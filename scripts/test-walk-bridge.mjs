import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Load only the settings and bridge: avatar/physics workers are out of scope.
const sources = ['216_walk_settings.js', '217_walk_collision_bridge.js'].map(name => ({
  name, code: readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8'),
}));
const plain = value => JSON.parse(JSON.stringify(value));
const identity = () => ({elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]});

// Fixtures use identity transforms. Keep bridge geometry extraction real,
// replacing only the small Three.js surface it needs and the WASM boundary.
class Vector3 {
  fromBufferAttribute(p, i) {
    [this.x, this.y, this.z] = p.array.slice(i * 3, i * 3 + 3);
    return this;
  }
  applyMatrix4(matrix) {
    assert.deepEqual(matrix.elements, identity().elements);
    return this;
  }
}

function geometry(size) {
  const position = {
    array: new Float32Array([0,0,0, size,0,0, 0,0,size]),
    count: 3, itemSize: 3, version: 0,
  };
  return {
    uuid: 'fixture-geometry-' + size,
    attributes: {position},
    getAttribute: name => name === 'position' ? position : undefined,
    getIndex: () => null,
  };
}

function meshLayer(id = 1) {
  const child = {
    isMesh: true, visible: true, userData: {},
    geometry: geometry(1), matrixWorld: identity(),
  };
  const root = {
    visible: true, matrixWorld: identity(), children: [child],
    updateWorldMatrix() {},
    traverseVisible(fn) { if (this.visible) { fn(this); if (child.visible) fn(child); } },
    traverse(fn) { fn(this); fn(child); },
  };
  return {id, type: 'sphere', name: 'Proxy', visible: true,
    size: {x: 1, y: 1, z: 1}, mesh: root};
}

function makeCore() {
  return {
    disposed: false, builds: [],
    rebuild(data) { this.builds.push(data); },
    dispose() { this.disposed = true; },
  };
}

function harness() {
  const cores = [], toasts = [], samples = [], voxels = [];
  const context = vm.createContext({
    console, setTimeout, clearTimeout, performance,
    THREE: {Vector3}, layers: [meshLayer()],
    walkMode: {active: false},
    camPos: {x: 0, y: 0, z: 0},
    document: {getElementById: () => null},
    scene: {add() {}, remove() {}},
    markDirty() {}, showUndoToast(message) { toasts.push(message); },
    LocahunWalkCollision: {
      refineLocal(points, boxes) { return {boxes,region:null}; },
      async create() { const core = makeCore(); cores.push(core); return core; },
      voxelize(points, options) {
        voxels.push({points: Array.from(points), options: plain(options)});
        return [{center: [0,0,0], half: [0.125,0.125,0.125]}];
      },
    },
  });
  context._acCollectSplatPoints = target => {
    samples.push(target);
    const loaded = context.layers.filter(layer =>
      layer.type === 'splat' && layer.visible && layer._testPoints);
    const points = Float32Array.from(loaded.flatMap(layer => layer._testPoints));
    return {points, count: points.length / 3, meshes: loaded.length};
  };
  context.window = context;
  for (const {name, code} of sources) vm.runInContext(code, context, {filename: name});
  const run = code => vm.runInContext(code, context);
  run('walkSetup.settings.meshIds = [1]');
  return {context, run, cores, toasts, samples, voxels};
}

test('cancelled generation cannot overwrite settings restored by a newer project', {timeout: 3000}, async () => {
  const {context, run} = harness();
  let releaseCreate, announceCreate;
  const started = new Promise(resolve => { announceCreate = resolve; });
  const pending = new Promise(resolve => { releaseCreate = resolve; });
  context.LocahunWalkCollision.create = () => { announceCreate(); return pending; };
  const staleCore = makeCore();
  const generation = run('_walkGenerateCollision()');
  await started;
  run(`_walkRestoreSettings({signature: 'new-project-signature', meshIds: [1],
    boxes: [{center: [0,-1,0], half: [1,0.1,1]}], spawn: {x: 8,y: 2,z: 9}})`);
  const restored = plain(run('_walkSaveSettings()'));
  releaseCreate(staleCore);
  assert.equal(await generation, false, 'old generation must be cancelled');
  assert.equal(staleCore.disposed, true, 'cancelled core must be disposed');
  assert.equal(run('walkSetup.core'), null, 'old core must not enter the new project');
  assert.deepEqual(plain(run('_walkSaveSettings()')), restored,
    'cancelled generation must not clear the new project signature');
});

test('resizing collision geometry invalidates readiness with an unchanged root transform', async () => {
  const {context, run, cores} = harness();
  assert.equal(await run('_walkGenerateCollision()'), true);
  const initialCore = cores[0];
  assert.equal(initialCore.builds[0].meshes[0].vertices[3], 1);
  const layer = context.layers[0];
  const matrixBefore = plain(layer.mesh.matrixWorld.elements);
  layer.size = {x: 10, y: 10, z: 10};
  layer.mesh.children[0].geometry = geometry(10);
  assert.deepEqual(layer.mesh.matrixWorld.elements, matrixBefore);
  await run('_walkPrepareCollision()');
  const currentCore = run('walkSetup.core');
  const lastBuild = currentCore.builds.at(-1);
  assert.equal(lastBuild.meshes[0].vertices[3], 10,
    'prepared collision must contain resized geometry, not the stale size-1 mesh');
});

