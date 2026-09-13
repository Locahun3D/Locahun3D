import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';

const read = name => fs.readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
function pad() {
  return { connected: true, axes: [0,0,0,0], buttons: Array.from({length:11}, () => ({value:0,pressed:false})) };
}
function setup(pads = []) {
  const c = { THREE, Event, console, window: {addEventListener(){},dispatchEvent(){}},
    navigator:{getGamepads:()=>pads}, keys:{}, joyDX:0, joyDY:0, camPos:new THREE.Vector3(),
    yaw:0,pitch:0,_yawTarget:0,_pitchTarget:0,camAnim:{playing:false},walkSetup:{epoch:0,core:{}},
    document:{body:{classList:{remove(){}}},getElementById:()=>null},
    markDirty(){},showUndoToast(){},T:x=>x,_refreshResetBtnLabel(){},_avatarResetBones(){},
    camSpeed:1,camera:new THREE.PerspectiveCamera(),_fwdVec:new THREE.Vector3(),
    _fwdHoriz:new THREE.Vector3(),_rgtVec:new THREE.Vector3(),touchUpHeld:false,touchDnHeld:false,
    layers:[],bumpSplatActive(){} };
  vm.createContext(c);
  vm.runInContext(read('210_fly_camera_ue5_viewport_style.js') + '\n' +
    read('211_fly_camera_google_earth_scheme.js') + '\n' +
    read('213_fly_camera_avatar_ground.js') + '\n' + read('219_collision_walk_update.js'),c);
  c.mode = vm.runInContext('walkMode',c);
  return c;
}
function unchanged(c) {
  assert.deepEqual(c.camPos.toArray(),[0,0,0]);
  assert.equal(c._yawTarget,0);assert.equal(c._pitchTarget,0);
}
test('actual gamepad reader: held A fires once, release/repress and disconnect recover',()=>{
  const p=pad(),c=setup([p]);p.buttons[0].pressed=true;
  const edges=Array.from({length:120},()=>!!c._readGamepadInput()?.aJustPressed);
  assert.equal(edges.filter(Boolean).length,1);
  assert.equal(c._readGamepadInput()?.aHeld,true);
  p.buttons[0].pressed=false;assert.equal(c._readGamepadInput(),null);
  p.buttons[0].pressed=true;assert.equal(c._readGamepadInput()?.aJustPressed,true);
  p.connected=false;assert.equal(c._readGamepadInput(),null);
  p.connected=true;assert.equal(c._readGamepadInput()?.aJustPressed,true);
});
test('actual 219 receives only one jump request throughout stationary A hold',()=>{
  const p=pad(),c=setup([p]);p.buttons[0].pressed=true;
  c.mode.active=true;c.mode.avatar=new THREE.Group();
  let jumps=0;
  c._walkCollisionAdvance=(av,dt,x,z,jump)=>{if(jump)jumps++;return false;};
  c._avatarUpdateAnimation=()=>{};c._walkCameraCollision=()=>{};
  for(let i=0;i<180;i++)c._updateCollisionAvatarWalk(1/60);
  assert.equal(jumps,1);
});
test('multiple connected pads retain independent held button histories',()=>{
  const a=pad(),b=pad(),c=setup([a,b]);b.buttons[0].pressed=true;
  assert.equal(Array.from({length:20},()=>!!c._readGamepadInput()?.aJustPressed).filter(Boolean).length,1);
  a.axes[0]=.5;
  for(let i=0;i<10;i++)c._readGamepadInput();
  a.axes[0]=0;
  assert.equal(c._readGamepadInput()?.aJustPressed,false);
});
// Include every key the real free-camera implementation reads, including modifiers.
const cameraKeys=[...new Set([...read('211_fly_camera_google_earth_scheme.js').matchAll(/keys\.([A-Za-z0-9]+)/g)].map(m=>m[1]))];
for(const key of [...cameraKeys,'Space'])test(`exit suppresses held ${key} until release`,()=>{
  const c=setup();c.keys[key]=true;c._avatarWalkExit();
  for(let i=0;i<3;i++){c.updateFlyCamera(1/60);unchanged(c);assert.equal(c.mode.awaitInputRelease,true);}
  c.keys[key]=false;c.updateFlyCamera(1/60);assert.equal(c.mode.awaitInputRelease,false);
  if(['ArrowUp','KeyE','PageUp'].includes(key)){
    c.keys[key]=true;c.updateFlyCamera(1/60);assert.ok(c.camPos.length()>0,'fresh input resumes camera');
  }
});
for(const input of ['touchUpHeld','touchDnHeld','joyDX','joyDY'])test(`exit suppresses ${input}`,()=>{
  const c=setup();c._avatarWalkExit();c[input]=input.startsWith('joy')?.005:true;
  c.updateFlyCamera(1/60);unchanged(c);assert.equal(c.mode.awaitInputRelease,true);
  c[input]=0;c.updateFlyCamera(1/60);assert.equal(c.mode.awaitInputRelease,false);
});
for(const input of ['lx','ly','rx','ry','lt','rt','sprint','aHeld'])test(`exit suppresses gamepad ${input}`,()=>{
  const p=pad(),c=setup([p]);
  const axis=['lx','ly','rx','ry'].indexOf(input);
  if(axis>=0)p.axes[axis]=.5;
  else if(input==='lt'||input==='rt')p.buttons[input==='lt'?6:7].value=.5;
  else p.buttons[input==='sprint'?10:0].pressed=true;
  c._avatarWalkExit();
  for(let i=0;i<3;i++){c.updateFlyCamera(1/60);unchanged(c);assert.equal(c.mode.awaitInputRelease,true);}
  p.axes.fill(0);p.buttons.forEach(b=>{b.value=0;b.pressed=false;});
  c.updateFlyCamera(1/60);assert.equal(c.mode.awaitInputRelease,false);
});
