import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';
import {stampViewer} from './prepare-viewer-release.mjs';

const source=fs.readFileSync(new URL('../src/js/310_zip_project_save_load_fflate.js',import.meta.url),'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
const unstamped='<html><script>window.__locahunBuildRelease="{{viewer-release-id}}";</script><script id="locahun-app-source">const x=1;</script></html>';
const release=hash(Buffer.from(unstamped));
const bytes=Buffer.from(unstamped.replace('{{viewer-release-id}}',release));
const descriptor={release,url:`https://viewer.locahun3d.com/releases/${release}/viewer.html`,bytes:bytes.length,sha256:hash(bytes)};
test('ZIP helper does not introduce a second build substitution token',()=>{
  const original=Buffer.from(unstamped.replace('const x=1;',source)).toString('latin1');
  const stamped=stampViewer(original);
  const id=stamped.match(/window\.__locahunBuildRelease="([a-f0-9]{64})"/)[1];
  const restored=stamped.replace(`window.__locahunBuildRelease="${id}"`,'window.__locahunBuildRelease="{{viewer-release-id}}"');
  assert.equal(hash(Buffer.from(restored,'latin1')),id);
});
function setup({artifact=descriptor,response=()=>new Response(bytes),web=true}={}){
  const calls=[];
  const context=vm.createContext({window:{__locahunWeb:web,__locahunOfflineArtifact:artifact},location:{href:'https://viewer.locahun3d.com/Locahun3D_OfflineViewer'},fetch:async(...args)=>{calls.push(args);return response();},crypto:webcrypto,URL,TextDecoder,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,console});
  vm.runInContext(source,context);
  return {context,calls,run:()=>vm.runInContext('_fetchOfflineViewerForZip()',context)};
}
test('web full ZIP fetches pinned embedded bytes, never the current page',async()=>{
  const s=setup();assert.deepEqual(Buffer.from(await s.run()),bytes);
  assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],descriptor.url);
});
for(const [name,artifact,response] of [
  ['missing descriptor',null,undefined],
  ['mutable URL',{...descriptor,url:'https://viewer.locahun3d.com/releases/stable.json'},undefined],
  ['foreign host',{...descriptor,url:`https://example.org/releases/${release}/viewer.html`},undefined],
  ['oversize declaration',{...descriptor,bytes:65*1024**2},undefined],
  ['HTTP failure',descriptor,()=>new Response('fail',{status:404})],
  ['wrong length',descriptor,()=>new Response(bytes.subarray(1))],
  ['wrong hash',{...descriptor,sha256:'0'.repeat(64)},undefined],
])test(`web export rejects ${name} without slim fallback`,async()=>{
  const s=setup({artifact,response});await assert.rejects(s.run());assert(s.calls.length<=1);
});
test('a correctly hashed web-only payload is not accepted as portable',async()=>{
  const base=unstamped.replace('const x=1;','window.__locahunWeb=true;');
  const id=hash(Buffer.from(base));
  const body=Buffer.from(base.replace('{{viewer-release-id}}',id));
  const s=setup({artifact:{...descriptor,release:id,url:`https://viewer.locahun3d.com/releases/${id}/viewer.html`,bytes:body.length,sha256:hash(body)},response:()=>new Response(body)});
  await assert.rejects(s.run());
});
test('responses without a bounded readable stream are rejected before buffering',async()=>{
  let buffered=false;
  const s=setup({response:()=>({ok:true,body:null,arrayBuffer(){buffered=true;return bytes;}})});
  await assert.rejects(s.run());assert.equal(buffered,false);
});
test('ZIP integration keeps local and lite exits ahead of fetching, fails closed on web',()=>{
  assert(source.indexOf('if(opts.localProject) return project;')<source.indexOf('await _fetchOfflineViewerForZip()'));
  assert.match(source,/if\(!_skipSplatData\)/);
  assert.match(source,/if\(window\.__locahunWeb\) throw e;/);
});
function saving(options){
  const s=setup(options),events={zip:0,toasts:[],files:null};
  Object.assign(s.context,{layers:[],isMobile:false,_projectName:'fixture',camPos:{x:0,y:1.6,z:0},yaw:0,pitch:0,
    _initCamPos:{x:0,y:1.6,z:0},_initYaw:0,_initPitch:0,_layerNextId:1,sun:{city:'Tokyo'},
    _walkSaveSettings:()=>({}),T:k=>k,showUndoToast:t=>events.toasts.push(t),Blob,
    console:{log(){},warn(){},error(){}},
    getFflate:async()=>({strToU8:t=>new TextEncoder().encode(t),zipSync:entries=>{events.zip++;events.files=entries;return new Uint8Array([1]);}})});
  return {...s,events,save:(lite,opts)=>s.context.window.saveProjectZip(lite,opts)};
}
test('actual local/lite save does not fetch the portable artifact',async()=>{
  const local=saving({artifact:null});assert.equal((await local.save(false,{localProject:true})).projectName,'fixture');
  assert.equal(local.calls.length,0);assert.equal(local.events.zip,0);
  const lite=saving({artifact:null});assert(await lite.save(true,{returnBlob:true}) instanceof Blob);
  assert.equal(lite.calls.length,0);assert.equal(lite.events.zip,1);
});

test('lite save keeps streamed RAD as a URL without downloading its full contents',async()=>{
 const s=saving({}),url='https://example.org/scene.rad';let downloads=0;
 s.context.layers=[{id:1,type:'splat',name:'streamed',visible:true,_streamUrl:url}];
 s.context._fetchStreamUrlToBytes=async()=>{downloads++;return {bytes:new Uint8Array([1,2,3])};};
 assert(await s.save(true,{returnBlob:true}) instanceof Blob);
 assert.equal(downloads,0);
 const project=JSON.parse(new TextDecoder().decode(s.events.files['project.json'][0]));
 assert.equal(project.layers[0].streamUrl,url);assert.equal(project.layers[0].file,null);
});
test('actual failed full save never creates a ZIP or reports success',async()=>{
  for(const opts of [{},{returnBlob:true}]){
    const s=saving({artifact:null});assert.equal(await s.save(false,opts),undefined);
    assert.equal(s.events.zip,0);assert(s.events.toasts.some(x=>x.startsWith('zip-fail')));
    assert.equal(s.events.toasts.length,2);
  }
});
test('actual successful full save bundles exact pinned bytes',async()=>{
  const s=saving({});assert(await s.save(false,{returnBlob:true}) instanceof Blob);
  assert.equal(s.events.zip,1);assert.deepEqual(Buffer.from(s.events.files['Locahun3D_OfflineViewer.html'][0]),bytes);
});

test('actual ZIP save includes verified regional files and fails closed if collection fails',async()=>{
 const s=saving({}),manifest={schema:1,source:'ab'.repeat(32)},name='assets/'+'cd'.repeat(32)+'.lnv',payload=new Uint8Array([4,5,6]);
 s.context._walkSaveSettings=()=>({navigationRegions:manifest});s.context._collectRegionalNavigationFiles=async()=>({files:new Map([[name,payload]])});
 assert(await s.save(true,{returnBlob:true}) instanceof Blob);assert.deepEqual(s.events.files[name][0],payload);
 const bad=saving({});bad.context._walkSaveSettings=()=>({navigationRegions:manifest});bad.context._collectRegionalNavigationFiles=async()=>{throw Error('Missing navigation');};
 assert.equal(await bad.save(true,{returnBlob:true}),undefined);assert.equal(bad.events.zip,0);
});
