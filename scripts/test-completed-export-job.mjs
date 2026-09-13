import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {runCompletedExportJob} from './completed-export-job.mjs';

async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'completed-job-test-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'source'),jobs=path.join(base,'jobs');
 await fs.mkdir(path.join(root,'assets'),{recursive:true});await fs.mkdir(jobs);
 const state={revision:4,status:'editing_complete',project:{version:4,layers:[{id:1,type:'splat',file:'assets/a.rad'}]}};
 await fs.writeFile(path.join(root,'assets/a.rad'),'source');
 const save=()=>fs.writeFile(path.join(root,'project-state.json'),JSON.stringify(state));await save();
 return {base,root,jobs,state,save};
}
test('completed revision creates one verified job and is reused on repeated execution',async t=>{
 const f=await fixture(t);const a=await runCompletedExportJob(f),b=await runCompletedExportJob(f);
 assert.equal(a.status,'created');assert.equal(b.status,'reused');assert.equal(a.archive,b.archive);
 assert.equal((await fs.readdir(f.jobs)).length,1);
 assert.equal(JSON.parse(await fs.readFile(path.join(a.directory,'receipt.json'))).input.revision,4);
});
test('draft waits without output; new saved revision creates a distinct job',async t=>{
 const f=await fixture(t);f.state.status='draft';await f.save();
 assert.equal((await runCompletedExportJob(f)).status,'waiting_for_edit');assert.deepEqual(await fs.readdir(f.jobs),[]);
 f.state.status='editing_complete';await f.save();const a=await runCompletedExportJob(f);
 f.state.revision++;await f.save();const b=await runCompletedExportJob(f);
 assert.notEqual(a.directory,b.directory);assert.equal((await fs.readdir(f.jobs)).length,2);
});
test('corrupted output is not reused or overwritten',async t=>{
 const f=await fixture(t),a=await runCompletedExportJob(f);await fs.writeFile(a.archive,'broken');
 await assert.rejects(runCompletedExportJob(f),/digest|mismatch/i);assert.equal(await fs.readFile(a.archive,'utf8'),'broken');
});
test('interrupted preparation leaves no completed job and retry succeeds',async t=>{
 const f=await fixture(t);
 await assert.rejects(runCompletedExportJob({...f,onProgress:stage=>{if(stage==='packaging')throw Error('interrupted');}}),/interrupted/);
 assert.deepEqual(await fs.readdir(f.jobs),[]);assert.equal((await runCompletedExportJob(f)).status,'created');
});
test('concurrent attempts converge on one artifact without replacing a completed job',async t=>{
 const f=await fixture(t);
 const results=await Promise.all([runCompletedExportJob(f),runCompletedExportJob(f)]);
 assert.deepEqual(results.map(r=>r.status).sort(),['created','reused']);assert.equal(results[0].archive,results[1].archive);
 assert.equal((await fs.readdir(f.jobs)).length,1);
});
