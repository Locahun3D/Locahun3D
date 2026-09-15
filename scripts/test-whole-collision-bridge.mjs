import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {startLocalProjectServer} from './local-project-server.mjs';
function fixture(){
 const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],packed=new Uint32Array(8);
 const mesh={initialized:Promise.resolve(),matrixWorld:{elements:matrix},updateWorldMatrix(){},packedSplats:{packedArray:packed,numSplats:2}};
 let builds=0;
 const c=vm.createContext({console,crypto:webcrypto,Uint8Array,Uint32Array,Float32Array,TextEncoder,TextDecoder,DataView,Blob,CompressionStream,DecompressionStream,btoa,atob,performance,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},
  fetch:async()=>new Response('',{status:404}),layers:[{id:1,type:'splat',visible:true,mesh,_rawBuffer:packed}],camPos:{x:0,y:2,z:0},walkMode:{height:1.65,active:false},document:{getElementById:()=>null},scene:{},markDirty(){},showUndoToast(){},THREE:{},
  LocahunWalkCollision:{async create(){builds++;return {rebuild(){},setTileCoverage(){},dispose(){}};}}
 });c.window=c;
 for(const file of ['216b_whole_collision.js','216c_collision_bake.js','216_walk_settings.js','217_walk_collision_bridge.js','217b_whole_collision_bridge.js'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+file,import.meta.url),'utf8'),c);
 return {c,run:s=>vm.runInContext(s,c),builds:()=>builds};
}
test('explicit preparation creates persistent proxy and ignores render residency / camera movement',async()=>{
 const f=fixture();assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'));
 assert(f.run('!!walkSetup.wholeIndex'));assert(f.run('walkSetup.settings.whole.data.length')>0);
 f.run('camPos.x=200;walkSetup.residentAtBuild="different"');await f.run('_walkAutoTick()');assert.equal(f.builds(),1);
 assert.equal(f.run('_walkNeedsRegion(camPos,3)'),false);
});

test('saved raw-file collision reuses exact cache after two real local-server launches without rebaking',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nav-restart-'));let server;
 t.after(async()=>{await server?.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('nav-restart-'));fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'assets'));fs.mkdirSync(path.join(root,'history'));
 fs.writeFileSync(path.join(root,'viewer.html'),'fixture');fs.writeFileSync(path.join(root,'assets/scene.rad'),new Uint8Array(32));
 fs.writeFileSync(path.join(root,'project-state.json'),JSON.stringify({revision:0,status:'draft',project:{version:4,layers:[{id:1,type:'splat',file:'assets/scene.rad'}]}}));
 const original=fixture();original.run('walkSetup.settings.cellSize=.1');
 assert(await original.run('_walkGenerateCollision({automatic:true,allowBake:true})'));
 const saved=JSON.parse(JSON.stringify(original.run('_walkSaveSettings()')));let previousUrl;
 for(let launch=0;launch<2;launch++){
  server=await startLocalProjectServer({root});assert.notEqual(server.url,previousUrl);previousUrl=server.url;
  const f=fixture(),methods=[];f.c.URL=URL;f.c.location=new URL(server.url);f.c.localProject={ready:true};f.c.saved=saved;
  f.c.fetch=(url,options)=>{methods.push(options?.method||'GET');return fetch(url,options);};
  f.c.sourceUrl=new URL('assets/scene.rad',server.url).href;
  f.run('walkSetup.settings=LocahunWalkSettings.parse(saved);layers[0]._rawBuffer=null;layers[0]._streamUrl=sourceUrl;LocahunCollisionBake.generate=()=>{throw Error("Unexpected bake")};');
  assert(await f.run('_walkGenerateCollision({automatic:true})'),f.run('walkSetup.status'));
  assert.equal(f.run('walkSetup.settings.whole.key'),saved.whole.key);assert(f.run('!!walkSetup.wholeIndex'));
  assert.deepEqual(methods,['HEAD']);await server.close();server=null;
 }
});
test('changed source transform defers automatic work until explicit regeneration',async()=>{
 const f=fixture();await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})');const key=f.run('walkSetup.settings.whole.key');
 f.run('layers[0].mesh.matrixWorld.elements[12]=10');await f.run('_walkAutoTick()');assert.equal(f.run('walkSetup.settings.whole.key'),key);await f.run('_walkGenerateCollision({allowBake:true})');assert.notEqual(f.run('walkSetup.settings.whole.key'),key);
});

test('replacing mesh with matching metadata invalidates collision signature',()=>{
 const f=fixture(),old=f.run('_walkSourceSignature()');
 f.run('layers[0].mesh={...layers[0].mesh}');
 assert.notEqual(f.run('_walkSourceSignature()'),old);
});

