import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const api = await import('./collision-source-identity.mjs').catch(e => {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  return {};
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'collision-identity-'));
  t.after(async () => {
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('collision-identity-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  await fs.mkdir(path.join(root,'assets'));
  await fs.writeFile(path.join(root,'assets/scan.rad'),'abcd');
  const project = {version:4,layers:[{id:1,type:'splat',file:'assets/scan.rad',pos:{x:0,y:0,z:0},rot:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}]};
  const save = () => fs.writeFile(path.join(root,'project-state.json'),JSON.stringify({revision:0,status:'draft',project}));
  await save();
  return {root,project,save};
}
test('inventory streams actual bytes and does not alter any project files',async t=>{
  assert.equal(typeof api.inventoryProject,'function');
  const {root} = await fixture(t);
  const before = await fs.readFile(path.join(root,'project-state.json'));
  const result = await api.inventoryProject({root});
  assert.equal(result.assets[0].sha256,hash('abcd'));
  assert.equal(result.assets[0].bytes,4);
  assert.deepEqual(result.layers[0].pos,{x:0,y:0,z:0});
  assert.deepEqual(await fs.readFile(path.join(root,'project-state.json')),before);
  assert.deepEqual((await fs.readdir(root)).sort(),['assets','project-state.json']);
  assert.deepEqual(await fs.readdir(path.join(root,'assets')),['scan.rad']);
});
test('same path/count/mtime replacement and transform or parent change invalidate scene',async t=>{
  assert.equal(typeof api.inventoryProject,'function');
  const {root,project,save} = await fixture(t);
  const original = await api.inventoryProject({root});
  const file=path.join(root,'assets/scan.rad'), stat=await fs.stat(file);
  await fs.writeFile(file,'wxyz'); await fs.utimes(file,stat.atime,stat.mtime);
  const changed=await api.inventoryProject({root});
  assert.notEqual(changed.sceneIdentity,original.sceneIdentity);
  project.layers[0].pos.x=2; await save();
  const moved=await api.inventoryProject({root});
  assert.notEqual(moved.sceneIdentity,changed.sceneIdentity);
  project.layers.push({id:2,type:'folder',pos:{x:1,y:0,z:0}});
  project.layers[0].parentId=2; await save();
  assert.notEqual((await api.inventoryProject({root})).sceneIdentity,moved.sceneIdentity);
});
test('protected path policy rejects traversal, ADS, URL, ZIP, and missing source',async t=>{
  assert.equal(typeof api.inventoryProject,'function');
  const {root,project,save}=await fixture(t);
  for(const file of ['../secret.rad','assets/../secret.rad','C:/secret.rad','assets/scan.rad:ads','https://host/scan.rad','assets/%2e%2e.rad','assets/CON.rad','assets/archive.zip','assets/missing.rad']) {
    project.layers[0].file=file; await save();
    await assert.rejects(api.inventoryProject({root}));
  }
  project.layers[0].file=null; project.layers[0].streamUrl='https://host/scan.rad'; await save();
  await assert.rejects(api.inventoryProject({root}));
});
test('junctions and linked asset roots are rejected',async t=>{
  assert.equal(typeof api.inventoryProject,'function');
  const {root}=await fixture(t);
  await fs.rename(path.join(root,'assets'),path.join(root,'original'));
  await fs.symlink(path.join(root,'original'),path.join(root,'assets'),'junction');
  await assert.rejects(api.inventoryProject({root}),/Unsafe|link/);
});
test('remote identity uses strong scoped ETag and full size, never range length',()=>{
  assert.equal(typeof api.identityFromHeaders,'function');
  const headers=new Headers({ETag:'"etag-2"','Content-Length':'2','Content-Range':'bytes 2-3/10'});
  const a=api.identityFromHeaders({scope:'r2:public-demo/scan.rad',headers,status:206});
  assert.equal(a.bytes,10); assert.equal(a.etag,'"etag-2"');
  for(const etag of ['', 'W/"weak"','unquoted']) {
    headers.set('etag',etag);
    assert.throws(()=>api.identityFromHeaders({scope:'r2:public-demo/scan.rad',headers,status:206}));
  }
});
test('cache binding includes source, world transform, decoder and bake version',()=>{
  assert.equal(typeof api.collisionCacheKey,'function');
  const input={sources:[{sha256:hash('abcd'),bytes:4}],worldMatrices:[[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]],decoder:'spark-v2/leaf-v1',bake:{codec:'tiles-v1',cellSize:0.1},selection:{included:[1],excluded:[]}};
  const key=api.collisionCacheKey(input);
  assert.equal(api.collisionCacheKey(structuredClone(input)),key);
  for(const mutate of [x=>x.sources[0].sha256=hash('wxyz'),x=>x.worldMatrices[0][12]=1,x=>x.decoder='v3',x=>x.bake.cellSize=0.2,x=>x.selection.excluded.push(2)]) {
    const x=structuredClone(input); mutate(x); assert.notEqual(api.collisionCacheKey(x),key);
  }
  assert.throws(()=>api.collisionCacheKey({...input,sources:[{url:'same',count:4}]}));
  assert.throws(()=>api.collisionCacheKey({...input,worldMatrices:[]}));
  assert.throws(()=>api.collisionCacheKey({...input,selection:undefined}));
});
test('remote range failures and changed scope never become a reusable identity',()=>{
  for (const [status,fields] of [
    [404,{ETag:'"x"','Content-Length':'10'}],
    [200,{ETag:'"x"'}],
    [206,{ETag:'"x"','Content-Length':'2','Content-Range':'bytes 2-3/*'}],
    [206,{ETag:'"x"','Content-Length':'2','Content-Range':'bytes 8-10/10'}],
    [206,{ETag:'"x"','Content-Length':'3','Content-Range':'bytes 2-3/10'}],
  ]) assert.throws(()=>api.identityFromHeaders({scope:'demo/a',headers:new Headers(fields),status}));
  const headers=new Headers({ETag:'"same"','Content-Length':'10'});
  assert.notDeepEqual(api.identityFromHeaders({scope:'demo/a',headers}),api.identityFromHeaders({scope:'private/a',headers}));
});
test('protected full-byte helper matches known SHA-256 and supports extracted project.json',async t=>{
  const {root,project}=await fixture(t);
  assert.deepEqual(await api.hashProtectedFile({root,file:'assets/scan.rad'}),{file:'assets/scan.rad',bytes:4,sha256:hash('abcd')});
  await fs.writeFile(path.join(root,'project.json'),JSON.stringify(project));
  assert.equal((await api.inventoryProject({root,projectFile:'project.json'})).assets[0].sha256,hash('abcd'));
});
