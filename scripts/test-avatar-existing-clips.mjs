import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const names=['Idle','Walk','Run','Jump','Land','Stop'];
async function fixture(edit=()=>{},withoutLegacy=false){
  let original,loads=0;
  class Loader extends GLTFLoader{
    parse(data,path,resolve,reject){loads++;super.parse(data,path,g=>{
      if(g.scene.getObjectByName('B1_Rig')?.userData.asset_id){
        const rig=g.scene.getObjectByName('B1_Rig');
        Object.assign(rig.userData,{nominal_walk_speed_mps:1.4,nominal_run_speed_mps:6});
        g.animations=names.map((name,i)=>{
          const tracks=[];
          g.scene.traverse(b=>{if(b.isBone){
            const q=b.quaternion.clone();
            if(b.name==='Spine2')q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),i*.05));
            tracks.push(new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',[0,.5],[...q.toArray(),...q.toArray()]));
          }});
          return new THREE.AnimationClip(name+'_Locomotion',.5,tracks);
        });
        const translations=new Map(),binds=[];
        g.scene.traverse(o=>{if(o.isBone)translations.set(o.name,o.position.toArray());
          if(o.isSkinnedMesh)binds.push(...o.skeleton.boneInverses.map(m=>m.toArray()));});
        original={clips:g.animations.slice(),translations,binds,spine:g.scene.getObjectByName('Spine2').quaternion.clone(),
          hand:g.scene.getObjectByName('RightHandIndex1').quaternion.clone()};
        edit(g);
      }
      resolve(g);
    },reject);}
  }
  const ctx={THREE,window:{},_addonLoader:async()=>Loader,
    _b64ToArrayBuffer:s=>Uint8Array.from(Buffer.from(s,'base64')).buffer};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../src/assets/kawaii_walk_glb_b64.html',import.meta.url),'utf8').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
  if(withoutLegacy)delete ctx.window.KAWAII_WALK_GLB_B64;
  vm.runInContext(fs.readFileSync(new URL('../src/js/214_kawaii_walk_avatar.js',import.meta.url),'utf8'),ctx);
  const bytes=fs.readFileSync(new URL('../figures/male165-shared-v2.glb',import.meta.url));
  const root=await ctx._buildKawaiiWalkAvatar(1.65,{modelData:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),loadIKSolver:async()=>null});
  const api=root.userData.kawaiiAnimation;
  return {root,api,original,loads,tick(n,speed=0,grounded=true,motion={}){for(let i=0;i<n;i++)api.update(1/60,speed,grounded,motion);}};
}

test('complete target clips survive loading without old retarget or procedural posing',async t=>{
  const {root,api,original,tick,loads}=await fixture(()=>{},true);t.after(()=>api.dispose());
  assert.equal(loads,1,'complete target must not parse the old CMU model');
  assert.equal(api.motionMode,'embedded');
  assert.equal(api.source,'embedded-locomotion');
  for(const [i,name] of names.entries())assert.equal(api.actions[name.toLowerCase()].getClip(),original.clips[i]);
  tick(120);
  assert.ok(root.getObjectByName('Spine2').quaternion.angleTo(original.spine)<1e-5);
  assert.ok(root.getObjectByName('RightHandIndex1').quaternion.angleTo(original.hand)<1e-5,'no extra hand curl');
  assert.equal(api.relaxedHandJoints,0);
  const binds=[];
  root.traverse(o=>{if(o.isBone)assert.deepEqual(o.position.toArray(),original.translations.get(o.name));
    if(o.isSkinnedMesh)binds.push(...o.skeleton.boneInverses.map(m=>m.toArray()));});
  assert.deepEqual(binds,original.binds);
});

