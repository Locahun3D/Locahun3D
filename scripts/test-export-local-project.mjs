import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadZipLibrary,prepareLocalProject} from './prepare-local-project.mjs';
import {exportLocalProject} from './export-local-project.mjs';

async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'local-export-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source');await fs.mkdir(path.join(source,'assets'),{recursive:true});
 await fs.mkdir(path.join(source,'history'));
 const project={version:4,layers:[{id:1,type:'splat',file:'assets/scene.rad',visible:true,pos:{x:1,y:2,z:3},scale:{x:1,y:1,z:1}},{id:2,type:'path',name:'Entrance',points:[[0,0,0],[1,0,0]],label:'Entrance\nSecond floor'}],camera:{position:[1,2,3]},walk:{cellSize:.25}};
 const envelope={revision:7,status:'editing_complete',project};
 await fs.writeFile(path.join(source,'project-state.json'),JSON.stringify(envelope));
 await fs.writeFile(path.join(source,'assets/scene.rad'),'fixture-rad');
 return {root,source,project,envelope,out:path.join(root,'complete.zip'),save:()=>fs.writeFile(path.join(source,'project-state.json'),JSON.stringify(envelope))};
}
test('exports exact completed revision and round-trips through local packager',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.source,'project-state.json'));
 const result=await exportLocalProject({root:f.source,out:f.out});
 assert.equal(result.revision,7);assert.match(result.sha256,/^[a-f0-9]{64}$/);
 const zip=await loadZipLibrary().loadAsync(await fs.readFile(f.out),{checkCRC32:true});
 assert.deepEqual(JSON.parse(await zip.file('project.json').async('string')),f.project);
 assert.equal(await zip.file('assets/scene.rad').async('string'),'fixture-rad');
 assert.equal(zip.file('project-state.json'),null);assert.equal(zip.file('viewer.html'),null);
 assert.equal(JSON.parse(await zip.file('export-info.json').async('string')).revision,7);
 assert.equal(result.roundtripVerified,true);
 const restored=path.join(f.root,'restored');await prepareLocalProject({zip:f.out,out:restored});
 const saved=JSON.parse(await fs.readFile(path.join(restored,'project-state.json')));
 const expected=structuredClone(f.project.layers);expected[0].file=saved.project.layers[0].file;
 assert.deepEqual(saved.project.layers,expected);assert.deepEqual(saved.project.camera,f.project.camera);
 assert.equal(await fs.readFile(path.join(restored,saved.project.layers[0].file),'utf8'),'fixture-rad');
 assert.deepEqual(await fs.readFile(path.join(f.source,'project-state.json')),before);
});
test('drafts, changed revision and existing outputs are not published',async t=>{
 const f=await fixture(t);f.envelope.status='draft';await f.save();
 await assert.rejects(exportLocalProject({root:f.source,out:f.out}),/editing_complete/);
 await assert.rejects(fs.stat(f.out),{code:'ENOENT'});
 f.envelope.status='editing_complete';await f.save();
 await assert.rejects(exportLocalProject({root:f.source,out:f.out,onProgress:async stage=>{if(stage==='packaging'){f.envelope.revision++;await f.save();}}}),/changed/);
 await assert.rejects(fs.stat(f.out),{code:'ENOENT'});
 await fs.writeFile(f.out,'keep');await assert.rejects(exportLocalProject({root:f.source,out:f.out}),/exist/i);
 assert.equal(await fs.readFile(f.out,'utf8'),'keep');
});
test('changed source bytes and missing regional sidecars fail without final output',async t=>{
 const f=await fixture(t);
 await assert.rejects(exportLocalProject({root:f.source,out:f.out,onProgress:async stage=>{if(stage==='packaging')await fs.writeFile(path.join(f.source,'assets/scene.rad'),'changed-data');}}),/changed/);
 await assert.rejects(fs.stat(f.out),{code:'ENOENT'});
 f.envelope.project.walk.navigationRegions={source:'invalid',regions:[]};await f.save();
 await assert.rejects(exportLocalProject({root:f.source,out:f.out}),/navigation/i);
 await assert.rejects(fs.stat(f.out),{code:'ENOENT'});
});
test('rejects unsafe references and output paths inside the source package',async t=>{
 const f=await fixture(t);
 await assert.rejects(exportLocalProject({root:f.source,out:path.join(f.source,'complete.zip')}),/inside/i);
 f.project.layers[0].file='../outside.rad';await f.save();
 await assert.rejects(exportLocalProject({root:f.source,out:f.out}),/Unsafe/);
});
test('a revision changed during verification cannot publish the completed ZIP',async t=>{
 const f=await fixture(t);
 await assert.rejects(exportLocalProject({root:f.source,out:f.out,onProgress:async stage=>{
  if(stage==='verifying'){f.envelope.status='draft';f.envelope.revision++;await f.save();}
 }}),/changed/);
 await assert.rejects(fs.stat(f.out),{code:'ENOENT'});
 assert.deepEqual((await fs.readdir(f.root)).sort(),['source']);
});
test('competing exports never overwrite a file published during verification',async t=>{
 const f=await fixture(t);
 await assert.rejects(exportLocalProject({root:f.source,out:f.out,onProgress:async stage=>{
  if(stage==='verifying')await fs.writeFile(f.out,'other-export',{flag:'wx'});
 }}),{code:'EEXIST'});
 assert.equal(await fs.readFile(f.out,'utf8'),'other-export');
 assert.deepEqual((await fs.readdir(f.root)).sort(),['complete.zip','source']);
});
