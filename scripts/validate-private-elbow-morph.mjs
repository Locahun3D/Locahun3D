// Private asset validation only; never embeds or writes the candidate GLB.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createElbowMorphDriver} from './elbow-morph-driver.mjs';
const asset=process.argv.find(a=>a.startsWith('--asset='))?.slice(8);
if(!asset)throw new Error('Provide private --asset=PATH; canonical is never a corrective candidate');
const bytes=fs.readFileSync(asset),toArray=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const loader=new GLTFLoader();
const candidate=await loader.parseAsync(toArray(bytes),'');
const canonical=await loader.parseAsync(toArray(fs.readFileSync(new URL('../figures/male165-shared-v2.glb',import.meta.url))),'');
const meshes=root=>{const list=[];root.traverse(o=>{if(o.isSkinnedMesh)list.push(o);});return list;};
const cMeshes=meshes(candidate.scene),bMeshes=meshes(canonical.scene);
assert.equal(cMeshes.length,bMeshes.length);
const binary=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
for(let i=0;i<cMeshes.length;i++){
  const c=cMeshes[i],b=bMeshes[i];assert.equal(c.name,b.name);
  for(const [name,attr] of Object.entries(b.geometry.attributes))assert.ok(binary(attr.array).equals(binary(c.geometry.attributes[name].array)),`base ${name} changed`);
  assert.ok(binary(b.geometry.index.array).equals(binary(c.geometry.index.array)),'topology changed');
  assert.equal(c.skeleton.bones.length,73);
  for(let j=0;j<73;j++){
    const cb=c.skeleton.bones[j],bb=b.skeleton.bones[j];assert.equal(cb.name,bb.name);
    assert.deepEqual(cb.position.toArray(),bb.position.toArray());assert.deepEqual(cb.quaternion.toArray(),bb.quaternion.toArray());assert.deepEqual(cb.scale.toArray(),bb.scale.toArray());
    assert.deepEqual(c.skeleton.boneInverses[j].toArray(),b.skeleton.boneInverses[j].toArray());
  }
}
const ctx={THREE,window:{},_addonLoader:async()=>GLTFLoader,_b64ToArrayBuffer:s=>toArray(Buffer.from(s,'base64'))};
vm.createContext(ctx);
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
vm.runInContext(read('src/assets/kawaii_walk_glb_b64.html').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
vm.runInContext(read('src/js/214_kawaii_walk_avatar.js'),ctx);
const root=await ctx._buildKawaiiWalkAvatar(1.65,{modelData:toArray(bytes),loadIKSolver:async()=>null});
const api=root.userData.kawaiiAnimation;
try{
  const mesh=meshes(root).find(m=>m.morphTargetDictionary?.Elbow_R_45!==undefined);
  assert.ok(mesh,'named Elbow_R_45 corrective missing');
  const samples=[45,70,105].map(angle=>({angle,name:'Elbow_R_'+angle}));
  const indices=samples.map(s=>mesh.morphTargetDictionary[s.name]);
  assert.ok(indices.every(Number.isInteger));assert.ok(mesh.geometry.morphTargetsRelative);
  const affected=[];
  for(let i=0;i<mesh.geometry.attributes.position.count;i++)if(indices.some(j=>{
    const a=mesh.geometry.morphAttributes.position[j];return Math.hypot(a.getX(i),a.getY(i),a.getZ(i))>1e-12;
  }))affected.push(i);
  assert.ok(affected.length>0,'empty corrective');
  const driver=createElbowMorphDriver(root,{mesh,samples,neutralAngle:15.291});
  assert.equal(driver.update(),null,'raw load must remain inactive');
  const states=[],timings=[],p=new THREE.Vector3(),q=new THREE.Vector3();
  for(const state of ['idle','walk','run','jump','landing','stop']){
    if(state==='idle'){api.reset();driver.reset();}
    for(let i=0;i<60;i++){
      api.update(1/60,state==='run'?6.16:state==='walk'?api.nominalSpeed:0,state!=='jump',{running:state==='run',verticalSpeed:state==='jump'?-2:0});
      root.updateMatrixWorld(true);if(i===0)driver.setEnabled(true);
      const start=performance.now();driver.update();timings.push(performance.now()-start);
    }
    const values=indices.map(i=>mesh.morphTargetInfluences[i]);let maxDelta=0,resetError=0;
    const activePositions=affected.map(i=>mesh.getVertexPosition(i,new THREE.Vector3()));
    driver.reset();
    const baseline=affected.map(i=>mesh.getVertexPosition(i,new THREE.Vector3()));
    for(let i=0;i<affected.length;i++)maxDelta=Math.max(maxDelta,activePositions[i].distanceTo(baseline[i]));
    driver.setEnabled(true);const angle=driver.update();
    for(let i=0;i<affected.length;i++){mesh.getVertexPosition(affected[i],p);resetError=Math.max(resetError,p.distanceTo(activePositions[i]));}
    assert.ok(resetError<1e-6,'repeated correction accumulated');
    driver.reset();for(let i=0;i<affected.length;i++){mesh.getVertexPosition(affected[i],q);assert.ok(q.distanceTo(baseline[i])<1e-7,'reset failed');}
    states.push({state,angle,weights:values,maxDeformedVertexDeltaM:maxDelta,roundTripErrorM:resetError});
  }
  assert.ok(states.some(s=>s.maxDeformedVertexDeltaM>1e-7),'GLTFLoader target did not deform actual skinned vertices');
  timings.sort((a,b)=>a-b);
  console.log(JSON.stringify({asset,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),baseInvariants:true,bones:73,affectedVertices:affected.length,states,driverTiming:{medianMs:timings[Math.floor(timings.length*.5)],p95Ms:timings[Math.floor(timings.length*.95)],scope:'driver only, excludes skin and render'}},null,2));
  driver.dispose();
}finally{api.dispose();}
