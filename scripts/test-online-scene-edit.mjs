import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Use the same pinned codec as the viewer, not a mock ZIP implementation.
const codecSource=await (await fetch('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js')).text();
const codec=await import('data:text/javascript;base64,'+Buffer.from(codecSource).toString('base64'));
const source=fs.readFileSync(new URL('../src/js/310_zip_project_save_load_fflate.js',import.meta.url),'utf8');
function setup(overrides={}){
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},Blob,Response,URL,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,
    layers:[{id:1,name:'scan',type:'splat',_rawBuffer:new Uint8Array([1,2,3]).buffer,_rawExt:'splat',pos:{x:1,y:2,z:3},rot:{x:0,y:90,z:0},scale:{x:2,y:2,z:2}}],
    showUndoToast(){},T:x=>x,isMobile:false,innerWidth:1440,innerHeight:900,_pathMode:false,
    _pathWidth:x=>x||.1,_pathLayerName:x=>x,_projectName:'Fixture',camPos:{x:0,y:1,z:0},yaw:0,pitch:0,
    _initCamPos:{x:0,y:1,z:0},_initYaw:0,_initPitch:0,_layerNextId:10,_walkSaveSettings:()=>({}),sun:{city:'tokyo'},
    location:{href:'https://app.example/viewer.html'},fetch:async()=>{throw Error('network failure');},...overrides});
  ctx.window=ctx;vm.runInContext(source,ctx);ctx.getFflate=async()=>codec;
  return {ctx,save:()=>ctx.saveProjectZip(false,{returnBlob:true,strictOnline:true})};
}
for(const [label,change,error] of [
  ['missing raw asset',s=>delete s.ctx.layers[0]._rawBuffer,/incomplete/i],
  ['failed streamed fetch',s=>{delete s.ctx.layers[0]._rawBuffer;s.ctx.layers[0]._streamUrl='https://app.example/asset.rad';},/incomplete/i],
  ['unsupported layer',s=>s.ctx.layers.push({type:'camera'}),/unsupported/i],
  ['unfinished path',s=>s.ctx._pathMode=true,/path/i],
  ['phone lite omission',s=>{s.ctx.isMobile=true;s.ctx.innerWidth=390;s.ctx.layers[0]._rawBuffer={byteLength:201*1024**2};},/capacity/i],
])test('strict export rejects '+label,async()=>{const s=setup();change(s);await assert.rejects(s.save,error);});
test('complete ZIP retains path, event image and transform without viewer or authenticated URL',async()=>{
  const s=setup();s.ctx.layers.push({id:2,name:'area',type:'path',pathPoints:[{x:0,y:0,z:1},{x:4,y:0,z:1}],pathLabel:'Area',pathWidth:.5},
    {id:3,name:'photo',type:'event',eventImage:'data:image/png;base64,aGVsbG8=',eventImageName:'photo.png'});
  const files=codec.unzipSync(new Uint8Array(await (await s.save()).arrayBuffer()));
  const project=JSON.parse(codec.strFromU8(files['project.json']));
  assert.deepEqual(project.layers[0].pos,{x:1,y:2,z:3});assert.deepEqual(project.layers[0].rot,{x:0,y:90,z:0});
  assert.deepEqual(project.layers[1].pathPoints,[{x:0,y:0,z:1},{x:4,y:0,z:1}]);
  assert.equal(project.layers[2].eventImage,'data:image/png;base64,aGVsbG8=');
  assert.deepEqual([...files[project.layers[0].file]],[1,2,3]);assert.equal(files['Locahun3D_OfflineViewer.html'],undefined);
});
const loaderSource=fs.readFileSync(new URL('../src/js/311_zip_load_core.js',import.meta.url),'utf8');
function loaderSetup(){
  const s=setup();Object.assign(s.ctx,{_regionalNavigationFiles:null,walkSetup:{epoch:1},
    restoreProject:async project=>{s.ctx.layers=project.layers;return {epoch:1,layers:project.layers};}});
  vm.runInContext(loaderSource,s.ctx);return s;
}
test('strict ZIP loader refuses missing assets before changing the scene',async()=>{
  const s=loaderSetup(),before=s.ctx.layers;
  const file=new Blob([codec.zipSync({'project.json':codec.strToU8(JSON.stringify({version:4,layers:[{type:'splat',file:'missing.rad'}]}))})]);
  assert.equal(typeof s.ctx._loadOnlineSceneFile,'function','strict loader must exist');
  await assert.rejects(()=>s.ctx._loadOnlineSceneFile(file,'scene.zip'),/incomplete/i);assert.equal(s.ctx.layers,before);
});
test('strict ZIP loader propagates failed restoration and rejects untrusted stream-only archive',async()=>{
  const s=loaderSetup();assert.equal(typeof s.ctx._loadOnlineSceneFile,'function');
  const streamed=new Blob([codec.zipSync({'project.json':codec.strToU8(JSON.stringify({version:4,layers:[{type:'splat',streamUrl:'https://evil.example/private'}]}))})]);
  await assert.rejects(()=>s.ctx._loadOnlineSceneFile(streamed,'scene.zip'),/incomplete/i);
  const archive=await s.save();s.ctx.restoreProject=async()=>{throw Error('decode failed');};
  await assert.rejects(()=>s.ctx._loadOnlineSceneFile(archive,'scene.zip'),/decode failed/);
});
test('strict ZIP loader rejects interrupted restore even when all entries exist',async()=>{
  const s=loaderSetup();assert.equal(typeof s.ctx._loadOnlineSceneFile,'function');const archive=await s.save();
  s.ctx.restoreProject=async p=>{s.ctx.layers=p.layers;return {epoch:0,layers:p.layers};};
  await assert.rejects(()=>s.ctx._loadOnlineSceneFile(archive,'scene.zip'),/interrupted/i);
});
const bridgePath=new URL('../src/js/432_online_scene_edit.js',import.meta.url);
function bridgeSetup(overrides={}){
  const sent=[],handlers={},docHandlers={},parent={location:{origin:'https://app.example'},postMessage:(data,origin)=>sent.push({data,origin})};
  const ctx=vm.createContext({URL,URLSearchParams,Blob,Uint8Array,Response,AbortController,AbortSignal,performance,Promise,setTimeout,clearTimeout,
    location:{origin:'https://app.example',href:'https://app.example/viewer/scene-editor.html?onlineSceneEdit=1',search:'?onlineSceneEdit=1'},parent,
    document:{addEventListener:(name,fn)=>docHandlers[name]=fn,body:{classList:{add(){},remove(){}}}},
    addEventListener:(name,fn)=>handlers[name]=fn,isMobile:false,innerWidth:1440,innerHeight:900,MAX_EMBED_BYTES:1024**3,
    fetch:async()=>new Response(new Uint8Array([1,2,3])),_loadOnlineSceneFile:async()=>({}),
    saveProjectZip:async()=>new Blob(['archive']),...overrides});ctx.window=ctx;
  vm.runInContext(fs.existsSync(bridgePath)?fs.readFileSync(bridgePath,'utf8'):'',ctx);
  return {ctx,sent,handlers,docHandlers,parent,send:async(data,origin='https://app.example',source=parent)=>handlers.message?.({data,origin,source})};
}
const loadMessage={type:'locahun:scene-load',requestId:'load-1',sourceUrl:'/api/scene-edit/source?sessionKey='+'a'.repeat(64),fileName:'scene.zip'};
test('bridge authenticates exact parent and source route, then waits for complete restoration',async()=>{
  let finish;const s=bridgeSetup({_loadOnlineSceneFile:()=>new Promise(resolve=>finish=resolve)});
  assert.equal(s.sent[0]?.data.type,'locahun:scene-editor-ready');
  await s.send(loadMessage,'https://evil.example');await s.send(loadMessage,undefined,{});assert.equal(s.sent.length,1);
  await s.send({...loadMessage,requestId:'bad-url',sourceUrl:'https://evil.example/file'});assert.equal(s.sent.at(-1).data.type,'locahun:scene-load-error');
  const loading=s.send(loadMessage);await new Promise(r=>setImmediate(r));
  assert.equal(s.sent.some(x=>x.data.type==='locahun:scene-ready'),false);finish({});await loading;
  assert.equal(s.sent.at(-1).data.type,'locahun:scene-ready');assert(s.sent.every(x=>x.origin==='https://app.example'));
});
test('bridge failure never becomes ready or exports and stale requests cannot clear newer dirty state',async()=>{
  const failed=bridgeSetup({_loadOnlineSceneFile:async()=>{throw Error('decode');}});assert.ok(failed.handlers.message);
  await failed.send(loadMessage);await failed.send({type:'locahun:scene-export',requestId:'export-1'});
  assert.equal(failed.sent.some(x=>x.data.type==='locahun:scene-ready'),false);assert.equal(failed.sent.at(-1).data.type,'locahun:scene-export-error');
  const s=bridgeSetup();await s.send(loadMessage);s.docHandlers.input({});
  await s.send({type:'locahun:scene-export',requestId:'export-1'});const count=s.sent.length;
  await s.send({type:'locahun:scene-export',requestId:'export-1'});assert.equal(s.sent.length,count);
  s.docHandlers.input({});await s.send({type:'locahun:scene-saved',requestId:'export-1'});
  let warned=false;s.handlers.beforeunload({preventDefault(){warned=true;}});assert.equal(warned,true);
});
test('toolbar save requests online attachment instead of offline download',async()=>{
  const s=bridgeSetup();await s.send(loadMessage);let stopped=false;
  s.docHandlers.click({target:{closest:selector=>selector==='#tb-save-btn'},preventDefault(){},stopImmediatePropagation(){stopped=true;}});
  assert.equal(s.sent.at(-1).data.type,'locahun:scene-save-requested');assert.equal(stopped,true);
});
test('an image still being read blocks export and completing it marks the changed image dirty',async()=>{
  const s=bridgeSetup();await s.send(loadMessage);
  const layer={id:3,type:'event'};let input,reader;
  Object.assign(s.ctx,{findLayer:()=>layer,renderTransformPanel(){},FileReader:class{constructor(){reader=this;}readAsDataURL(){} }});
  s.ctx.document.createElement=()=>input={click(){}};
  const pathSource=fs.readFileSync(new URL('../src/js/350_path_object_4_point_closed_region_center.js',import.meta.url),'utf8');
  vm.runInContext(pathSource.slice(pathSource.indexOf('window.importEventImage ='),pathSource.indexOf('window.showEventImage =')),s.ctx);
  s.ctx.importEventImage(3);input.onchange({target:{files:[{name:'photo.png'}]}});
  await s.send({type:'locahun:scene-export',requestId:'during-image'});
  assert.equal(s.sent.at(-1).data.type,'locahun:scene-export-error');
  reader.onload({target:{result:'data:image/png;base64,aGVsbG8='}});
  assert.equal(layer.eventImage,'data:image/png;base64,aGVsbG8=');assert.equal(s.sent.at(-1).data.type,'locahun:scene-dirty');
});
test('strict export rejects a GLTF requiring external buffer or image instead of dropping dependencies',async()=>{
  const s=setup();s.ctx.layers=[{id:1,name:'model',type:'obj',_rawExt:'gltf',_rawBuffer:new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'missing.bin',byteLength:12}]})).buffer}];
  await assert.rejects(s.save,/incomplete/i);
});
test('strict streaming export embeds all bytes without retaining authenticated source URL',async()=>{
  const s=setup({fetch:async()=>new Response(new Uint8Array([9,8,7]))});delete s.ctx.layers[0]._rawBuffer;s.ctx.layers[0]._streamUrl='https://app.example/api/scene-edit/source?sessionKey=private';
  const files=codec.unzipSync(new Uint8Array(await (await s.save()).arrayBuffer()));const text=codec.strFromU8(files['project.json']);
  const project=JSON.parse(text);assert.deepEqual([...files[project.layers[0].file]],[9,8,7]);assert.equal(project.layers[0].streamUrl,undefined);assert.equal(text.includes('private'),false);
});
test('source is fetched as parallel no-store Range chunks, reassembled in order, with progress sent to the parent',async()=>{
  const total=40*1024**2+123,source=new Uint8Array(total);for(let i=0;i<total;i+=4099)source[i]=(i/4099)%251;
  const calls=[];let inFlight=0,peak=0,failedOnce=false,received;
  const s=bridgeSetup({
    fetch:async(_url,init)=>{
      const m=/^bytes=(\d+)-(\d+)$/.exec(init.headers?.Range||'');assert.ok(m,'every request is a Range request');assert.equal(init.cache,'no-store');
      const from=+m[1],to=+m[2];calls.push([from,to]);
      if(from===16*1024**2&&!failedOnce){failedOnce=true;throw Error('transient');}
      inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,5));inFlight--;
      return new Response(source.slice(from,to+1),{status:206,headers:{'content-range':`bytes ${from}-${to}/${total}`}});
    },
    _loadOnlineSceneFile:async blob=>{received=new Uint8Array(await blob.arrayBuffer());return {};},
  });
  await s.send(loadMessage);
  assert.equal(s.sent.at(-1).data.type,'locahun:scene-ready');
  assert.equal(received.length,total);assert.ok(received.every((v,i)=>v===source[i]),'bytes are reassembled in order');
  assert.ok(peak>1,'chunks are fetched in parallel');assert.ok(failedOnce&&calls.filter(c=>c[0]===16*1024**2).length===2,'a failed chunk is retried');
  const progress=s.sent.filter(m=>m.data.type==='locahun:scene-load-progress');
  assert.ok(progress.length&&progress.at(-1).data.loaded===total&&progress.at(-1).data.total===total);
});
test('a referenced RAD is saved as a reference: no bytes, no URL, and loads back only with a caller-supplied stream URL',async()=>{
  const s=loaderSetup();
  s.ctx.layers=[{id:1,name:'scan',type:'splat',_streamUrl:'https://app.example/api/scene-edit/source?sessionKey=private',_streamRef:'source',_rawExt:'rad',_isMain:true,pos:{x:0,y:0,z:0},rot:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}];
  let fetched=false;s.ctx.fetch=async()=>{fetched=true;throw Error('must not download');};
  const archive=await s.save();assert.equal(fetched,false,'the RAD is never downloaded for saving');
  assert.ok(archive.size<20000,'archive holds only the project');
  const files=codec.unzipSync(new Uint8Array(await archive.arrayBuffer())),text=codec.strFromU8(files['project.json']),entry=JSON.parse(text).layers[0];
  assert.equal(entry.streamRef,'source');assert.ok(!entry.file);assert.ok(!entry.streamUrl);assert.ok(!text.includes('sessionKey'));
  await assert.rejects(()=>s.ctx._loadOnlineSceneFile(archive,'scene.zip'),/incomplete/i);
  let restored;s.ctx.restoreProject=async p=>{restored=p;s.ctx.layers=p.layers;return {epoch:1,layers:p.layers};};
  await s.ctx._loadOnlineSceneFile(archive,'scene.zip','/api/scene-edit/source?sessionKey=x&ref=stream');
  assert.equal(restored.layers[0].streamUrl,'/api/scene-edit/source?sessionKey=x&ref=stream');
  const evil=new Blob([codec.zipSync({'project.json':codec.strToU8(JSON.stringify({version:4,layers:[{id:1,type:'splat',streamRef:'source',streamUrl:'https://evil.example/x'}]}))})]);
  await s.ctx._loadOnlineSceneFile(evil,'scene.zip','/safe');assert.equal(restored.layers[0].streamUrl,'/safe','a URL inside the archive never wins');
});
test('a RAD source is streamed, not downloaded, by the editor bridge',async()=>{
  let streamed,fetched=false;
  const s=bridgeSetup({fetch:async()=>{fetched=true;return new Response(new Uint8Array([1]));},_loadOnlineSceneStream:async(url,name)=>{streamed=[url,name];return {};}});
  await s.send({...loadMessage,requestId:'rad-1',fileName:'scene.rad'});
  assert.equal(s.sent.at(-1).data.type,'locahun:scene-ready');assert.equal(fetched,false);
  assert.deepEqual(streamed,['https://app.example/api/scene-edit/source?sessionKey='+'a'.repeat(64),'scene.rad']);
});