test('partial, duplicate and uncalibrated clip bundles fail explicitly',async()=>{
  await assert.rejects(()=>fixture(g=>g.animations.pop()),/Incomplete locomotion clips/);
  await assert.rejects(()=>fixture(g=>g.animations.push(g.animations[0].clone())),/Duplicate locomotion clip/);
  await assert.rejects(()=>fixture(g=>delete g.scene.getObjectByName('B1_Rig').userData.nominal_walk_speed_mps),/walk speed metadata/);
  await assert.rejects(()=>fixture(g=>g.scene.getObjectByName('B1_Rig').userData.nominal_run_speed_mps=0),/run speed metadata/);
  await assert.rejects(()=>fixture(g=>g.animations[3].duration=0),/Incomplete locomotion clips/);
});

test('idle crouch does not change rest height scale, floor offset or calibrated speed',async t=>{
  const a=await fixture(),b=await fixture(g=>{
    const hips=g.scene.getObjectByName('Hips'),p=hips.position.clone();p.y-=.2;
    g.animations[0].tracks.push(new THREE.VectorKeyframeTrack('Hips.position',[0,.5],[...p.toArray(),...p.toArray()]));
    for(const side of ['Left','Right']){
      const track=g.animations[0].tracks.find(t=>t.name===side+'UpLeg.quaternion');
      const q=g.scene.getObjectByName(side+'UpLeg').quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.8));
      track.values.set([...q.toArray(),...q.toArray()]);
    }
  });
  t.after(()=>{a.api.dispose();b.api.dispose();});
  assert.deepEqual(b.root.children[0].scale.toArray(),a.root.children[0].scale.toArray());
  assert.deepEqual(b.root.children[0].position.toArray(),a.root.children[0].position.toArray());
  assert.equal(b.api.nominalSpeed,a.api.nominalSpeed);
  assert.equal(b.api.nominalRunSpeed,a.api.nominalRunSpeed);
});

test('existing jump holds in air, physical landing triggers land, stop is interruptible',async t=>{
  const {root,api,tick,original}=await fixture();t.after(()=>api.dispose());
  const modelY=root.children[0].position.y;
  root.position.set(3,4,5);
  tick(60,api.nominalRunSpeed,true,{running:true});
  assert.equal(api.state,'run');
  assert.equal(api.runAction.getEffectiveTimeScale(),1);
  tick(1,3,false,{verticalSpeed:5});assert.equal(api.state,'takeoff');
  tick(90,3,false,{verticalSpeed:-2});assert.equal(api.state,'airborne');
  assert.equal(api.actions.jump.time,.5);assert.ok(api.actions.jump.getEffectiveWeight()>.99);
  const jumpSpine=original.spine.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.15));
  assert.ok(root.getObjectByName('Spine2').quaternion.angleTo(jumpSpine)<1e-5,'air pose is the clip, not an overlay');
  assert.equal(root.children[0].position.y,modelY);
  tick(1,0,true);assert.equal(api.state,'landing');
  tick(60);assert.equal(api.state,'idle');
  tick(45,api.nominalSpeed);assert.equal(api.state,'walk');
  tick(1);assert.equal(api.state,'stopping');
  tick(2,api.nominalSpeed);assert.equal(api.state,'walk');
  tick(1);tick(60);assert.equal(api.state,'idle');
  assert.equal(root.children[0].position.y,modelY,'stop does not add procedural pelvis drop');
  assert.deepEqual(root.position.toArray(),[3,4,5],'clips never move physical root');
  const sum=Object.values(api.actions).reduce((s,a)=>s+a.getEffectiveWeight(),0);
  assert.ok(Math.abs(sum-1)<1e-6);
  api.reset();assert.equal(api.state,'idle');assert.equal(api.idleAction.getEffectiveWeight(),1);
  tick(1,0,false,{verticalSpeed:-1});assert.equal(api.state,'airborne','ledge drop skips takeoff');
  assert.equal(api.actions.jump.time,.5);
});

