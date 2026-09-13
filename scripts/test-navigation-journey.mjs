import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({AbortController});
for(const name of ['403i_navigation_corridor','403j_navigation_journey']){
 const path=new URL('../src/js/'+name+'.js',import.meta.url);if(fs.existsSync(path))vm.runInContext(fs.readFileSync(path,'utf8'),context);
}
const a={x:0,y:0,z:0},b={x:2,y:0,z:0};
function fixture(){
 let epoch=1,disposed=0,built=0;
 const io={read:()=>({source:'a'.repeat(64),epoch}),regions:{find:async()=>({key:'b'.repeat(64),points:[a,b]}),cancel(){}},
  loadCollision:async()=>[{center:[1,-.1,0],half:[2,.1,2]}],
  build:async()=>{built++;return {dispose(){disposed++;}};}};
 assert(context.LocahunNavigationJourney);return {io,journey:context.LocahunNavigationJourney.create(io),change(){epoch++;},get disposed(){return disposed;},get built(){return built;}};
}
test('journey is lazy and its lease releases the temporary collision exactly once',async()=>{
 const f=fixture();assert.equal(f.built,0);const lease=await f.journey.acquire(a,b);assert(lease?.valid());
 assert(lease.covers(a));assert(!lease.covers({...a,y:3}));lease.dispose();lease.dispose();assert.equal(f.disposed,1);assert(!lease.valid());
});
test('two-region journey loads both payloads and requires full-core verification',async()=>{
 const f=fixture(),calls=[];f.io.regions.find=async()=>({key:'a',keys:['a','b'],points:[a,b]});
 f.io.loadCollision=async key=>{calls.push(key);return [{center:[1,-.1,0],half:[2,.1,2]}];};
 assert.equal(await f.journey.acquire(a,b),null);
 f.io.verifyCore=()=>true;assert((await f.journey.acquire(a,b))?.valid());assert.deepEqual(calls.slice(-2),['a','b']);
});
test('three and four regions share a deduplicated core and verify the entire route',async()=>{
 for(const keys of [['a','b','c'],['a','b','c','d']]){
  const f=fixture(),loaded=[];let verified=0;
  const points=[a,{x:1,y:0,z:0},b];
  f.io.regions.find=async()=>({key:keys[0],keys,points});
  f.io.loadCollision=async key=>{loaded.push(key);return [{center:[1,-.1,0],half:[2,.1,2]}];};
  f.io.build=async boxes=>{assert.equal(boxes.length,1);return {dispose(){}};};
  f.io.verifyCore=route=>{assert.deepEqual(route,points);verified++;return true;};
  const lease=await f.journey.acquire(a,b);assert(lease?.valid());
  assert.deepEqual(loaded,keys);assert.equal(verified,1);lease.dispose();
 }
});
test('invalid multi-region key sets are rejected before collision loading',async()=>{
 for(const keys of [[],['a'],['a','b','a'],['a','b','c','d','e'],['a',null]]){
  const f=fixture();let loaded=0;
  f.io.regions.find=async()=>({key:'a',keys,points:[a,b]});
  f.io.verifyCore=()=>true;f.io.loadCollision=async()=>{loaded++;return [];};
  assert.equal(await f.journey.acquire(a,b),null);assert.equal(loaded,0);
 }
});
test('a rejected three-region physical route disposes its core without a lease',async()=>{
 const f=fixture();f.io.regions.find=async()=>({key:'a',keys:['a','b','c'],points:[a,b]});
 f.io.verifyCore=()=>false;
 assert.equal(await f.journey.acquire(a,b),null);assert.equal(f.built,1);assert.equal(f.disposed,1);
});
test('a replacement aborts pending collision and rejects its late result',async()=>{
 const f=fixture();let resolve,signal;
 f.io.loadCollision=(_key,s)=>{signal=s;return new Promise(r=>resolve=r);};
 const pending=f.journey.acquire(a,b);await new Promise(r=>setImmediate(r));f.journey.cancel();assert(signal.aborted);
 resolve([]);assert.equal(await pending,null);assert.equal(f.built,0);
});

test('physical fallback disposes rejected cores before accepting a replacement',async()=>{
 const f=fixture();let checked=0;
 f.io.regions.find=async(_a,_b,accept)=>{for(let i=0;i<2;i++){const route={key:'a',keys:['a','b'],points:[a,b]};if(await accept(route))return route;}return null;};
 f.io.verifyCore=()=>++checked===2;
 const lease=await f.journey.acquire(a,b);assert(lease?.valid());assert.equal(f.built,2);assert.equal(f.disposed,1);
 lease.dispose();assert.equal(f.disposed,2);
});
test('a scene change during core creation disposes the late core',async()=>{
 const f=fixture();let release;f.io.build=()=>new Promise(r=>release=r);
 const pending=f.journey.acquire(a,b);await new Promise(r=>setImmediate(r));f.change();let disposed=0;
 release({dispose(){disposed++;}});assert.equal(await pending,null);assert.equal(disposed,1);
});
test('replacement releases previous lease and load failures do not escape',async()=>{
 const f=fixture();const first=await f.journey.acquire(a,b);assert(await f.journey.acquire(a,b));assert(!first.valid());assert.equal(f.disposed,1);
 f.io.loadCollision=async()=>{throw new Error('Unavailable');};assert.equal(await f.journey.acquire(a,b),null);assert.equal(f.disposed,2);
});
