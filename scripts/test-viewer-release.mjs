import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stampViewer,prepareRelease} from './prepare-viewer-release.mjs';
import updater from './viewer-update-core.cjs';
import {execFileSync} from 'node:child_process';
test('build ID is deterministic and changes with viewer source',()=>{
  const source='<head><script>window.__locahunBuildRelease="{{viewer-release-id}}";</script></head><script type="module" id="locahun-app-source">a</script>';
  assert.equal(stampViewer(source),stampViewer(source));
  assert.notEqual(stampViewer(source),stampViewer(source+'b'));
  assert.doesNotMatch(stampViewer(source),/\{\{viewer-release-id\}\}/);
});
test('release is immutable, old artifacts survive, manifest hashes exact bytes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-release-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('viewer-release-'));await fs.rm(root,{recursive:true,force:true});});
  const source=path.join(root,'viewer.html'),out=path.join(root,'releases');
  const html=stampViewer('<head><script>window.__locahunBuildRelease="{{viewer-release-id}}";</script></head><script type="module" id="locahun-app-source">a</script>');
  await fs.writeFile(source,html);
  const first=await prepareRelease({viewer:source,out});
  assert.equal(first.viewer.sha256,createHash('sha256').update(await fs.readFile(source)).digest('hex'));
  await prepareRelease({viewer:source,out});
  await fs.writeFile(source,stampViewer(html.replace(first.release,'{{viewer-release-id}}')+'b'));
  const second=await prepareRelease({viewer:source,out});
  assert.notEqual(first.release,second.release);
  assert.equal(await fs.readFile(path.join(out,first.release,'viewer.bin'),'utf8'),html);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(out,'stable.json'),'utf8')),second);
  await fs.writeFile(path.join(out,second.release,'viewer.bin'),'tampered');
  await assert.rejects(prepareRelease({viewer:source,out}),/immutable/i);
});
test('worker release route adds CORS, mutable manifest and immutable payload caching',async()=>{
  const workerSource=await fs.readFile(new URL('../worker.js',import.meta.url),'utf8');
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'));
  const seen=[];
  const env={ASSETS:{fetch:async request=>{seen.push(new URL(request.url).pathname);return new Response('fixture',{status:200});}}};
  for(const [name,cache] of [['stable.json','no-store'],['abc/viewer.html','public, max-age=31536000, immutable, no-transform']]) {
    const response=await worker.fetch(new Request('https://viewer.locahun3d.com/releases/'+name,{headers:{Origin:'null'}}),env);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(response.headers.get('Cache-Control'),cache);
    if(name.endsWith('viewer.html'))assert.equal(response.headers.get('Content-Type'),'application/octet-stream');
  }
  assert.equal(seen[1],'/releases/abc/viewer.bin');
  const invalid=await worker.fetch(new Request('https://viewer.locahun3d.com/releases/other.txt'),env);
  assert.equal(invalid.status,404);
});

test('invalid UTF-8 cannot be published even when the build hash matches',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-release-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('viewer-release-'));await fs.rm(root,{recursive:true,force:true});});
  const source=stampViewer('<head><script>window.__locahunBuildRelease="{{viewer-release-id}}";</script></head><script type="module" id="locahun-app-source">//\xff\n</script>');
  const viewer=path.join(root,'viewer.html');await fs.writeFile(viewer,Buffer.from(source,'latin1'));
  await assert.rejects(prepareRelease({viewer,out:path.join(root,'releases')}),/encoded|utf|valid/i);
});
test('assembled canonical source has valid final module and absolute release imports',async()=>{
  let source=await fs.readFile(new URL('../src/template.html',import.meta.url),'latin1');
  for(const match of [...source.matchAll(/\{\{include(?:-variant)?:([^}]+)\}\}/g)]) {
    const fragment=await fs.readFile(new URL('../'+match[1],import.meta.url),'latin1');
    source=source.replace(match[0],()=>fragment);
  }
  source=stampViewer(source);
  updater.validateHtml(source);
  const final=source.slice(source.lastIndexOf('<script type="module"'));
  assert.ok(final.includes('await window.__locahunStartupGate;'));
  const code=final.slice(final.indexOf('>')+1,final.lastIndexOf('</script>'));
  execFileSync(process.execPath,['--input-type=module','--check'],{input:Buffer.from(code,'latin1'),stdio:['pipe','pipe','pipe']});
});
