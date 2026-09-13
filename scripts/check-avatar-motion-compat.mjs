import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {CCDIKSolver} from './avatar-assets/node_modules/three/examples/jsm/animation/CCDIKSolver.js';

const option=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
const asset=option('asset'),sha=option('sha'),out=option('out');
if(!asset||!sha||!out)throw new Error('Require --asset=PRIVATE.glb --sha=EXPECTED_SHA256 --out=PRIVATE_REPORT.json');
const bytes=fs.readFileSync(asset),actualHash=createHash('sha256').update(bytes).digest('hex');
assert.equal(actualHash,sha,'asset changed before snapshot');
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
let metadataComparison;
if(option('metadata-base')){
  const baseBytes=fs.readFileSync(option('metadata-base'));
  const baseHash=createHash('sha256').update(baseBytes).digest('hex');
  assert.equal(baseHash,option('base-sha'),'base asset changed');
  const baseJSON=JSON.parse(baseBytes.subarray(20,20+baseBytes.readUInt32LE(12)));
  const withoutTiming=structuredClone(json),node=withoutTiming.nodes.find(n=>n.name==='B1_Rig');
  assert(node.extras?.jump_timing,'metadata-only derivative has no jump_timing');
  assert(!baseJSON.nodes.find(n=>n.name==='B1_Rig').extras?.jump_timing,'base already has timing');
  delete node.extras.jump_timing;assert.deepEqual(withoutTiming,baseJSON,'non-timing JSON changed');
  const nonJSON=b=>{
    const chunks=[];for(let offset=12;offset<b.length;){
      const length=b.readUInt32LE(offset),type=b.readUInt32LE(offset+4);
      if(type!==0x4e4f534a)chunks.push({type,hash:createHash('sha256').update(b.subarray(offset+8,offset+8+length)).digest('hex'),length});
      offset+=8+length;
    }return chunks;
  };
  assert.deepEqual(nonJSON(bytes),nonJSON(baseBytes),'binary chunks changed');
  metadataComparison={baseHash,jsonEqualExceptJumpTiming:true,nonJSONChunks:nonJSON(bytes)};
}
assert(!json.meshes.some(m=>m.primitives.some(p=>p.attributes.JOINTS_1!==undefined||p.attributes.WEIGHTS_1!==undefined)),
  'extra influences are not supported by the current four-weight runtime shader');
let parsed,rest;
class Loader extends GLTFLoader{
  parse(data,path,resolve,reject){super.parse(data,path,g=>{
    parsed=g;g.scene.updateMatrixWorld(true);
    const bones=[],binds=[];
    g.scene.traverse(o=>{if(o.isBone)bones.push({name:o.name,position:o.position.toArray()});
      if(o.isSkinnedMesh)binds.push(...o.skeleton.boneInverses.map(m=>m.toArray()));});
    const bounds=new THREE.Box3().setFromObject(g.scene,true);
    rest={bones,binds,height:bounds.max.y-bounds.min.y,modelScale:g.scene.scale.toArray()};resolve(g);
  },reject);}
}
const ctx={THREE,window:{},_addonLoader:async()=>Loader,
  _b64ToArrayBuffer:s=>Uint8Array.from(Buffer.from(s,'base64')).buffer};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../src/js/214_kawaii_walk_avatar.js',import.meta.url),'utf8'),ctx);
