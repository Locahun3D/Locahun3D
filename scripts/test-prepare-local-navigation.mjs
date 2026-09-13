import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareLocalNavigation} from './prepare-local-navigation.mjs';
test('existing output is never overwritten or used for a new preparation',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nav-guard-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('nav-guard-'));await fs.rm(root,{recursive:true,force:true});});
 const output=path.join(root,'existing.json');await fs.writeFile(output,'keep');
 await assert.rejects(prepareLocalNavigation({root,output}),/already exists/);
 assert.equal(await fs.readFile(output,'utf8'),'keep');
});
test('unsupported collision selections and missing splats reject before creating output',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nav-guard-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('nav-guard-'));await fs.rm(root,{recursive:true,force:true});});
 const output=path.join(root,'prepared.json'),file=path.join(root,'project-state.json');
 for(const walk of [{meshOnly:true},{meshIds:[1]},{excludeIds:[1]},{}]){
  const state=JSON.stringify({revision:0,project:{version:4,layers:[],walk}});await fs.writeFile(file,state);
  await assert.rejects(prepareLocalNavigation({root,output}),/selection|No visible/);
  assert.equal(await fs.readFile(file,'utf8'),state);await assert.rejects(fs.stat(output),{code:'ENOENT'});
 }
});
