// Counterfactual density comparison only. Never changes project or collision data.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
import {navigationSourceKey} from './navigation-region-contract.mjs';
const root='F:/Codex/locahun-navigation-20260913/MeetingRoom-local';
const neighborhood=JSON.parse(await fs.readFile('F:/Codex/locahun-navigation-20260913/room-browser-1789288231769/neighborhood.json','utf8'));
const state=JSON.parse(await fs.readFile(root+'/project-state.json','utf8'));
assert.equal(state.project.layers.length,1);
const layer=state.project.layers[0];assert.equal(layer.type,'splat');assert(!layer.parentId&&!layer._loadFlipped);
const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...['x','y','z'].map(k=>THREE.MathUtils.degToRad(layer.rot[k])),'XYZ'));
const vector=p=>new THREE.Vector3(p.x,p.y,p.z);
const oldMatrix=new THREE.Matrix4().compose(vector(layer.pos),quaternion,vector(layer.scale));
const hash=layer.file.match(/^assets\/([a-f0-9]{64})\.rad$/)?.[1];assert(hash);
assert.equal(navigationSourceKey([{sha256:hash,matrix:oldMatrix.elements}]),neighborhood.source);
const unitMatrix=new THREE.Matrix4().compose(vector(layer.pos),quaternion,new THREE.Vector3(1,1,1));
const conversion=unitMatrix.clone().multiply(oldMatrix.clone().invert());
const camera=vector(state.project.camera.pos),unitCamera=camera.clone().applyMatrix4(conversion);
function column(points,origin){
 const cells=new Map();
 for(const p of points){
  if(Math.floor(p.x/.1)!==Math.floor(origin.x/.1)||Math.floor(p.z/.1)!==Math.floor(origin.z/.1))continue;
  const y=Math.floor(p.y/.1);cells.set(y,(cells.get(y)||0)+1);
 }
 return [...cells].sort((a,b)=>a[0]-b[0]).map(([y,count])=>({y:y*.1,count,passesTwoPointRule:count>=2}));
}
const points=neighborhood.points.map(p=>new THREE.Vector3(...p));
console.log(JSON.stringify({source:neighborhood.source,scale:layer.scale,
 originalCamera:camera.toArray(),counterfactualCamera:unitCamera.toArray(),
 originalColumn:column(points,camera),unitScaleColumn:column(points.map(p=>p.clone().applyMatrix4(conversion)),unitCamera),
 collisionApproved:false,reason:'Same bounded samples and local camera; unit scale is a diagnostic hypothesis, not measured calibration.'},null,2));
