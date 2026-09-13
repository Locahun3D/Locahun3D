import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import updater from './viewer-update-core.cjs';

const MAX_HTML=64*1024**2,MAX_DISK=256*1024**2;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const validHash=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
async function cacheDirectory(root,create=false) {
  if((await fs.lstat(root)).isSymbolicLink())throw new Error('Cache root cannot be a symlink');
  let directory=await fs.realpath(root);
  for(const part of ['runtime','updates']) {
    directory=path.join(directory,part);
    if(create)await fs.mkdir(directory).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const stat=await fs.lstat(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(directory)!==directory)throw new Error('Unsafe cache directory');
  }
  return directory;
}
async function readSafe(directory,name,limit) {
  const file=path.join(directory,name),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>limit)throw new Error('Invalid cache file size/type');
  const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const actual=await handle.stat();
    if(actual.ino!==stat.ino||actual.dev!==stat.dev||actual.size!==stat.size)throw new Error('Cache file changed during access');
    const bytes=Buffer.alloc(stat.size);let offset=0;
    while(offset<bytes.length) {
      const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,null);
      if(!bytesRead)throw new Error('Partial cache file');offset+=bytesRead;
    }
    if((await handle.read(Buffer.alloc(1),0,1,null)).bytesRead)throw new Error('Cache file grew during access');
    return bytes;
  } finally {await handle.close();}
}
async function readIndex(directory) {
  const index=JSON.parse((await readSafe(directory,'last-good.json',4096)).toString('utf8'));
  if(index.schema!==1||!Array.isArray(index.hashes)||index.hashes.length>2||!index.hashes.every(validHash)||new Set(index.hashes).size!==index.hashes.length)throw new Error('Invalid cache index');
  return index.hashes;
}
async function readEntry(directory,sha256,projectVersion,currentRelease) {
  const metadata=JSON.parse((await readSafe(directory,sha256+'.json',16384)).toString('utf8'));
  if(metadata.schema!==1||metadata.sha256!==sha256||!Number.isSafeInteger(metadata.bytes)||metadata.bytes<1||metadata.bytes>MAX_HTML||
    metadata.projectVersion!==projectVersion||metadata.localProjectApi!==1||!/^[A-Za-z0-9._-]{1,80}$/.test(metadata.release))throw new Error('Incompatible cache metadata');
  const bundle=currentRelease ?? null;
  const baseValid=metadata.baseRelease===null || typeof metadata.baseRelease==='string' && /^[A-Za-z0-9._-]{1,80}$/.test(metadata.baseRelease);
  if(metadata.release!==bundle && (!baseValid || metadata.baseRelease!==bundle))throw new Error('Cached update belongs to a different bundled viewer');
  const url=new URL(metadata.url);
  if(url.origin!=='https://viewer.locahun3d.com'||url.username||url.password||url.search||url.hash||!/^\/releases\/[A-Za-z0-9._-]+\/viewer\.html$/.test(url.pathname))throw new Error('Invalid cached release URL');
  const bytes=await readSafe(directory,sha256+'.html',MAX_HTML);
  if(bytes.length!==metadata.bytes||hash(bytes)!==sha256)throw new Error('Cache hash/size mismatch');
  const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  updater.validateHtml(html);
  return {html,release:metadata.release,url:metadata.url,sha256};
}
async function loadCache(root,projectVersion,currentRelease) {
  try {
    const directory=await cacheDirectory(root);
    for(const sha256 of await readIndex(directory)) {
      try{return await readEntry(directory,sha256,projectVersion,currentRelease);}catch{/* Try the previous verified entry. */}
    }
  } catch {/* Missing, incompatible or corrupted cache never blocks the bundled viewer. */}
  return null;
}
async function saveCache(root,update,projectVersion,currentRelease,io={}) {
  const directory=await cacheDirectory(root,true),bytes=Buffer.from(update.html,'utf8');
  if(!validHash(update.sha256)||hash(bytes)!==update.sha256||bytes.length>MAX_HTML)throw new Error('Unverified cache input');
  updater.validateHtml(update.html);
  const names=await fs.readdir(directory);
  if(names.length>64)throw new Error('Cache file-count limit reached');
  let used=0;
  for(const name of names) {
    const stat=await fs.lstat(path.join(directory,name));
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Unsafe cache contents');
    used+=stat.size;
  }
  if(used+bytes.length+32768>MAX_DISK)throw new Error('Cache disk limit reached');
  let previous=[];
  try {previous=await readIndex(directory);}catch{/* Replace invalid index only after full new verification. */}
  const temps=new Set();
  async function temporary(data) {
    const name='.cache-'+randomUUID()+'.tmp',file=path.join(directory,name);
    const handle=await fs.open(file,'wx');temps.add(file);
    try {await (io.write ? io.write(handle,data) : handle.writeFile(data));await handle.sync();}
    finally {await handle.close();}
    if(!(await readSafe(directory,name,data.length)).equals(data))throw new Error('Partial cache write');
    return file;
  }
  async function immutable(name,data) {
    const temp=await temporary(data),target=path.join(directory,name);
    await cacheDirectory(root);
    try {await fs.link(temp,target);}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      if(!(await readSafe(directory,name,data.length)).equals(data))throw new Error('Immutable cache collision');
    }
  }
  try {
    await immutable(update.sha256+'.html',bytes);
    const metadata={schema:1,release:update.release,url:update.url,sha256:update.sha256,bytes:bytes.length,projectVersion,localProjectApi:1,baseRelease:currentRelease ?? null};
    await immutable(update.sha256+'.json',Buffer.from(JSON.stringify(metadata)+'\n'));
    await readEntry(directory,update.sha256,projectVersion,currentRelease);
    const hashes=[update.sha256,...previous.filter(value=>value!==update.sha256)].slice(0,2);
    const pointer=await temporary(Buffer.from(JSON.stringify({schema:1,hashes})+'\n'));
    await cacheDirectory(root);
    await (io.rename || fs.rename)(pointer,path.join(directory,'last-good.json'));temps.delete(pointer);
    // Only retire previously indexed cache-owned regular files after publishing the new pointer.
    for(const old of previous.filter(value=>!hashes.includes(value))) {
      for(const ext of ['html','json']) {
        await cacheDirectory(root);
        const file=path.join(directory,old+'.'+ext),stat=await fs.lstat(file).catch(()=>null);
        if(stat?.isFile()&&!stat.isSymbolicLink())await fs.unlink(file);
      }
    }
  } finally {
    // Exact temporary files created by this operation only; never recursive cleanup.
    for(const file of temps) {
      try {await cacheDirectory(root);await fs.unlink(file);}catch{/* A locked temp is retained and counts toward the next quota check. */}
    }
  }
}
export async function selectLocalViewer({root,projectVersion,currentRelease,fetch,cacheIO}) {
  // Caller owns the project's existing exclusive server lock throughout selection/persistence.
  const cached=await loadCache(root,projectVersion,currentRelease);
  const update=await updater.check({fetch,projectVersion,currentRelease:cached?.release || currentRelease});
  if(update.html) {
    let cacheWarning;
    try {await saveCache(root,update,projectVersion,currentRelease,cacheIO);}catch(error){cacheWarning=error.message;}
    return {...update,source:'online',...(cacheWarning?{cacheWarning}:{})};
  }
  if(cached)return {...cached,source:'cache',reason:update.reason};
  return {...update,source:'bundled'};
}
