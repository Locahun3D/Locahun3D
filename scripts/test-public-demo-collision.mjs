import test from 'node:test';
import assert from 'node:assert/strict';
import {demoKey,demoResource,sha256,validatePublicDemo} from './public-demo-collision-contract.mjs';
function fixture(){
 const bytes=Buffer.from('test-only'),metadata={key:demoKey,httpEtag:'"abc"',size:100,observedAt:'2026-09-11T00:00:00Z'};
 const a=-168*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const identity='etag:'+sha256(demoResource)+':"abc":100',matrix=[c,0,-s,0,0,1,0,0,s,0,c,0,0,1.5,0,1];
 const report={metadata,completedAt:'2026-09-11T00:01:00Z',sources:[{identity,matrix,url:demoResource,pos:{x:0,y:1.5,z:0},rot:{x:0,y:-168,z:0},scale:{x:1,y:1,z:1}}],cellSize:.15,
 whole:{key:sha256(JSON.stringify(['whole-tiles-v1',.15,[{identity,matrix}]]))},bytes:bytes.length,sha256:sha256(bytes),measured:{entries:2,leaves:1},tiles:1,boxes:1};
 return {report,bytes,after:{...metadata,observedAt:'2026-09-11T00:02:00Z'}};
}
test('public demo binds exact resource, runtime identity, key and bytes to bracketing observations',()=>{
 const {report,bytes,after}=fixture();assert.equal(validatePublicDemo(report,bytes,after).key,report.whole.key);
 for(const mutate of [r=>r.sources[0].url='https://private.invalid/a.rad',r=>r.sources[0].matrix[0]=2,r=>r.sources[0].identity='probe',r=>r.sha256='0'.repeat(64),r=>r.sources.push(r.sources[0])]){
  const copy=structuredClone(report);mutate(copy);assert.throws(()=>validatePublicDemo(copy,bytes,after));
 }
 assert.throws(()=>validatePublicDemo(report,bytes,{...after,httpEtag:'"changed"'}));
 assert.throws(()=>validatePublicDemo(report,bytes,{...after,observedAt:report.metadata.observedAt}));
});
