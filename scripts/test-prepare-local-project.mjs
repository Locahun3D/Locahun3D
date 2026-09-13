import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, readdir, rm, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { prepareLocalProject, loadZipLibrary } from './prepare-local-project.mjs';
import vm from 'node:vm';
import {prepareNavigationRegion} from './prepare-navigation-region.mjs';

const JSZip = loadZipLibrary();
const hash = b => createHash('sha256').update(b).digest('hex');

test('regional sidecars are verified and preserved; missing or corrupted files reject before output',async t=>{
 const c=vm.createContext({Uint8Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
 vm.runInContext(await readFile(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),c);
 const sources=[{sha256:hash(Buffer.from('fixture asset')),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}];
 const collisionSource=hash(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))]));
 const collision=await c.LocahunWholeCollision.encodeTiles([{coord:[0,-1,0],boxes:[{center:[1.6,-.05,1.6],half:[1.6,.05,1.6]}]}],collisionSource,.1);
 const bundle=await prepareNavigationRegion({sources,bounds:[[-1,-1,-1],[5,4,5]],collision,collisionSource});
 for(const mode of ['valid','missing','corrupt']){
  const project={version:4,layers:[{id:0,type:'splat',file:'scene.rad'}],walk:{cellSize:.25,navigationRegions:bundle.manifest}};
  const f=await fixture(t,project,zip=>{for(const p of bundle.payloads){if(mode==='missing'&&p.name.endsWith('.lcp'))continue;zip.file('assets/'+p.name,mode==='corrupt'?Buffer.alloc(p.bytes.length):p.bytes);}});
  if(mode!=='valid'){await assert.rejects(prepareLocalProject(f),/navigation|Navigation/);assert(!(await readdir(f.root)).includes('new package'));continue;}
  await prepareLocalProject(f);
  for(const p of bundle.payloads)assert.equal(hash(await readFile(path.join(f.out,'assets',p.name))),hash(p.bytes));
  const state=JSON.parse(await readFile(path.join(f.out,'project-state.json'),'utf8'));assert.deepEqual(state.project.walk.navigationRegions,bundle.manifest);
 }
});
async function fixture(t, project = { version: 4, layers: [{id:0,type:'splat', file:'scene.rad', streamUrl:'blob:null/fixture'}], camera:{x:3}, custom:{keep:true} }, extra) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'local-package-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('local-package-'));
    return rm(root, {recursive:true, force:true});
  });
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(project));
  zip.file('scene.rad', Buffer.from('fixture asset'));
  extra?.(zip);
  const source = path.join(root,'source.zip');
  await writeFile(source, await zip.generateAsync({type:'nodebuffer', platform:'UNIX'}));
  const viewer = path.join(root,'canonical.html');
  const server = path.join(root,'trusted-server.mjs');
  await writeFile(viewer, '<html>canonical fixture</html>');
  await writeFile(server, '// trusted fixture, never execute\n');
  return {zip:source, out:path.join(root,'new package'), viewer, server, node:process.execPath, root};
}
test('packages once, preserves fields/source, rewrites assets and bundles trusted files', async t => {
  const f = await fixture(t);
  const before = hash(await readFile(f.zip));
  await prepareLocalProject(f);
  const state = JSON.parse(await readFile(path.join(f.out,'project-state.json'),'utf8'));
  assert.equal(state.revision,0); assert.equal(state.status,'draft');
  assert.deepEqual(state.project.custom,{keep:true});
  assert.deepEqual(state.project.camera,{x:3});
  assert.equal(Object.hasOwn(state.project,'cameraInit'),false);
  assert.equal(state.project.layers[0].streamUrl,undefined);
  assert.match(state.project.layers[0].file,/^assets\/[a-f0-9]{64}\.rad$/);
  assert.equal((await readFile(path.join(f.out,state.project.layers[0].file))).toString(),'fixture asset');
  assert.equal(hash(await readFile(f.zip)),before);
  assert.equal(hash(await readFile(path.join(f.out,'runtime/node.exe'))),hash(await readFile(process.execPath)));
  assert.equal((await readFile(path.join(f.out,'viewer.html'))).toString(),'<html>canonical fixture</html>');
  const launcher = await readFile(path.join(f.out,'編集を開く.cmd'),'utf8');
  assert.match(launcher, /-WindowStyle Hidden/); assert.match(launcher, /RedirectStandardError/);
  assert.match(launcher, /--root/); assert.match(launcher, /startup-error\.log/);
});
test('refuses existing output without touching it', async t => {
  const f = await fixture(t); await mkdir(f.out); await writeFile(path.join(f.out,'keep'),'keep');
  await assert.rejects(prepareLocalProject(f),/exist/i);
  assert.deepEqual(await readdir(f.out),['keep']);
});
for (const [name, project] of [
  ['missing asset',{version:4,layers:[{id:0,type:'splat',file:'missing.rad'}]}],
  ['external stream',{version:4,layers:[{id:0,type:'splat',streamUrl:'https://example.test/a'}]}],
  ['inline rawData',{version:4,layers:[{rawData:'AAAA'}]}],
  ['unsupported version',{version:99,layers:[]}],
  ['asset traversal',{version:4,layers:[{id:0,type:'splat',file:'../scene.rad'}]}],
]) test(`rejects ${name}`,async t => {
  const f = await fixture(t,project);
  await assert.rejects(prepareLocalProject(f));
  assert.ok(!(await readdir(f.root)).includes('new package'));
});
for (const name of ['../escape.rad','/absolute.rad','C:/escape.rad','a\\escape.rad','name:ads','CON','trailing.']) {
  test(`rejects unsafe ZIP path ${name}`,async t => {
    const f = await fixture(t,undefined,z => z.file(name,'bad',{createFolders:false}));
    await assert.rejects(prepareLocalProject(f),/path|name|unsafe/i);
  });
}
test('rejects symlink entry',async t => {
  const f = await fixture(t,undefined,z => z.file('link','scene.rad',{unixPermissions:0o120777}));
  await assert.rejects(prepareLocalProject(f),/symlink|type/i);
});
test('rejects duplicate central entries before library can overwrite them',async t => {
  const f = await fixture(t,undefined,z => z.file('other.rad','bad'));
  const bytes = await readFile(f.zip);
  for(let p=0;(p=bytes.indexOf(Buffer.from('other.rad'),p))>=0;p+=9) Buffer.from('scene.rad').copy(bytes,p);
  await writeFile(f.zip,bytes);
  await assert.rejects(prepareLocalProject(f),/duplicate/i);
});
test('rejects uncompressed size budget and leaves no package',async t => {
  const f = await fixture(t);
  await assert.rejects(prepareLocalProject({...f,limits:{maxEntryBytes:10}}),/limit|size/i);
  assert.ok(!(await readdir(f.root)).includes('new package'));
});
test('accepts supported legacy version and deduplicates identical assets',async t => {
  const f = await fixture(t,{version:3,layers:[{id:0,type:'splat',file:'scene.rad'},{id:1,type:'splat',file:'scene.rad'}]});
  await prepareLocalProject(f);
  assert.equal((await readdir(path.join(f.out,'assets'))).length,1);
});
test('rejects false expansion size without a success envelope',async t => {
  const f = await fixture(t);
  const bytes = await readFile(f.zip);
  for(let p=0;p<bytes.length-46;p++) if(bytes.readUInt32LE(p)===0x02014b50 && bytes.subarray(p+46,p+55).toString()==='scene.rad') bytes.writeUInt32LE(1,p+24);
  await writeFile(f.zip,bytes);
  await assert.rejects(prepareLocalProject(f),/expansion size/);
  await assert.rejects(readFile(path.join(f.out,'project-state.json')));
  assert.ok((await readdir(f.out)).some(n=>n.startsWith('.prepare-')));
});
test('rejects CRC corruption',async t => {
  const f = await fixture(t); const bytes=await readFile(f.zip);
  bytes[bytes.indexOf(Buffer.from('fixture asset'))]^=1;
  await writeFile(f.zip,bytes);
  await assert.rejects(prepareLocalProject(f),/CRC/);
});
test('supports one wrapped project with relative embedded references',async t => {
  const f=await fixture(t); const z=new JSZip();
  z.file('wrapped/project.json',JSON.stringify({version:4,layers:[{id:0,type:'splat',file:'data/scan.rad'}]}));
  z.file('wrapped/data/scan.rad','fixture');
  await writeFile(f.zip,await z.generateAsync({type:'nodebuffer'}));
  await prepareLocalProject(f);
  assert.equal((await readdir(path.join(f.out,'assets'))).length,1);
});
test('simultaneous output requests never overwrite one another',async t => {
  const f=await fixture(t);
  const results=await Promise.allSettled([prepareLocalProject(f),prepareLocalProject(f)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('missing trusted server fails before creating output',async t => {
  const f=await fixture(t);
  await assert.rejects(prepareLocalProject({...f,server:path.join(f.root,'missing.mjs')}),/ENOENT/);
  assert.ok(!(await readdir(f.root)).includes('new package'));
});
for(const [name,layers] of [
  ['duplicate IDs',[{id:1,type:'path'},{id:1,type:'path'}]],
  ['string/numeric ID collision',[{id:1,type:'path'},{id:'1',type:'path'}]],
  ['missing ID',[{type:'path'}]],
  ['unknown type',[{id:1,type:'unknown'}]],
  ['camera layer with unpersisted savedPose',[{id:1,type:'camera',savedPose:{position:{x:1,y:2,z:3}}}]],
  ['unsupported extension',[{id:1,type:'obj',file:'model.exe'}]],
]) test(`rejects ${name} before creating output`,async t=>{
  const f=await fixture(t,{version:4,layers},z=>z.file('model.exe','fixture'));
  await assert.rejects(prepareLocalProject(f),/ID|type|extension/);
  assert.ok(!(await readdir(f.root)).includes('new package'));
});
test('accepts all ten supported extensions and preserves four path layers',async t=>{
  const extensions=['rad','ply','splat','spz','ksplat','sog','glb','gltf','obj','fbx'];
  const paths=Array.from({length:4},(_,i)=>({id:100+i,type:'path',pathWidth:0.2,points:[{x:i,y:0,z:1}]}));
  const project={version:4,layers:[...extensions.map((ext,id)=>({id,type:id<6?'splat':'obj',file:`model.${ext}`})),...paths]};
  const f=await fixture(t,project,z=>extensions.forEach(ext=>z.file(`model.${ext}`,'fixture')));
  await prepareLocalProject(f);
  const state=JSON.parse(await readFile(path.join(f.out,'project-state.json'),'utf8'));
  assert.deepEqual(state.project.layers.slice(-4),paths);
  assert.equal(Object.hasOwn(state.project,'cameraInit'),false);
  assert.equal((await readdir(path.join(f.out,'assets'))).length,10);
});
test('copied real server reads packaged metadata and immutable asset',async t=>{
  const f=await fixture(t);
  delete f.server;
  await prepareLocalProject(f);
  const {startLocalProjectServer}=await import(pathToFileURL(path.join(f.out,'server.mjs')).href);
  const running=await startLocalProjectServer({root:f.out});
  try {
    const response=await fetch(new URL('api/project',running.url));
    assert.equal(response.status,200);
    const state=await response.json();
    assert.equal(state.project.layers[0].streamUrl,undefined);
    assert.equal(Object.hasOwn(state.project,'cameraInit'),false);
    const asset=await fetch(new URL(state.project.layers[0].file,running.url));
    assert.equal(asset.status,200);
    assert.equal(await asset.text(),'fixture asset');
  } finally {await running.close();}
});
for(const code of ['EBUSY','EPERM','ENOTEMPTY']) test(`retries empty stage cleanup after ${code}`,async t=>{
  const f=await fixture(t); let calls=0; const delays=[];
  const result=await prepareLocalProject({...f,cleanupAdapter:{
    rmdir:async stage=>{
      assert.equal(path.dirname(stage),f.out);
      assert.deepEqual(await readdir(stage),[]);
      if(++calls<3) throw Object.assign(new Error('Dropbox lock'),{code});
      await rmdir(stage);
    },
    sleep:async ms=>{delays.push(ms);}
  }});
  assert.equal(calls,3); assert.deepEqual(delays,[100,200]);
  assert.equal(result.cleanupWarning,undefined);
  assert.ok(!(await readdir(f.out)).some(n=>n.startsWith('.prepare-')));
});
test('persistent cleanup lock returns success with warning and complete package',async t=>{
  const f=await fixture(t); let calls=0; const delays=[];
  const before=hash(await readFile(f.zip));
  const result=await prepareLocalProject({...f,cleanupAdapter:{
    rmdir:async()=>{calls++; throw Object.assign(new Error('Dropbox lock'),{code:'EBUSY'});},
    sleep:async ms=>{delays.push(ms);}
  }});
  assert.equal(calls,5); assert.deepEqual(delays,[100,200,400,800]);
  assert.equal(result.cleanupWarning.code,'EBUSY');
  assert.equal(path.dirname(result.cleanupWarning.path),f.out);
  assert.deepEqual(await readdir(result.cleanupWarning.path),[]);
  const state=JSON.parse(await readFile(path.join(f.out,'project-state.json'),'utf8'));
  assert.equal(await readFile(path.join(f.out,state.project.layers[0].file),'utf8'),'fixture asset');
  assert.equal(hash(await readFile(f.zip)),before);
  await assert.rejects(prepareLocalProject(f),/exist/i);
});
test('nonempty staging after cleanup error is preserved without retry',async t=>{
  const f=await fixture(t); let calls=0;
  const result=await prepareLocalProject({...f,cleanupAdapter:{
    rmdir:async stage=>{
      calls++; await writeFile(path.join(stage,'keep.txt'),'do not delete');
      throw Object.assign(new Error('Not empty'),{code:'ENOTEMPTY'});
    },
    sleep:async()=>{assert.fail('must not retry nonempty directory');}
  }});
  assert.equal(calls,1); assert.equal(result.cleanupWarning.code,'ENOTEMPTY');
  assert.equal(await readFile(path.join(result.cleanupWarning.path,'keep.txt'),'utf8'),'do not delete');
});
test('unexpected cleanup errors warn without retry or false incomplete failure',async t=>{
  const f=await fixture(t); let calls=0;
  const result=await prepareLocalProject({...f,cleanupAdapter:{
    rmdir:async()=>{calls++; throw Object.assign(new Error('Access denied'),{code:'EACCES'});},
    sleep:async()=>{assert.fail('must not retry EACCES');}
  }});
  assert.equal(calls,1); assert.equal(result.cleanupWarning.code,'EACCES');
  assert.doesNotMatch(result.cleanupWarning.message,/incomplete/i);
});
