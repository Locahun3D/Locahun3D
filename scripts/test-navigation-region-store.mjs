import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {navigationRegionEntry} from './navigation-region-contract.mjs';
import {selectNavigationRegionBoxes} from './navigation-region-boxes.mjs';
const url=new URL('../src/js/403f_navigation_region_store.js',import.meta.url),context=vm.createContext({crypto:webcrypto,TextEncoder,Uint8Array,AbortController});
if(fs.existsSync(url))vm.runInContext(fs.readFileSync(url,'utf8'),context);
const source='ab'.repeat(32),bytes=new Uint8Array([1,2,3]);
const entry=x=>navigationRegionEntry(source,[[x,0,0],[x+32,8,32]],bytes);
function fixture(){
 assert(context.LocahunNavigationRegionStore);let epoch=1,loads=0,disposed=0;
 const io={read:()=>({source,epoch}),load:async()=>{loads++;return bytes;},decode:async(_bytes,key)=>({source:key}),build:()=>({dispose(){disposed++;}})};
 return {io,store:context.LocahunNavigationRegionStore.create(io),change(){epoch++;},get loads(){return loads;},get disposed(){return disposed;}};
}
test('store is lazy, reuses a verified region and evicts beyond two ready regions',async()=>{
 const f=fixture();assert.equal(f.loads,0);const first=await f.store.prepare(entry(0));assert(first);
 assert.equal(await f.store.prepare(entry(0)),first);assert.equal(f.loads,1);
 await f.store.prepare(entry(16));await f.store.prepare(entry(32));assert.equal(f.disposed,1);
 f.store.clear();assert.equal(f.disposed,3);
});
test('digest, length, source and bounds mismatches never build a query',async()=>{
 for(const modify of [e=>({...e,sha256:'ff'.repeat(32)}),e=>({...e,bytes:4}),e=>({...e,source:'cd'.repeat(32)}),e=>({...e,bounds:[[1,0,0],[32,8,32]]})]){
  const f=fixture();let built=0;f.io.build=()=>{built++;return {};};assert.equal(await f.store.prepare(modify(entry(0))),null);assert.equal(built,0);
 }
});
test('scene change discards delayed data and aborts its request',async()=>{
 const f=fixture();let release,signal;f.io.load=(_entry,s)=>{signal=s;return new Promise(r=>release=r);};
 const pending=f.store.prepare(entry(0));while(!release)await new Promise(r=>setImmediate(r));
 f.change();f.store.get(entry(0));assert(signal.aborted);release(bytes);assert.equal(await pending,null);
});
test('duplicate pending loads share one promise and a new region aborts the old request',async()=>{
 const f=fixture(),requests=[];
 f.io.load=(_entry,signal)=>new Promise(resolve=>requests.push({signal,resolve}));
 const first=f.store.prepare(entry(0));assert.equal(f.store.prepare(entry(0)),first);
 while(requests.length<1)await new Promise(r=>setImmediate(r));
 const second=f.store.prepare(entry(16));assert(requests[0].signal.aborted);
 while(requests.length<2)await new Promise(r=>setImmediate(r));
 requests[0].resolve(bytes);requests[1].resolve(bytes);
 assert.equal(await first,null);assert(await second);f.store.clear();
});

if(process.argv.includes('--studio'))test('actual bound studio region verifies digest, decodes and finds the staircase',async()=>{
 const THREE=await import('./navigation-assets/node_modules/three/build/three.module.js');
 const {Pathfinding}=await import('./navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs');
 const c=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,Blob,CompressionStream,DecompressionStream});
 for(const name of ['403_navigation_cache','403b_navigation_query'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),c);
 const dir='F:/Codex/locahun-navigation-20260913',entry=JSON.parse(fs.readFileSync(dir+'/studio-regional-filtered-entry.json'));
 let loaded=0;
 const store=context.LocahunNavigationRegionStore.create({read:()=>({source:entry.source,epoch:1}),
  load:async()=>{loaded++;return new Uint8Array(fs.readFileSync(dir+'/studio-regional-filtered-bound.lnv'));},
  decode:(bytes,key)=>c.LocahunNavigationCache.decode(bytes,key),build:mesh=>c.LocahunNavigationQuery.create(THREE,Pathfinding,mesh)});
 try{
  const q=await store.prepare(entry);assert(q);assert.equal(await store.prepare(entry),q);assert.equal(loaded,1);
  assert(q.find({x:6.6,y:-.47,z:2.25},{x:8.6,y:1.1,z:1.2},entry.key)?.length);
  assert.equal(q.find({x:6.6,y:-.47,z:2.25},{x:8.6,y:1.1,z:1.2},entry.source),null);
 }finally{store.clear();}
});

