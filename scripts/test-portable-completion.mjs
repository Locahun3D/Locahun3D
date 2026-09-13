import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {loadZipLibrary} from './prepare-local-project.mjs';
import {preparePortableCompletion} from './prepare-portable-completion.mjs';

test('relocated portable package exports a human-completed save without canonical dependencies', {timeout:120000}, async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'portable-completion-'));
 let child,serverPid;
 t.after(async()=>{
  if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
  if(serverPid){try{process.kill(serverPid);}catch(e){if(e.code!=='ESRCH')throw e;}
   for(let i=0;i<100;i++){try{process.kill(serverPid,0);}catch(e){if(e.code==='ESRCH')break;throw e;}await new Promise(r=>setTimeout(r,50));}
   assert.throws(()=>process.kill(serverPid,0),{code:'ESRCH'});
  }
  assert.equal(path.dirname(base),path.resolve(os.tmpdir()));await fs.rm(base,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 });
 const ZIP=loadZipLibrary(),zip=new ZIP();
 zip.file('project.json',JSON.stringify({version:4,layers:[{id:1,type:'splat',file:'a.rad'}]}));zip.file('a.rad','unchanged-source');
 const source=path.join(base,'source.zip');await fs.writeFile(source,await zip.generateAsync({type:'nodebuffer'}));
 const original=await fs.readFile(source),out=path.join(base,'bundle');
 await preparePortableCompletion({zip:source,out});
 await assert.rejects(preparePortableCompletion({zip:source,out}),/exists/i);
 const moved=path.join(base,'relocated package');await fs.cp(out,moved,{recursive:true,errorOnExist:true,force:false});
 assert.equal(path.dirname(out),base);await fs.rm(out,{recursive:true,force:true});
 const launch=await fs.readFile(path.join(moved,'Start_AutoExport.cmd'),'utf8');
 assert.match(launch,/%~dp0/);assert.doesNotMatch(launch,/F:|askgg|SESSION/i);
 assert.match(launch,/LOCAHUN_NO_OPEN/);
 child=spawn('cmd.exe',['/d','/c','Start_AutoExport.cmd'],{cwd:moved,windowsHide:true,env:{...process.env,USERPROFILE:base,HOME:base,NODE_PATH:'',LOCAHUN_ADMIN_SESSION:'',LOCAHUN_NO_OPEN:'1'},stdio:['ignore','pipe','pipe']});
 let err='';child.stderr.on('data',b=>err+=b);
 assert.equal((await once(child,'exit'))[0],0,err);
 let url;
 for(let i=0;i<100;i++){
  try{const lock=JSON.parse(await fs.readFile(path.join(moved,'Project/.local-project.lock')));assert.equal(lock.root,path.join(moved,'Project'));serverPid=lock.pid;url=lock.url;if(url)break;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(url,await fs.readFile(path.join(moved,'server-error.log'),'utf8'));
 assert.deepEqual(await fs.readdir(path.join(moved,'Exports')),[]);
 const state=JSON.parse(await fs.readFile(path.join(moved,'Project/project-state.json')));
 assert.equal(state.status,'draft');
 const response=await fetch(new URL('api/project',url),{method:'POST',headers:{Origin:new URL(url).origin,'Content-Type':'application/json'},body:JSON.stringify({...state,status:'editing_complete'})});assert.equal(response.status,200);
 let completion;
 for(let i=0;i<200;i++){completion=await (await fetch(new URL('api/completion',url))).json();if(['completed','failed'].includes(completion.status))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(completion.status,'completed',JSON.stringify(completion)+err);
 const entries=await fs.readdir(path.join(moved,'Exports'));assert.equal(entries.length,1);
 const receipt=JSON.parse(await fs.readFile(path.join(moved,'Exports',entries[0],'receipt.json')));assert.equal(receipt.roundtripVerified,true);assert.equal(receipt.input.revision,1);
 const archive=await fs.readFile(path.join(moved,'Exports',entries[0],'project.zip'));
 const unpacked=await ZIP.loadAsync(archive);const project=JSON.parse(await unpacked.file('project.json').async('string'));
 assert.equal(await unpacked.file(project.layers[0].file).async('string'),'unchanged-source');
 assert.deepEqual(await fs.readFile(source),original);
 assert.ok((await fs.stat(path.join(moved,'tools/node_modules/jszip/LICENSE.markdown'))).isFile());
 assert.ok((await fs.stat(path.join(moved,'Project/runtime/LICENSE'))).isFile());
});
