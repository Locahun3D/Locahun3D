import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { lstat, readFile, writeFile, mkdir, mkdtemp, copyFile, rename, readdir, rmdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Keep in sync with local-project-server.mjs and the viewer's restore dispatcher.
const EXTENSIONS = new Set(['rad','ply','splat','spz','ksplat','sog','glb','gltf','obj','fbx']);
const LAYER_TYPES = new Set(['folder','cube','sphere','obj','splat','light','figure','event','path']);
const DEFAULT_LIMITS = Object.freeze({maxZipBytes:2*1024**3, maxEntryBytes:1024**3, maxTotalBytes:4*1024**3, maxEntries:10000, maxProjectBytes:16*1024**2});
export function loadZipLibrary() {
  for (const candidate of ['jszip', path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/jszip')]) {
    try { return require(candidate); } catch (e) { if(e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  throw new Error('JSZip is required in local node_modules or the installed Codex Node runtime. No dependencies are downloaded.');
}
function safeName(name) {
  if(typeof name !== 'string' || !name || name.startsWith('/') || /[\\:\x00-\x1f\x7f]/.test(name)) throw new Error(`Unsafe ZIP path: ${name}`);
  const pieces = name.replace(/\/$/,'').split('/');
  for(const part of pieces) if(!part || part === '.' || part === '..' || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) throw new Error(`Unsafe ZIP name: ${name}`);
  return name;
}
function inventory(bytes, limits) {
  // Inspect original central-directory names before JSZip sanitizes paths or overwrites duplicates.
  let end = -1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--) {
    if(bytes.readUInt32LE(p) === 0x06054b50 && p+22+bytes.readUInt16LE(p+20)===bytes.length) { end=p; break; }
  }
  if(end<0) throw new Error('Invalid ZIP end directory');
  const count=bytes.readUInt16LE(end+10), size=bytes.readUInt32LE(end+12), start=bytes.readUInt32LE(end+16);
  if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==count||count===65535||start===0xffffffff||size===0xffffffff) throw new Error('Multipart/ZIP64 archives are unsupported; export a standard ZIP');
  if(count>limits.maxEntries || start+size!==end) throw new Error('ZIP directory limit or bounds invalid');
  const entries=new Map(), names=new Set(); let p=start,total=0;
  for(let i=0;i<count;i++) {
    if(p+46>end || bytes.readUInt32LE(p)!==0x02014b50) throw new Error('Invalid ZIP directory entry');
    const flags=bytes.readUInt16LE(p+8), method=bytes.readUInt16LE(p+10), compressed=bytes.readUInt32LE(p+20), length=bytes.readUInt32LE(p+24);
    const n=bytes.readUInt16LE(p+28), x=bytes.readUInt16LE(p+30), c=bytes.readUInt16LE(p+32), local=bytes.readUInt32LE(p+42);
    if(p+46+n+x+c>end || local+30>start || bytes.readUInt32LE(local)!==0x04034b50) throw new Error('ZIP local header bounds invalid');
    const raw=bytes.subarray(p+46,p+46+n);
    if(!(flags&0x800) && raw.some(v=>v>127)) throw new Error('ZIP names must use UTF-8');
    const name=safeName(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    const key=name.replace(/\/$/,'').normalize('NFC').toLowerCase();
    if(names.has(key)) throw new Error(`Duplicate ZIP path: ${name}`);
    names.add(key);
    const mode=bytes.readUInt32LE(p+38)>>>16, type=mode&0xf000;
    if(type && type!==0x8000 && type!==0x4000) throw new Error(`ZIP symlink/special type forbidden: ${name}`);
    if(flags&1 || ![0,8].includes(method)) throw new Error('Encrypted/unsupported ZIP compression');
    const ln=bytes.readUInt16LE(local+26), lx=bytes.readUInt16LE(local+28);
    if(local+30+ln+lx+compressed>start || !bytes.subarray(local+30,local+30+ln).equals(raw) || bytes.readUInt16LE(local+8)!==method || bytes.readUInt16LE(local+6)!==flags) throw new Error('ZIP local/central header mismatch');
    total+=length;
    if(length>limits.maxEntryBytes || total>limits.maxTotalBytes) throw new Error('ZIP uncompressed size limit exceeded');
    entries.set(name,{length,crc:bytes.readUInt32LE(p+16),directory:name.endsWith('/')});
    p+=46+n+x+c;
  }
  if(p!==end) throw new Error('ZIP directory size mismatch');
  return entries;
}
function extract(zip,name,meta,limit) {
  return new Promise((resolve,reject)=>{
    const entry=zip.file(name);
    if(!entry) {reject(new Error(`Missing embedded asset: ${name}`)); return;}
    const stream=entry.internalStream('nodebuffer'); const chunks=[]; let length=0, failed=false;
    stream.on('data',chunk=>{
      length+=chunk.length;
      if(length>limit || length>meta.length) {failed=true; stream.pause(); reject(new Error(`ZIP expansion size limit exceeded: ${name}`)); return;}
      chunks.push(chunk);
    });
    stream.on('error',reject);
    stream.on('end',()=>{
      if(failed) return;
      const result=Buffer.concat(chunks,length);
      if(length!==meta.length || crc32(result)!==meta.crc) reject(new Error(`ZIP size/CRC mismatch: ${name}`));
      else resolve(result);
    });
    stream.resume();
  });
}
async function regular(file) {
  const stat=await lstat(file);
  if(!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular trusted file: ${file}`);
  return stat;
}
function rejectInline(value) {
  if(!value || typeof value!=='object') return;
  for(const [key,item] of Object.entries(value)) {
    if(['rawData','meshData','_buf','_rawBuffer'].includes(key)) throw new Error(`Inline ${key} is unsupported; export a ZIP with embedded asset files`);
    rejectInline(item);
  }
}
function launcher() {
  // Pass paths through an environment variable, not interpolation into PowerShell source.
  return '\ufeff'+[
    '@echo off', 'setlocal', 'set "LOCAHUN_PACKAGE_ROOT=%~dp0"',
    'powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference=\'Stop\'; $r=$env:LOCAHUN_PACKAGE_ROOT; try { $n=Join-Path $r \'runtime\\node.exe\'; $s=Join-Path $r \'server.mjs\'; $root=$r.TrimEnd([char]92); $q=[char]34; $a=$q+$s+$q+\' --root \'+$q+$root+$q; Start-Process -FilePath $n -ArgumentList $a -WorkingDirectory $r -WindowStyle Hidden -RedirectStandardOutput (Join-Path $r \'server.log\') -RedirectStandardError (Join-Path $r \'server-error.log\') -ErrorAction Stop } catch { $_ | Out-File -LiteralPath (Join-Path $r \'startup-error.log\') -Encoding utf8; exit 1 }"',
    'if errorlevel 1 (', '  echo Startup failed. See startup-error.log.', '  pause', ')', ''
  ].join('\r\n').replace(/^\ufeff/,'');
}
async function cleanupStage(stage, adapter = {}) {
  const remove = adapter.rmdir || rmdir, wait = adapter.sleep || sleep;
  const delays = [100,200,400,800];
  async function verifyEmpty() {
    const stat = await lstat(stage);
    if(!stat.isDirectory() || stat.isSymbolicLink()) throw Object.assign(new Error('Staging path is no longer a regular directory; preserved'),{code:'ESTAGETYPE'});
    if((await readdir(stage)).length) throw Object.assign(new Error('Staging directory is not empty; preserved'),{code:'ENOTEMPTY'});
  }
  try {
    for(let attempt=0; ;attempt++) {
      await verifyEmpty();
      try { await remove(stage); return undefined; }
      catch(error) {
        if(!['EBUSY','EPERM','ENOTEMPTY'].includes(error.code)) throw error;
        // Dropbox may report ENOTEMPTY for an empty directory. Never delete newly added contents.
        await verifyEmpty();
        if(attempt===delays.length) throw error;
        await wait(delays[attempt]);
      }
    }
  } catch(error) {
    if(error.code==='ENOENT') return undefined;
    return {path:stage,code:error.code || 'ECLEANUP',message:`Package complete. Staging cleanup was not completed: ${error.message}`};
  }
}
export async function prepareLocalProject(options) {
  if(!options.zip || !options.out) throw new Error('Required: --zip SOURCE --out NEWDIR');
  const source=path.resolve(options.zip), out=path.resolve(options.out);
  const viewer=path.resolve(options.viewer || path.join(here,'../Locahun3D_OfflineViewer.html'));
  const server=path.resolve(options.server || path.join(here,'local-project-server.mjs'));
  const node=path.resolve(options.node || process.execPath);
  try { await lstat(out); throw new Error(`Output already exists: ${out}`); } catch(e) {if(e.code!=='ENOENT') throw e;}
  const limits={...DEFAULT_LIMITS,...options.limits};
  for(const [k,v] of Object.entries(limits)) if(!Number.isSafeInteger(v)||v<=0||v>DEFAULT_LIMITS[k]) throw new Error(`Invalid limit ${k}`);
  const stat=await regular(source);
  if(stat.size>limits.maxZipBytes) throw new Error('ZIP input size limit exceeded');
  await regular(viewer); await regular(server); await regular(node);
  const updateCore=path.join(here,'viewer-update-core.cjs');
  await regular(updateCore);
  const updateCache=path.join(here,'local-viewer-cache.mjs');
  await regular(updateCache);
  const bytes=await readFile(source); // One read of the original archive; never extracted to its directory.
  if(bytes.length>limits.maxZipBytes) throw new Error('ZIP input size limit exceeded');
  const entries=inventory(bytes,limits);
  const projects=[...entries.keys()].filter(n=>n==='project.json'||n.endsWith('/project.json'));
  if(projects.length!==1) throw new Error('ZIP must contain exactly one project.json');
  const projectName=projects[0], base=projectName.slice(0,-'project.json'.length);
  if(entries.get(projectName).length>limits.maxProjectBytes) throw new Error('project.json size limit exceeded');
  const JSZip=loadZipLibrary(); const zip=await JSZip.loadAsync(bytes);
  const project=JSON.parse((await extract(zip,projectName,entries.get(projectName),limits.maxProjectBytes)).toString('utf8'));
  if(!project || ![1,2,3,4].includes(project.version) || !Array.isArray(project.layers)) throw new Error('Unsupported project version or layers');
  rejectInline(project);
  if(project.layers.length>10000) throw new Error('Project layer count limit exceeded');
  const assets=new Map(),ids=new Set();
  for(const layer of project.layers) {
    if(!layer || typeof layer!=='object' || Array.isArray(layer)) throw new Error('Invalid project layer');
    if(!LAYER_TYPES.has(layer.type)) throw new Error(`Unknown layer type: ${layer.type}`);
    if(!(Number.isSafeInteger(layer.id) && layer.id>=0 || typeof layer.id==='string' && layer.id.trim() && layer.id.length<=128)) throw new Error('Invalid layer ID');
    if(ids.has(String(layer.id))) throw new Error(`Duplicate layer ID: ${layer.id}`);
    ids.add(String(layer.id));
    if(layer.file) {
      safeName(layer.file);
      const name=base+layer.file;
      if(!entries.has(name)||entries.get(name).directory) throw new Error(`Missing embedded asset: ${name}`);
      const ext=path.posix.extname(name).slice(1).toLowerCase();
      if(!EXTENSIONS.has(ext)) throw new Error(`Unsupported asset extension: ${name}`);
      assets.set(name,ext);
    } else if(layer.streamUrl || ['splat','obj'].includes(layer.type)) throw new Error(`Missing embedded asset for layer: ${layer.name||layer.type||'stream'}`);
    delete layer.streamUrl;
  }
  const {prepareProjectNavigation}=await import('./prepare-project-navigation.mjs');
  const navigation=await prepareProjectNavigation(project);
  if(navigation.project.walk)project.walk=navigation.project.walk;
  let regional=null;
  if(project.walk?.navigationRegions){
    const {validateNavigationBundle}=await import('./validate-navigation-bundle.mjs');
    regional=await validateNavigationBundle(project.walk.navigationRegions,async(name,limit)=>{
      const item=entries.get(base+name);if(!item||item.directory||item.length!==limit)throw new Error('Missing or invalid navigation asset: '+name);
      return extract(zip,base+name,item,limit);
    });
    project.walk.navigationRegions=regional.manifest;
  }
  if(Buffer.byteLength(JSON.stringify(project))>limits.maxProjectBytes)throw new Error('Prepared project metadata size limit exceeded');
  // mkdir is the no-overwrite reservation. Leave only this newly owned directory on failure.
  await mkdir(out);
  const stage=await mkdtemp(path.join(out,'.prepare-'));
  let assetCount;
  try {
    await mkdir(path.join(stage,'assets')); await mkdir(path.join(stage,'history')); await mkdir(path.join(stage,'runtime'));
    const mapped=new Map(),written=new Set();
    for(const [name,ext] of assets) {
      const data=await extract(zip,name,entries.get(name),limits.maxEntryBytes);
      const target=`assets/${createHash('sha256').update(data).digest('hex')}.${ext}`;
      if(!written.has(target)) await writeFile(path.join(stage,target),data,{flag:'wx'});
      written.add(target); mapped.set(name,target);
    }
    for(const layer of project.layers) if(layer.file) layer.file=mapped.get(base+layer.file);
    if(regional)for(const [name,data] of regional.files){await writeFile(path.join(stage,name),data,{flag:'wx'});written.add(name);}
    await writeFile(path.join(stage,'project-state.json'),JSON.stringify({revision:0,status:'draft',project},null,2)+'\n',{flag:'wx'});
    await copyFile(viewer,path.join(stage,'viewer.html'),constants.COPYFILE_EXCL);
    await copyFile(server,path.join(stage,'server.mjs'),constants.COPYFILE_EXCL);
    await copyFile(updateCore,path.join(stage,'viewer-update-core.cjs'),constants.COPYFILE_EXCL);
    await copyFile(updateCache,path.join(stage,'local-viewer-cache.mjs'),constants.COPYFILE_EXCL);
    await copyFile(node,path.join(stage,'runtime/node.exe'),constants.COPYFILE_EXCL);
    await writeFile(path.join(stage,'編集を開く.cmd'),launcher(),{flag:'wx'});
    await writeFile(path.join(stage,'README.txt'),'\ufeffローカル編集用プロジェクト\r\n\r\n「編集を開く.cmd」をダブルクリックしてください。フォルダ一式を保持してください。\r\n保存はこのフォルダ内のみです。編集完了は公開・送信ではありません。元ZIPは変更していません。\r\n起動失敗: startup-error.log / server-error.log / server.log を確認してください。\r\nビューアーには外部依存があります。完全なオフライン動作は保証しません。\r\n',{flag:'wx'});
    for(const name of await readdir(stage)) await rename(path.join(stage,name),path.join(out,name));
    assetCount=written.size;
  } catch(e) {
    throw new Error(`Preparation failed; incomplete NEW directory retained for inspection: ${out}. ${e.message}`,{cause:e});
  }
  // All package files are promoted. Optional empty-directory cleanup cannot undo that success.
  const cleanupWarning=await cleanupStage(stage,options.cleanupAdapter);
  return {out,assets:assetCount,navigation:navigation.status,...(cleanupWarning ? {cleanupWarning} : {})};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const options={};
    for(let i=2;i<process.argv.length;i+=2) {
      const key=process.argv[i];
      if(!['--zip','--out','--viewer','--node'].includes(key)||!process.argv[i+1]||options[key.slice(2)]) throw new Error('Usage: node prepare-local-project.mjs --zip SOURCE --out NEWDIR [--viewer HTML] [--node EXE]');
      options[key.slice(2)]=process.argv[i+1];
    }
    console.log(JSON.stringify(await prepareLocalProject(options)));
  } catch(e) {console.error(e.message); process.exitCode=1;}
}
