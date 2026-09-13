import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readReleaseAssets,copyReleaseAssets,verifyReleaseAssets} from './perf-release-assets.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('vendor absent length is accepted only with mandatory exact GET bytes and digest',async()=>{
 const body=Buffer.from('ok'),plan=[{relative:'vendor/spark-fixture.module.js',body,sha256:hash(body),bytes:2}];
 for(const payload of ['ok','bad','no']){
  const calls=[];
  const fetcher=async(_,o)=>{calls.push(o.method);return new Response(o.method==='HEAD'?null:payload,{headers:{'Content-Type':'text/javascript','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length'}});};
  if(payload==='ok')await verifyReleaseAssets(plan,'https://fixture.test',fetcher);
  else await assert.rejects(verifyReleaseAssets(plan,'https://fixture.test',fetcher),/length|digest/i);
  assert.deepEqual(calls,['HEAD','GET']);
 }
 const wrong=async(_,o)=>new Response(o.method==='HEAD'?null:body,{headers:{'Content-Type':'text/javascript','Content-Length':'3','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length'}});
 await assert.rejects(verifyReleaseAssets(plan,'https://fixture.test',wrong),/length/i);
 const collision=[{...plan[0],relative:'collision/'+ 'a'.repeat(64)+'.lct'}];
 await assert.rejects(verifyReleaseAssets(collision,'https://fixture.test',async()=>new Response(null,{headers:{'Content-Type':'application/octet-stream'}})),/length/i);
});
test('canonical plan includes exact reviewed vendor and manifest-only public collision',async()=>{
 const plan=await readReleaseAssets(new URL('../',import.meta.url));
 assert(plan.some(p=>p.sha256==='ff799ee9a31cec478ebf173759c0f4061da662164dd72fd9da2efbabadd332f5'));
 assert(plan.some(p=>p.sha256==='eb56281adf11bfdb117231a1ae3b22db497fa59c994731c0a0f08fd02e1ea16c'&&p.bytes===482369));
 assert(!plan.some(p=>p.relative.endsWith('demo-source.json')));
});
test('append-only copy preserves unrelated and older assets, refuses conflicting bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'perf-release-assets-'));
 t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert(path.basename(root).startsWith('perf-release-assets-'));await fs.rm(root,{recursive:true,force:true});});
 await fs.mkdir(path.join(root,'collision'));await fs.writeFile(path.join(root,'collision','old.lct'),'keep');
 const body=Buffer.from('payload'),plan=[{relative:'collision/'+ 'a'.repeat(64)+'.lct',body,sha256:hash(body),bytes:body.length}];
 await copyReleaseAssets(plan,root);await copyReleaseAssets(plan,root);
 assert.equal(await fs.readFile(path.join(root,'collision','old.lct'),'utf8'),'keep');
 await fs.writeFile(path.join(root,plan[0].relative),'changed');
 await assert.rejects(copyReleaseAssets(plan,root),/immutable|mismatch/i);
 assert.equal(await fs.readFile(path.join(root,plan[0].relative),'utf8'),'changed');
});
test('verification rejects wrong bytes, CORS and advertised length',async()=>{
 const body=Buffer.from('ok'),plan=[{relative:'collision/'+ 'a'.repeat(64)+'.lct',body,sha256:hash(body),bytes:2}];
 const response=(method,change={})=>new Response(method==='HEAD'?null:body,{headers:{'Content-Type':'application/octet-stream','Content-Length':'2','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length',...change}});
 await verifyReleaseAssets(plan,'https://fixture.test',async(_,o)=>response(o.method));
 for(const change of [{'Content-Length':'3'},{'Access-Control-Allow-Origin':'https://wrong.test'},{'Access-Control-Expose-Headers':'ETag'}])await assert.rejects(verifyReleaseAssets(plan,'https://fixture.test',async(_,o)=>response(o.method,change)));
 await assert.rejects(verifyReleaseAssets(plan,'https://fixture.test',async(_,o)=>new Response(o.method==='HEAD'?null:'no',{headers:{'Content-Type':'application/octet-stream','Content-Length':'2','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length'}})),/digest/i);
});
