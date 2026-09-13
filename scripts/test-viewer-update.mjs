import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import updater from './viewer-update-core.cjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startLocalProjectServer} from './local-project-server.mjs';

const html='<!doctype html><html><head></head><body><script id="locahun-app-source" type="text/plain">globalThis.fixture=true;</script></body></html>';
const bytes=Buffer.from(html);
function release(overrides={}) {
  return {schema:1,release:'fixture-1',projectVersions:[1,2,3,4],localProjectApi:1,
    viewer:{url:'https://viewer.locahun3d.com/releases/fixture-1/viewer.html',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},...overrides};
}
function fixture(manifest=release(),body=bytes) {
  const calls=[];
  return {calls,fetch:async(url,options)=>{
    calls.push({url,options});
    return new Response(url===updater.MANIFEST_URL?JSON.stringify(manifest):body,{status:200});
  }};
}
test('accepts official manifest and exact bytes without credentials or redirects',async()=>{
  const f=fixture();const result=await updater.check({fetch:f.fetch,projectVersion:4});
  assert.equal(result.html,html);assert.equal(result.release,'fixture-1');
  assert.equal(f.calls.length,2);
  for(const call of f.calls){assert.equal(call.options.redirect,'error');assert.equal(call.options.credentials,'omit');}
});
for(const [name,manifest,body] of [
  ['external asset',{...release(),viewer:{...release().viewer,url:'https://evil.test/viewer.html'}},bytes],
  ['hash mismatch',release(),Buffer.from(html.replace('fixture=true','fixture=evil'))],
  ['size mismatch',release(),Buffer.from(html+' ')],
  ['unsupported schema',release({schema:2}),bytes],
  ['incompatible project',release({projectVersions:[1]}),bytes],
  ['incompatible local API',release({localProjectApi:2}),bytes],
  ['oversized asset',{...release(),viewer:{...release().viewer,bytes:128*1024**2}},bytes],
]) test(`${name} retains bundled fallback`,async()=>{
  const f=fixture(manifest,body);assert.equal((await updater.check({fetch:f.fetch,projectVersion:4})).html,undefined);
});
test('offline, HTTP errors and timeout retain bundled fallback',async()=>{
  for(const fetch of [async()=>{throw new Error('offline');},async()=>new Response('missing',{status:404}),
    (_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))]) {
    const result=await updater.check({fetch,timeoutMs:20});assert.equal(result.html,undefined);assert.ok(result.reason);
  }
});
test('known release does not fetch payload again',async()=>{
  const f=fixture();const result=await updater.check({fetch:f.fetch,currentRelease:'fixture-1'});
  assert.equal(result.html,undefined);assert.equal(f.calls.length,1);
});
test('relative import maps cannot become standalone/local startup releases',async()=>{
  const body=Buffer.from(html.replace('</head>','<script type="importmap">{"imports":{"spark":"./vendor/spark.js"}}</script></head>'));
  const manifest=release();manifest.viewer.bytes=body.length;manifest.viewer.sha256=createHash('sha256').update(body).digest('hex');
  const f=fixture(manifest,body);
  assert.match((await updater.check({fetch:f.fetch})).reason,/absolute.*import/i);
});
test('local startup caches verified viewer without changing project/history/bundled bytes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-update-'));
  t.after(async()=>{
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('viewer-update-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  await fs.mkdir(path.join(root,'assets'));await fs.mkdir(path.join(root,'history'));
  const state=JSON.stringify({revision:0,status:'draft',project:{version:4,layers:[]}});
  await fs.writeFile(path.join(root,'project-state.json'),state);
  await fs.writeFile(path.join(root,'history','keep.txt'),'keep');
  await fs.writeFile(path.join(root,'viewer.html'),'bundled fixture');
  const f=fixture();
  const server=await startLocalProjectServer({root,autoUpdate:true,updateFetch:f.fetch});
  try {
    const response=await fetch(server.url);assert.equal(await response.text(),html);
    assert.equal(f.calls.length,2);
    await fetch(server.url);assert.equal(f.calls.length,2);
    assert.equal(await fs.readFile(path.join(root,'project-state.json'),'utf8'),state);
    assert.equal(await fs.readFile(path.join(root,'viewer.html'),'utf8'),'bundled fixture');
    assert.equal(await fs.readFile(path.join(root,'history','keep.txt'),'utf8'),'keep');
  } finally {await server.close();}
  const offline=await startLocalProjectServer({root,autoUpdate:true,updateFetch:async()=>{throw new Error('offline');}});
  try{assert.equal(await (await fetch(offline.url)).text(),html);}finally{await offline.close();}
  await fs.writeFile(path.join(root,'runtime/updates',release().viewer.sha256+'.html'),'corrupted cache');
  const corrupt=await startLocalProjectServer({root,autoUpdate:true,updateFetch:async()=>{throw new Error('offline');}});
  try{assert.equal(await (await fetch(corrupt.url)).text(),'bundled fixture');}finally{await corrupt.close();}
});
