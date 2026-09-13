import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './collision-cache-bridge-fixture.mjs';
async function waitFor(check){for(let i=0;i<100&&!check();i++)await new Promise(r=>setTimeout(r,2));assert.ok(check());}
test('cold bridge reuses persisted bytes only after actual source-bound codec validation',async()=>{
  const map=new Map();let reads=0,writes=0;
  const cache={async get(k){reads++;return map.get(k)||null;},async put(k,b){writes++;map.set(k,b.slice());return true;}};
  const first=fixture(cache);assert.equal((await first.c.runFixture()).bakes,1);
  assert.equal(writes,1);assert.equal(map.size,1);
  const second=fixture(cache);const result=await second.c.runFixture();
  assert.equal(result.ok,true);assert.equal(result.bakes,0);assert.equal(reads,2);
  const key=result.key;map.set(key,new Uint8Array([1,2,3]));
  assert.equal((await fixture(cache).c.runFixture()).bakes,1);
  const wrong=await second.c.LocahunWholeCollision.encodeTiles([], 'wrong-source',.15);map.set(key,wrong);
  assert.equal((await fixture(cache).c.runFixture()).bakes,1);
  map.set(key,await second.c.LocahunWholeCollision.encodeTiles([],key,.15));
  assert.equal((await fixture(cache).c.runFixture()).bakes,1);
  const a=new second.c.LocahunWholeCollision.Accumulator({cellSize:.3,minPoints:1});a.add(0,0,0);
  map.set(key,await second.c.LocahunWholeCollision.encodeTiles(a.tiles(),key,.3));
  assert.equal((await fixture(cache).c.runFixture()).bakes,1);
});
test('missing, throwing, rejecting, and hanging helpers fall back to generation with bounded waits',async()=>{
  for(const cache of [null,{}, {get(){throw Error('denied');},put(){throw Error('quota');}},
    {get:()=>Promise.reject(Error('private')),put:()=>Promise.reject(Error('quota'))},
    {get:()=>new Promise(()=>{}),put:()=>new Promise(()=>{})}]) {
    const f=fixture(cache);const r=await f.c.runFixture();assert.equal(r.ok,true);assert.equal(r.bakes,1);
  }
});
test('completion awaits put and does not install a core while persistence remains pending',async()=>{
  let release;
  const f=fixture({get:async()=>null,put:()=>new Promise(r=>{release=r;})});
  const running=f.c.runFixture();await waitFor(()=>release);
  assert.equal(f.c.coreBuilds,0);release(true);
  assert.equal((await running).ok,true);assert.equal(f.c.coreBuilds,1);
});
test('cancelled or changed-source cache jobs never install late cores',async()=>{
  for(const stage of ['get','put'])for(const change of ['cancel','transform']) {
    let release;
    const cache={get:async()=>null,put:async()=>true};cache[stage]=()=>new Promise(r=>{release=r;});
    const f=fixture(cache),running=f.c.runFixture();await waitFor(()=>release);
    if(change==='cancel')f.run('walkSetup.job.cancel();walkSetup.epoch++');
    else f.run('layers[0].mesh.matrixWorld.elements[12]=10');
    release(stage==='get'?null:true);
    assert.equal((await running).ok,false);assert.equal(f.c.coreBuilds,0);assert.equal(f.run('walkSetup.core'),null);
  }
});
test('pinned manifest digest mismatch in persistent storage must not bypass verified public fetch',async()=>{
  const first=fixture();const r=await first.c.runFixture();
  const bytes=first.run('_wholeUnbase64(walkSetup.settings.whole.data)');
  const f=fixture({get:async()=>bytes,put:async()=>true});
  f.c.LocahunCollisionManifest={[r.key]:{sha256:'0'.repeat(64),bytes:bytes.length}};
  let requests=0;f.c.fetch=async()=>{requests++;return new Response('',{status:404});};
  assert.equal((await f.c.runFixture()).bakes,1);assert.equal(requests,1);
});
test('template loads optional cache before whole bridge exactly once',()=>{
  const text=fs.readFileSync(new URL('../src/template.html',import.meta.url),'utf8');
  assert.equal(text.split('{{include:src/js/216d_collision_cache.js}}').length-1,1);
  assert(text.indexOf('216d_collision_cache.js')<text.indexOf('217b_whole_collision_bridge.js'));
});
test('only exact query-free approved demo aliases share the same source key',async()=>{
  const canonical='https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad';
  async function result(url){
    const f=fixture(null);f.c.transport=url;
    f.c.fetch=async()=>new Response('',{headers:{etag:'"same"','content-length':'32'}});
    f.run('layers[0]._rawBuffer=null;layers[0]._streamUrl=transport');
    const r=await f.c.runFixture();assert.equal(r.ok,true);return r.key;
  }
  const expected=await result(canonical);
  for(const url of [canonical.replace('viewer.locahun3d.com','locahun3d.com'),'/api/demo-asset/Kousaten_ForDemo_point_cloud.rad'])assert.equal(await result(url),expected);
  const keys=[];
  for(const url of [canonical+'?v=1',canonical+'?',canonical.replace('viewer.locahun3d.com','other.example'),
    canonical.replace('demo-asset','viewer-stream'),canonical.replace('Kousaten','Other'),canonical.replace('https:','http:'),
    canonical.replace('viewer.locahun3d.com','viewer.locahun3d.com:8443')]) {
    const key=await result(url);assert.notEqual(key,expected);keys.push(key);
  }
  assert.equal(new Set(keys).size,keys.length);
});
