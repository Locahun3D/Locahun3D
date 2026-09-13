// Viewer-only lightweight native-derived asset; published originals stay unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const NATIVE_ASSET=Object.freeze({
  relative:'figures/viewer-figure165-9224d968.glb',
  sha256:'9224d96800753290cbd4d65f9eb05be515cc8914307b44bf2cc9125bb1bd417d',
  bytes:1206764,
  geometrySourceLicense:'pending-source-audit',
  motionVariant:'menu-figure-retargeted-restrained',
});
const clips=['Idle_Locomotion','Walk_Locomotion','Run_Locomotion','Jump_Locomotion','Land_Locomotion','Stop_Locomotion'];
const defaultInput=path.join(root,NATIVE_ASSET.relative);
const defaultOutput=path.join(root,'src/assets/male165_glb_b64.html');
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
export function renderViewerNativeEmbed(bytes){
  assert(Buffer.isBuffer(bytes),'Expected GLB Buffer');
  assert.equal(bytes.length,NATIVE_ASSET.bytes,'Native asset size mismatch');
  assert(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'Invalid GLB2 header');
  let offset=12,json,bin;
  while(offset<bytes.length){
    assert(offset+8<=bytes.length,'Truncated GLB chunk');
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),end=offset+8+length;
    assert(length%4===0&&end<=bytes.length,'Invalid GLB chunk size');
    if(type===0x4e4f534a){assert(!json&&offset===12,'Invalid GLB JSON chunk');json=JSON.parse(bytes.subarray(offset+8,end).toString('utf8'));}
    else{assert(type===0x004e4942&&!bin,'Invalid GLB BIN chunk');bin=bytes.subarray(offset+8,end);}
    offset=end;
  }
  assert(json&&bin,'Missing GLB data');
  assert.deepEqual(json.animations?.map(a=>a.name),clips,'Require complete six native clips');
  for(const clip of json.animations)assert(clip.channels?.length>0&&clip.samplers?.length>0,'Native clip channels missing');
  const rig=json.nodes?.find(n=>n.name==='B1_Rig')?.extras;
  assert.equal(rig?.motion_included,true,'Native motion metadata missing');
  assert.equal(rig.geometry_source_license,NATIVE_ASSET.geometrySourceLicense,'Geometry rights metadata mismatch');
  assert.equal(rig.geometry_source,'src/assets/mixamo_glb_b64.html','Require the exact menu figure geometry source');
  assert.equal(rig.motion_rights,'Adobe Mixamo motion, not CC0','Motion rights metadata mismatch');
  assert(Number.isFinite(rig.stature_m)&&Math.abs(rig.stature_m-1.65)<.00002,'165 cm stature metadata mismatch');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),NATIVE_ASSET.sha256,'Native asset digest mismatch');
  const meta={source:NATIVE_ASSET.relative,sha256:NATIVE_ASSET.sha256,bytes:bytes.length,motionIncluded:true,
    distributionScope:'locahun-viewer-only',geometrySourceLicense:rig.geometry_source_license,motionRights:rig.motion_rights,
    motionVariant:NATIVE_ASSET.motionVariant};
  return '<script>\nwindow.KAWAII_MALE_ASSET_INFO='+JSON.stringify(meta)+';\nwindow.KAWAII_MALE_GLB_B64="'+bytes.toString('base64')+'";\n</script>\n';
}
export async function embedViewerNative({input=defaultInput,output=defaultOutput}={}){
  input=path.resolve(input);output=path.resolve(output);
  assert([path.basename(defaultInput),'figure165-candidate.glb'].includes(path.basename(input)),'Unexpected native asset name');
  assert(!samePath(input,output),'Input and output must differ');
  const parent=await fs.realpath(path.dirname(output));
  if(samePath(input,defaultInput))assert(samePath(output,defaultOutput),'Canonical input may write only viewer embed');
  else{
    const relative=path.relative(await fs.realpath(os.tmpdir()),parent);
    assert(!samePath(output,defaultOutput)&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep),'Private input requires private temp output, never canonical');
    assert.equal(path.extname(output),'.html','Private output must be HTML');
  }
  assert(samePath(path.join(parent,path.basename(output)),output),'Output parent is redirected');
  const stat=await fs.lstat(output).catch(e=>{if(e.code!=='ENOENT')throw e;});
  if(stat)assert(stat.isFile()&&!stat.isSymbolicLink(),'Unsafe embed output');
  assert(!(await fs.lstat(input)).isSymbolicLink(),'Symlink native input');
  const html=renderViewerNativeEmbed(await fs.readFile(input));
  // All validation precedes the only write; private fixtures cannot update production.
  await fs.writeFile(output,html);
  return {output,source:NATIVE_ASSET.relative,sha256:NATIVE_ASSET.sha256,bytes:NATIVE_ASSET.bytes};
}
if(process.argv[1]&&samePath(process.argv[1],fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2);let options;
  if(args.length){assert(args.length===4&&args[0]==='--input'&&args[2]==='--output','Use --input PRIVATE_RC --output TEMP_HTML');options={input:args[1],output:args[3]};}
  console.log(JSON.stringify(await embedViewerNative(options)));
}
