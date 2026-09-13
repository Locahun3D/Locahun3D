import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {inventoryProject} from './collision-source-identity.mjs';
import {createHash} from 'node:crypto';
import {prepareNavigationRegion} from './prepare-navigation-region.mjs';
const file=new URL('./apply-local-navigation.mjs',import.meta.url);
let apply;try{apply=(await import(file)).applyLocalNavigation;}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nav-apply-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('nav-apply-'));await fs.rm(root,{recursive:true,force:true});});
 const state={revision:0,status:'draft',project:{version:4,layers:[],projectName:'Keep name'}};
 await fs.mkdir(path.join(root,'history'));await fs.mkdir(path.join(root,'assets'));await fs.writeFile(path.join(root,'viewer.html'),'fixture');
 await fs.writeFile(path.join(root,'project-state.json'),JSON.stringify(state));
 const inventory=await inventoryProject({root}),prepared=path.join(root,'prepared.json');
 const project={...state.project,_navigationPreparation:{schema:1,revision:0,projectSha256:inventory.projectSha256,assets:inventory.assets}};
 await fs.writeFile(prepared,JSON.stringify(project));return {root,prepared,state,project};
}
test('missing preparation binding and changed project cannot overwrite current edits',async t=>{
 assert.equal(typeof apply,'function');const f=await fixture(t);
 await fs.writeFile(f.prepared,JSON.stringify({version:4,layers:[]}));await assert.rejects(apply(f),/binding/);
 await fs.writeFile(f.prepared,JSON.stringify(f.project));f.state.project.projectName='Human edit';
 const current=JSON.stringify(f.state);await fs.writeFile(path.join(f.root,'project-state.json'),current);
 await assert.rejects(apply(f),/changed/);assert.equal(await fs.readFile(path.join(f.root,'project-state.json'),'utf8'),current);
 assert.deepEqual(await fs.readdir(path.join(f.root,'history')),[]);
});
test('missing navigation data is rejected without saving an incomplete preparation',async t=>{
 assert.equal(typeof apply,'function');const f=await fixture(t);
 await assert.rejects(apply(f),/navigation/i);assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'project-state.json'),'utf8')).revision,0);
});
test('valid preparation saves only walking data with revision history and rejects repeat application',async t=>{
 const f=await fixture(t),key='ab'.repeat(32);
 const c=vm.createContext({Uint8Array,DataView,Float32Array,Uint32Array,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
 for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(await fs.readFile(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),c);
 const whole=await c.LocahunWholeCollision.encodeTiles([{coord:[0,-1,0],boxes:[{center:[1,-.1,1],half:[1,.1,1]}]}],key,.1);
 const nav=await c.LocahunNavigationCache.encode({vertices:[0,0,0,1,0,0,0,0,1],triangles:[0,1,2]},key);
 f.project.projectName='Must not replace current name';
 f.project.walk={cellSize:.1,whole:{key,data:Buffer.from(whole).toString('base64')},navigation:{key,data:Buffer.from(nav).toString('base64')}};
 await fs.writeFile(f.prepared,JSON.stringify(f.project));
 const result=await apply(f);assert.equal(result.revision,1);assert.equal(result.key,key);
 const saved=JSON.parse(await fs.readFile(path.join(f.root,'project-state.json'),'utf8'));
 assert.equal(saved.project.projectName,'Keep name');assert.deepEqual(saved.project.walk,f.project.walk);
 assert.equal(saved.project._navigationPreparation,undefined);
 const history=JSON.parse(await fs.readFile(path.join(f.root,'history/revision-0.json'),'utf8'));assert.deepEqual(history,f.state);
 await assert.rejects(apply(f),/changed/);assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'project-state.json'),'utf8')).revision,1);
});

test('regional application preserves coarse collision and requires every verified sidecar',async t=>{
 const f=await fixture(t),sources=[{sha256:'ab'.repeat(32),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}];
 const c=vm.createContext({Uint8Array,DataView,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
 vm.runInContext(await fs.readFile(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),c);
 const key=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
 const collision=await c.LocahunWholeCollision.encodeTiles([{coord:[0,-1,0],boxes:[{center:[1.6,-.05,1.6],half:[1.6,.05,1.6]}]}],key,.1);
 const bundle=await prepareNavigationRegion({sources,bounds:[[-1,-1,-1],[5,4,5]],collision,collisionSource:key});
 f.state.project.walk={cellSize:.25,signature:'unchanged',whole:{key:'cd'.repeat(32),data:'existing-coarse-cache'}};
 await fs.writeFile(path.join(f.root,'project-state.json'),JSON.stringify(f.state));
 const inventory=await inventoryProject({root:f.root});f.project._navigationPreparation.projectSha256=inventory.projectSha256;
 f.project.walk={navigationRegions:bundle.manifest};
 const staged=path.join(f.root,'staged');await fs.mkdir(path.join(staged,'assets'),{recursive:true});
 f.prepared=path.join(staged,'project.json');await fs.writeFile(f.prepared,JSON.stringify(f.project));
 await assert.rejects(apply(f));
 assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'project-state.json'),'utf8')).revision,0);
 for(const item of bundle.payloads)await fs.writeFile(path.join(staged,'assets',item.name),item.bytes);
 const result=await apply(f);assert.equal(result.revision,1);
 const saved=JSON.parse(await fs.readFile(path.join(f.root,'project-state.json'),'utf8'));
 assert.deepEqual(saved.project.walk,{...f.state.project.walk,navigationRegions:bundle.manifest});
 for(const item of bundle.payloads)assert.deepEqual(await fs.readFile(path.join(f.root,'assets',item.name)),Buffer.from(item.bytes));
});
