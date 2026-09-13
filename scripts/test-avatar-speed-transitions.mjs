import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {CCDIKSolver} from './avatar-assets/node_modules/three/examples/jsm/animation/CCDIKSolver.js';
const read=n=>fs.readFileSync(new URL('../src/js/'+n,import.meta.url),'utf8');
const soleCache=new WeakMap();
function soleY(root,foot){
  let min=Infinity;const p=new THREE.Vector3();root.updateMatrixWorld(true);
  if(soleCache.has(foot)){
    for(const [mesh,i] of soleCache.get(foot)){
      mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);
    }return min;
  }
  const vertices=[];
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const ids=new Set();mesh.skeleton.bones.forEach((b,i)=>{
      for(let node=b;node;node=node.parent)if(node===foot){ids.add(i);break;}
    });
    const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;
    for(let i=0;i<si.count;i++){
      let w=0;for(let j=0;j<4;j++)if(ids.has(si.getComponent(i,j)))w+=sw.getComponent(i,j);
      if(w<.5)continue;vertices.push([mesh,i]);mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);
    }
  });soleCache.set(foot,vertices);return min;
}
function movement(){
  const ctx={THREE,keys:{},joyDX:0,joyDY:0,yaw:0,camAnim:{playing:false},
    walkSetup:{core:{}},camPos:new THREE.Vector3(),_readGamepadInput:()=>null,
    _walkCameraCollision(){},_avatarWalkCameraVisibility(){},markDirty(){},_avatarUpdateAnimation(){}};
  vm.createContext(ctx);
  vm.runInContext('var walkMode = '+read('211_fly_camera_google_earth_scheme.js').split('const walkMode = ')[1],ctx);
  Object.assign(ctx.walkMode,{active:true,avatar:new THREE.Group(),speed:1.2,runMul:1.85});
  ctx._walkCollisionAdvance=(av,dt,x,z,jump)=>{
    av.position.x+=x*dt;av.position.z+=z*dt;
    ctx.walkMode.actualSpeed=Math.hypot(x,z);ctx.jump=jump;
    return ctx.walkMode.actualSpeed>.03;
  };
  vm.runInContext(read('219_collision_walk_update.js'),ctx);
  ctx.tick=n=>{for(let i=0;i<n;i++)ctx._updateCollisionAvatarWalk(1/60);};
  return ctx;
}
test('run target is not overwritten by loaded walk capture speed',()=>{
  const c=movement();c.keys.KeyW=true;c.keys.ShiftLeft=true;c.tick(180);
  assert.ok(Math.abs(c.walkMode.actualSpeed-6.16)<.01,`run=${c.walkMode.actualSpeed}`);
  const z=c.walkMode.avatar.position.z;c.tick(60);
  assert.ok(Math.abs(c.walkMode.avatar.position.z-z-6.16)<.01);
});
test('touch/mouse analog outer zone and keyboard share run speed, diagonals do not boost it',()=>{
  const c=movement();c.joyDY=-1;c.tick(180);assert.ok(c.walkMode.actualSpeed>6.15);
  c.joyDX=1;c.joyDY=-1;c.tick(180);assert.ok(c.walkMode.actualSpeed<=6.161);
  c.joyDX=0;c.joyDY=0;c.tick(90);assert.equal(c.walkMode.actualSpeed,0);
});
test('quick run reversal responds within 200ms without exceeding run speed',()=>{
 const c=movement();c.keys.KeyW=true;c.keys.ShiftLeft=true;c.tick(180);
 c.keys.KeyW=false;c.keys.KeyS=true;c.tick(12);
 assert(c.walkMode.moveZ<0,'must stop travelling in the old direction after a quick reversal');
 assert(c.walkMode.actualSpeed<=6.161);
});

