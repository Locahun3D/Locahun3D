import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const read=n=>fs.readFileSync(new URL('../src/js/'+n,import.meta.url),'utf8');
async function fixture(t,boxes=[{center:[0,-.1,5],half:[5,.1,15]}],feet={x:0,y:.02,z:0}){
 const av=new THREE.Group();av.position.copy(feet);
 const c={THREE,console,Float32Array,Uint32Array,performance,keys:{},joyDX:0,joyDY:0,yaw:0,camPos:new THREE.Vector3(),
  _readGamepadInput:()=>null,_walkSourceSignature:()=> 'same',_walkNeedsRegion:()=>false,_walkRequestKey:()=>'',_walkGenerateCollision(){},_walkStatus(){},_walkAutoTick(){},_avatarWalkExit(){throw Error('exit');},_avatarUpdateAnimation(){},_walkCameraCollision(){},_avatarWalkCameraVisibility(){},markDirty(){}};
 vm.createContext(c);vm.runInContext(read('215_walk_collision.js'),c);
 const core=await c.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>core.dispose());core.rebuild({boxes});core.setCharacter(feet,1.65,.22);
 vm.runInContext('globalThis.walkMode = '+read('211_fly_camera_google_earth_scheme.js').split('const walkMode = ')[1].split('const _wmRay')[0],c);
 Object.assign(c.walkMode,{active:true,avatar:av,speed:1.5600961856355386,runMul:1.85});c.walkSetup={core,settings:{signature:'same',spawn:{y:feet.y}},checkedAt:0};
 const bridge=read('217_walk_collision_bridge.js');vm.runInContext(bridge.slice(bridge.indexOf('function _walkCollisionAdvance('),bridge.indexOf('let cameraCollisionEnabled=')),c);vm.runInContext(read('219_collision_walk_update.js'),c);
 return {c,core,av,step(dt){c._updateCollisionAvatarWalk(dt);return {y:av.position.y,speed:c.walkMode.actualSpeed,command:c.walkMode.moveZ,grounded:!c.walkMode.airborne};}};
}
test('actual input deceleration on a flat box does not lose a substep to ground snapping',
 {todo:'Known original-A/core baseline: floor-only slide can discard pending horizontal travel; separate from landing and native animation adoption.'},async t=>{
 const f=await fixture(t);f.step(1/60);const rows=[];
 for(const [seconds,keys] of [[.5,{}],[.8,{KeyW:true}],[.8,{KeyW:true,ShiftLeft:true}],[.1,{KeyW:true,ShiftLeft:true,Space:true}],[.9,{KeyW:true,ShiftLeft:true}],[.2,{KeyW:true,ShiftLeft:true}],[1,{}]]){f.c.keys=keys;for(let i=0;i<Math.round(seconds*60);i++)rows.push(f.step(1/60));}
 const stop=rows.slice(-60).filter(r=>r.command>.5);
 assert(Math.max(...stop.map(r=>r.command-r.speed))<.02,'flat ground loses horizontal movement '+JSON.stringify(stop.reduce((a,b)=>b.command-b.speed>a.command-a.speed?b:a)));
 assert(rows.at(-1).speed<.035);
});
test('landing is not reported while the capsule is still above the floor skin',async t=>{
 for(const fps of [30,60]){
  const f=await fixture(t);for(let i=0;i<15;i++)f.step(1/fps);f.c.keys={KeyW:true,ShiftLeft:true,Space:true};let airborne=false,land;
  for(let i=0;i<fps*2;i++){const row=f.step(1/fps);f.c.keys.Space=false;if(!row.grounded)airborne=true;else if(airborne){land=row;break;}}
  assert(land);assert(land.y<.013,'predicted near-ground contact accepted early: '+land.y);
 }
});
test('30Hz flat run does not turn a small controller floor nudge into airborne/landing',async t=>{
 const f=await fixture(t);f.step(1/60);
 for(const [seconds,keys]of [[.5,{}],[.8,{KeyW:true}],[.8,{KeyW:true,ShiftLeft:true}]]){
  f.c.keys=keys;for(let i=0;i<Math.round(seconds*30);i++){
   const row=f.step(1/30);assert(row.grounded,'flat run became airborne at rootY '+row.y);
  }
 }
});
test('descending steps remain supported but a cliff is not snapped down',async t=>{
 const boxes=[{center:[0,-.1,3],half:[3,.1,5]}];for(let i=0;i<5;i++)boxes.push({center:[0,(5-i)*.09,(i+.5)*.45],half:[1,(5-i)*.09,.225]});
 const f=await fixture(t,boxes,{x:0,y:.91,z:.2});let y=.91;
 for(let i=0;i<180;i++){const r=f.core.move({x:0,y:-.001,z:.018});if(r.feet.z<2.1){assert(r.grounded,'lost stair support '+JSON.stringify(r));assert(r.feet.y<=y+.005,'descending stairs moved upward');}y=r.feet.y;}
 const cliff=await fixture(t,[{center:[0,-.1,0],half:[2,.1,.5]}],{x:0,y:.01,z:.2});let fell=false;
 for(let i=0;i<70;i++){const r=cliff.core.move({x:0,y:-.01,z:.02});if(r.feet.z>1){assert(!r.grounded,'cliff reported grounded');fell=true;}}
 assert(fell);
});
