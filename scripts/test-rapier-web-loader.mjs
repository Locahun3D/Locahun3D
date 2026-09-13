import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';

const source=fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8');
const bytes=fs.readFileSync(new URL('../vendor/rapier-walk/rapier.mjs',import.meta.url));
const descriptor={url:'/vendor/rapier-0.20.0-09a000bee2ad8276.mjs',bytes:2857590,sha256:'09a000bee2ad827608780cf8821258cadc243aaeb8881ab3e769de73f945eee0'};
function fixture(){
  const calls={fetch:0,imports:0,init:0,worlds:0,revoked:0},blobs=new Map();
  const rapier={async init(){calls.init++;},World:class{constructor(){calls.worlds++;}createCharacterController(){return new Proxy({},{get:()=>()=>{}});}}};
  class TestURL extends URL {}
  TestURL.createObjectURL=blob=>{const url='blob:test-'+blobs.size;blobs.set(url,blob);return url;};
  TestURL.revokeObjectURL=url=>{assert(blobs.has(url));calls.revoked++;};
  const c=vm.createContext({console,Blob,Uint8Array,URL:TestURL,AbortController,crypto:webcrypto,atob,performance,TextEncoder,
    location:{href:'http://localhost:3210/viewer/',origin:'http://localhost:3210',protocol:'http:'},isSecureContext:true,
    setTimeout:(fn,ms,...args)=>setTimeout(fn,ms>=10000?100:ms,...args),clearTimeout,
    fetch:async(url,options)=>{calls.fetch++;assert.equal(url,'http://localhost:3210'+descriptor.url);assert.equal(options.credentials,'omit');return new Response(bytes);},
    testImport:async url=>{calls.imports++;assert(blobs.has(url));assert.equal(await blobs.get(url).text(),bytes.toString());return rapier;}
  });
  vm.runInContext(source.replaceAll('await import(url)','await testImport(url)'),c);
  c.WALK_RAPIER_ASSET={...descriptor};
  return {c,calls,rapier,blobs,Core:c.LocahunWalkCollision};
}
test('pinned existing compat bytes and descriptor agree',()=>{
  assert.equal(bytes.length,descriptor.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),descriptor.sha256);
  const html=fs.readFileSync(new URL('../src/assets/rapier_walk_web.html',import.meta.url),'utf8');
  const c={};vm.runInNewContext(html.replace(/<\/?script>/g,''),c);
  assert.deepEqual(JSON.parse(JSON.stringify(c.WALK_RAPIER_ASSET)),descriptor);
});
test('web loader is lazy and concurrent creates share fetch, import and init',async()=>{
  const f=fixture();assert.equal(f.calls.fetch,0);
  await Promise.all([f.Core.create(),f.Core.create(),f.Core.create()]);
  assert.deepEqual(f.calls,{fetch:1,imports:1,init:1,worlds:3,revoked:1});
});
test('injected API never fetches or imports',async()=>{
  const f=fixture();await f.Core.create({rapier:f.rapier});await f.Core.create(f.rapier);
  assert.equal(f.calls.fetch,0);assert.equal(f.calls.imports,0);assert.equal(f.calls.init,1);
});
test('standalone embedded bytes take precedence and work offline',async()=>{
  const f=fixture();f.c.WALK_RAPIER_B64=bytes.toString('base64');f.c.location={href:'file:///viewer.html',origin:'null',protocol:'file:'};
  f.c.fetch=()=>{throw Error('Offline');};await f.Core.create();
  assert.equal(f.calls.fetch,0);assert.equal(f.calls.imports,1);assert.equal(f.calls.init,1);
});
test('bad HTTP, length and digest never execute and can retry',async()=>{
  for(const kind of ['404','short','long','digest','network']){
    const f=fixture(),good=f.c.fetch;f.c.fetch=async()=>{
      if(kind==='network')throw Error('offline');
      if(kind==='404')return new Response(null,{status:404});
      return new Response(kind==='short'?bytes.subarray(0,30):kind==='long'?new Uint8Array(bytes.length+1):new Uint8Array(bytes.length));
    };
    await assert.rejects(f.Core.create());assert.equal(f.calls.imports,0,kind);
    f.c.fetch=good;await f.Core.create();assert.equal(f.calls.imports,1);
  }
});
test('invalid descriptor, insecure remote HTTP and file-only slim entry never fetch',async()=>{
  for(const kind of ['host','query','size','hash','http','file']){
    const f=fixture();
    if(kind==='host')f.c.WALK_RAPIER_ASSET.url='https://untrusted.example'+descriptor.url;
    if(kind==='query')f.c.WALK_RAPIER_ASSET.url+='?override=1';
    if(kind==='size')f.c.WALK_RAPIER_ASSET.bytes=512*1024*1024;
    if(kind==='hash')f.c.WALK_RAPIER_ASSET.sha256='0'.repeat(64);
    if(kind==='http')Object.assign(f.c,{location:{href:'http://example.com/',origin:'http://example.com',protocol:'http:'},isSecureContext:false});
    if(kind==='file')f.c.location={href:'file:///slim.html',origin:'null',protocol:'file:'};
    await assert.rejects(f.Core.create());assert.equal(f.calls.fetch,0,kind);
  }
});
test('network timeout aborts and no module executes',async()=>{
  const f=fixture();let signal;f.c.fetch=(url,options)=>{signal=options.signal;return new Promise(()=>{});};
  await assert.rejects(f.Core.create(),/tim|load/i);assert(signal.aborted);assert.equal(f.calls.imports,0);
});
test('CSP import or WASM init failure rejects, revokes URL and permits retry',async()=>{
  for(const phase of ['import','init']){
    const f=fixture(),good=f.c.testImport;
    if(phase==='import')f.c.testImport=async()=>{throw Error('CSP blocked blob');};
    else f.rapier.init=async()=>{throw Error('CSP blocked WASM');};
    await assert.rejects(f.Core.create(),/CSP/);assert.equal(f.calls.revoked,1);assert.equal(f.calls.worlds,0);
    f.c.testImport=good;f.rapier.init=async()=>{f.calls.init++;};await f.Core.create();assert.equal(f.calls.worlds,1);
  }
});
test('slow initialization stays single-flight while additional callers wait',async()=>{
  const f=fixture();let finish;
  f.rapier.init=()=>{f.calls.init++;return new Promise(resolve=>{finish=resolve;});};
  const first=f.Core.create();
  for(let i=0;i<100&&!finish;i++)await new Promise(r=>setTimeout(r,2));
  assert(finish);const second=f.Core.create();finish();await Promise.all([first,second]);
  assert.equal(f.calls.fetch,1);assert.equal(f.calls.imports,1);assert.equal(f.calls.init,1);assert.equal(f.calls.worlds,2);
});
test('body timeout and late response cannot import or retain an unread body',async()=>{
  const f=fixture();let cancel=0;
  f.c.fetch=async()=>new Response(new ReadableStream({cancel(){cancel++;}}));
  await assert.rejects(f.Core.create());assert.equal(cancel,1);assert.equal(f.calls.imports,0);
  const late=fixture();let resolve;
  late.c.fetch=()=>new Promise(r=>{resolve=r;});
  await assert.rejects(late.Core.create());
  resolve(new Response(new ReadableStream({cancel(){cancel++;}})));
  await new Promise(r=>setTimeout(r,0));assert.equal(cancel,2);assert.equal(late.calls.imports,0);
});
test('actual embedded compat module initializes offline through the loader',async()=>{
  const f=fixture();f.c.WALK_RAPIER_B64=bytes.toString('base64');
  f.c.location={href:'file:///viewer.html',origin:'null',protocol:'file:'};
  f.c.fetch=()=>{throw Error('Unexpected offline network');};
  f.c.testImport=async url=>import('data:text/javascript;base64,'+Buffer.from(await f.blobs.get(url).text()).toString('base64'));
  const core=await f.Core.create();assert(core._world);core.dispose();assert.equal(f.calls.revoked,1);
});
