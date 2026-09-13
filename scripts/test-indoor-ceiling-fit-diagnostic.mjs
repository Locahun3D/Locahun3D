import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitIndoorCeiling} from './fixtures/indoor-ceiling-fit-diagnostic.mjs';
test('ceiling fitting retains extrema, padding, horizontal footprint and box count',()=>{
 const points=[];
 for(const x of [-1.59,-1.51])for(const z of [1.61,1.69])for(const y of [-1.0918,-1.002])points.push(x,y,z);
 const box={center:[-1.55,-1.05,1.65],half:[.05,.05,.05]};
 const result=fitIndoorCeiling(points,[box],.1),fit=result.boxes[0];
 assert.equal(result.boxes.length,1);assert.equal(result.changes.length,1);
 assert.ok(Math.abs(fit.center[1]-fit.half[1]-(-1.0968))<1e-9);
 assert.ok(fit.center[1]+fit.half[1]>=-1.002);
 assert.deepEqual([fit.half[0],fit.half[2]],[.05,.05]);
 assert.equal(box.center[1],-1.05);
});
test('sparse cells and unrelated floor stay identical',()=>{
 const boxes=[{center:[-1.55,-1.05,1.65],half:[.05,.05,.05]},{center:[-1.55,-2.85,1.65],half:[.05,.05,.05]}];
 const result=fitIndoorCeiling([-1.55,-1.07,1.65],boxes,.1);
 assert.equal(result.changes.length,0);assert.equal(result.boxes[0],boxes[0]);assert.equal(result.boxes[1],boxes[1]);
});