if(process.argv.includes('--studio'))test('real HTTP transport feeds verified private region into the bounded store',async()=>{
 const {createServer}=await import('node:http');
 const THREE=await import('./navigation-assets/node_modules/three/build/three.module.js');
 const {Pathfinding}=await import('./navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs');
 const codec=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
 for(const name of ['403_navigation_cache','403b_navigation_query'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),codec);
 vm.runInContext(fs.readFileSync(new URL('../src/js/403h_navigation_regions.js',import.meta.url),'utf8'),context);
 const dir='F:/Codex/locahun-navigation-20260913',entry=JSON.parse(fs.readFileSync(dir+'/studio-regional-filtered-entry.json'));
 const payload=fs.readFileSync(dir+'/studio-regional-filtered-bound.lnv');let requests=0;
 vm.runInContext(fs.readFileSync(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),codec);
 const meta=JSON.parse(fs.readFileSync(dir+'/studio-full-fine.json'));
 const index=await codec.LocahunWholeCollision.decodeTiles(new Uint8Array(fs.readFileSync(dir+'/studio-full-fine.lct')),meta.source);
 const selected=selectNavigationRegionBoxes([...index.tiles.values()].flatMap(t=>index.boxes(t)),entry.bounds);
 const collision=await codec.LocahunWholeCollision.encode(selected,entry.key),collisionEntry=navigationRegionEntry(entry.source,entry.bounds,collision);
 const server=createServer((req,res)=>{requests++;const body=req.url==='/'+entry.key+'.lnv'?payload:req.url==='/'+entry.key+'.lcp'?collision:null;if(!body){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Length':body.length,'Content-Type':'application/octet-stream'});res.write(body.subarray(0,100));setImmediate(()=>res.end(body.subarray(100)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const transport=vm.createContext({URL,Uint8Array,AbortController,Error,setTimeout,clearTimeout,fetch});
  vm.runInContext(fs.readFileSync(new URL('../src/js/403g_navigation_region_loader.js',import.meta.url),'utf8'),transport);
  const load=transport.LocahunNavigationRegionLoader.create({baseUrl:'http://127.0.0.1:'+server.address().port+'/'});
  const store=context.LocahunNavigationRegionStore.create({read:()=>({source:entry.source,epoch:1}),load,
   decode:(bytes,key)=>codec.LocahunNavigationCache.decode(bytes,key),build:mesh=>codec.LocahunNavigationQuery.create(THREE,Pathfinding,mesh)});
  const regions=context.LocahunNavigationRegions.create({read:()=>({source:entry.source,epoch:1,entries:[entry]}),store});
  for(const name of ['403i_navigation_corridor','403j_navigation_journey'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),context);
  const collisionStore=context.LocahunNavigationRegionStore.create({read:()=>({source:entry.source,epoch:1}),
   load:transport.LocahunNavigationRegionLoader.create({baseUrl:'http://127.0.0.1:'+server.address().port+'/',extension:'lcp'}),
   decode:async(bytes,key)=>({source:key,boxes:await codec.LocahunWholeCollision.decode(bytes,key)}),
   build:mesh=>({boxes:mesh.boxes,dispose(){this.boxes=[];}})});
  let coreBoxes=0,disposed=0;
  const journey=context.LocahunNavigationJourney.create({read:()=>({source:entry.source,epoch:1}),regions,
   loadCollision:async(key,signal)=>{
    assert.equal(key,collisionEntry.key);const abort=()=>collisionStore.clear();signal.addEventListener('abort',abort,{once:true});
    try{if(signal.aborted)throw Error('cancelled');const value=await collisionStore.prepare(collisionEntry);if(!value)throw Error('Invalid collision');return value.boxes;}finally{signal.removeEventListener('abort',abort);}
   },build:async boxes=>{coreBoxes=boxes.length;return {dispose(){disposed++;}};}});
  try{
   const route=await regions.find({x:6.6,y:-.47,z:2.25},{x:8.6,y:1.1,z:1.2});assert(route?.points.length);assert.equal(route.key,entry.key);
   assert(await store.prepare(entry));assert.equal(requests,1);
   const lease=await journey.acquire({x:6.6,y:-.47,z:2.25},{x:8.6,y:1.1,z:1.2});assert(lease?.valid());
   assert.equal(coreBoxes,1880);assert.equal(requests,2);assert(!lease.covers({x:6.6,y:2.53,z:2.25}));
   lease.dispose();assert.equal(disposed,1);
   assert.equal(await collisionStore.prepare({...collisionEntry,sha256:'ff'.repeat(32)}),null);
  }finally{journey.cancel();collisionStore.clear();store.clear();}
 }finally{await new Promise(resolve=>server.close(resolve));}
});
