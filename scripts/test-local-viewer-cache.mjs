import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {selectLocalViewer} from './local-viewer-cache.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const html=id=>`<html><head></head><body><script type="module" id="locahun-app-source">window.fixture=${JSON.stringify(id)};</script></body></html>`;
function online(id='one',body=html(id)) {
  const bytes=Buffer.from(body),hash=sha(bytes);
  const manifest={schema:1,release:id,localProjectApi:1,projectVersions:[4],viewer:{url:`https://viewer.locahun3d.com/releases/${id}/viewer.html`,bytes:bytes.length,sha256:hash}};
  return async url=>new Response(url.endsWith('stable.json')?JSON.stringify(manifest):bytes);
}
const offline=async()=>{throw new Error('offline');};
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'local-viewer-cache-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('local-viewer-cache-'));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'assets'));await fs.mkdir(path.join(root,'history'));
  for(const name of ['viewer.html','project-state.json','assets/source.rad','history/revision-0.json'])await fs.writeFile(path.join(root,name),'unchanged');
  return {root,projectVersion:4,dir:path.join(root,'runtime/updates')};
}
test('offline uses last verified cache and leaves original files byte-identical',async t=>{
  const f=await fixture(t);const first=await selectLocalViewer({...f,fetch:online()});
  assert.equal(first.source,'online');assert.equal(first.cacheWarning,undefined);
  const next=await selectLocalViewer({...f,fetch:offline});
  assert.equal(next.source,'cache');assert.equal(next.html,html('one'));
  for(const name of ['viewer.html','project-state.json','assets/source.rad','history/revision-0.json'])assert.equal(await fs.readFile(path.join(f.root,name),'utf8'),'unchanged');
});
test('cache hash corruption falls back to previous verified entry, then bundle',async t=>{
  const f=await fixture(t);await selectLocalViewer({...f,fetch:online('one')});await selectLocalViewer({...f,fetch:online('two')});
  await fs.writeFile(path.join(f.dir,sha(html('two'))+'.html'),'corrupt');
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,html('one'));
  await fs.writeFile(path.join(f.dir,sha(html('one'))+'.html'),'corrupt');
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,undefined);
});
test('partial HTML writes never replace last-good metadata; online update still runs',async t=>{
  const f=await fixture(t);await selectLocalViewer({...f,fetch:online('one')});
  const before=await fs.readFile(path.join(f.dir,'last-good.json'));
  const next=await selectLocalViewer({...f,fetch:online('two'),cacheIO:{write:async(handle,bytes)=>{
    await handle.write(bytes.subarray(0,5));throw new Error('simulated disk full');
  }}});
  assert.equal(next.html,html('two'));assert.match(next.cacheWarning,/disk full/);
  assert.deepEqual(await fs.readFile(path.join(f.dir,'last-good.json')),before);
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,html('one'));
});
test('atomic pointer replacement failure preserves offline last-good',async t=>{
  const f=await fixture(t);await selectLocalViewer({...f,fetch:online('one')});
  const next=await selectLocalViewer({...f,fetch:online('two'),cacheIO:{rename:async()=>{throw new Error('Dropbox EBUSY');}}});
  assert.equal(next.html,html('two'));assert.match(next.cacheWarning,/EBUSY/);
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,html('one'));
});
test('rechecks absolute imports even when local metadata hash matches edited HTML',async t=>{
  const f=await fixture(t);await selectLocalViewer({...f,fetch:online()});
  const body=html('bad').replace('</head>','<script type="importmap">{"imports":{"x":"./x.js"}}</script></head>');
  const hash=sha(body),oldHash=sha(html('one'));
  const meta=JSON.parse(await fs.readFile(path.join(f.dir,oldHash+'.json'),'utf8'));
  await fs.writeFile(path.join(f.dir,hash+'.html'),body);
  await fs.writeFile(path.join(f.dir,hash+'.json'),JSON.stringify({...meta,sha256:hash,bytes:Buffer.byteLength(body)}));
  await fs.writeFile(path.join(f.dir,'last-good.json'),JSON.stringify({schema:1,hashes:[hash]}));
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,undefined);
});
test('incompatible project and corrupt index cannot load cached code',async t=>{
  const f=await fixture(t);await selectLocalViewer({...f,fetch:online()});
  assert.equal((await selectLocalViewer({...f,projectVersion:3,fetch:offline})).html,undefined);
  await fs.writeFile(path.join(f.dir,'last-good.json'),'partial{');
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,undefined);
});
test('keeps two completed entries and does not repeatedly download current cache',async t=>{
  const f=await fixture(t);
  for(const id of ['one','two','three'])await selectLocalViewer({...f,fetch:online(id)});
  assert.equal((await fs.readdir(f.dir)).filter(n=>n.endsWith('.html')).length,2);
  const calls=[];const fetch=online('three');
  const current=await selectLocalViewer({...f,fetch:async url=>{calls.push(url);return fetch(url);}});
  assert.equal(current.source,'cache');assert.equal(calls.length,1);
});
test('runtime junction cannot redirect cache writes outside package',async t=>{
  const f=await fixture(t),outside=path.join(f.root,'outside');
  await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep'),'keep');
  await fs.symlink(outside,path.join(f.root,'runtime'),'junction');
  const result=await selectLocalViewer({...f,fetch:online()});
  assert.equal(result.source,'online');assert.match(result.cacheWarning,/Unsafe cache directory/);
  assert.deepEqual(await fs.readdir(outside),['keep']);
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,undefined);
});
test('cache entry quota preserves unknown files and permits verified memory update',async t=>{
  const f=await fixture(t);await fs.mkdir(f.dir,{recursive:true});
  for(let i=0;i<65;i++)await fs.writeFile(path.join(f.dir,'keep-'+i),'keep');
  const result=await selectLocalViewer({...f,fetch:online()});
  assert.equal(result.source,'online');assert.match(result.cacheWarning,/limit/);
  assert.equal((await fs.readdir(f.dir)).length,65);
});
test('silent short write fails readback without replacing last-good',async t=>{
  const f=await fixture(t);await selectLocalViewer({...f,fetch:online('one')});
  const result=await selectLocalViewer({...f,fetch:online('two'),cacheIO:{write:async(handle,bytes)=>{await handle.write(bytes.subarray(0,5));}}});
  assert.equal(result.html,html('two'));assert.match(result.cacheWarning,/Partial cache write/);
  assert.equal((await selectLocalViewer({...f,fetch:offline})).html,html('one'));
});
test('newer manually installed bundle is not overridden by older offline cache',async t=>{
  const f=await fixture(t);
  await selectLocalViewer({...f,currentRelease:'bundle-old',fetch:online('cached-old')});
  const result=await selectLocalViewer({...f,currentRelease:'bundle-new',fetch:offline});
  assert.equal(result.source,'bundled');assert.equal(result.html,undefined);
  const metadata=JSON.parse(await fs.readFile(path.join(f.dir,sha(html('cached-old'))+'.json'),'utf8'));
  assert.equal(metadata.baseRelease,'bundle-old');
});
test('unchanged bundle retains its last-good update offline',async t=>{
  const f=await fixture(t);
  await selectLocalViewer({...f,currentRelease:'bundle-old',fetch:online('newer-update')});
  assert.equal((await selectLocalViewer({...f,currentRelease:'bundle-old',fetch:offline})).release,'newer-update');
});
test('cache matching installed bundle is allowed even when its recorded base differs',async t=>{
  const f=await fixture(t);
  await selectLocalViewer({...f,currentRelease:'bundle-old',fetch:online('installed-new')});
  const result=await selectLocalViewer({...f,currentRelease:'installed-new',fetch:offline});
  assert.equal(result.source,'cache');assert.equal(result.release,'installed-new');
});
test('legacy metadata without recorded bundle identity is not selected',async t=>{
  const f=await fixture(t);await selectLocalViewer({...f,fetch:online()});
  const file=path.join(f.dir,sha(html('one'))+'.json');
  const metadata=JSON.parse(await fs.readFile(file,'utf8'));delete metadata.baseRelease;
  await fs.writeFile(file,JSON.stringify(metadata));
  assert.equal((await selectLocalViewer({...f,fetch:offline})).source,'bundled');
});
