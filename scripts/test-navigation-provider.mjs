import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {navigationRegionEntry} from './navigation-region-contract.mjs';
const c=vm.createContext({crypto:webcrypto,TextEncoder,Uint8Array,AbortController,URL,fetch,setTimeout,clearTimeout});
for(const n of ['403f_navigation_region_store','403g_navigation_region_loader','403p_navigation_multihop','403h_navigation_regions','403i_navigation_corridor','403j_navigation_journey','403k_navigation_provider'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+n+'.js',import.meta.url),'utf8'),c);
const source='ab'.repeat(32),bytes=new Uint8Array([1,2,3]),entry=navigationRegionEntry(source,[[-2,-2,-2],[8,5,8]],bytes),a={x:0,y:0,z:0},b={x:2,y:0,z:0};
function fixture(){
 let calls=0,disposed=0;const manifest={schema:1,source,regions:[{navigation:structuredClone(entry),collision:structuredClone(entry)}]};
 const io={manifest,baseUrl:'http://127.0.0.1/navigation/',read:()=>({source,epoch:1}),fetchFn:async()=>{calls++;return new Response(bytes);},
  decodeNavigation:async(_bytes,key)=>({source:key}),buildQuery:()=>({find:(a,b)=>[a,b],dispose(){}}),
  decodeCollision:async()=>[{center:[1,-.1,0],half:[2,.1,2]}],buildCore:async()=>({dispose(){disposed++;}})};
 return {io,get calls(){return calls;},get disposed(){return disposed;}};
}
test('provider is lazy, verifies paired payloads and disposes its active core',async()=>{
 const f=fixture(),p=c.LocahunNavigationProvider.create(f.io);assert.equal(f.calls,0);
 const lease=await p.acquire(a,b);assert(lease?.valid());assert.equal(f.calls,2);p.dispose();assert.equal(f.disposed,1);assert(!lease.valid());assert.equal(await p.acquire(a,b),null);
});
test('mismatched and duplicate pairs are rejected before any request',()=>{
 for(const mutate of [m=>m.regions[0].collision.key='ff'.repeat(32),m=>m.regions.push(m.regions[0]),m=>m.source='ff'.repeat(32),m=>m.regions[0].collision.bounds[0][0]=-3]){
  const f=fixture();mutate(f.io.manifest);assert.throws(()=>c.LocahunNavigationProvider.create(f.io));assert.equal(f.calls,0);
 }
});

test('provider rejects a changed live source before requesting assets',async()=>{
 const f=fixture(),p=c.LocahunNavigationProvider.create(f.io);
 f.io.read=()=>({source:'ff'.repeat(32),epoch:1});
 assert.equal(await p.acquire(a,b),null);assert.equal(f.calls,0);p.dispose();
});
test('provider snapshots manifest entries and rejects bad collision digest',async()=>{
 const f=fixture();f.io.manifest.regions[0].collision.sha256='ff'.repeat(32);const p=c.LocahunNavigationProvider.create(f.io);
 f.io.manifest.regions[0].collision.sha256=entry.sha256;assert.equal(await p.acquire(a,b),null);assert.equal(f.disposed,0);p.dispose();
});

test('rapid replacement keeps the latest collision request alive',async()=>{
 const f=fixture(),waiting=[];
 f.io.fetchFn=async url=>url.endsWith('.lnv')?new Response(bytes):new Promise(resolve=>waiting.push(resolve));
 const p=c.LocahunNavigationProvider.create(f.io),first=p.acquire(a,b);
 for(let i=0;i<100&&!waiting.length;i++)await new Promise(r=>setTimeout(r,1));assert.equal(waiting.length,1);
 const second=p.acquire(a,b);
 for(let i=0;i<100&&waiting.length<2;i++)await new Promise(r=>setTimeout(r,1));assert.equal(waiting.length,2);
 waiting[0](new Response(bytes));waiting[1](new Response(bytes));
 assert.equal(await first,null);assert((await second)?.valid());p.dispose();
});
