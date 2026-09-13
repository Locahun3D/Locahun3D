import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file=new URL('../src/js/403g_navigation_region_loader.js',import.meta.url);
const c=vm.createContext({URL,Uint8Array,AbortController,Error,setTimeout,clearTimeout,fetch});
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);
const entry={key:'ab'.repeat(32),bytes:3},baseUrl='https://viewer.locahun3d.com/navigation/';
const create=options=>{assert(c.LocahunNavigationRegionLoader);return c.LocahunNavigationRegionLoader.create({baseUrl,...options});};

test('collision transport allows only the fixed lcp extension',async()=>{
 const load=create({extension:'lcp',fetchFn:async url=>{assert.equal(url,baseUrl+entry.key+'.lcp');return new Response(new Uint8Array(3));}});
 assert.equal((await load(entry)).length,3);
 for(const extension of ['../secret','json','lnv?redirect=1',''])assert.throws(()=>create({extension}));
});
test('loader is lazy and derives a fixed hashed URL with bounded streaming',async()=>{
 let calls=0;const load=create({fetchFn:async(url,options)=>{calls++;assert.equal(url,baseUrl+entry.key+'.lnv');assert.equal(options.redirect,'error');return new Response(new Uint8Array([1,2,3]),{headers:{'content-length':'3'}});}});
 assert.equal(calls,0);assert.deepEqual(Array.from(await load(entry)),[1,2,3]);assert.equal(calls,1);
});
test('oversize, truncated and wrong-length payloads reject',async()=>{
 for(const [bytes,headers] of [[new Uint8Array(4),{}],[new Uint8Array(2),{}],[new Uint8Array(3),{'content-length':'4'}]]){
  const load=create({fetchFn:async()=>new Response(bytes,{headers})});await assert.rejects(load(entry),/length|limit/);
 }
});
test('timeout and caller cancellation reject even when fetch ignores abort',async()=>{
 const load=create({fetchFn:()=>new Promise(()=>{}),timeoutMs:10});await assert.rejects(load(entry),/timeout/);
 const control=new AbortController(),pending=create({fetchFn:()=>new Promise(()=>{})})(entry,control.signal);control.abort();await assert.rejects(pending,/cancel/);
});
test('invalid key/base and HTTP errors never produce payloads',async()=>{
 assert.throws(()=>create({baseUrl:'file:///private/'}),/base/);
 const load=create({fetchFn:async()=>new Response('',{status:404})});await assert.rejects(load(entry),/404/);
 await assert.rejects(load({...entry,key:'../private'}),/entry/);
});
test('stalled body and stalled cancellation do not defeat the read timeout',async()=>{
 const load=create({timeoutMs:10,fetchFn:async()=>new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})}))});
 const outcome=await Promise.race([load(entry).then(()=> 'unexpected success',e=>e.message),new Promise(r=>setTimeout(()=>r('did not settle'),100))]);
 assert.match(outcome,/timeout/);
});
