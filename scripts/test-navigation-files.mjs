import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {navigationRegionEntry} from './navigation-region-contract.mjs';
const c=vm.createContext({Uint8Array,_wholeHash:async b=>createHash('sha256').update(b).digest('hex')});
for(const n of ['216_walk_settings','403m_navigation_files'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+n+'.js',import.meta.url),'utf8'),c);
const bytes=new Uint8Array([1,2,3]),source='ab'.repeat(32),entry=navigationRegionEntry(source,[[0,0,0],[8,8,8]],bytes),manifest={schema:1,source,regions:[{navigation:entry,collision:entry}]};
test('archive collection uses exact hashed asset paths and snapshots verified bytes',async()=>{
 const names=[],input=new Uint8Array(bytes),result=await c.LocahunNavigationFiles.read(manifest,name=>{names.push(name);return input;});
 assert.deepEqual(names,['assets/'+entry.key+'.lnv','assets/'+entry.key+'.lcp']);input[0]=9;
 assert.equal(result.files.get(names[0])[0],1);
});
test('missing, truncated and corrupted archive payloads fail rather than losing settings',async()=>{
 for(const value of [undefined,new Uint8Array(2),new Uint8Array(3)])await assert.rejects(c.LocahunNavigationFiles.read(manifest,()=>value),/Missing or corrupt/);
});
