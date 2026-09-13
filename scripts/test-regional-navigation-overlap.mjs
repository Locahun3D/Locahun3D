import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
import {init,getNavMeshPositionsAndIndices} from './navigation-assets/node_modules/@recast-navigation/core/dist/index.mjs';
import {generateSoloNavMesh} from './navigation-assets/node_modules/@recast-navigation/generators/dist/index.mjs';
import {Pathfinding} from './navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs';
import {selectNavigationRegionBoxes} from './navigation-region-boxes.mjs';
const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../src/js/403b_navigation_query.js',import.meta.url),'utf8'),context);
await init();
function build(boxes,bounds){
 const positions=[],indices=[];
 for(const box of selectNavigationRegionBoxes(boxes,bounds)){
  const g=new THREE.BoxGeometry(...box.half.map(v=>2*v));g.translate(...box.center);
  const offset=positions.length/3;positions.push(...g.attributes.position.array);indices.push(...Array.from(g.index.array,i=>i+offset));g.dispose();
 }
 const result=generateSoloNavMesh(positions,indices,{bounds,cs:.05,ch:.025,walkableHeight:80,walkableClimb:12,walkableRadius:3,walkableSlopeAngle:45,minRegionArea:0,mergeRegionArea:0});
 assert(result.success,result.error);
 try{
  const [v,t]=getNavMeshPositionsAndIndices(result.navMesh);
  return context.LocahunNavigationQuery.create(THREE,Pathfinding,{source:'overlap',vertices:new Float32Array(v),triangles:new Uint32Array(t)});
 }finally{result.navMesh.destroy();}
}
test('overlapping regional meshes share usable same-floor targets without connecting stacked floors',()=>{
 const boxes=[{center:[32,-.1,16],half:[32,.1,16]},{center:[32,3.9,16],half:[32,.1,16]}];
 const a=build(boxes,[[0,-2,0],[32,8,32]]),b=build(boxes,[[16,-2,0],[48,8,32]]);
 try{
  for(const y of [.05,4.05])for(const x of [18,22,26]){
   const start={x,y,z:16},end={x:x+2,y,z:16};
   for(const q of [a,b]){const route=q.find(start,end,'overlap');assert(route?.length);assert(route.every(p=>Math.abs(p.y-y)<.1));}
  }
  for(const q of [a,b])assert.equal(q.find({x:20,y:.05,z:16},{x:24,y:4.05,z:16},'overlap'),null);
  assert.equal(a.find({x:24,y:.05,z:16},{x:34,y:.05,z:16},'overlap'),null);
  assert.equal(b.find({x:20,y:.05,z:16},{x:14,y:.05,z:16},'overlap'),null);
 }finally{a.dispose();b.dispose();}
});
test('regional geometry retains a physical gap instead of bridging across it',()=>{
 const q=build([{center:[5,-.1,16],half:[5,.1,16]},{center:[25,-.1,16],half:[7,.1,16]}],[[0,-2,0],[32,8,32]]);
 try{assert.equal(q.find({x:8,y:.05,z:16},{x:20,y:.05,z:16},'overlap'),null);}finally{q.dispose();}
});
