import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const ctx={THREE,window:{},_addonLoader:async()=>GLTFLoader,
  _b64ToArrayBuffer:s=>Uint8Array.from(Buffer.from(s,'base64')).buffer};
vm.createContext(ctx);
for(const file of ['src/assets/kawaii_walk_glb_b64.html','src/assets/male165_glb_b64.html','src/js/214_kawaii_walk_avatar.js']){
  vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
}
const root=await ctx._buildKawaiiWalkAvatar(1.65,{loadIKSolver:async()=>null});
const a=root.userData.kawaiiAnimation;
const position=name=>root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const direction=(from,to)=>position(to).sub(position(from)).normalize().toArray().map(x=>+x.toFixed(3));
for(const phase of [0,.25,.5,.75]){
  a.idleAction.setEffectiveWeight(0);a.walkAction.setEffectiveWeight(0);a.runAction.setEffectiveWeight(1).setEffectiveTimeScale(1);
  a.mixer.setTime(phase*.64);root.updateMatrixWorld(true);
  console.log(JSON.stringify({phase,leftUpper:direction('LeftArm','LeftForeArm'),rightUpper:direction('RightArm','RightForeArm'),leftLower:direction('LeftForeArm','LeftHand'),rightLower:direction('RightForeArm','RightHand')}));
}
a.reset();
root.traverse(b=>{if(b.isBone&&/LeftHand/.test(b.name))console.log(b.name,b.children.filter(c=>c.isBone).map(c=>({name:c.name,direction:direction(b.name,c.name)})));});
a.dispose();