const report={asset,sha256:actualHash,states:[],limitation:'CPU compatibility only. Explicit synthetic grounded/vertical inputs, not a physics simulation, visual review or anatomy/contact acceptance. Top-four influence loss must be reviewed separately against the source master.'};
if(metadataComparison)report.metadataComparison=metadataComparison;
let root;
let ikConstructed=0,ikCalls=0;
class CountingIK extends CCDIKSolver{
  constructor(...args){super(...args);ikConstructed++;}
  updateOne(...args){ikCalls++;return super.updateOne(...args);}
}
try{
  root=await ctx._buildKawaiiWalkAvatar(1.65,{modelData:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),loadIKSolver:async()=>CountingIK});
  const api=root.userData.kawaiiAnimation;
  assert.equal(api.motionMode,'embedded');
  for(const name of ['idle','walk','run','jump','land','stop'])assert.equal(api.actions[name].getClip().name,name[0].toUpperCase()+name.slice(1)+'_Locomotion');
  for(const name of ['Hips','Spine2','Head','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'])assert(root.getObjectByName(name),'missing required bone '+name);
  const expectedBones=Number(option('bones')||65);assert.equal(rest.bones.length,expectedBones);
  const meta=parsed.scene.getObjectByName('B1_Rig').userData;
  assert(Math.abs(api.nominalRunSpeed-meta.nominal_run_speed_mps*1.65/rest.height)<1e-9);
  report.rest={height:rest.height,bones:rest.bones.length};report.metadata=meta;
  report.nominalWalkSpeed=api.nominalSpeed;report.nominalRunSpeed=api.nominalRunSpeed;
  report.targetRunSpeed=6.16;report.targetRunRate=6.16/api.nominalRunSpeed;
  root.position.set(2,0,3);
  const tick=(n,speed,grounded,motion={})=>{for(let i=0;i<n;i++)api.update(1/60,speed,grounded,motion);};
  const record=label=>{
    root.updateMatrixWorld(true);
    const weights=Object.values(api.actions).map(a=>a.getEffectiveWeight());
    assert(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-6);
    root.traverse(o=>{
      if(o.isBone)assert([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite));
      if(o.isSkinnedMesh)for(let i=0;i<o.geometry.attributes.position.count;i+=127){
        const p=o.getVertexPosition(i,new THREE.Vector3());assert(p.toArray().every(Number.isFinite));
      }
    });
    assert.deepEqual(root.position.toArray(),[2,0,3]);
    report.states.push({label,state:api.state,weights,jumpTime:api.actions.jump.time,runRate:api.runAction.getEffectiveTimeScale()});
  };
  record('idle');tick(60,api.nominalSpeed,true);assert.equal(api.state,'walk');record('walk');
  tick(90,6.16,true,{running:true});assert.equal(api.state,'run');record('run');
  tick(1,6.16,false,{verticalSpeed:5});assert.equal(api.state,'takeoff');record('takeoff');
  tick(90,6.16,false,{verticalSpeed:-2});assert.equal(api.state,'airborne');record('held-air');
  tick(1,6.16,true);assert.equal(api.state,'landing');record('land-contact');
  tick(1,6.16,true,{running:true});assert.equal(api.state,'run');record('land-interrupt');
  tick(1,0,true);assert.equal(api.state,'stopping');record('stop');
  tick(1,api.nominalSpeed,true);assert.equal(api.state,'walk');record('stop-interrupt');
  api.reset();record('reset');
  tick(5,api.nominalSpeed,true,{groundAt:()=>({y:.18,normal:{x:0,y:1,z:0}})});record('raised-ground-IK');
  assert.equal(ikConstructed,2);assert(ikCalls>0,'new rig must exercise both-leg IK adapter');
  report.terrainIK={chains:ikConstructed,solverCalls:ikCalls,limitation:'synthetic raised plane exercises solver only, not foot-clearance acceptance'};
  api.reset();
  if(metadataComparison){
    const clip=api.actions.jump.getClip(),flight=10/9.8,expectedRate=clip.duration/flight;
    const apexSeconds=meta.jump_timing.apex_clip_s/expectedRate;
    report.jumpSynchronization={flightSeconds:flight,expectedRate,sourceApexClipSeconds:meta.jump_timing.apex_clip_s,
      expectedApexSeconds:apexSeconds,physicsReferenceApexSeconds:flight/2,
      apexOffsetSeconds:apexSeconds-flight/2,steps:[],
      limitation:'Source apex is fitted pelvis trajectory, not validated physical COM. Synthetic caller duration; no geometry or live visual approval.'};
    for(const fps of [15,30,60]){
      api.reset();const dt=Math.min(1/fps,.05);let elapsed=0,firstClipTime,apexSampleSeconds;
      while(elapsed<flight+.15){
        api.update(dt,0,false,{verticalSpeed:5-9.8*(elapsed+dt),jumpFlightSeconds:flight});elapsed+=dt;
        assert.equal(api.actions.jump.timeScale,expectedRate);
        assert(Math.abs(api.actions.jump.time-Math.min(clip.duration,elapsed*expectedRate))<1e-6);
        if(firstClipTime===undefined){firstClipTime=api.actions.jump.time;assert(Math.abs(firstClipTime-dt*expectedRate)<1e-6);}
        if(apexSampleSeconds===undefined&&api.actions.jump.time>=meta.jump_timing.apex_clip_s)apexSampleSeconds=elapsed;
        assert.deepEqual(root.position.toArray(),[2,0,3]);
      }
      assert(apexSampleSeconds>=apexSeconds-1e-6&&apexSampleSeconds-apexSeconds<=dt+1e-6);
      assert.equal(api.actions.jump.time,clip.duration);
      report.jumpSynchronization.steps.push({fps,inputDt:1/fps,processedDt:dt,rate:api.actions.jump.timeScale,firstClipTime,apexSampleSeconds,endClipTime:api.actions.jump.time});
      api.update(dt,0,true);assert.equal(api.state,'landing');
    }
    api.reset();
  }
  const binds=[];root.traverse(o=>{if(o.isSkinnedMesh)binds.push(...o.skeleton.boneInverses.map(m=>m.toArray()));});
  assert.deepEqual(binds,rest.binds);
  for(const bone of rest.bones)if(bone.name!=='Hips')assert.deepEqual(root.getObjectByName(bone.name).position.toArray(),bone.position);
  report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{root?.userData.kawaiiAnimation?.dispose();}
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
