import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const read = name => fs.readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
function context() {
  const ctx = {THREE, console, Event, performance, keys: {}, joyDX: 0, joyDY: 0,
    yaw: 0, pitch: -.35, _yawTarget: 0, _pitchTarget: -.35,
    camPos: new THREE.Vector3(0, 2.55, -3.2), camAnim: {playing: false}, cam: {active: false}, arMode: {active: false},
    document: {body: {classList: {remove() {}}}, getElementById: () => null},
    dispatchEvent() {}, markDirty() {}, showUndoToast() {}, _refreshResetBtnLabel() {}, T: x => x,
    _readGamepadInput: () => null, _walkCameraCollision() {},
    setCamRotImmediate(y, p) {ctx.yaw = ctx._yawTarget = y; ctx.pitch = ctx._pitchTarget = p;},
    walkMode: {active: true, height: 1.7, runMul: 1.85, speed: 1.2, actualSpeed: 0,
      velocity: new THREE.Vector3(), airborne: false, groundOffset: 0, cameraDist: 3.2, cameraHeight: 2.55,
      avatar: new THREE.Group()},
    walkSetup: {epoch: 1, core: {}},
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const name of ['212_fly_camera_walk_cycle_clip.js', '213_fly_camera_avatar_ground.js', '219_collision_walk_update.js']) vm.runInContext(read(name), ctx);
  return ctx;
}
test('keyboard jump is edge-triggered; motion accelerates and stops without instant speed changes', () => {
  const ctx = context(), jumps = [], speeds = [];
  ctx._walkCollisionAdvance = (av, dt, x, z, jump) => {
    jumps.push(jump); speeds.push(Math.hypot(x, z));
    ctx.walkMode.actualSpeed = Math.hypot(x, z); av.position.x += x * dt; av.position.z += z * dt;
    return ctx.walkMode.actualSpeed > .03;
  };
  ctx.walkMode.avatar.userData.kawaiiAnimation = {update() {}};
  ctx.keys.Space = true; ctx.keys.KeyW = true;
  for (let i = 0; i < 30; i++) ctx._updateCollisionAvatarWalk(1/60);
  assert.equal(jumps.filter(Boolean).length, 1);
  assert.ok(speeds[0] > 0 && speeds[0] < ctx.walkMode.speed);
  assert.ok(Math.abs(speeds.at(-1) - ctx.walkMode.speed) < .01);
  ctx.keys.Space = false; ctx.keys.KeyW = false; ctx._updateCollisionAvatarWalk(1/60);
  assert.ok(speeds.at(-1) > 0 && speeds.at(-1) < ctx.walkMode.speed);
  for (let i = 0; i < 30; i++) ctx._updateCollisionAvatarWalk(1/60);
  assert.equal(speeds.at(-1), 0);
  ctx.keys.Space = true; ctx._updateCollisionAvatarWalk(1/60);
  assert.equal(jumps.filter(Boolean).length, 2);
});
test('normal toggle exit far from entry preserves camera and waits for held key release', () => {
  const ctx = context();
  ctx.walkMode.entryCamera = {position: {x: 0, y: 2, z: 0}, yaw: 0, pitch: 0};
  ctx.camPos.set(120, 18, -240); ctx.setCamRotImmediate(2.3, -.6);
  ctx.keys.KeyW = true; ctx.keys.ShiftLeft = true;
  const before = ctx.camPos.clone();
  ctx.toggleAvatarWalk();
  assert.equal(ctx.walkMode.active, false);
  assert.equal(ctx.walkMode.avatar.visible, false);
  assert.equal(ctx.walkMode.exitTransition, null);
  for (let i = 0; i < 120; i++) {
    assert.equal(ctx._avatarWalkPostExit(1/60), true);
    assert.deepEqual(ctx.camPos, before);
    assert.equal(ctx.yaw, 2.3); assert.equal(ctx.pitch, -.6);
    assert.equal(ctx._yawTarget, 2.3); assert.equal(ctx._pitchTarget, -.6);
  }
  ctx.keys.KeyW = false;
  assert.equal(ctx._avatarWalkPostExit(1/60), true);
  ctx.keys.ShiftLeft = false;
  assert.equal(ctx._avatarWalkPostExit(1/60), false);
  assert.deepEqual(ctx.camPos, before);
});

