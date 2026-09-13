import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {createElbowMorphDriver} from './elbow-morph-driver.mjs';
function fixture(){
  const root=new THREE.Group();
  for(const name of ['RightArm','RightForeArm','RightHand']){const b=new THREE.Bone();b.name=name;root.add(b);}
  const mesh={morphTargetDictionary:{Elbow_R_45:0,Elbow_R_70:1,Elbow_R_105:2,Smile:3},morphTargetInfluences:[0,0,0,.7]};
  const driver=createElbowMorphDriver(root,{mesh,neutralAngle:15,samples:[45,70,105].map(angle=>({angle,name:'Elbow_R_'+angle}))});
  driver.setEnabled(true);
  function pose(angle){root.getObjectByName('RightForeArm').position.set(0,-1,0);root.getObjectByName('RightHand').position.set(Math.sin(angle*Math.PI/180),-1-Math.cos(angle*Math.PI/180),0);root.updateMatrixWorld(true);return driver.update();}
  return {root,mesh,driver,pose};
}
test('angle driver blends only owned correctives and resets without touching unrelated morphs',()=>{
  const {mesh,driver,pose}=fixture();
  pose(15);assert.deepEqual(mesh.morphTargetInfluences,[0,0,0,.7]);
  pose(45);assert.ok(Math.abs(mesh.morphTargetInfluences[0]-1)<1e-12);
  pose(57.5);assert.ok(Math.abs(mesh.morphTargetInfluences[0]-.5)<1e-12);assert.ok(Math.abs(mesh.morphTargetInfluences[1]-.5)<1e-12);
  pose(105);assert.ok(Math.abs(mesh.morphTargetInfluences[2]-1)<1e-12);
  for(let angle=0;angle<=150;angle++){
    pose(angle);assert.ok(mesh.morphTargetInfluences.slice(0,3).every(x=>x>=0&&x<=1));
    assert.ok(mesh.morphTargetInfluences.slice(0,3).reduce((a,b)=>a+b,0)<=1+1e-12);
  }
  driver.reset();assert.deepEqual(mesh.morphTargetInfluences,[0,0,0,.7]);
  driver.dispose();pose(70);assert.deepEqual(mesh.morphTargetInfluences,[0,0,0,.7]);
});
test('invalid skeleton angle clears owned targets instead of retaining a stale correction',()=>{
  const {root,mesh,pose,driver}=fixture();pose(70);
  root.getObjectByName('RightForeArm').position.set(0,0,0);root.updateMatrixWorld(true);
  assert.equal(driver.update(),null);assert.deepEqual(mesh.morphTargetInfluences,[0,0,0,.7]);
});
test('inactive bind pose cannot activate correction and extrapolation is flagged',()=>{
  const {mesh,driver,pose}=fixture();driver.setEnabled(false);
  pose(46.435);assert.deepEqual(mesh.morphTargetInfluences,[0,0,0,.7]);
  driver.setEnabled(true);pose(110);assert.equal(driver.outsideValidatedRange,true);
  pose(70);assert.equal(driver.outsideValidatedRange,false);
  driver.reset();pose(46.435);assert.deepEqual(mesh.morphTargetInfluences,[0,0,0,.7]);
});
test('private driver CPU timing excludes pose matrix updates and rendering',t=>{
  const {driver,pose}=fixture();pose(70);const times=[];
  for(let i=0;i<2000;i++){const start=performance.now();driver.update();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  t.diagnostic(JSON.stringify({samples:times.length,medianMs:times[1000],p95Ms:times[1900],scope:'driver only; no skin/render cost'}));
});
