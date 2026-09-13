import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './collision-cache-bridge-fixture.mjs';

function setup() {
  const f=fixture(null);
  Object.assign(f.c,{AbortController,Headers,Response});
  f.c.camPos.set=function(x,y,z){Object.assign(this,{x,y,z});};
  return f;
}
function remote(f) {
  f.run('layers[0]._rawBuffer=null;layers[0]._streamUrl="https://assets.example/scene.rad"');
}
test('automatic raw import never hashes or bakes, even with camera OFF',async()=>{
  const f=setup();f.run('setCameraCollision(false);_wholeHash=()=>{throw Error("Unexpected hash");}');
  assert.equal(await f.run('_walkAutoImport()'),false);
  assert.equal(f.c.bakes,0);assert.equal(f.c.coreBuilds,0);
  assert.match(f.run('walkSetup.status'),/未準備/);
});
test('missing validators or failed HEAD never cause automatic source GET',async()=>{
  for(const status of [200,401,403,405,500]){
    const f=setup();remote(f);const requests=[];
    f.c.fetch=async(url,options)=>{requests.push(options?.method||'GET');return new Response(null,{status});};
    assert.equal(await f.run('_walkAutoImport()'),false);
    assert.deepEqual(requests,['HEAD']);assert.equal(f.c.bakes,0);
  }
});
test('known demo proxy validates with no source bake; mismatches defer',async()=>{
  const d=JSON.parse(fs.readFileSync(new URL('../collision/demo-source.json',import.meta.url),'utf8'));
  const bytes=new Uint8Array(fs.readFileSync(new URL('../collision/'+d.whole.key+'.lct',import.meta.url)));
  for(const variant of ['exact','query','matrix','cell','corrupt','missing','storage-denied']){
    const f=setup();f.c.demoMatrix=d.sources[0].matrix.slice();remote(f);
    f.run('layers[0]._streamUrl="https://locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad";layers[0].mesh.matrixWorld.elements=demoMatrix;');
    f.run(fs.readFileSync(new URL('../src/js/216a_collision_manifest.js',import.meta.url),'utf8'));
    if(variant==='query')f.run('layers[0]._streamUrl+="?different=1"');
    if(variant==='matrix')f.run('demoMatrix[12]+=1');
    if(variant==='cell')f.run('walkSetup.settings.cellSize=.3');
    if(variant==='storage-denied')f.c.LocahunCollisionCache={get:async()=>{throw Error('denied');},put:async()=>{throw Error('denied');}};
    const requests=[];f.c.fetch=async(url,options)=>{
      requests.push(options?.method||'GET');
      if(options?.method==='HEAD')return new Response(null,{headers:{etag:d.metadata.httpEtag,'content-length':String(d.metadata.size)}});
      assert.match(url,/\/collision\/.*\.lct$/);
      if(variant==='missing')return new Response(null,{status:404});
      return new Response(variant==='corrupt'?new Uint8Array(bytes.length):bytes,{headers:{'content-length':String(bytes.length)}});
    };
    assert.equal(await f.run('_walkAutoImport()'),variant==='exact'||variant==='storage-denied',variant);
    assert.equal(f.c.bakes,0,variant);
    assert.deepEqual(requests,['exact','corrupt','missing','storage-denied'].includes(variant)?['HEAD','GET']:['HEAD']);
  }
});
test('source HEAD inherits auth and credentials; 401 never retries raw GET even explicitly',async()=>{
  const f=setup();remote(f);
  f.run('layers[0].mesh.paged={rootUrl:layers[0]._streamUrl,requestHeader:{Authorization:"Bearer synthetic"},withCredentials:true}');
  const requests=[];f.c.fetch=async(url,options)=>{requests.push(options);return new Response(null,{status:401});};
  assert.equal(await f.run('_walkGenerateCollision({allowBake:true})'),false);
  assert.equal(requests.length,1);assert.equal(requests[0].credentials,'include');
  assert.equal(new Headers(requests[0].headers).get('authorization'),'Bearer synthetic');
});
test('scene cancellation aborts pending identity HEAD and never installs',async()=>{
  const f=setup();remote(f);let signal;
  f.c.fetch=(url,options)=>new Promise((resolve,reject)=>{signal=options.signal;signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});
  const pending=f.run('_walkAutoImport()');
  for(let i=0;i<30&&!signal;i++)await new Promise(r=>setTimeout(r,2));
  f.run('_walkCancelPending()');await pending;
  assert(signal?.aborted);assert.equal(f.c.coreBuilds,0);assert.equal(f.c.bakes,0);
});
test('stalled HEAD has a bounded abort and no automatic GET fallback',async()=>{
  const f=setup();remote(f);let signal,calls=0;
  f.c.setTimeout=(fn,ms,...args)=>setTimeout(fn,ms===5000?10:ms,...args);
  f.c.fetch=(url,options)=>{calls++;signal=options.signal;return new Promise(()=>{});};
  assert.equal(await f.run('_walkAutoImport()'),false);
  assert(signal.aborted);assert.equal(calls,1);assert.equal(f.c.bakes,0);
});
test('unprepared normal camera remains movable and reports readiness without retry storm',async()=>{
  const f=setup();await f.run('_walkAutoImport()');
  f.run('camPos.x=2;_applyFreeCameraCollision({x:0,y:2,z:0})');
  assert.equal(f.c.camPos.x,2);assert.equal(f.run('walkSetup.cameraReadiness'),'unavailable');
  assert.equal(f.run('walkSetup.pending'),null);assert.equal(f.c.bakes,0);
});
test('explicit preparation after automatic deferral can bake before avatar start',async()=>{
  const f=setup();await f.run('_walkAutoImport()');
  await f.run('_walkPrepareCollision()');
  assert.equal(f.c.bakes,1);assert.equal(f.c.coreBuilds,1);
  assert.equal(f.c.walkMode.active,false);assert.equal(f.run('walkSetup.cameraReadiness'),'ready');
});
test('automatic saved or memory reuse preserves a verified ready core without another bake',async()=>{
  const f=setup();await f.run('_walkGenerateCollision({allowBake:true})');
  assert.equal(await f.run('_walkAutoImport()'),true);
  assert.equal(f.c.bakes,1);assert.equal(f.run('walkSetup.cameraReadiness'),'ready');
  f.run('walkSetup.settings.whole=null');
  assert.equal(await f.run('_walkAutoImport()'),true);assert.equal(f.c.bakes,1);
});
test('explicit failed preparation never activates the avatar or adopts a stale core',async()=>{
  const f=setup();remote(f);f.c.fetch=async()=>new Response(null,{status:403});
  await assert.rejects(f.run('_walkPrepareCollision()'));
  assert.equal(f.c.walkMode.active,false);assert.equal(f.c.coreBuilds,0);
});
test('cold saved local proxy hashes resident original bytes once without fetching or baking',async()=>{
  const warm=setup();assert(await warm.run('_walkGenerateCollision({allowBake:true})'));
  const saved=JSON.parse(warm.run('JSON.stringify(walkSetup.settings.whole)'));
  const f=setup();f.c.saved=saved;f.run('walkSetup.settings.whole=saved');
  let hashes=0;const hash=f.run('_wholeHash');f.c.countedHash=async bytes=>{if(bytes===f.c.layers[0]._rawBuffer)hashes++;return hash(bytes);};
  f.run('_wholeHash=countedHash');
  assert.equal(await f.run('_walkAutoImport()'),true);assert.equal(hashes,1);assert.equal(f.c.bakes,0);
  assert.equal(await f.run('_walkAutoImport()'),true);assert.equal(hashes,1);
  const changed=setup();changed.c.saved=saved;
  changed.run('walkSetup.settings.whole=saved;layers[0]._rawBuffer=new Uint32Array([1,0,0,0,0,0,0,0])');
  assert.equal(await changed.run('_walkAutoImport()'),false);assert.equal(changed.c.bakes,0);assert.equal(changed.c.coreBuilds,0);
});
test('already aborted source job starts no HEAD fetch',async()=>{
  const f=setup();let calls=0;f.c.fetch=async()=>{calls++;return new Response(null);};
  f.run('walkSetup.job={epoch:walkSetup.epoch,signature:_walkSourceSignature(),abortController:new AbortController(),cancelled:new Promise(()=>{})};walkSetup.job.abortController.abort();');
  await assert.rejects(f.run('_wholeSourceFetch("https://assets.example/a.rad","HEAD",layers[0].mesh,walkSetup.job)'));
  assert.equal(calls,0);
});
test('public camera readiness API rejects stale cores and respects disabled setting',async()=>{
  const f=setup();assert.equal(typeof f.c.getCameraCollisionState,'function');
  assert.equal(f.c.getCameraCollisionState().ready,false);
  assert(await f.run('_walkGenerateCollision({allowBake:true})'));assert.equal(f.c.getCameraCollisionState().ready,true);
  f.run('layers[0].mesh.matrixWorld.elements[12]=1');assert.equal(f.c.getCameraCollisionState().ready,false);
  f.run('setCameraCollision(false)');assert.equal(f.c.getCameraCollisionState().readiness,'off');
  assert.equal(f.c.getCameraCollisionState().enabled,false);
});
test('fresh automatic context uses source-bound persistent bytes and rejects a changed scene during get',async()=>{
  let stored;
  const warm=setup();remote(warm);
  warm.c.fetch=async()=>new Response(null,{headers:{etag:'"synthetic"','content-length':'32'}});
  warm.c.LocahunCollisionCache={get:async()=>null,put:async(key,bytes)=>{stored={key,bytes};return true;}};
  assert(await warm.run('_walkGenerateCollision({allowBake:true})'));
  for(const stale of [false,true]){
    const f=setup();remote(f);f.c.fetch=warm.c.fetch;let release;
    f.c.LocahunCollisionCache={get:key=>{assert.equal(key,stored.key);return stale?new Promise(r=>{release=r;}):Promise.resolve(stored.bytes);}};
    const pending=f.run('_walkAutoImport()');
    if(stale){
      for(let i=0;i<30&&!release;i++)await new Promise(r=>setTimeout(r,2));
      assert(release);f.run('layers[0].mesh.matrixWorld.elements[12]=2');release(stored.bytes);
    }
    assert.equal(await pending,!stale);assert.equal(f.c.bakes,0);assert.equal(f.c.coreBuilds,stale?0:1);
  }
});