test('replacing raw bytes on an existing mesh invalidates collision signature',()=>{
 const f=fixture(),old=f.run('_walkSourceSignature()');
 f.run('layers[0]._rawBuffer=new Uint32Array(8)');
 assert.notEqual(f.run('_walkSourceSignature()'),old);
});

test('non tiled core installation clears previous whole index',async()=>{
 const f=fixture();await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})');
 await f.run('_walkInstallCore([{center:[0,0,0],half:[1,1,1]}])');
 assert.equal(f.run('walkSetup.wholeIndex'),null);
});

test('source ETag identity is scoped to its resource',async()=>{
 const f=fixture();f.c.fetch=async()=>new Response('',{headers:{etag:'"same"','content-length':'10'}});
 f.run('layers[0]._rawBuffer=null;layers[0]._streamUrl="https://one.example/a.rad"');
 await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})');const first=f.run('walkSetup.settings.whole.key');
 f.run('layers[0].mesh={...layers[0].mesh};layers[0]._streamUrl="https://two.example/a.rad"');
 await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})');assert.notEqual(f.run('walkSetup.settings.whole.key'),first);
});

test('late core from cancelled whole generation is disposed',async()=>{
 const f=fixture();let resolve,disposed=0;
 f.c.LocahunWalkCollision.create=()=>new Promise(r=>{resolve=r;});
 const pending=f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})');
 for(let i=0;i<100&&!resolve;i++)await new Promise(r=>setTimeout(r,5));
 assert(resolve);f.run('walkSetup.job.cancel();walkSetup.epoch++');
 await pending;
 resolve({dispose(){disposed++;}});await new Promise(r=>setTimeout(r,0));
 assert.equal(disposed,1);
});

test('blob sources do not require unsupported HEAD requests',async()=>{
 const f=fixture();f.run('layers[0]._rawBuffer=null;layers[0]._streamUrl="blob:http://localhost/local-file"');
 f.c.fetch=async(url,options)=>{
  if(options?.method==='HEAD')throw Error('HEAD unsupported for blob');
  if(!url.startsWith('blob:'))return new Response('',{status:404});
  return new Response(new Uint8Array(32),{headers:{'content-length':'32'}});
 };
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'),f.run('walkSetup.status'));
});

