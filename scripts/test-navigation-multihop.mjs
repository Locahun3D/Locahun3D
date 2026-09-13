import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({}),file=new URL('../src/js/403p_navigation_multihop.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);
function fixture(){
 const source='d'.repeat(64),keys=['a','b','c'].map(k=>k.repeat(64));
 const entries=keys.map((key,i)=>({source,key,bounds:[[i*4-1,-1,-1],[i*4+5,3,3]]}));
 const portals=[0,1].map(i=>({a:{key:keys[i],point:{x:i*4+4,y:0,z:0}},b:{key:keys[i+1],point:{x:i*4+4,y:0,z:0}}}));
 let active=true,loads=0,checked=0;
 const input={source,from:{x:0,y:0,z:0},to:{x:12,y:0,z:0},entries,portals,current:()=>active,
  prepare:async e=>{loads++;return {find:(a,b,key)=>{assert.equal(key,e.key);return [a,b];}};},accept:async()=>{checked++;return true;}};
 return {input,cancel(){active=false;},get loads(){return loads;},get checked(){return checked;}};
}
test('three-region route preserves every verified join and copies before eviction',async()=>{
 const f=fixture();assert.equal(typeof c.LocahunNavigationMultihop?.find,'function');
 let previous;
 f.input.prepare=async e=>{if(previous)previous.forEach(p=>p.x=999);return {find:(a,b)=>previous=[{...a},{...b}]};};
 const route=await c.LocahunNavigationMultihop.find(f.input);
 assert.deepEqual(Array.from(route.keys),f.input.entries.map(e=>e.key));
 assert.deepEqual(Array.from(route.points,p=>p.x),[0,4,4,8,8,12]);
});
test('missing middle connection or a changed source never produces a route',async()=>{
 for(const mode of ['missing','source','floor']){
  const f=fixture();if(mode==='missing')f.input.portals.pop();
  if(mode==='source')f.input.entries[1].source='e'.repeat(64);
  if(mode==='floor')f.input.portals[0].b.point.y=2;
  assert.equal(await c.LocahunNavigationMultihop.find(f.input),null);assert.equal(f.checked,0);
 }
});
test('disconnected region query and full physical rejection never accept a chain',async()=>{
 const f=fixture();
 // Match by key since the planner owns snapshots.
 f.input.prepare=async e=>({find:(a,b)=>e.key===f.input.entries[1].key?null:[a,b]});
 assert.equal(await c.LocahunNavigationMultihop.find(f.input),null);
 const g=fixture();g.input.accept=async()=>false;assert.equal(await c.LocahunNavigationMultihop.find(g.input),null);
});

test('physical attempts and query loads remain bounded for many alternate portals',async()=>{
 const f=fixture();f.input.portals=Array.from({length:16},(_,i)=>f.input.portals[i%2]);let attempts=0;
 f.input.accept=async()=>{attempts++;return false;};
 assert.equal(await c.LocahunNavigationMultihop.find(f.input),null);assert.equal(attempts,4);assert(f.loads<=32);
});
test('physical verifier receives immutable geometry',async()=>{
 const f=fixture();let rejected=false;
 f.input.accept=async route=>{try{route.points[0].x=999;}catch{rejected=true;}return true;};
 const route=await c.LocahunNavigationMultihop.find(f.input);assert(rejected);assert.equal(route.points[0].x,0);
});
test('late source changes cannot return a prepared or verified route',async()=>{
 for(const stage of ['prepare','accept']){const f=fixture(),original=f.input[stage];
  f.input[stage]=async(...args)=>{const result=await original(...args);f.cancel();return result;};
  assert.equal(await c.LocahunNavigationMultihop.find(f.input),null);
 }
});
test('distance and malformed graph reject before loading',async()=>{
 const f=fixture();f.input.to.x=40;assert.equal(await c.LocahunNavigationMultihop.find(f.input),null);assert.equal(f.loads,0);
 const g=fixture();g.input.portals=Array(257).fill(g.input.portals[0]);assert.equal(await c.LocahunNavigationMultihop.find(g.input),null);assert.equal(g.loads,0);
});
