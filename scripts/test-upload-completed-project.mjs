import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {uploadCompletedProject} from './upload-completed-project.mjs';

async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'workflow-http-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'source'),jobs=path.join(base,'jobs');
 await fs.mkdir(path.join(root,'assets'),{recursive:true});await fs.mkdir(jobs);
 const state={revision:4,status:'editing_complete',project:{version:4,layers:[{id:1,type:'splat',file:'assets/a.rad'}]}};
 await fs.writeFile(path.join(root,'assets/a.rad'),'source');
 const save=()=>fs.writeFile(path.join(root,'project-state.json'),JSON.stringify(state));await save();
 let binding,stored,ready=false,attachments=0,puts=0,corrupt=false;
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/object'&&req.method==='PUT'){
   puts++;if(stored){res.writeHead(412);res.end();return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);stored=Buffer.concat(chunks);
   assert.equal(req.headers.authorization,undefined);assert.equal(req.headers['if-none-match'],'*');
   assert.equal(req.headers['content-md5'],createHash('md5').update(stored).digest('base64'));
   res.end();return;
  }
  if(req.url==='/object') {res.end(corrupt?Buffer.from('bad'):stored);return;}
  assert.equal(req.headers.authorization,'Bearer test-only');
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks));
  res.setHeader('content-type','application/json');
  if(input.action==='reserve'){
   if(binding)assert.deepEqual(binding,input.binding);binding=input.binding;
   res.end(JSON.stringify({key:'a'.repeat(64),id:'wf_'+'a'.repeat(64),status:ready?'ready':'uploading',...(!ready?{putUrl:origin+'/object',headers:{'Content-MD5':Buffer.from(binding.archiveMd5,'hex').toString('base64'),'If-None-Match':'*'}}:{})}));
  }else if(input.action==='verify'){
   ready=true;res.end(JSON.stringify({downloadUrl:origin+'/object',bytes:binding.archiveBytes,sha256:binding.archiveSha256}));
  }else{
   assert.equal(input.verifiedSha256,binding.archiveSha256);attachments++;res.end(JSON.stringify({status:'attached',key:input.key,propertyId:'p',sceneId:'s'}));
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port;
 const options={root,jobs,origin,token:'test-only',allowedOrigins:[origin],target:{propertyId:'p',sceneId:'s',expectedUpdatedAt:'2026-09-14T00:00:00.000Z',previousUrl:''}};
 return {options,state,save,setCorrupt:()=>{corrupt=true;},counts:()=>({attachments,puts})};
}
test('completed package streams to storage, reads back and attaches; retry skips PUT',async t=>{
 const f=await fixture(t);assert.equal((await uploadCompletedProject(f.options)).status,'attached');
 assert.equal((await uploadCompletedProject(f.options)).status,'attached');assert.deepEqual(f.counts(),{attachments:2,puts:1});
});
test('draft never contacts the server and corrupt download never attaches',async t=>{
 const f=await fixture(t);f.state.status='draft';await f.save();
 assert.equal((await uploadCompletedProject(f.options)).status,'waiting_for_edit');assert.equal(f.counts().puts,0);
 f.state.status='editing_complete';await f.save();f.setCorrupt();
 await assert.rejects(uploadCompletedProject(f.options),/archive|size|digest/i);assert.equal(f.counts().attachments,0);
});
test('untrusted storage origin never receives upload or credentials',async t=>{
 const f=await fixture(t);await assert.rejects(uploadCompletedProject({...f.options,allowedOrigins:['https://different.test']}),/origin/i);
 assert.equal(f.counts().puts,0);
});
test('editing source during upload prevents attachment',async t=>{
 const f=await fixture(t);let changed=false;
 await assert.rejects(uploadCompletedProject({...f.options,fetch:async(url,options)=>{
  const response=await fetch(url,options);
  if(options?.method==='PUT'&&!changed){changed=true;f.state.status='draft';f.state.revision++;await f.save();}
  return response;
 }}),/Source changed/);
 assert.equal(f.counts().attachments,0);
});
test('session provider is refreshed for each administrative request',async t=>{
 const f=await fixture(t);let calls=0;
 await uploadCompletedProject({...f.options,token:async()=>{calls++;return 'test-only';}});
 assert.equal(calls,3);
});
test('unresponsive session provider has a deadline and makes no remote writes',async t=>{
 const f=await fixture(t);
 await assert.rejects(uploadCompletedProject({...f.options,token:()=>new Promise(()=>{}),tokenTimeoutMs:10}),/session.*deadline/i);
 assert.deepEqual(f.counts(),{attachments:0,puts:0});
});
test('lost PUT response retries the same write-once object and then attaches',async t=>{
 const f=await fixture(t);let lost=false;
 await assert.rejects(uploadCompletedProject({...f.options,fetch:async(url,options)=>{
  const response=await fetch(url,options);
  if(options?.method==='PUT'&&!lost){lost=true;await response.arrayBuffer();throw Error('response lost');}
  return response;
 }}),/response lost/);
 assert.equal((await uploadCompletedProject(f.options)).status,'attached');
 assert.deepEqual(f.counts(),{attachments:1,puts:2});
});