test('source response byte length must match advertised complete content',async()=>{
 const f=fixture();f.run('layers[0]._rawBuffer=null;layers[0]._streamUrl="blob:http://localhost/truncated"');
 f.c.fetch=async()=>new Response(new Uint8Array(16),{headers:{'content-length':'32'}});
 assert.equal(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'),false);
 assert.match(f.run('walkSetup.status'),/length/);
});

test('whole generation validates and persists automatic spawn without moving camera',async()=>{
 const f=fixture();let picks=0;
 f.c.computeAutoInitialView=()=>{picks++;return {position:{x:7,y:1,z:9},yaw:.5};};
 f.run('_walkSpawnPosition=()=>({...walkSetup.spawnCandidate,yaw:walkSetup.spawnYawCandidate})');
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'));
 assert.equal(picks,1);assert.equal(f.run('walkSetup.settings.spawn.x'),7);
 assert.equal(f.run('walkSetup.settings.spawnYaw'),.5);assert.equal(f.c.camPos.x,0);
});

test('small exclusions remove occupied cells without deleting an entire merged floor run',()=>{
 const f=fixture();
 f.run('walkSetup.settings.excludeIds=[5];_walkExcludeBoxes=boxes=>boxes.filter(b=>Math.abs(b.center[0]-1)>.2)');
 const boxes=f.run('_walkWholeExcludeBoxes([{center:[2.4,.075,.075],half:[2.4,.075,.075]}],.15)');
 const covered=x=>boxes.some(b=>Math.abs(x-b.center[0])<b.half[0]);
 assert.equal(covered(1),false);assert(covered(.2));assert(covered(4));
});

test('whole proxy honors selected cell size and exposes nearby preview boxes',async()=>{
 const f=fixture();f.run('walkSetup.settings.cellSize=.3');
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'),f.run('walkSetup.status'));
 assert.equal(f.run('walkSetup.wholeIndex.cellSize'),.3);
 assert(f.run('_walkPreviewBoxes().length')>0);
});

test('coverage failure preserves camera position instead of escaping the render loop',async()=>{
 const f=fixture();assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'));
 f.c.camPos.set=function(x,y,z){Object.assign(this,{x,y,z});};
 f.run('walkSetup.core.setTileCoverage=()=>{throw new Error("Active collision tile limit exceeded");};camPos.x=2');
 assert.doesNotThrow(()=>f.run('_applyFreeCameraCollision({x:0,y:2,z:0})'));
 assert.equal(f.c.camPos.x,0);assert.match(f.run('walkSetup.status'),/limit/);
});

test('embedded source bytes take precedence over stale saved blob transport URLs',async()=>{
 const f=fixture();f.run('layers[0]._streamUrl="blob:null/previous-browser-session"');
 f.c.fetch=async()=>{throw new Error('Failed to fetch stale blob');};
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'),f.run('walkSetup.status'));
});

test('whole bake owns a packed decoder independent of render pager initialization',async()=>{
 const f=fixture();let constructed=0,disposed=0;
 f.run('layers[0].mesh.paged={fileType:"RAD",pager:null}');
 f.c.PagedSplats=class{
  constructor(options){constructed++;assert.equal(options.pager.extSplats,false);assert.equal(options.fileBytes.byteLength,32);}
  async getRadMeta(){return {meta:{count:2,chunks:[{}]}};}
  async fetchDecodeChunk(){return {numSplats:2,packedArray:new Uint32Array(8),extra:{lodTree:new Uint32Array(8)}};}
  dispose(){disposed++;}
 };
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'),f.run('walkSetup.status'));
 assert.equal(constructed,1);assert.equal(disposed,1);
});

test('unlisted private collision keys are never requested from the public server',async()=>{
 const f=fixture();let requests=0;f.c.fetch=async()=>{requests++;return new Response('',{status:404});};
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'));assert.equal(requests,0);
});

test('public proxy bytes must match the release-pinned digest before reuse',async()=>{
 const f=fixture();assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'));
 const key=f.run('walkSetup.settings.whole.key'),bytes=f.run('_wholeUnbase64(walkSetup.settings.whole.data)');
 f.c.LocahunCollisionManifest={[key]:{sha256:'0'.repeat(64),bytes:bytes.length}};
 f.run('walkSetup.settings.whole=null;_wholeByteCache.clear()');
 let bakes=0;const generate=f.c.LocahunCollisionBake.generate;f.c.LocahunCollisionBake.generate=async(...args)=>{bakes++;return generate(...args);};
 f.c.fetch=async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}});
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'));assert.equal(bakes,1);
});

test('verified release proxy avoids source rebaking',async()=>{
 const f=fixture();assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'));
 const key=f.run('walkSetup.settings.whole.key'),bytes=f.run('_wholeUnbase64(walkSetup.settings.whole.data)');
 const sha256=await f.run('_wholeHash(_wholeUnbase64(walkSetup.settings.whole.data))');
 f.c.LocahunCollisionManifest={[key]:{sha256,bytes:bytes.length}};
 f.run('walkSetup.settings.whole=null;_wholeByteCache.clear()');
 f.c.LocahunCollisionBake.generate=async()=>{throw Error('Unexpected source rebake');};
 f.c.fetch=async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}});
 assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})'),f.run('walkSetup.status'));
});

test('explicit camera retry recovers a transient failure using cached geometry without baking',async()=>{
 const f=fixture();assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true})'));
 f.run('walkSetup.core=null;walkSetup.settings.signature="";LocahunCollisionBake.generate=()=>{throw Error("Must not bake")};');
 const create=f.c.LocahunWalkCollision.create;
 f.c.LocahunWalkCollision.create=async()=>{throw Error('temporary runtime failure');};
 assert.equal(await f.run('_walkGenerateCollision({automatic:true})'),false);
 f.c.LocahunWalkCollision.create=create;
 assert(await f.run('prepareCameraCollision()'),f.run('walkSetup.status'));
 assert.equal(f.run('getCameraCollisionState().ready'),true);
});

test('camera OFF to ON retries saved collision after a transient failure without baking',async()=>{
 const f=fixture();assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true})'));
 f.run('walkSetup.core=null;walkSetup.settings.signature="";LocahunCollisionBake.generate=()=>{throw Error("Must not bake")};');
 const create=f.c.LocahunWalkCollision.create;
 f.c.LocahunWalkCollision.create=async()=>{throw Error('temporary runtime failure');};
 assert.equal(await f.run('_walkGenerateCollision({automatic:true})'),false);
 f.c.LocahunWalkCollision.create=create;
 await f.run('setCameraCollision(false)');
 await f.run('setCameraCollision(true)');
 assert.equal(f.run('getCameraCollisionState().ready'),true);
 const builds=f.builds();await f.run('setCameraCollision(true)');
 assert.equal(f.builds(),builds);
});
