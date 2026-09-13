import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {CCDIKSolver} from './avatar-assets/node_modules/three/examples/jsm/animation/CCDIKSolver.js';
const root=new URL('..',import.meta.url);
const ctx={THREE,window:{},_addonLoader:async()=>GLTFLoader,
  _b64ToArrayBuffer:s=>Uint8Array.from(Buffer.from(s,'base64')).buffer};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('src/assets/kawaii_walk_glb_b64.html',root),'utf8').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
const male=process.argv.includes('--male');
if(male)vm.runInContext(fs.readFileSync(new URL('src/assets/male165_glb_b64.html',root),'utf8').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
vm.runInContext(fs.readFileSync(new URL('src/js/214_kawaii_walk_avatar.js',root),'utf8'),ctx);
const av=await ctx._buildKawaiiWalkAvatar(1.65,{loadIKSolver:async()=>CCDIKSolver}),a=av.userData.kawaiiAnimation;
const samples=[],p=new THREE.Vector3();
const out=process.env.AVATAR_VERIFY_DIR||'F:/Codex/locahun-walk/verification/animation-2026-09-11/'+(male?'male-final':'contact-r2');
function exportPose(name){
  if(!process.argv.includes('--export'))return;
  fs.mkdirSync(out,{recursive:true});
  const lines=[];let base=1;
  av.updateMatrixWorld(true);
  av.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const position=mesh.geometry.attributes.position;
    lines.push('o '+mesh.name.replace(/\s/g,'_'));
    for(let i=0;i<position.count;i++){
      mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
      lines.push(`v ${p.x} ${p.y} ${p.z}`);
    }
    const index=mesh.geometry.index,count=index?index.count:position.count;
    for(let i=0;i<count;i+=3)lines.push('f '+[0,1,2].map(j=>base+(index?index.getX(i+j):i+j)).join(' '));
    base+=position.count;
  });
  fs.writeFileSync(out+'/'+name+'.obj',lines.join('\n'));
}
a.idleAction.setEffectiveWeight(0);a.walkAction.setEffectiveWeight(0);
a.runAction.setEffectiveWeight(1).setEffectiveTimeScale(1);
for(let i=0;i<=48;i++){
  a.mixer.setTime(i/48*.64);av.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(av,true);
  av.getObjectByName('LeftFoot').getWorldPosition(p);
  samples.push({phase:i/48,floor:box.min.y,height:box.max.y,left:p.toArray()});
}
const contact=samples.filter(p=>p.phase<=.22);
const stanceSpeed=(contact[0].left[2]-contact.at(-1).left[2])/((contact.at(-1).phase-contact[0].phase)*.64);
const rate=6.16/a.nominalRunSpeed;
const residuals=contact.slice(1).map((s,i)=>Math.abs(6.16+(s.left[2]-contact[i].left[2])/(.64*(s.phase-contact[i].phase))*rate));
const report={source:a.source,walkSpeed:a.nominalSpeed,oldRunSpeed:a.nominalSpeed*1.85,nominalRunSpeed:a.nominalRunSpeed,
  stepsPerMinuteAt616:6.16/a.nominalRunSpeed/.64*120,stanceSpeed,
  stanceAnkleResidualMean:residuals.reduce((a,b)=>a+b,0)/residuals.length,
  stanceAnkleResidualMax:Math.max(...residuals),
  floorMin:Math.min(...samples.map(s=>s.floor)),floorMax:Math.max(...samples.map(s=>s.floor)),samples};
console.log(JSON.stringify({...report,samples:process.argv.includes('--samples')?samples:undefined},null,2));
// Metrics above isolate the baked contact curve. Evidence must include the
// runtime additive poses as well, particularly the relaxed finger pose.
for(const i of [0,12,24,36]){
  a.reset();for(let frame=0;frame<90;frame++)a.update(1/60,6.16,true,{running:true});
  const dt=1/120;
  a.runAction.time=i/48*.64-dt*a.runAction.getEffectiveTimeScale();
  a.update(dt,6.16,true,{running:true});exportPose('run-'+i);
}
a.reset();
for(let i=0;i<16;i++)a.update(1/60,0,false,{verticalSpeed:5-i*.16});
exportPose('jump');
for(let i=0;i<16;i++)a.update(1/60,0,false,{verticalSpeed:-3});
for(let i=0;i<6;i++)a.update(1/60,0,true);
exportPose('landing');
a.reset();
for(let i=0;i<90;i++)a.update(1/60,6.16,true,{running:true});
a.runAction.time=.08;a.update(1/120,6.16,true,{running:true});
for(let i=1;i<=30;i++){
  a.update(1/60,0,true);
  if([1,6,12,18,24,30].includes(i))exportPose('stop-'+i);
}
if(process.argv.includes('--export'))fs.writeFileSync(out+'/cadence.json',JSON.stringify(report,null,2));
a.dispose();