test('transition weights stay normalized and gait rates track actual speed',async t=>{
  const {api,tick}=await fixture();t.after(()=>api.dispose());
  for(const [speed,grounded,motion] of [[.4,true,{}],[2,true,{}],[6.16,true,{running:true}],[3,false,{verticalSpeed:5}],[3,false,{verticalSpeed:-2}],[0,true,{}],[1,true,{}],[0,true,{}]]){
    for(let i=0;i<20;i++){
      tick(1,speed,grounded,motion);
      const weights=Object.values(api.actions).map(a=>a.getEffectiveWeight());
      assert.ok(weights.every(w=>w>=0&&w<=1));
      assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-6);
      assert.ok(Math.abs(api.walkAction.getEffectiveTimeScale()*api.nominalSpeed-(grounded?speed:0))<1e-6);
      assert.ok(Math.abs(api.runAction.getEffectiveTimeScale()*api.nominalRunSpeed-(grounded?speed:0))<1e-6);
    }
  }
});

test('landing starts on contact but yields to real movement on the following frame',async t=>{
  const {api,tick}=await fixture();t.after(()=>api.dispose());
  tick(1,6,false,{verticalSpeed:5});tick(30,6,false,{verticalSpeed:-2});
  tick(1,6,true,{running:true});assert.equal(api.state,'landing');
  tick(1,6,true,{running:true});assert.equal(api.state,'run');
  tick(1,0,false,{verticalSpeed:-2});tick(1,0,true);assert.equal(api.state,'landing');
  tick(1,api.nominalSpeed,true);assert.equal(api.state,'walk');
});

const timing={duration_s:.5,takeoff_clip_s:0,apex_clip_s:.25,prelanding_clip_s:.5,source_ballistic_removed:true};
const withTiming=g=>{g.scene.getObjectByName('B1_Rig').userData.jump_timing={...timing};};
function physics(root,impulse){
  const bridge=fs.readFileSync(new URL('../src/js/217_walk_collision_bridge.js',import.meta.url),'utf8');
  const code=bridge.slice(bridge.indexOf('function _walkCollisionAdvance('),bridge.indexOf('let cameraCollisionEnabled='));
  const c={THREE,performance,walkSetup:{core:{move(d){const p=root.position.clone().add(new THREE.Vector3(d.x,d.y,d.z));
      const grounded=p.y<0;if(grounded)p.y=0;return {feet:p,grounded};}},settings:{signature:'same',spawn:{y:0}},checkedAt:0},
    walkMode:{active:true,avatar:root,airborne:false,groundOffset:0,velocity:new THREE.Vector3(),jumpVel:impulse},
    _walkSourceSignature:()=> 'same',_walkNeedsRegion:()=>false,_walkRequestKey:()=>'',_walkGenerateCollision(){},_walkAutoTick(){},_walkStatus(){},_avatarWalkExit(){throw new Error('unexpected exit');}};
  vm.createContext(c);vm.runInContext(code,c);
  vm.runInContext(fs.readFileSync(new URL('../src/js/212_fly_camera_walk_cycle_clip.js',import.meta.url),'utf8'),c);
  return {c,step(dt,launch){c._walkCollisionAdvance(root,dt,0,0,launch);const y=root.position.y;
    c._avatarUpdateAnimation(dt,false,1);assert.equal(root.position.y,y,'animation cannot change physics root Y');}};
}

test('explicit launch duration synchronizes first dt and phase at15/30/60fps with variable impulses',async t=>{
  for(const fps of [15,30,60])for(const impulse of [3,5,7]){
    const {root,api}=await fixture(withTiming);t.after(()=>api.dispose());
    const p=physics(root,impulse),dt=Math.min(1/fps,.05),flight=2*impulse/9.8;
    let elapsed=0,first=true,sawApex=false,sawLanding=false;
    while(elapsed<flight+.1){
      p.step(dt,first);first=false;elapsed+=dt;
      if(p.c.walkMode.airborne){
        assert.ok(Math.abs(api.actions.jump.getEffectiveTimeScale()-.5/flight)<1e-9);
        assert.ok(Math.abs(api.actions.jump.time-Math.min(.5,elapsed*.5/flight))<1e-6,`phase at ${fps}fps impulse${impulse}`);
        if(!sawApex&&p.c.walkMode.velocity.y<=0){
          assert.ok(Math.abs(api.actions.jump.time-.25)<=dt*.5/flight+1e-6,'apex within one processed step');sawApex=true;
        }
      }else{assert.equal(api.state,'landing');sawLanding=true;break;}
    }
    assert(sawApex&&sawLanding,'exercise actual bridge apex and landing');
  }
});

