import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../worker.js',import.meta.url));
const {default:worker}=await import('data:text/javascript;base64,'+source.toString('base64'));
const key='f2ba008e5632deb2bd81b8f86de0dac93a4c4b977ec6c24e07e76ec785fb1b49';
const url='https://viewer.locahun3d.com/collision/'+key+'.lct';
const payload=fs.readFileSync(new URL('../collision/'+key+'.lct',import.meta.url));
test('static collision assets cannot bypass the worker allowlist and CORS',()=>{
 const config=fs.readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
 const routes=JSON.parse(config.match(/^run_worker_first\s*=\s*(\[[^\n]+\])/m)[1]);
 assert(routes.includes('/collision'));assert(routes.includes('/collision/*'));
});
test('worker public allowlist matches the finalized release manifest',()=>{
 const manifestSource=fs.readFileSync(new URL('../src/js/216a_collision_manifest.js',import.meta.url),'utf8');
 const manifest=JSON.parse(manifestSource.match(/Object\.freeze\((\{[\s\S]*\})\);/)[1]);
 assert.deepEqual(Object.keys(manifest),[key]);assert.equal(manifest[key].bytes,payload.length);
 assert(source.toString().includes(manifest[key].sha256));
});
test('public content-addressed collision GET/HEAD has CORS, binary identity and length',async()=>{
 for(const method of ['GET','HEAD']){
  const r=await worker.fetch(new Request(url,{method}),{ASSETS:{fetch:async()=>new Response(payload,{headers:{'Content-Length':String(payload.length)}})}});
  assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.match(r.headers.get('access-control-expose-headers'),/Content-Length/);assert.equal(r.headers.get('content-type'),'application/octet-stream');assert.match(r.headers.get('cache-control'),/immutable/);assert.equal(r.headers.get('content-length'),String(payload.length));assert.equal((await r.arrayBuffer()).byteLength,method==='HEAD'?0:payload.length);
 }
});

test('missing asset-provider length is verified from bounded bytes for GET and HEAD',async()=>{
 for(const method of ['GET','HEAD']){
  const r=await worker.fetch(new Request(url,{method}),{ASSETS:{fetch:async request=>{
   assert.equal(request.method,'GET','HEAD must verify actual stored bytes');
   return new Response(payload);
  }}});
  assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),String(payload.length));
  assert.equal((await r.arrayBuffer()).byteLength,method==='HEAD'?0:payload.length);
 }
});
test('missing length cannot authorize oversized or incorrect asset bytes',async()=>{
 for(const bytes of [Buffer.alloc(payload.length),Buffer.alloc(payload.length+1),Buffer.from('short')]){
  const r=await worker.fetch(new Request(url,{method:'HEAD'}),{ASSETS:{fetch:async()=>new Response(bytes)}});
  assert.equal(r.status,502);assert.equal(r.headers.get('cache-control'),'no-store');
 }
});
test('asset-provider non200 and read failures fail closed',async()=>{
 for(const status of [206,301,304,403,404,500]){
  const r=await worker.fetch(new Request(url),{ASSETS:{fetch:async()=>new Response(null,{status})}});
  assert.equal(r.status,status===404?404:502);assert.equal(r.headers.get('cache-control'),'no-store');
 }
 const r=await worker.fetch(new Request(url),{ASSETS:{fetch:async()=>new Response(new ReadableStream({start(c){c.error(Error('read failure'));}}))}});
 assert.equal(r.status,502);
});
test('collision route denies invalid names and writes; preflight and missing are safe',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('missing',{status:404})}};
 assert.equal((await worker.fetch(new Request(url,{method:'OPTIONS'}),env)).status,204);
 assert.equal((await worker.fetch(new Request(url,{method:'POST'}),env)).status,405);
 for(const target of [url.replace(key,'demo-source'),url.replace(key,'a'.repeat(64)),url+'?private=1',url.replace('/collision/','/%63ollision/'),url.replace('/collision/','/collision%2f'),url.replace('/'+key+'.lct','')])assert.equal((await worker.fetch(new Request(target),{ASSETS:{fetch:async()=>{throw new Error('Unlisted asset reached storage');}}})).status,404);
 const missing=await worker.fetch(new Request(url),env);assert.equal(missing.status,404);assert.equal(missing.headers.get('access-control-allow-origin'),'*');assert.doesNotMatch(missing.headers.get('cache-control')||'',/immutable/);
});
test('wrong payload length/digest fails closed without immutable caching',async()=>{
 for(const bytes of [Buffer.from('bad'),Buffer.alloc(payload.length)]){
 const r=await worker.fetch(new Request(url),{ASSETS:{fetch:async()=>new Response(bytes,{headers:{'Content-Length':String(bytes.length)}})}});
 assert.equal(r.status,502);assert.equal(r.headers.get('cache-control'),'no-store');}
 const ranged=await worker.fetch(new Request(url,{headers:{Range:'bytes=0-1'}}),{});assert.equal(ranged.status,416);
});