test('explicit camera restoration settles animation; held input waits for release', () => {
  const ctx = context(); let resets = 0, updates = 0;
  ctx.walkMode.avatar.userData.kawaiiAnimation = {reset() {resets++;}, update() {updates++;}};
  ctx.walkMode.entryCamera = {position: {x: 2, y: 3, z: 4}, yaw: 1, pitch: .1};
  ctx.keys.KeyW = true;
  const before = ctx.camPos.clone();
  ctx._avatarWalkExit({restoreCamera: true});
  assert.equal(ctx.walkMode.active, false); assert.deepEqual(ctx.camPos, before);
  assert.equal(ctx.walkMode.avatar.visible, true);
  assert.equal(ctx._avatarWalkPostExit(1/60), true);
  assert.ok(ctx.camPos.distanceTo(before) > 0);
  for (let i = 0; i < 40; i++) ctx._avatarWalkPostExit(1/60);
  assert.ok(ctx.camPos.distanceTo(new THREE.Vector3(2,3,4)) < 1e-6);
  assert.equal(ctx.yaw, 1); assert.equal(ctx.pitch, .1);
  assert.equal(ctx.walkMode.avatar.visible, false); assert.equal(resets, 1); assert.ok(updates > 0);
  assert.equal(ctx._avatarWalkPostExit(1/60), true);
  ctx.keys.KeyW = false; assert.equal(ctx._avatarWalkPostExit(1/60), false);
});
test('scene replacement or camera playback cancels deferred camera restoration', () => {
  for (const mode of ['import', 'playback']) {
    const ctx = context(); ctx.walkMode.avatar.userData.kawaiiAnimation = {reset() {}, update() {}};
    ctx.walkMode.entryCamera = {position: {x: 20, y: 3, z: 4}, yaw: 1, pitch: .1};
    ctx._avatarWalkExit({restoreCamera: true});
    if (mode === 'import') ctx.walkSetup.epoch++; else ctx.camAnim.playing = true;
    ctx.camPos.set(8,9,10); ctx._avatarWalkPostExit(1/60);
    assert.deepEqual(ctx.camPos.toArray(), [8,9,10]); assert.equal(ctx.walkMode.avatar.visible, false);
  }
});
test('continuous 18cm stairs with 24cm treads climb without permitting a 60cm wall', async t => {
  const ctx = vm.createContext({console, Float32Array, Uint32Array}); vm.runInContext(read('215_walk_collision.js'), ctx);
  const core = await ctx.LocahunWalkCollision.create({rapier: RAPIER}); t.after(() => core.dispose());
  const floor = {center: [2,-.1,0], half: [6,.1,2]};
  const stairs = Array.from({length: 8}, (_, i) => ({center: [1+(i+.5)*.24, (i+1)*.09, 0], half: [.12,(i+1)*.09,1]}));
  function travel(boxes) {
    core.rebuild({boxes}); core.setCharacter({x: 0, y: .02, z: 0}, 1.7, .22);
    let vy = 0, peak = 0, result;
    for (let i = 0; i < 600; i++) {
      vy -= 9.8/90; result = core.move({x: 1.2/90, y: vy/90, z: 0});
      if (result.grounded && vy < 0) vy = 0;
      peak = Math.max(peak, result.feet.y);
    }
    return {peak, result};
  }
  assert.ok(travel([floor, ...stairs]).peak > 1.4);
  assert.ok(travel([floor, {center: [2,.3,0], half: [1,.3,2]}]).result.feet.x < .85);
  assert.ok(travel([floor, {center: [1.04,.14,0], half: [.04,.14,1]}]).peak < .1,
    'a narrow 8cm ledge must not become a valid autostep landing');
});
test('actual B1 has nonfrozen stop and explicitly procedural run/air/landing poses', async t => {
  const ctx = {THREE, window: {}, _addonLoader: async () => GLTFLoader,
    _b64ToArrayBuffer: s => Uint8Array.from(Buffer.from(s, 'base64')).buffer};
  vm.createContext(ctx);
  const html = fs.readFileSync(new URL('../src/assets/kawaii_walk_glb_b64.html', import.meta.url), 'utf8');
  vm.runInContext(html.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, ''), ctx);
  vm.runInContext(read('214_kawaii_walk_avatar.js'), ctx);
  const avatar = await ctx._buildKawaiiWalkAvatar(1.7), api = avatar.userData.kawaiiAnimation;
  t.after(() => api.dispose());
  for (let i = 0; i < 40; i++) api.update(1/60, api.nominalSpeed);
  api.update(1/60, 0);
  assert.ok(api.walkAction.getEffectiveTimeScale() > 0, 'do not freeze a half-stride before blending out');
  for (let i = 0; i < 40; i++) api.update(1/60, 0);
  assert.ok(api.idleAction.getEffectiveWeight() > .99);
  assert.match(api.motionSources.run, /procedural/); assert.match(api.motionSources.jump, /procedural/);
  api.update(.05, api.nominalSpeed * 1.85, true, {running: true});
  assert.equal(api.state, 'run');
  const knee = avatar.getObjectByName('LeftLeg'), idle = knee.quaternion.clone();
  for (let i = 0; i < 8; i++) api.update(1/60, 0, false, {verticalSpeed: 3});
  assert.equal(api.state, 'airborne'); assert.ok(knee.quaternion.angleTo(idle) > .15);
  api.update(1/60, 0, true, {verticalSpeed: 0}); assert.equal(api.state, 'landing');
  api.reset(); const first = knee.quaternion.clone();
  api.update(.05, 0, false, {verticalSpeed: 3}); api.reset();
  assert.ok(knee.quaternion.angleTo(first) < 1e-6, 'procedural offsets must not accumulate');
  const turned = await ctx._buildKawaiiWalkAvatar(1.7), turnedApi = turned.userData.kawaiiAnimation;
  t.after(() => turnedApi.dispose()); turned.rotation.y = Math.PI/2;
  for(let i=0;i<40;i++){
    api.update(1/60,api.nominalSpeed*1.85,true,{running:true});
    turnedApi.update(1/60,turnedApi.nominalSpeed*1.85,true,{running:true});
  }
  assert.ok(avatar.getObjectByName('LeftArm').quaternion.clone().normalize().angleTo(turned.getObjectByName('LeftArm').quaternion.clone().normalize())<1e-6,
    'run pose must be invariant under world heading');
});
