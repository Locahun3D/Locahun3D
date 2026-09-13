import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceSurfaceCells} from './fixtures/indoor-surface-cells.mjs';

const box=(y,hy)=>({center:[.05,y,.05],half:[.05,hy,.05]});
const replacement={cell:[0,0,0],cellSize:.1,
 vertices:[0,.02,0,.1,.02,0,0,.02,.1,0,.1,0],
 indices:[0,2,1,0,1,3,1,2,3,2,0,3]};
const fixture={schema:1,replacements:[replacement]};
test('only a complete matching cell is replaced; adjacent vertical volume is retained',()=>{
 const boxes=[box(.05,.15),{center:[.3,.05,.05],half:[.2,.15,.05]}];
 const snapshot=JSON.stringify(boxes);
 const result=replaceSurfaceCells(boxes,fixture);
 assert.equal(result.meshes.length,1);assert.equal(result.applied,1);
 assert.equal(result.boxes.length,3);assert.equal(result.boxes.at(-1),boxes[1]);
 assert.ok(Math.abs(result.boxes[0].center[1]+.05)<1e-9);
 assert.ok(Math.abs(result.boxes[1].center[1]-.15)<1e-9);
 assert.equal(JSON.stringify(boxes),snapshot);
});
test('partial cells, other resolution, empty matches and gaps remain untouched',()=>{
 const boxes=[box(.01,.01),box(.16,.04),{center:[.1,.1,.1],half:[.1,.1,.1]}];
 const result=replaceSurfaceCells(boxes,fixture);
 assert.equal(result.applied,0);assert.deepEqual(result.boxes,boxes);assert.equal(result.meshes.length,0);
});
test('invalid or duplicate fixtures fail before replacement',()=>{
 for(const bad of [
  {...fixture,schema:2},
  {...fixture,replacements:[replacement,replacement]},
  {...fixture,replacements:[{...replacement,vertices:[NaN,0,0]}]},
  {...fixture,replacements:[{...replacement,indices:[0,1,99]}]},
  {...fixture,replacements:[{...replacement,indices:replacement.indices.slice(3)}]},
  {...fixture,replacements:[{...replacement,indices:[0,0,1,...replacement.indices]}]},
  {...fixture,replacements:[{...replacement,vertices:replacement.vertices.map((v,i)=>i===0?-.01:v)}]},
 ])assert.throws(()=>replaceSurfaceCells([box(.05,.05)],bad));
});