test('sync captures launch once, interrupts early landing, holds long fall and resets for a new impulse',async t=>{
  const {api}=await fixture(withTiming);t.after(()=>api.dispose());
  api.update(.05,0,false,{verticalSpeed:4.51,jumpFlightSeconds:1});
  assert.equal(api.actions.jump.time,.025);
  api.update(.05,0,false,{verticalSpeed:4,jumpFlightSeconds:2});
  assert.equal(api.actions.jump.getEffectiveTimeScale(),.5,'midair parameter change must not retime');
  api.update(.05,0,true);assert.equal(api.state,'landing');
  api.update(.05,0,false,{verticalSpeed:6,jumpFlightSeconds:2});
  assert.equal(api.actions.jump.getEffectiveTimeScale(),.25);
  for(let i=0;i<60;i++)api.update(.05,0,false,{verticalSpeed:-5});
  assert.equal(api.state,'airborne');assert.equal(api.actions.jump.time,.5);
  api.reset();assert.equal(api.actions.jump.getEffectiveTimeScale(),1);
  api.update(.05,0,false,{verticalSpeed:-1,jumpFlightSeconds:1});
  assert.equal(api.state,'airborne');assert.equal(api.actions.jump.time,.5,'ledge fall still skips takeoff');
});

test('absent or invalid timing and duration retain original playback',async t=>{
  for(const metadata of [undefined,{...timing,source_ballistic_removed:false},{...timing,apex_clip_s:NaN},{...timing,apex_clip_s:.1},{...timing,prelanding_clip_s:.2}]){
    const {api}=await fixture(g=>{g.scene.getObjectByName('B1_Rig').userData.jump_timing=metadata;});t.after(()=>api.dispose());
    api.update(.05,0,false,{verticalSpeed:5,jumpFlightSeconds:2});assert.equal(api.actions.jump.getEffectiveTimeScale(),1);
  }
  for(const duration of [undefined,0,-1,NaN,Infinity,Number.MIN_VALUE]){
    const {api}=await fixture(withTiming);t.after(()=>api.dispose());
    api.update(.05,0,false,{verticalSpeed:5,jumpFlightSeconds:duration});assert.equal(api.actions.jump.getEffectiveTimeScale(),1);
  }
});

test('physics launch captures duration; landing and walk reset discard stale values before a fall',async t=>{
  const {root,api}=await fixture(withTiming);t.after(()=>api.dispose());
  const p=physics(root,5);p.step(1/60,true);
  assert.equal(p.c.walkMode.jumpFlightSeconds,10/9.8);
  for(let i=0;i<90&&p.c.walkMode.airborne;i++)p.step(1/60,false);
  assert.equal(p.c.walkMode.jumpFlightSeconds,undefined);
  p.step(1/60,true);assert.equal(p.c.walkMode.jumpFlightSeconds,10/9.8);
  p.c._avatarResetBones();assert.equal(p.c.walkMode.jumpFlightSeconds,undefined);
  root.position.y=3;p.c.walkMode.airborne=true;p.c.walkMode.velocity.y=-1;
  p.step(1/60,false);assert.equal(api.state,'airborne');
  assert.equal(api.actions.jump.time,.5);assert.equal(api.actions.jump.timeScale,1);
  assert.equal(api.actions.jump.getEffectiveTimeScale(),0,'ledge end pose is paused');
});
