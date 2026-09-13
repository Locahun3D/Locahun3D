import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const read = rel => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

test('viewer embeds one current walking avatar, not the unused legacy payload', () => {
  const template = read('src/template.html');
  assert.ok(template.includes('{{include:src/assets/male165_glb_b64.html}}'));
  assert.ok(!template.includes('{{include:src/assets/kawaii_walk_glb_b64.html}}'),
    'Do not ship the unused 7.6 MB legacy walking model');
});

test('actual embedded native motions run without loading legacy data', async t => {
  let loads = 0;
  class Loader extends GLTFLoader {
    parse(...args) { loads++; return super.parse(...args); }
  }
  const ctx = vm.createContext({THREE, window: {}, _addonLoader: async () => Loader,
    _b64ToArrayBuffer: s => Uint8Array.from(Buffer.from(s, 'base64')).buffer});
  const embedded = read('src/assets/male165_glb_b64.html');
  vm.runInContext(embedded.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, ''), ctx);
  vm.runInContext(read('src/js/214_kawaii_walk_avatar.js'), ctx);
  const root = await ctx._buildKawaiiWalkAvatar(1.65, {loadIKSolver: async () => null});
  const api = root.userData.kawaiiAnimation;
  t.after(() => api.dispose());
  assert.equal(ctx.window.KAWAII_WALK_GLB_B64, undefined);
  assert.equal(loads, 1);
  assert.equal(api.motionMode, 'embedded');
  for (const name of ['idle', 'walk', 'run', 'jump', 'land', 'stop']) {
    assert.ok(api.actions[name].getClip().tracks.length > 0, name);
  }
  for (let i = 0; i < 60; i++) api.update(1/60, api.nominalRunSpeed, true, {running:true});
  assert.equal(api.state, 'run');
  api.update(1/60, 0, false, {verticalSpeed:5, jumpFlightSeconds:1});
  assert.ok(['takeoff', 'airborne'].includes(api.state));
  for (let i = 0; i < 90; i++) api.update(1/60, 0, false, {verticalSpeed:-2});
  api.update(1/60, 0, true, {verticalSpeed:0});
  for (let i = 0; i < 180; i++) api.update(1/60, 0, true, {});
  assert.equal(api.state, 'idle');
  root.updateMatrixWorld(true);
  root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite), o.name));
  assert.equal(loads, 1);
});
