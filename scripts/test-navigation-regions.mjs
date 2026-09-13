import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({}),file=new URL('../src/js/403h_navigation_regions.js',import.meta.url);
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