test('analog run boundary has hysteresis and continuous speed',()=>{
  const c=movement();c.joyDY=-.8;c.tick(180);
  const fast=c.walkMode.actualSpeed;c.joyDY=-.74;c.tick(30);
  assert.ok(c.walkMode.actualSpeed>fast*.8,'small pointer jitter must not drop to walk');
});
test('existing elevation button triggers one jump per press for touch and mouse',()=>{
  const c=movement();c.touchUpHeld=true;c.tick(1);assert.equal(c.jump,true);
  c.tick(1);assert.equal(c.jump,false);
  c.touchUpHeld=false;c.tick(1);c.touchUpHeld=true;c.tick(1);assert.equal(c.jump,true);
});
test('dedicated jump button request is consumed exactly once',()=>{
 const c=movement();c.walkMode.jumpRequested=true;
 c.tick(1);assert.equal(c.jump,true);assert.equal(c.walkMode.jumpRequested,false);
 c.tick(1);assert.equal(c.jump,false);
});
async function avatar(configure=()=>{},modelData){
  class Loader extends GLTFLoader{
    parse(data,path,resolve,reject){super.parse(data,path,g=>{configure(g);resolve(g);},reject);}
  }
  const ctx={THREE,window:{},_addonLoader:async()=>Loader,
    _b64ToArrayBuffer:s=>Uint8Array.from(Buffer.from(s,'base64')).buffer};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../src/assets/kawaii_walk_glb_b64.html',import.meta.url),'utf8').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
  vm.runInContext(read('214_kawaii_walk_avatar.js'),ctx);
  return ctx._buildKawaiiWalkAvatar(1.65,{loadIKSolver:async()=>CCDIKSolver,modelData});
}
test('run uses an independent action, all action weights sum to one; takeoff is distinct from falling',async t=>{
  const av=await avatar(),a=av.userData.kawaiiAnimation;t.after(()=>a.dispose());
  assert.ok(a.runAction,'separate authored run action is required');
  const cadence=6.16/a.nominalRunSpeed/a.runAction.getClip().duration*120;
  assert.ok(cadence>=160&&cadence<=240,`reject implausible run cadence ${cadence}`);
  assert.notEqual(a.runAction.getClip(),a.walkAction.getClip());
  a.update(1/60,.2,true,{running:true});
  assert.equal(a.state,'walk','held sprint is not a running gait before accelerating');
  for(let i=0;i<90;i++)a.update(1/60,5.2,true,{running:true});
  assert.ok(a.runAction.getEffectiveWeight()>.95);
  assert.ok(a.walkAction.getEffectiveWeight()<.01);
  assert.ok(Math.abs(a.runAction.getEffectiveTimeScale()*a.nominalRunSpeed-5.2)<.01);
  a.update(1/60,5.2,false,{running:true,verticalSpeed:5});assert.equal(a.state,'takeoff');
  for(let i=0;i<30;i++)a.update(1/60,5.2,false,{verticalSpeed:-1});
  assert.equal(a.state,'airborne');
  a.update(1/60,5.2,true,{verticalSpeed:0});assert.equal(a.state,'landing');
  for(let i=0;i<100;i++)a.update(1/60,0,true);
  assert.equal(a.state,'idle');
  assert.ok(Math.abs(a.idleAction.getEffectiveWeight()+a.walkAction.getEffectiveWeight()+a.runAction.getEffectiveWeight()-1)<1e-6);
  a.reset();a.update(1/60,0,false,{verticalSpeed:-1});assert.equal(a.state,'airborne','walking off a ledge is not a jump');
});
test('canonical male uses calibrated rotations without changing target bone lengths or inverse binds',async t=>{
  const path=new URL('../figures/male165-shared-v2.glb',import.meta.url);
  const buffer=fs.readFileSync(path),data=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
  let bind,translations;
  const av=await avatar(g=>{
    if(!g.scene.getObjectByName('B1_Rig')?.userData.asset_id)return;
    bind=[];translations=new Map();
    g.scene.traverse(o=>{
      if(o.isBone)translations.set(o.name,o.position.toArray());
      if(o.isSkinnedMesh)bind.push(o.skeleton.boneInverses.map(m=>m.toArray()));
    });
  },data);
  const a=av.userData.kawaiiAnimation;t.after(()=>a.dispose());
  assert.match(a.source,/male165_continuous_v2/);
  const current=[];
  av.traverse(o=>{
    if(o.isBone&&o.name!=='Hips')assert.deepEqual(o.position.toArray(),translations.get(o.name));
    if(o.isSkinnedMesh)current.push(o.skeleton.boneInverses.map(m=>m.toArray()));
  });
  assert.deepEqual(current,bind);
  const knee=av.getObjectByName('LeftLeg'),q=knee.quaternion.clone();
  for(let i=0;i<45;i++)a.update(1/60,a.nominalSpeed,true);
  assert.ok(knee.quaternion.angleTo(q)>.05);
  const box=new THREE.Box3().setFromObject(av,true);
  assert.ok(Number.isFinite(box.min.y)&&box.min.y>-.08);
});
test('male retarget preserves captured limb directions, not source local quaternion values',async t=>{
  const buffer=fs.readFileSync(new URL('../figures/male165-shared-v2.glb',import.meta.url));
  const data=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
  const source=await avatar(),target=await avatar(()=>{},data);
  t.after(()=>{source.userData.kawaiiAnimation.dispose();target.userData.kawaiiAnimation.dispose();});
  function direction(root,a,b){
    return root.getObjectByName(b).getWorldPosition(new THREE.Vector3())
      .sub(root.getObjectByName(a).getWorldPosition(new THREE.Vector3())).normalize();
  }
  let maxError=0;
  for(const time of [.125,.45,.8]){
    for(const av of [source,target]){
      const api=av.userData.kawaiiAnimation;
      api.idleAction.setEffectiveWeight(0);api.runAction.setEffectiveWeight(0);
      api.walkAction.setEffectiveWeight(1).setEffectiveTimeScale(1);api.mixer.setTime(time);av.updateMatrixWorld(true);
    }
    for(const side of ['Left','Right'])for(const [a,b] of [['UpLeg','Leg'],['Leg','Foot'],['Arm','ForeArm'],['ForeArm','Hand']]){
      const error=direction(source,side+a,side+b).angleTo(direction(target,side+a,side+b));
      maxError=Math.max(maxError,error);
      assert.ok(error<.01,`${side}${a} direction error ${error} radians`);
    }
  }
  t.diagnostic(`max sampled captured limb direction error ${maxError*180/Math.PI} degrees`);
});
test('male run arms oppose at leg swing extrema and relaxed fingers persist in every state',async t=>{
  const buffer=fs.readFileSync(new URL('../figures/male165-shared-v2.glb',import.meta.url));
  const av=await avatar(()=>{},buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
  const a=av.userData.kawaiiAnimation;t.after(()=>a.dispose());
  const p=name=>av.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  const values=[];
  for(const phase of [.25,.75]){
    a.reset();for(let i=0;i<90;i++)a.update(1/60,6.16,true,{running:true});
    a.runAction.time=phase*.64-1/120*a.runAction.getEffectiveTimeScale();
    a.update(1/120,6.16,true,{running:true});av.updateMatrixWorld(true);
    const z=side=>p(side+'ForeArm').sub(p(side+'Arm')).normalize().z;
    values.push([z('Left'),z('Right')]);
    assert.ok(z('Left')*z('Right')<-.10,'upper arms must point in opposite sagittal directions');
    for(const side of ['Left','Right']){
      const upper=p(side+'ForeArm').sub(p(side+'Arm')).normalize();
      const lower=p(side+'Hand').sub(p(side+'ForeArm')).normalize();
      const leg=p(side+'Leg').sub(p(side+'UpLeg')).normalize();
      assert.ok(upper.z*leg.z<-.08,'arm must oppose its same-side thigh');
      const flex=upper.angleTo(lower)*180/Math.PI;
      assert.ok(flex>60&&flex<120,`elbow flex ${flex} degrees`);
    }
  }
  assert.ok(Math.abs(values[0][0]-values[1][0])>1,'left arm needs visible phase excursion');
  assert.ok(Math.abs(values[0][1]-values[1][1])>1,'right arm needs visible phase excursion');
  for(const state of ['idle','walk','run','jump']){
    a.reset();
    for(const track of a.idleAction.getClip().tracks){
      if(/Hand.*\.quaternion$/.test(track.name))av.getObjectByName(track.name.split('.')[0]).quaternion.fromArray(track.createInterpolant().evaluate(0));
    }
    av.updateMatrixWorld(true);
    const wrist=p('LeftHand'),baseline=p('LeftHandMiddle4').distanceTo(wrist);
    for(let i=0;i<60;i++)a.update(1/60,state==='run'?6.16:state==='walk'?a.nominalSpeed:0,state!=='jump',{running:state==='run',verticalSpeed:2});
    const hand=av.getObjectByName('LeftHandMiddle2');
    assert.ok(a.relaxedHandJoints>=24,'both hands require rig-derived relaxed finger joints');
    assert.ok(Number.isFinite(hand.quaternion.w));
    const ratio=p('LeftHandMiddle4').distanceTo(p('LeftHand'))/baseline;
    assert.ok(ratio<.98,`relaxed ${state} finger reach ratio=${ratio}`);
  }
});

test('authored run total chest-relative shoulder extension stays within35 degrees',async t=>{
  const buffer=fs.readFileSync(new URL('../figures/male165-shared-v2.glb',import.meta.url));
  const av=await avatar(()=>{},buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
  const a=av.userData.kawaiiAnimation;t.after(()=>a.dispose());
  const p=name=>av.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  a.idleAction.setEffectiveWeight(0);a.walkAction.setEffectiveWeight(0);a.runAction.setEffectiveWeight(1).setEffectiveTimeScale(1);
  const maximum={Left:-Infinity,Right:-Infinity};
  for(let i=0;i<=120;i++){
    a.mixer.setTime(i/120*.64);av.updateMatrixWorld(true);
    const y=p('Neck').sub(p('Spine')).normalize();
    const x=p('LeftShoulder').sub(p('RightShoulder')).normalize();
    const z=new THREE.Vector3().crossVectors(x,y).normalize();
    for(const side of ['Left','Right']){
      const d=p(side+'ForeArm').sub(p(side+'Arm')).normalize();
      const angle=Math.atan2(-d.dot(z),-d.dot(y))*180/Math.PI;
      maximum[side]=Math.max(maximum[side],angle);
      assert.ok(angle<=35.05,`${side} total extension=${angle}, phase=${i/120}`);
    }
  }
  for(const side of ['Left','Right'])assert.ok(maximum[side]>30,`${side} backswing must remain visible`);
  t.diagnostic(JSON.stringify({maxChestExtension:maximum}));
});

test('stopping preserves its planted foot instead of dragging it into idle',async t=>{
  const buffer=fs.readFileSync(new URL('../figures/male165-shared-v2.glb',import.meta.url));
  const maleData=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
  for(const kind of ['source','male']){
  const av=await avatar(()=>{},kind==='male'?maleData:undefined),a=av.userData.kawaiiAnimation;t.after(()=>a.dispose());
  for(const phase of [.02,.08,.12,.34,.40,.44]){
  a.reset();
  for(let i=0;i<90;i++)a.update(1/60,6.16,true,{running:true});
  a.runAction.time=phase;
  a.update(1/120,6.16,true,{running:true});
  const feet=['LeftFoot','RightFoot'].map(n=>av.getObjectByName(n));
  feet.sort((a,b)=>soleY(av,a)-soleY(av,b));
  const foot=feet[0],start=foot.getWorldPosition(new THREE.Vector3());
  assert.equal(foot.name,phase<.32?'LeftFoot':'RightFoot','the intended stance foot must be the grounded sole');
  let drift=0,stepLift=0;
  for(let i=0;i<45;i++){
    a.update(1/60,0,true);
    if(i<6)drift=Math.max(drift,foot.getWorldPosition(new THREE.Vector3()).distanceTo(start));
    if(i>=9&&i<=19)stepLift=Math.max(stepLift,soleY(av,foot));
  }
  t.diagnostic(`${kind} stop phase=${phase}s foot=${foot.name} initial drift=${drift}m stepLift=${stepLift}m`);
  assert.ok(drift<.025,`phase=${phase}: planted foot drift during stop: ${drift}m`);
  assert.ok(stepLift>.025,'recovery foot must lift instead of skating into idle');
  assert.ok(Math.abs(soleY(av,foot))<.015,'recovery step must finish on the floor');
  assert.equal(a.state,'idle');
  a.reset();const q=foot.quaternion.clone();a.update(1/60,0,true);
  assert.ok(foot.quaternion.angleTo(q)<.01,'reset must clear the stop anchor');
  }
  }
});
test('embedded run must have calibrated speed metadata',async()=>{
  await assert.rejects(()=>avatar(g=>{
    const clip=g.animations.find(c=>c.name==='Walk_CMU_07_01').clone();
    clip.name='Run_Locomotion';g.animations.push(clip);
  }),/run speed metadata/);
});
test('authored run stance cancels world travel without visible ankle skating',async t=>{
  const av=await avatar(),a=av.userData.kawaiiAnimation;t.after(()=>a.dispose());
  a.idleAction.setEffectiveWeight(0);a.walkAction.setEffectiveWeight(0);
  a.runAction.setEffectiveWeight(1).setEffectiveTimeScale(1);
  const dt=.64*.22/40,rate=6.16/a.nominalRunSpeed;
  for(const [side,phase] of [['Left',0],['Right',.5]]){
    let last=null;const residual=[];
    for(let i=0;i<=40;i++){
      a.mixer.setTime(phase*.64+i*dt);av.updateMatrixWorld(true);
      const p=av.getObjectByName(side+'Foot').getWorldPosition(new THREE.Vector3());
      if(last)residual.push(Math.abs(6.16+(p.z-last.z)/dt*rate));
      last=p;
    }
    const mean=residual.reduce((a,b)=>a+b,0)/residual.length;
    assert.ok(mean<.035,`${side} mean stance residual ${mean} m/s`);
    assert.ok(Math.max(...residual)<.10,`${side} peak stance residual ${Math.max(...residual)} m/s`);
  }
});
