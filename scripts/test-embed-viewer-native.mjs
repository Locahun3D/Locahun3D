import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=new URL('./embed-male165.mjs',import.meta.url);
const root=fileURLToPath(new URL('../',import.meta.url));
const rc=path.join(root,'docs/figure-locomotion-review/figure165-candidate.glb');
const expected='9224d96800753290cbd4d65f9eb05be515cc8914307b44bf2cc9125bb1bd417d';
const sha=b=>createHash('sha256').update(b).digest('hex');
// Do not import the historical script: it writes canonical output at import time.
async function api(){assert.match(await fs.readFile(script,'utf8'),/export function renderViewerNativeEmbed/,'An import-safe native embed API is required');return import(script.href);}
async function snapshot(file){const b=await fs.readFile(file),s=await fs.stat(file);return {sha256:sha(b),bytes:b.length,mtimeMs:s.mtimeMs};}
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-native-embed-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('viewer-native-embed-'));await fs.rm(dir,{recursive:true,force:true});});return dir;}
function editJson(bytes,change){const b=Buffer.from(bytes),len=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+len));change(j);const replacement=Buffer.from(JSON.stringify(j));assert(replacement.length<=len);b.fill(32,20,20+len);replacement.copy(b,20);return b;}
test('real private RC embeds byte-identically with viewer-only metadata',async()=>{
 const {renderViewerNativeEmbed,NATIVE_ASSET}=await api();const bytes=await fs.readFile(rc);assert.equal(bytes.length,1206764);assert.equal(sha(bytes),expected);
 const html=renderViewerNativeEmbed(bytes),context=vm.createContext({window:{}});vm.runInContext(html.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),context);
 assert.equal(NATIVE_ASSET.relative,'figures/viewer-figure165-9224d968.glb');
 assert.equal(sha(Buffer.from(context.window.KAWAII_MALE_GLB_B64,'base64')),expected);
 const meta=context.window.KAWAII_MALE_ASSET_INFO;assert.equal(meta.source,NATIVE_ASSET.relative);assert.equal(meta.motionIncluded,true);assert.equal(meta.distributionScope,'locahun-viewer-only');assert.equal(meta.geometrySourceLicense,'pending-source-audit');assert.equal(meta.motionRights,'Adobe Mixamo motion, not CC0');
 assert.equal(meta.motionVariant,'menu-figure-retargeted-restrained');
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),primitive=json.meshes[0].primitives[0],position=json.accessors[primitive.attributes.POSITION];
 assert.equal(position.count,1615);assert.equal(json.accessors[primitive.indices].count,6288);assert.equal(json.skins[0].joints.length,52);
 const rig=json.nodes.find(n=>n.name==='B1_Rig');assert.equal(rig.extras.stature_m,1.65);assert.equal(rig.extras.geometry_source,'src/assets/mixamo_glb_b64.html');
});

test('generated viewer payload matches the new immutable figure exactly',async()=>{
 const {NATIVE_ASSET}=await api(),bytes=await fs.readFile(path.join(root,NATIVE_ASSET.relative)),html=await fs.readFile(path.join(root,'src/assets/male165_glb_b64.html'),'utf8');
 const context=vm.createContext({window:{}});vm.runInContext(html.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),context);
 const decoded=Buffer.from(context.window.KAWAII_MALE_GLB_B64,'base64');assert(decoded.equals(bytes));assert.equal(sha(decoded),expected);assert.equal(context.window.KAWAII_MALE_ASSET_INFO.sha256,expected);
});
test('size, digest, malformed GLB, missing clip and motion metadata fail closed',async()=>{
 const {renderViewerNativeEmbed}=await api(),bytes=await fs.readFile(rc);
 assert.throws(()=>renderViewerNativeEmbed(bytes.subarray(1)),/size/i);
 const changed=Buffer.from(bytes);changed[changed.length-1]^=1;assert.throws(()=>renderViewerNativeEmbed(changed),/digest/i);
 const malformed=Buffer.from(bytes);malformed.writeUInt32LE(0,0);assert.throws(()=>renderViewerNativeEmbed(malformed),/GLB/i);
 assert.throws(()=>renderViewerNativeEmbed(editJson(bytes,j=>j.animations.pop())),/six|clips/i);
 assert.throws(()=>renderViewerNativeEmbed(editJson(bytes,j=>{j.animations[0].channels=[];})),/channels/i);
  assert.throws(()=>renderViewerNativeEmbed(editJson(bytes,j=>{delete j.nodes.find(n=>n.name==='B1_Rig').extras.motion_included;})),/motion/i);
 assert.throws(()=>renderViewerNativeEmbed(editJson(bytes,j=>{j.nodes.find(n=>n.name==='B1_Rig').extras.motion_rights='CC0';})),/rights/i);
 assert.throws(()=>renderViewerNativeEmbed(editJson(bytes,j=>{j.nodes.find(n=>n.name==='B1_Rig').extras.stature_m=1.75;})),/stature/i);
});
test('CLI writes only private fixture output; old shared, canonical embed and HTML stay untouched',async t=>{
 await api();const dir=await temp(t),output=path.join(dir,'embedded.html');
 const protectedFiles=['figures/male165-shared-v2.glb','figures/viewer-male165-native-v1-a7f50a3b.glb','src/assets/male165_glb_b64.html','Locahun3D_OfflineViewer.html','Locahun3D_OfflineViewer.online.html'].map(p=>path.join(root,p));
 const before=await Promise.all(protectedFiles.map(snapshot));
 execFileSync(process.execPath,[fileURLToPath(script),'--input',rc,'--output',output],{stdio:'pipe',windowsHide:true});
 assert((await fs.readFile(output,'utf8')).includes(expected));assert.deepEqual(await Promise.all(protectedFiles.map(snapshot)),before);
});
test('invalid input leaves existing output unchanged and private input cannot write canonical output',async t=>{
 const {embedViewerNative}=await api(),dir=await temp(t),output=path.join(dir,'embedded.html');await fs.writeFile(output,'unchanged');const before=await snapshot(output);
 const input=path.join(dir,'figure165-candidate.glb'),bytes=await fs.readFile(rc),changed=Buffer.from(bytes);changed[changed.length-1]^=1;
 for(const [invalid,error] of [[changed,/digest/i],[bytes.subarray(1),/size/i],[editJson(bytes,j=>j.animations.pop()),/six|clips/i]]){
  await fs.writeFile(input,invalid);await assert.rejects(embedViewerNative({input,output}),error);assert.deepEqual(await snapshot(output),before);
 }
  await assert.rejects(embedViewerNative({input:rc,output:path.join(root,'src/assets/male165_glb_b64.html')}),/private|canonical/i);
 await assert.rejects(embedViewerNative({input:rc,output:path.join(root,'figures/male165-shared-v2.glb')}),/private|canonical/i);
 const wrong=path.join(dir,'wrong-name.glb');await fs.writeFile(wrong,await fs.readFile(rc));await assert.rejects(embedViewerNative({input:wrong,output}),/name/i);assert.deepEqual(await snapshot(output),before);
});
