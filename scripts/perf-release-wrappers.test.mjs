import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root='F:/Codex/locahun-viewer-release-20260909/scripts/';
test('preview-only executes the real wrapper tail without any verification or promotion calls',async()=>{
 for(const name of ['deploy-viewer-verified.mjs','deploy-verified.mjs']){
  const s=fs.readFileSync(root+name,'utf8'),start=s.indexOf('if(previewOnly){');
  assert(start>=0,name+' explicit preview stop missing');
  assert(s.includes("args[0]==='--preview-only'"));
  const calls=[],printed=[],exit=Symbol('exit');
  const context={previewOnly:true,version:'candidate-id',preview:'https://candidate.workers.dev',expected:'html-sha',inputDigest:'source-sha',liveVersion:'old-live',assets:[{relative:'vendor/candidate.js',sha256:'asset-sha',bytes:123}],console:{log:s=>printed.push(JSON.parse(s))},process:{exit:code=>{assert.equal(code,0);throw exit;}},run:async(...args)=>calls.push(args),verify:async()=>calls.push('verify'),verifyReleaseAssets:async()=>calls.push('verify-assets')};
  await assert.rejects(new vm.Script('(async()=>{'+s.slice(start)+'})()').runInNewContext(context),e=>e===exit);
  assert.deepEqual(calls,[],'preview flag reached deploy or browser verification');
  assert.equal(printed.length,1);assert.equal(printed[0].previewOnly,true);assert.equal(printed[0].version,'candidate-id');assert.equal(printed[0].preview,'https://candidate.workers.dev');assert.equal(printed[0].viewerSha256,'html-sha');assert.equal(printed[0].sourceDigest,'source-sha');
 }
});
test('both guarded wrappers require frozen assets, verified copies and remote digest/CORS',()=>{
 for(const name of ['deploy-viewer-verified.mjs','deploy-verified.mjs']){
  const s=fs.readFileSync(root+name,'utf8');
  for(const token of ['readReleaseAssets','copyReleaseAssets','verifyReleaseAssets','snapshotReleaseInputs'])assert(s.includes(token),name+' '+token);
  assert(s.includes('guardProduction'));assert(s.includes('rollback'));
 }
});
