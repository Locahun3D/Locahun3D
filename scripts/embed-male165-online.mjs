import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NATIVE_ASSET,renderViewerNativeEmbed} from './embed-male165.mjs';

export function renderViewerOnlineDescriptor({basePath='/figures'}={}){
  assert(['/figures','/viewer/figures'].includes(basePath),'Unexpected avatar base path');
  const info={source:NATIVE_ASSET.relative,url:basePath+'/'+path.basename(NATIVE_ASSET.relative),
    sha256:NATIVE_ASSET.sha256,bytes:NATIVE_ASSET.bytes,delivery:'lazy-glb',motionIncluded:true,
    distributionScope:'locahun-viewer-only',geometrySourceLicense:NATIVE_ASSET.geometrySourceLicense,motionRights:'Adobe Mixamo motion, not CC0',
    motionVariant:NATIVE_ASSET.motionVariant};
  return '<script>\nwindow.KAWAII_MALE_ASSET_INFO='+JSON.stringify(info)+';\n</script>\n';
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  assert(args.length%2===0,'Use --base-path /figures or /viewer/figures and optional --out PRIVATE.html');
  for(let i=0;i<args.length;i+=2){assert(['--base-path','--out'].includes(args[i])&&args[i+1]&&!Object.hasOwn(options,args[i]),'Invalid descriptor arguments');options[args[i]]=args[i+1];}
  const root=fileURLToPath(new URL('../',import.meta.url));
  const output=path.resolve(options['--out']||path.join(root,'src/assets/male165_glb_b64.online.html'));
  const parent=await fs.realpath(path.dirname(output));
  assert(path.join(parent,path.basename(output)).toLowerCase()===output.toLowerCase(),'Redirected descriptor output');
  if(options['--out']){const relative=path.relative(root,output);assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Private descriptor output must be outside the repository');}
  assert(path.extname(output)==='.html','Descriptor output must be HTML');
  const html=renderViewerOnlineDescriptor({basePath:options['--base-path']});
  renderViewerNativeEmbed(await fs.readFile(path.join(root,NATIVE_ASSET.relative)));
  const stat=await fs.lstat(output).catch(e=>{if(e.code!=='ENOENT')throw e;});
  assert(!stat||(stat.isFile()&&!stat.isSymbolicLink()),'Unsafe descriptor output');
  await fs.writeFile(output,html);console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),sha256:NATIVE_ASSET.sha256}));
}
