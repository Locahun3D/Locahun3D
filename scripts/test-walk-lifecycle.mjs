import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = name => readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, {x, y, z}); return this; }
  fromBufferAttribute(p, i) { return this.set(...p.array.slice(i * 3, i * 3 + 3)); }
  applyMatrix4(matrix) { assert.deepEqual(matrix.elements, identity); return this; }
}

function harness(names) {
  const added = [], cores = [];
  const context = vm.createContext({
    console: {error() {}}, setTimeout, clearTimeout, performance, Event,
    THREE: {Vector3}, layers: [], selectedLayerId: 1,
    walkMode: {active: false, avatar: null, height: 1.7, velocity: new Vector3()},
    camAnim: {playing: false}, camPos: new Vector3(10, 4, 20),
    keys: {}, joyDX: 0, joyDY: 0, yaw: 0, pitch: 0, _yawTarget: 0, _pitchTarget: 0,
    document: {getElementById: () => null, body: {classList: {remove() {}}}},
    scene: {add(o) { added.push(o); }, remove() {}},
    markDirty() {}, showUndoToast() {}, _refreshResetBtnLabel() {}, T: key => key,
    _ensureFigureLighting() {},
    _readGamepadInput: () => null,
    _walkCollisionAdvance: () => false, _walkCameraCollision() {},
    LocahunWalkCollision: {
      async create() {
        const core = {disposed: false, builds: [],
          rebuild(data) { this.builds.push(data); },
          dispose() { this.disposed = true; }};
        cores.push(core);
        return core;
      },
    },
  });
  context.window = context;
  context.dispatchEvent = () => {};
  for (const name of names) vm.runInContext(source(name), context, {filename: name});
  return {context, added, cores, run: code => vm.runInContext(code, context)};
}
const lifecycleSources = [
  '212_fly_camera_walk_cycle_clip.js', '213_fly_camera_avatar_ground.js',
  '216_walk_settings.js', '217_walk_collision_bridge.js', '219_collision_walk_update.js',
];

test('scene replacement disposes a pending avatar without adopting builder side effects', {timeout: 3000}, async () => {
  const {context, added, run} = harness(lifecycleSources);
  let release, announce;
  const pending = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { announce = resolve; });
  let disposed = 0, lights = 0;
  const api = {mixer: {}, walkAction: {}, source: 'test-avatar', nominalSpeed: 1,
    dispose() { disposed++; }};
  const avatar = {visible: true, userData: {kawaiiAnimation: api}};
  context._buildKawaiiWalkAvatar = () => { announce(); return pending; };
  context._ensureFigureLighting = () => { lights++; };
  context._walkPrepareCollision = async () => {};
  context._walkSpawnPosition = () => ({x: 0, y: 0, z: 0});
  const before = {...context.walkMode};
  const entering = run('_avatarWalkEnter()');
  const rejected = assert.rejects(entering, /./);
  await started;
  run('_walkRestoreSettings(null)');
  release(avatar);
  await rejected;
  assert.equal(disposed, 1, 'cancelled model must be disposed exactly once');
  assert.deepEqual(added, [], 'cancelled model must never enter the scene');
  assert.deepEqual(context.walkMode, before, 'builder must not overwrite shared animation state');
  assert.equal(lights, 0, 'cancelled build must not install lighting');
});

test('switching an exclusion cube to a collider invalidates its role and rebuilds physics', {timeout: 3000}, async () => {
  const {context, cores, run} = harness(['216_walk_settings.js', '217_walk_collision_bridge.js']);
  const position = {count: 3, array: new Float32Array([0,0,0, 1,0,0, 0,0,1])};
  const child = {isMesh: true, userData: {}, matrixWorld: {elements: identity},
    geometry: {getAttribute: () => position, getIndex: () => null}};
  context.layers.push({id: 1, type: 'cube', name: 'Proxy', visible: true,
    size: {x: 1, y: 1, z: 1}, mesh: {
      matrixWorld: {elements: identity}, updateWorldMatrix() {},
      traverseVisible(fn) { fn(child); },
    }});
  run('walkSetup.settings.meshOnly=true; walkSetup.settings.excludeIds=[1]');
  const exclusionSignature = run('_walkSourceSignature()');
  run('walkSetup.settings.signature=_walkSourceSignature()');
  const oldCore = {disposed: false, dispose() { this.disposed = true; }};
  context.oldCore = oldCore;
  run('walkSetup.core=oldCore; walkUseSelectedMesh()');
  assert.deepEqual(plain(run('walkSetup.settings.meshIds')), [1]);
  assert.deepEqual(plain(run('walkSetup.settings.excludeIds')), []);
  assert.equal(run('walkSetup.settings.signature'), '', 'toggle must explicitly invalidate readiness');
  assert.notEqual(run('_walkSourceSignature()'), exclusionSignature, 'signature must distinguish roles');
  await run('_walkPrepareCollision()');
  assert.equal(oldCore.disposed, true);
  assert.equal(cores.length, 1, 'preparation must replace stale physics');
  assert.equal(run('walkSetup.core'), cores[0]);
  assert.equal(cores[0].builds[0].meshes.length, 1);
  assert.deepEqual(Array.from(cores[0].builds[0].meshes[0].vertices), Array.from(position.array));
  assert.equal(run('walkSetup.settings.signature'), run('_walkSourceSignature()'));
});

test('camera playback rejects walk entry and exits an active walk without overwriting the camera', async () => {
  const {context, run} = harness(lifecycleSources);
  let prepared = 0, built = 0, reset = 0;
  context._walkPrepareCollision = async () => { prepared++; };
  context._walkSpawnPosition = () => ({x: 0, y: 0, z: 0});
  context._buildKawaiiWalkAvatar = async () => { built++; throw new Error('unexpected build'); };
  context.camAnim.playing = true;
  const cameraBefore = plain(context.camPos);
  await assert.rejects(run('_avatarWalkEnter()'), /./);
  assert.equal(prepared, 0, 'reject before preparing collision');
  assert.equal(built, 0, 'reject before loading an avatar');
  assert.equal(context.walkMode.active, false);
  Object.assign(context.walkMode, {active: true, speed: 1, runMul: 1,
    groundOffset: 0, cameraDist: 3.2, cameraHeight: 2.55,
    avatar: {visible: true, position: new Vector3(), rotation: {y: 0},
      userData: {kawaiiAnimation: {reset() { reset++; }, update() {}}}},
  });
  run('walkSetup.core={}; _updateCollisionAvatarWalk(1/60)');
  assert.equal(context.walkMode.active, false, 'playback must release camera ownership');
  assert.equal(context.walkMode.avatar.visible, false);
  assert.equal(reset, 1, 'normal walk exit cleanup must run');
  assert.deepEqual(plain(context.camPos), cameraBefore, 'preserve the sampled camera position');
  assert.equal(context.camAnim.playing, true, 'walk exit must not stop camera playback');
});