test('visible cacheless RAD permits an explicitly selected collision mesh', async () => {
  const {context, run, samples} = harness();
  run('walkSetup.settings.meshOnly = true');
  context.layers.push({id: 2, type: 'splat', name: 'scan.rad', visible: true,
    _rawExt: 'rad', mesh: {visible: true, matrixWorld: identity(), updateWorldMatrix() {}}});
  const generated = await run('_walkGenerateCollision()');
  assert.equal(generated, true,
    'selected mesh must remain usable with visible RAD: ' + run('walkSetup.status'));
  const build = run('walkSetup.core').builds.at(-1);
  assert.equal(build.meshes.length, 1, 'bridge must actually submit the selected mesh');
  assert.deepEqual(Array.from(build.meshes[0].vertices), [0,0,0, 1,0,0, 0,0,1]);
  assert.deepEqual(samples, [], 'mesh-only mode must not read splat data');
});

test('shared world-space samples are filtered around the camera before voxelization', async () => {
  const {context, run, samples, voxels} = harness();
  context.camPos = {x: 10, y: 2, z: 20};
  context.layers.push({id: 2, type: 'splat', visible: true,
    mesh: {matrixWorld: identity(), updateWorldMatrix() {}},
    _testPoints: [10,2,20, 11,2,20, 40,2,20, 10,40,20]});
  run('walkSetup.settings.radius = 2');
  assert.equal(await run('_walkGenerateCollision()'), true, run('walkSetup.status'));
  assert.deepEqual(samples, [2000000]);
  assert.deepEqual(voxels.map(call => call.points), [[10,2,20, 11,2,20]],
    'only nearby world-space samples should reach voxelization');
});

test('mesh-only settings retain the saved spawn after save/restore and collision preparation', async () => {
  const {run} = harness();
  assert.equal(await run('_walkGenerateCollision()'), true);
  run('walkSetup.settings.spawn = {x: 8,y: 2,z: 9}');
  const saved = plain(run('_walkSaveSettings()'));
  assert.deepEqual(saved.boxes, [], 'fixture must exercise mesh-only persistence');
  run('_walkRestoreSettings(' + JSON.stringify(saved) + ')');
  assert.equal(run('walkSetup.core'), null);
  assert.deepEqual(plain(run('walkSetup.settings.spawn')), {x: 8,y: 2,z: 9});
  await run('_walkPrepareCollision()');
  assert.ok(run('walkSetup.core'), 'restoration must also prepare collision');
  assert.deepEqual(plain(run('_walkSaveSettings().spawn')), {x: 8,y: 2,z: 9},
    'preparing restored mesh-only collision must not erase the saved spawn');
});

test('mesh-only toggle during core creation keeps the active generation mode and restores its checkbox', {timeout: 3000}, async () => {
  const {context, run} = harness();
  const checkbox = {checked: false};
  context.document.getElementById = id => id === 'walk-mesh-only' ? checkbox : null;
  context.layers.push({id: 2, type: 'splat', visible: true,
    mesh: {matrixWorld: identity(), updateWorldMatrix() {}},
    _testPoints: [0,0,0, 1,0,0]});
  let releaseCreate, announceCreate;
  const started = new Promise(resolve => { announceCreate = resolve; });
  const pending = new Promise(resolve => { releaseCreate = resolve; });
  context.LocahunWalkCollision.create = () => { announceCreate(); return pending; };
  const core = makeCore();
  const generation = run('_walkGenerateCollision()');
  await started;
  try {
    assert.equal(run('walkSetup.busy'), true);
    checkbox.checked = true;
    run('walkSetMeshOnly(true)');
    assert.equal(run('walkSetup.settings.meshOnly'), false,
      'a pending splat generation must not accept a mesh-only mode change');
    assert.equal(checkbox.checked, false, 'rejected mode change must restore the UI');
  } finally {
    releaseCreate(core);
    await generation;
  }
  assert.equal(await generation, true);
  assert.equal(run('walkSetup.settings.meshOnly'), false);
  assert.equal(core.builds.at(-1).boxes.length, 1);
  assert.equal(run('walkSetup.settings.signature === _walkSourceSignature()'), true);
  assert.equal(run('walkSetup.busy'), false);
  run('walkSetMeshOnly(true)');
  assert.equal(run('walkSetup.settings.meshOnly'), true,
    'mode changes must work again after generation completes');
  assert.equal(run('walkSetup.settings.signature'), '', 'accepted change invalidates readiness');
});

test('camera movement between point batches cannot move the generation radius', async () => {
  const {context, run, voxels} = harness();
  context.layers.push({id: 2, type: 'splat', visible: true,
    mesh: {matrixWorld: identity(), updateWorldMatrix() {}},
    _testPoints: [0,0,0, 100,0,0, 100,0,0]});
  run('walkSetup.settings.radius = 2');
  // First yield precedes sampling; second yield follows sample index zero.
  let yields = 0, moved = false;
  context.setTimeout = (callback, delay) => setTimeout(() => {
    if (++yields === 2) {
      context.camPos.x = 100;
      moved = true;
    }
    callback();
  }, delay);
  assert.equal(await run('_walkGenerateCollision()'), true, run('walkSetup.status'));
  assert.equal(moved, true, 'fixture must move the camera while point filtering is paused');
  assert.deepEqual(voxels.map(call => call.points), [[0,0,0]],
    'radius must stay centered at the starting camera, excluding the distant samples');
});
