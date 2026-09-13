import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import viewerUpdate from './viewer-update-core.cjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function stampViewer(html) {
  if(!html.includes('{{viewer-release-id}}'))throw new Error('Missing viewer release ID placeholder');
  return html.replaceAll('{{viewer-release-id}}',sha(Buffer.from(html,'latin1')));
}
export async function prepareRelease({viewer,out}) {
  if(!viewer||!out)throw new Error('Required: --viewer HTML --out RELEASES_DIRECTORY');
  const bytes=await fs.readFile(viewer);
  if(!bytes.length||bytes.length>64*1024**2)throw new Error('Release viewer size limit');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),release=text.match(/window\.__locahunBuildRelease="([a-f0-9]{64})"/)?.[1];
  if(!release||!text.includes('id="locahun-app-source"'))throw new Error('Viewer must be built with the startup/release contract');
  const unstamped=bytes.toString('latin1').replace(`window.__locahunBuildRelease="${release}"`,'window.__locahunBuildRelease="{{viewer-release-id}}"');
  if(sha(Buffer.from(unstamped,'latin1'))!==release)throw new Error('Viewer changed after build; rebuild before preparing release');
  viewerUpdate.validateHtml(text);
  const root=path.resolve(out);
  await fs.mkdir(root,{recursive:true});
  if((await fs.lstat(root)).isSymbolicLink())throw new Error('Release directory cannot be a symlink');
  const directory=path.join(root,release);
  await fs.mkdir(directory,{recursive:true});
  if((await fs.lstat(directory)).isSymbolicLink())throw new Error('Immutable release directory cannot be a symlink');
  const target=path.join(directory,'viewer.bin');
  try {await fs.writeFile(target,bytes,{flag:'wx'});}
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    if((await fs.lstat(target)).isSymbolicLink()||!(await fs.readFile(target)).equals(bytes))throw new Error('Immutable release collision; existing bytes preserved');
  }
  const manifest={schema:1,release,projectVersions:[1,2,3,4],localProjectApi:1,
    viewer:{url:`https://viewer.locahun3d.com/releases/${release}/viewer.html`,bytes:bytes.length,sha256:sha(bytes)}};
  const temp=path.join(root,'.stable-'+randomUUID()+'.tmp');
  await fs.writeFile(temp,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  await fs.rename(temp,path.join(root,'stable.json'));
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2),options={};
    for(let i=0;i<args.length;i+=2) {
      if(!['--viewer','--out'].includes(args[i])||!args[i+1]||options[args[i].slice(2)])throw new Error('Usage: --viewer HTML --out RELEASES_DIRECTORY');
      options[args[i].slice(2)]=args[i+1];
    }
    console.log(JSON.stringify(await prepareRelease(options)));
  } catch(error){console.error(error.message);process.exitCode=1;}
}
