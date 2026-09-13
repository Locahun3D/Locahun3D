// Offline candidate only: never replaces a published avatar or embedded payload.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {GLTFExporter} from './avatar-assets/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
globalThis.FileReader=class{
 readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:'+blob.type+';base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}
};
const root=new URL('../',import.meta.url),out=new URL('docs/figure-locomotion-review/',root);
fs.mkdirSync(out,{recursive:true});
async function load(path){const bytes=fs.readFileSync(new URL(path,root));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const source=await load('figures/viewer-male165-simple-v3-d687080d.glb');
const menuFragment=fs.readFileSync(new URL('src/assets/mixamo_glb_b64.html',root),'utf8');
const menuMatch=menuFragment.match(/^\s*<script>\s*window\.MIXAMO_GLB_B64="([A-Za-z0-9+/=]+)";?\s*<\/script>\s*$/);
assert(menuMatch,'Expected the exact existing menu figure payload');
const menuBytes=Buffer.from(menuMatch[1],'base64');
const target=await new GLTFLoader().parseAsync(menuBytes.buffer.slice(menuBytes.byteOffset,menuBytes.byteOffset+menuBytes.byteLength),'');
target.scene.traverse(node=>{node.name=node.name.replace(/^mixamorig:?/,'');});
target.scene.updateMatrixWorld(true);
const bounds=new THREE.Box3().setFromObject(target.scene,true),height=bounds.max.y-bounds.min.y;
assert(Number.isFinite(height)&&height>0);
target.scene.scale.multiplyScalar(1.65/height);
target.scene.position.y-=bounds.min.y*1.65/height;
target.scene.name='B1_Rig';target.scene.updateMatrixWorld(true);
const context=vm.createContext({THREE});
vm.runInContext(fs.readFileSync(new URL('src/js/214_kawaii_walk_avatar.js',root),'utf8'),context);
const transferred=context._retargetKawaiiLocomotion(source.scene,target.scene,source.animations,{alignHands:true});
let maxAngularError=0,maxPositionError=0,retainedDenseTracks=0;
for(const clip of transferred.clips){
 clip.tracks=clip.tracks.map(track=>{
  const interpolant=track.createInterpolant(),frames=Math.ceil(clip.duration*60),times=[],values=[];
  for(let i=0;i<=frames;i++){const t=i/frames*clip.duration;times.push(t);values.push(...interpolant.evaluate(t));}
  const compact=new track.constructor(track.name,times,values),compare=compact.createInterpolant();
  let angularError=0,positionError=0;
  for(let i=0;i<track.times.length;i++){
   const a=interpolant.evaluate(track.times[i]),b=compare.evaluate(track.times[i]);
   if(track.ValueTypeName==='quaternion'){
    const qa=new THREE.Quaternion().fromArray(a).normalize(),qb=new THREE.Quaternion().fromArray(b).normalize();
    angularError=Math.max(angularError,qa.angleTo(qb)*180/Math.PI);
   }else positionError=Math.max(positionError,new THREE.Vector3().fromArray(a).distanceTo(new THREE.Vector3().fromArray(b)));
  }
  if(angularError>.05||positionError>.0005){retainedDenseTracks++;return track.optimize();}
  maxAngularError=Math.max(maxAngularError,angularError);maxPositionError=Math.max(maxPositionError,positionError);
  return compact.optimize();
 });
}
assert(maxAngularError<1,'60Hz compression changes joint angles excessively');
assert(maxPositionError<.001,'60Hz compression changes root motion excessively');
const sourceMixer=new THREE.AnimationMixer(source.scene),targetMixer=new THREE.AnimationMixer(target.scene);
let maxHandDirectionError=0;
for(let c=0;c<source.animations.length;c++){
 sourceMixer.clipAction(source.animations[c]).setLoop(THREE.LoopOnce,1).play();
 targetMixer.clipAction(transferred.clips[c]).setLoop(THREE.LoopOnce,1).play();
 for(let frame=0;frame<20;frame++){
  const time=source.animations[c].duration*frame/20;sourceMixer.setTime(time);targetMixer.setTime(time);
  source.scene.updateMatrixWorld(true);target.scene.updateMatrixWorld(true);
  for(const side of ['Left','Right']){
   const direction=scene=>scene.getObjectByName(side+'HandMiddle1').getWorldPosition(new THREE.Vector3())
     .sub(scene.getObjectByName(side+'Hand').getWorldPosition(new THREE.Vector3())).normalize();
   maxHandDirectionError=Math.max(maxHandDirectionError,direction(source.scene).angleTo(direction(target.scene))*180/Math.PI);
  }
 }
 sourceMixer.stopAllAction();targetMixer.stopAllAction();
}
// World-space evaluation includes interpolation through the entire parent chain.
assert(maxHandDirectionError<1,'Retarget must preserve palm direction within one degree: '+maxHandDirectionError);
sourceMixer.uncacheRoot(source.scene);targetMixer.uncacheRoot(target.scene);target.scene.updateMatrixWorld(true);
const metadata=source.scene.getObjectByName('B1_Rig').userData;
target.scene.userData={...metadata,asset_id:'figure-menu-locomotion-candidate',stature_m:1.65,
 geometry_source:'src/assets/mixamo_glb_b64.html',geometry_source_license:'pending-source-audit',
 nominal_walk_speed_mps:metadata.nominal_walk_speed_mps*transferred.legScale,
 nominal_run_speed_mps:metadata.nominal_run_speed_mps*transferred.legScale};
let triangles=0;
target.scene.traverse(mesh=>{
 if(!mesh.isMesh)return;
 mesh.material=new THREE.MeshStandardMaterial({color:0xdcd8d2,roughness:.85,metalness:0});
 triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
});
const bytes=await new GLTFExporter().parseAsync(target.scene,{binary:true,animations:transferred.clips});
fs.writeFileSync(new URL('figure165-candidate.glb',out),Buffer.from(bytes));
const report={candidateOnly:true,sourceGeometry:'src/assets/mixamo_glb_b64.html',triangles,bytes:bytes.byteLength,maxAngularError,maxPositionError,retainedDenseTracks,maxHandDirectionError,
 height:new THREE.Box3().setFromObject(target.scene,true).getSize(new THREE.Vector3()).y,
 legScale:transferred.legScale,clips:transferred.clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length}))};
assert(Math.abs(report.height-1.65)<.0001);
fs.writeFileSync(new URL('build.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
