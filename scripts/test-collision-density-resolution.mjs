import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),c);

test('sparse planar centers can survive coarse occupancy but disappear at fine resolution',()=>{
 const points=[[.02,-4.12,-1.98],[.14,-4.11,-1.88]];
 const counts=[];
 for(const cellSize of [.25,.1]){
  const accumulator=new c.LocahunWholeCollision.Accumulator({cellSize});
  for(const p of points)accumulator.add(...p);
  counts.push(accumulator.finish().length);
 }
 // Reproduction of the current density filter, not approval to lower its threshold.
 assert.deepEqual(counts,[1,0]);
});
