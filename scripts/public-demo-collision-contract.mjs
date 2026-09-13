import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const demoKey='Kousaten_ForDemo_point_cloud.rad';
export const demoResource='https://viewer.locahun3d.com/api/demo-asset/'+demoKey;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validatePublicDemo(report,bytes,after){
 const before=report.metadata;
 assert.equal(before.key,demoKey);assert.equal(after.key,demoKey);
 assert.equal(after.httpEtag,before.httpEtag);assert.equal(after.size,before.size);
 assert.match(before.httpEtag,/^"[^"\r\n]+"$/);assert(Number.isSafeInteger(before.size)&&before.size>0);
 assert(Date.parse(before.observedAt)<=Date.parse(report.completedAt));
 assert(Date.parse(after.observedAt)>=Date.parse(report.completedAt),'R2 verification must follow bake');
 assert.equal(report.sources.length,1);const source=report.sources[0];
 assert.equal(source.url,demoResource);assert.deepEqual(source.pos,{x:0,y:1.5,z:0});
 assert.deepEqual(source.rot,{x:0,y:-168,z:0});assert.deepEqual(source.scale,{x:1,y:1,z:1});
 const identity='etag:'+sha256(demoResource)+':'+before.httpEtag+':'+before.size;
 assert.equal(source.identity,identity);assert.equal(source.matrix.length,16);assert(source.matrix.every(Number.isFinite));
 const angle=-168*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const curated=[c,0,-s,0,0,1,0,0,s,0,c,0,0,1.5,0,1];
 assert(source.matrix.every((n,i)=>Math.abs(n-curated[i])<1e-12),'matrix must match curated 292 transform');
 assert.equal(report.whole.key,sha256(JSON.stringify(['whole-tiles-v1',report.cellSize,[{identity,matrix:source.matrix}]])));
 assert.equal(report.bytes,bytes.length);assert.equal(report.sha256,sha256(bytes));
 assert(report.measured?.entries>0&&report.measured.leaves>0&&report.tiles>0&&report.boxes>0);
 return {key:report.whole.key,entry:{sha256:report.sha256,bytes:bytes.length}};
}
