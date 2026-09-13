import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const argument=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const out=argument('out')||'F:/Codex/locahun-walk/verification/animation-2026-09-11/shoulder-ab';
fs.mkdirSync(out,{recursive:true});
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const ctx={THREE,window:{},_addonLoader:async()=>GLTFLoader,_b64ToArrayBuffer:s=>Uint8Array.from(Buffer.from(s,'base64')).buffer};
vm.createContext(ctx);
for(const f of ['src/assets/kawaii_walk_glb_b64.html','src/assets/male165_glb_b64.html','src/js/214_kawaii_walk_avatar.js'])vm.runInContext(read(f).replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
const bytes=fs.readFileSync(argument('asset')||new URL('../figures/male165-shared-v2.glb',import.meta.url));
const raw=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const av=await ctx._buildKawaiiWalkAvatar(1.65,{loadIKSolver:async()=>null,modelData:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),api=av.userData.kawaiiAnimation;
const pos=(root,n)=>root.getObjectByName(n).getWorldPosition(new THREE.Vector3());
function chest(root){
  root.updateMatrixWorld(true);
  const y=pos(root,'Neck').sub(pos(root,'Spine')).normalize();
  const x=pos(root,'LeftShoulder').sub(pos(root,'RightShoulder')).normalize();
  const z=new THREE.Vector3().crossVectors(x,y).normalize();x.crossVectors(y,z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
function frame(root,bone='RightArm',tip='RightForeArm'){
  const c=chest(root),inv=c.clone().invert();
  const dir=pos(root,tip).sub(pos(root,bone)).normalize().applyQuaternion(inv);
  const q=root.getObjectByName(bone).getWorldQuaternion(new THREE.Quaternion()).premultiply(inv);
  return {c,dir,q};
}
const bind=frame(raw.scene);
const lowerBind=frame(raw.scene,'RightForeArm','RightHand');
function rotate(b,worldAxis,angle){
  const axis=worldAxis.clone().applyQuaternion(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  b.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));b.updateMatrixWorld(true);
}
const report=[];
function save(root,name){
  const f=frame(root),swing=new THREE.Quaternion().setFromUnitVectors(bind.dir,f.dir);
  const twist=swing.invert().multiply(f.q.clone().multiply(bind.q.clone().invert())).normalize();
  const roll=2*Math.atan2(new THREE.Vector3(twist.x,twist.y,twist.z).dot(bind.dir),twist.w)*180/Math.PI;
  const lowerFrame=frame(root,'RightForeArm','RightHand');
  const lowerTwist=new THREE.Quaternion().setFromUnitVectors(lowerBind.dir,lowerFrame.dir).invert()
    .multiply(lowerFrame.q.clone().multiply(lowerBind.q.clone().invert())).normalize();
  const lowerRoll=2*Math.atan2(new THREE.Vector3(lowerTwist.x,lowerTwist.y,lowerTwist.z).dot(lowerBind.dir),lowerTwist.w)*180/Math.PI;
  const bones={};
  for(const n of ['RightShoulder','RightArm','RightForeArm','RightHand','Spine','Neck']){
    const b=root.getObjectByName(n);
    bones[n]={worldMatrixColumnMajor:b.matrixWorld.toArray(),worldQuaternionXYZW:b.getWorldQuaternion(new THREE.Quaternion()).toArray(),worldOrigin:b.getWorldPosition(new THREE.Vector3()).toArray(),localQuaternionXYZW:b.quaternion.toArray()};
  }
  const item={name,chestDirection:f.dir.toArray(),extensionDeg:Math.atan2(-f.dir.z,-f.dir.y)*180/Math.PI,axialRollFromBindDeg:roll,
    forearmAxialRollFromBindDeg:lowerRoll,elbowFlexDeg:f.dir.angleTo(lowerFrame.dir)*180/Math.PI,
    chestWorldQuaternionXYZW:f.c.toArray(),chestWorldRotationMatrixColumnMajor:new THREE.Matrix4().makeRotationFromQuaternion(f.c).toArray(),bones};
  report.push(item);console.log(JSON.stringify(item));
  const lines=[];let base=1;const p=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    lines.push('o '+mesh.name);const count=mesh.geometry.attributes.position.count;
    for(let i=0;i<count;i++){mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);lines.push(`v ${p.x} ${p.y} ${p.z}`);}
    const index=mesh.geometry.index;
    for(let i=0;i<index.count;i+=3)lines.push('f '+[0,1,2].map(j=>base+index.getX(i+j)).join(' '));
    base+=count;
  });
  fs.writeFileSync(out+'/'+name+'.obj',lines.join('\n'));
}
save(raw.scene,'target-rest');api.reset();save(av,'retarget-idle');
const idleArm=av.getObjectByName('RightArm').quaternion.clone();
const idleLower=av.getObjectByName('RightForeArm').quaternion.clone();
for(const [name,factor,clavicle] of [['back100',1,0],['back50',.5,0],['back0',0,0],['cap35',null,0],['cap35-clav-plus10',null,10],['cap35-clav-minus10',null,-10],['cap35-roll0',null,0],['cap35-forearm-roll0',null,0],['cap35-flex0',null,0],['cap35-flex45',null,0],['cap35-flex55',null,0],['cap35-flex70',null,0],['cap35-flex105',null,0]]){
  api.reset();for(let i=0;i<90;i++)api.update(1/60,6.16,true,{running:true});
  api.runAction.time=.16-1/120*api.runAction.getEffectiveTimeScale();api.update(1/120,6.16,true,{running:true});
  const arm=av.getObjectByName('RightArm');
  // Reconstruct the rejected R3 right-arm pose independently of later runtime
  // caps, so100/50/0 continues to mean the same diagnostic experiment.
  arm.quaternion.copy(idleArm);
  const forearm=av.getObjectByName('RightForeArm');forearm.quaternion.copy(idleLower);
  av.updateMatrixWorld(true);rotate(arm,new THREE.Vector3(1,0,0),.8);
  rotate(forearm,new THREE.Vector3(1,0,0),-1.2);
  if(factor!==null)rotate(arm,new THREE.Vector3(1,0,0),-.8*(1-factor));
  else{
    const f=frame(av),angle=Math.atan2(-f.dir.z,-f.dir.y);
    rotate(arm,new THREE.Vector3(1,0,0).applyQuaternion(f.c),35*Math.PI/180-angle);
  }
  if(clavicle){
    const q=arm.getWorldQuaternion(new THREE.Quaternion());
    rotate(av.getObjectByName('RightShoulder'),new THREE.Vector3(0,1,0).applyQuaternion(chest(av)),clavicle*Math.PI/180);
    arm.quaternion.copy(arm.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));av.updateMatrixWorld(true);
  }
  if(name==='cap35-roll0'){
    const f=frame(av),swing=new THREE.Quaternion().setFromUnitVectors(bind.dir,f.dir);
    const lower=av.getObjectByName('RightForeArm'),lowerQ=lower.getWorldQuaternion(new THREE.Quaternion());
    const desired=f.c.clone().multiply(swing).multiply(bind.q);
    arm.quaternion.copy(arm.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));arm.updateMatrixWorld(true);
    lower.quaternion.copy(lower.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(lowerQ));av.updateMatrixWorld(true);
  }
  if(name==='cap35-forearm-roll0'){
    const f=frame(av,'RightForeArm','RightHand'),swing=new THREE.Quaternion().setFromUnitVectors(lowerBind.dir,f.dir);
    const lower=av.getObjectByName('RightForeArm'),hand=av.getObjectByName('RightHand');
    const handQ=hand.getWorldQuaternion(new THREE.Quaternion());
    const desired=f.c.clone().multiply(swing).multiply(lowerBind.q);
    lower.quaternion.copy(lower.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));lower.updateMatrixWorld(true);
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handQ));av.updateMatrixWorld(true);
  }
  if(name.startsWith('cap35-flex')){
    const upper=pos(av,'RightForeArm').sub(pos(av,'RightArm')).normalize();
    const lower=pos(av,'RightHand').sub(pos(av,'RightForeArm')).normalize();
    const hinge=new THREE.Vector3().crossVectors(upper,lower).normalize();
    const target=Number(name.slice('cap35-flex'.length))*Math.PI/180;
    rotate(av.getObjectByName('RightForeArm'),hinge,target-upper.angleTo(lower));
  }
  save(av,name);
}
fs.writeFileSync(out+'/poses.json',JSON.stringify({assetSha256:crypto.createHash('sha256').update(bytes).digest('hex'),phase:.25,rollDefinition:'Swing removed from bind-to-posed humerus rotation in anatomical chest frames; residual signed about bind humerus direction',poses:report},null,2));
api.dispose();
