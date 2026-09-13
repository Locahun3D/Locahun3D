import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({}),file=new URL('../src/js/403h_navigation_regions.js',import.meta.url);
vm.runInContext(fs.readFileSync(new URL('../src/js/403p_navigation_multihop.js',import.meta.url),'utf8'),c);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);
const source='ab'.repeat(32),entry=(x,key)=>({source,key:key.repeat(64),sha256:'f'.repeat(64),bytes:10,bounds:[[x,-2,0],[x+32,8,32]]});
function fixture(){
 assert(c.LocahunNavigationRegions);let epoch=1,loads=0;const entries=[entry(0,'a'),entry(16,'b')];
 const io={read:()=>({source,epoch,entries}),store:{prepare:async e=>{loads++;return {find:(a,b,key)=>{assert.equal(key,e.key);return [a,b];}};}}};
 return {io,regions:c.LocahunNavigationRegions.create(io),change(){epoch++;},get loads(){return loads;}};
}
test('regions load only a covering candidate and return its bound route',async()=>{
 const f=fixture();assert.equal(f.loads,0);
 const route=await f.regions.find({x:4,y:0,z:4},{x:24,y:0,z:4});assert(route?.points.length);assert.equal(route.key,'a'.repeat(64));assert.equal(f.loads,1);
});
test('region routing crosses three connected regions through one bounded physical gate',async()=>{
 const f=fixture(),entries=[0,1,2].map((n)=>({...entry(0,'abc'[n]),bounds:[[n*4-1,-2,0],[n*4+5,8,8]]}));
 f.io.read=()=>({source,epoch:1,entries});let checked=0;
 f.io.loadGraph=async()=>({portals:[4,8].map((x,i)=>({a:{key:entries[i].key,point:{x,y:0,z:4}},b:{key:entries[i+1].key,point:{x,y:0,z:4}}}))});
 const route=await f.regions.find({x:0,y:0,z:4},{x:12,y:0,z:4},async r=>{checked++;assert.equal(r.keys.length,3);return true;});
 assert.equal(route?.keys.length,3);assert.equal(checked,1);
 checked=0;assert.equal(await f.regions.find({x:0,y:0,z:4},{x:12,y:0,z:4},async()=>{checked++;return false;}),null);
 assert.equal(checked,1);
});
test('verified graph is loaded only when no single region covers both endpoints',async()=>{
 const f=fixture();let calls=0;f.io.loadGraph=async()=>{calls++;return {portals:[{a:{key:'a'.repeat(64),point:{x:24,y:0,z:4}},b:{key:'b'.repeat(64),point:{x:24,y:0,z:4}}}]};};
 const route=await f.regions.find({x:10,y:0,z:4},{x:38,y:0,z:4});
 assert.deepEqual(Array.from(route?.keys||[]),['a'.repeat(64),'b'.repeat(64)]);assert.equal(calls,1);
 assert(route.points.length>=4);
});
test('a stale graph cannot bridge entries belonging to another live source',async()=>{
 const f=fixture(),state=f.io.read();f.io.read=()=>({...state,source:'c'.repeat(64)});
 f.io.loadGraph=async()=>({portals:[{a:{key:'a'.repeat(64),point:{x:24,y:0,z:4}},b:{key:'b'.repeat(64),point:{x:24,y:0,z:4}}}]});
 assert.equal(await f.regions.find({x:10,y:0,z:4},{x:38,y:0,z:4}),null);
});

test('cross-region candidates fall back after failed physical verification and discard late acceptance',async()=>{
 const f=fixture();f.io.loadGraph=async()=>({portals:[24,25].map(x=>({a:{key:'a'.repeat(64),point:{x,y:0,z:4}},b:{key:'b'.repeat(64),point:{x,y:0,z:4}}}))});
 let checked=0;
 const route=await f.regions.find({x:10,y:0,z:4},{x:38,y:0,z:4},async()=>++checked===2);
 assert.equal(checked,2);assert.equal(route.points[1].x,25);
 assert.equal(await f.regions.find({x:10,y:0,z:4},{x:38,y:0,z:4},async()=>{f.change();return true;}),null);
});
test('uncovered, distant and invalid points never request data',async()=>{
 const f=fixture();for(const to of [{x:60,y:0,z:4},{x:35,y:0,z:4},{x:NaN,y:0,z:4},{x:4,y:20,z:4}])assert.equal(await f.regions.find({x:4,y:0,z:4},to),null);
 assert.equal(f.loads,0);
});
test('scene changes and replacement intents discard asynchronous routes',async()=>{
 const f=fixture();let release;f.io.store.prepare=()=>new Promise(r=>release=r);
 const pending=f.regions.find({x:4,y:0,z:4},{x:20,y:0,z:4});f.change();release({find:(a,b)=>[a,b]});assert.equal(await pending,null);
 const next=f.regions.find({x:4,y:0,z:4},{x:20,y:0,z:4});f.regions.cancel();release({find:(a,b)=>[a,b]});assert.equal(await next,null);
});
test('routes leaving their region and partial endpoints are not accepted',async()=>{
 for(const route of [[{x:4,y:0,z:4},{x:40,y:0,z:4},{x:20,y:0,z:4}],[{x:4,y:0,z:4},{x:10,y:0,z:4}]]){
  const f=fixture();f.io.store.prepare=async()=>({find:()=>route});assert.equal(await f.regions.find({x:4,y:0,z:4},{x:20,y:0,z:4}),null);
 }
});

test('malformed manifest entries do not prevent using a valid region',async()=>{
 const f=fixture();f.io.read().entries.unshift(null,undefined,{},42);
 assert(await f.regions.find({x:4,y:0,z:4},{x:20,y:0,z:4}));
});

test('a query failure tries another covering region without rejecting the input handler',async()=>{
 const f=fixture();let calls=0;
 f.io.store.prepare=async()=>({find:(a,b)=>{if(++calls===1)throw new Error('Invalid zone');return [a,b];}});
 assert(await f.regions.find({x:20,y:0,z:4},{x:24,y:0,z:4}));assert.equal(calls,2);
 f.io.store.prepare=async()=>({find:()=>{throw new Error('Invalid zone');}});
 assert.equal(await f.regions.find({x:20,y:0,z:4},{x:24,y:0,z:4}),null);
});
