import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../worker.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const url='https://viewer.locahun3d.com/figures/jtoastie_walk.glb';
function envFor(status=200){
  const calls=[];
  return {calls,ASSETS:{async fetch(request){
    calls.push(request);
    return new Response(request.method==='HEAD'||status===304?null:new Uint8Array([103,108,84,70]),{status,headers:{
      'Content-Type':'model/gltf-binary','ETag':'"figure-v1"','Cache-Control':'public, max-age=3600',
      ...(status===206?{'Content-Range':'bytes 0-3/100','Accept-Ranges':'bytes'}:{}),
    }});
  }}};
}
for(const method of ['GET','HEAD'])test(`public figure ${method} supports file origin without changing content headers`,async()=>{
  const env=envFor();
  const response=await worker.fetch(new Request(url,{method,headers:{Origin:'null'}}),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  assert.equal(response.headers.get('Content-Type'),'model/gltf-binary');
  assert.equal(response.headers.get('ETag'),'"figure-v1"');assert.equal(response.headers.get('Cache-Control'),'public, max-age=3600');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
  assert.equal((await response.arrayBuffer()).byteLength,method==='HEAD'?0:4);assert.equal(env.calls.length,1);
});
test('figure preflight is handled without fetching assets',async()=>{
  const env=envFor();
  const response=await worker.fetch(new Request(url,{method:'OPTIONS',headers:{Origin:'null','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'range'}}),env);
  assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  assert.match(response.headers.get('Access-Control-Allow-Methods'),/GET, HEAD, OPTIONS/);
  assert.match(response.headers.get('Access-Control-Allow-Headers'),/Range/);assert.equal(env.calls.length,0);
});
test('figure rejects write methods without touching assets',async()=>{
  for(const method of ['POST','PUT','DELETE']){
    const env=envFor();const response=await worker.fetch(new Request(url,{method}),env);
    assert.equal(response.status,405);assert.equal(env.calls.length,0);
  }
});
test('range, conditional and missing responses retain their status and CORS',async()=>{
  for(const status of [206,304,404]){
    const env=envFor(status);
    const response=await worker.fetch(new Request(url,{headers:{Range:'bytes=0-3','If-None-Match':'"figure-v1"'}}),env);
    assert.equal(response.status,status);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
    assert.equal(env.calls[0].headers.get('Range'),'bytes=0-3');
    if(status===206)assert.equal(response.headers.get('Content-Range'),'bytes 0-3/100');
  }
});
test('CORS is not expanded to other figures or private asset paths',async()=>{
  for(const pathname of ['/figures/private.glb','/assets/private.glb','/api/private-asset/example','/figures/jtoastie_walk.glb/private']){
    const env=envFor();const response=await worker.fetch(new Request('https://viewer.locahun3d.com'+pathname),env);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);assert.equal(env.calls.length,1);
  }
});
test('static figures cannot bypass the Worker CORS handler',async()=>{
  const config=await fs.readFile(new URL('../wrangler.toml',import.meta.url),'utf8');
  const routes=JSON.parse(config.match(/^run_worker_first\s*=\s*(\[[^\n]+\])/m)[1]);
  assert.ok(routes.includes('/figures/*'));
  assert.ok(routes.includes('/vendor/*'));assert.ok(routes.includes('/releases/*'));
  assert.ok(!routes.includes('/*')&&!routes.includes('/assets/*'));
});
