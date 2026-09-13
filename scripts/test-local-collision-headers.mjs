import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startLocalProjectServer} from './local-project-server.mjs';
const etag = text => '"sha256-' + createHash('sha256').update(text).digest('hex') + '"';
test('local HEAD/GET/ranges hash content, invalidate memory cache and retain access protection',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'local-collision-'));
  let server;
  t.after(async()=>{
    if(server) await server.close();
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('local-collision-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  await fs.mkdir(path.join(root,'assets')); await fs.mkdir(path.join(root,'history'));
  await fs.writeFile(path.join(root,'viewer.html'),'fixture');
  const file=path.join(root,'assets/untrusted-filename.rad');
  await fs.writeFile(file,'0123456789');
  const state=JSON.stringify({revision:0,status:'draft',project:{version:4,layers:[{id:1,type:'splat',file:'assets/untrusted-filename.rad'}]}});
  await fs.writeFile(path.join(root,'project-state.json'),state);
  server=await startLocalProjectServer({root});
  const url=new URL('assets/untrusted-filename.rad',server.url);
  for(const method of ['HEAD','GET']) for(const range of [undefined,'bytes=2-3','bytes=-2','bytes=8-']) {
    const res=await fetch(url,{method,headers:range?{Range:range}:{}});
    assert.equal(res.status,range?206:200);
    assert.equal(res.headers.get('etag'),etag('0123456789'));
    assert.ok(Number.isFinite(Date.parse(res.headers.get('last-modified'))));
    assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal(res.headers.get('access-control-allow-origin'),null);
    assert.equal((await res.arrayBuffer()).byteLength,method==='HEAD'?0:range?2:10);
  }
  const stat=await fs.stat(file);
  await fs.writeFile(file,'abcdefghij'); await fs.utimes(file,stat.atime,stat.mtime);
  assert.equal((await fetch(url,{method:'HEAD'})).headers.get('etag'),etag('abcdefghij'));
  await fs.writeFile(file,'larger content');
  assert.equal((await fetch(url,{method:'HEAD'})).headers.get('etag'),etag('larger content'));
  assert.equal((await fetch(new URL('/assets/untrusted-filename.rad',url))).status,404);
  // Existing policy guards write Origin; cross-origin reads are unreadable without CORS.
  assert.equal((await fetch(url,{headers:{Origin:'https://evil.invalid'}})).headers.get('access-control-allow-origin'),null);
  assert.equal((await fetch(url,{headers:{Range:'bytes=900-'}})).status,416);
  assert.equal(await fs.readFile(path.join(root,'project-state.json'),'utf8'),state);
  assert.deepEqual(await fs.readdir(path.join(root,'history')),[]);
});
