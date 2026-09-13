import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
let source='';
try { source=await fs.readFile(new URL('../src/js/216d_collision_cache.js',import.meta.url),'utf8'); }
catch(e) { if(e.code!=='ENOENT') throw e; }
function load(indexedDB) {
  const c=vm.createContext({indexedDB,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,console});
  vm.runInContext(source,c); return c.LocahunCollisionCache;
}
const key=n=>String(n).padStart(64,'0');

// Asynchronous transactional test double. Writes become visible only on complete.
// Browser IndexedDB remains the production implementation; no browser is launched.
function fakeIDB({blocked=false,hangOpen=false,hangTransaction=false,quota=false,abortCommit=false}={}) {
  const records=new Map(); let exists=false;
  const stats={opens:0,closes:0,aborts:0};
  const factory={open(){
    stats.opens++; const request={};
    const db={objectStoreNames:{contains:()=>exists},createObjectStore(){exists=true;},close(){stats.closes++;},transaction(_store,mode){
      const pending=new Map([...records].map(([k,v])=>[k,structuredClone(v)]));
      let stopped=false, jobs=0, generation=0;
      const tx={abort(){if(stopped)return;stopped=true;stats.aborts++;queueMicrotask(()=>tx.onabort?.());},objectStore(){return store;}};
      function complete(){
        const ticket=++generation;
        setTimeout(()=>{
          if(stopped||jobs||ticket!==generation||hangTransaction)return;
          if(abortCommit){tx.abort();return;}
          stopped=true;
          if(mode==='readwrite'){records.clear();for(const [k,v] of pending)records.set(k,v);}
          tx.oncomplete?.();
        },0);
      }
      function job(fn){
        const r={}; jobs++;
        queueMicrotask(()=>{if(stopped)return;try{r.result=fn();r.onsuccess?.();}catch(e){r.error=e;r.onerror?.();tx.abort();}finally{jobs--;complete();}});
        return r;
      }
      const store={
        get:k=>job(()=>structuredClone(pending.get(k))),
        put:value=>job(()=>{if(quota)throw new Error('QuotaExceededError');pending.set(value.key,structuredClone(value));return value.key;}),
        delete:k=>job(()=>pending.delete(k)),
        openCursor(){
          const r={};const entries=[...pending];let i=0;
          function next(){jobs++;queueMicrotask(()=>{
            if(stopped)return;
            const entry=entries[i++];
            r.result=entry?{primaryKey:entry[0],value:structuredClone(entry[1]),continue:next,delete:()=>store.delete(entry[0])}:null;
            try{r.onsuccess?.();}finally{jobs--;complete();}
          });}
          next();return r;
        },
      };
      complete();return tx;
    }};
    setTimeout(()=>{
      request.result=db;
      if(blocked){request.onblocked?.();setTimeout(()=>request.onsuccess?.(),10);return;}
      if(hangOpen)return;
      if(!exists)request.onupgradeneeded?.();
      request.onsuccess?.();
    },0);
    return request;
  }};
  return {factory,records,stats};
}
function cache(f,options={}){
  const api=load(f?.factory);assert.ok(api,'global cache helper exists');
  return api.create({indexedDB:f?.factory,timeoutMs:100,maxEntryBytes:16,maxTotalBytes:32,maxEntries:4,...options});
}
test('cold instance reads persisted exact subview bytes by source-bound key, with defensive copies',async()=>{
  const f=fakeIDB(),c=cache(f),input=new Uint8Array([9,1,2,8]);
  const saving=c.put(key(1),input.subarray(1,3));input[1]=99;
  assert.equal(await saving,true);
  const a=await cache(f).get(key(1));assert.deepEqual([...a],[1,2]);
  a[0]=55;assert.deepEqual([...(await c.get(key(1)))],[1,2]);
  assert.equal(await c.get(key(2)),null);
});
test('caps enforce entry size, four entries, total bytes, overwrite and FIFO eviction atomically',async()=>{
  const f=fakeIDB(),c=cache(f);
  assert.equal(await c.put(key(0),new Uint8Array(17)),false);
  for(let i=1;i<=5;i++)assert.equal(await c.put(key(i),new Uint8Array(4).fill(i)),true);
  assert.equal(f.records.size,4);assert.equal(await c.get(key(1)),null);
  assert.equal(await c.put(key(5),new Uint8Array(16)),true);
  assert.equal(await c.put(key(6),new Uint8Array(16)),true);
  assert.equal(f.records.size,2);
  assert.equal([...f.records.values()].reduce((n,r)=>n+r.payload.byteLength,0),32);
});
test('bad keys/types and raising hard caps never open storage',async()=>{
  const f=fakeIDB(),c=cache(f);
  for(const k of ['','abc','x'.repeat(64),'A'.repeat(64),null]) {
    assert.equal(await c.get(k),null);assert.equal(await c.put(k,new Uint8Array(2)),false);
  }
  assert.equal(await c.put(key(1),new ArrayBuffer(2)),false);
  assert.equal(await c.put(key(1),new Uint8Array()),false);
  assert.equal(await cache(f,{maxEntryBytes:16777217}).put(key(1),new Uint8Array(1)),false);
  assert.equal(await cache(f,{maxTotalBytes:67108865}).put(key(1),new Uint8Array(1)),false);
  assert.equal(await cache(f,{maxEntries:5}).put(key(1),new Uint8Array(1)),false);
  assert.equal(f.stats.opens,0);
});
test('failed write rolls back evictions and preserves the prior cached payload',async()=>{
  for(const mode of [{quota:true},{abortCommit:true}]) {
    const f=fakeIDB(mode),c=cache(f,{maxEntries:1});
    const original={key:key(1),version:1,payload:new Uint8Array([7]),storedAt:1};
    f.records.set(key(1),original);
    assert.equal(await c.put(key(2),new Uint8Array([9])),false);
    assert.deepEqual(f.records.get(key(1)),original);assert.equal(f.records.size,1);
  }
});
test('read timeouts, storage getter denial, and late blocked-open success settle without retaining connections',async()=>{
  for(const mode of [{hangOpen:true},{hangTransaction:true}]) {
    const f=fakeIDB(mode);assert.equal(await cache(f,{timeoutMs:15}).get(key(1)),null);
  }
  const blocked=fakeIDB({blocked:true});
  assert.equal(await cache(blocked).get(key(1)),null);
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(blocked.stats.closes,1);
  const c=vm.createContext({Uint8Array,ArrayBuffer,setTimeout,clearTimeout});
  Object.defineProperty(c,'indexedDB',{get(){throw new Error('SecurityError');}});
  vm.runInContext(source,c);assert.equal(await c.LocahunCollisionCache.get(key(1)),null);
});
test('blocked, open timeout, transaction timeout, quota, commit abort and unavailable storage fail open',async()=>{
  for(const mode of [{blocked:true},{hangOpen:true},{hangTransaction:true},{quota:true},{abortCommit:true}]) {
    const f=fakeIDB(mode),c=cache(f,{timeoutMs:20});
    assert.equal(await c.put(key(1),new Uint8Array([1])),false);
    assert.equal(f.records.size,0);
  }
  const missing=cache();assert.equal(await missing.get(key(1)),null);assert.equal(await missing.put(key(1),new Uint8Array([1])),false);
  const denied=cache({factory:{open(){throw new Error('SecurityError');}}});
  assert.equal(await denied.get(key(1)),null);
});
test('corrupt/version-mismatched records miss and are cleaned only inside the dedicated cache',async()=>{
  const f=fakeIDB(),c=cache(f);
  f.records.set(key(1),{key:key(1),version:99,payload:new Uint8Array([1]),storedAt:1});
  assert.equal(await c.get(key(1)),null);
  assert.equal(await c.put(key(2),new Uint8Array([2])),true);
  assert.equal(f.records.has(key(1)),false);
});
