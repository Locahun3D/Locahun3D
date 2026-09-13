import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/294_rad_lod_prefetch.js', import.meta.url), 'utf8');
const start = source.indexOf('(function(){');
assert.ok(start >= 0 && source.trimEnd().endsWith('})();'));
const actual = source.slice(start);

function fixture(phase = 'sweep', extra = {}) {
  let tick, now = 10000, dirty = 0;
  class Quaternion {
    setFromAxisAngle() { return this; }
    clone() { return new Quaternion(); }
    multiply() { return this; }
    setFromEuler() { return this; }
  }
  class Vector3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
  const mesh = { paged: {} };
  const saved = { id: 2, type: 'camera', savedPose: { pos: { x: 20, y: 2, z: 40 }, yaw: 1, pitch: 0 } };
  const context = vm.createContext({
    window: {}, console: { info() {} },
    THREE: { Quaternion, Vector3, Euler: class {} },
    camera: { quaternion: new Quaternion() },
    sparkRenderer: { lodPosOverride: { remote: true }, lodQuatOverride: { remote: true } },
    layers: [{ _isMain: true, mesh }, saved],
    _splatPerfTier: 'desktop', _splatActiveUntil: 0,
    keys: {}, dragOn: false, joyDX: 0, joyDY: 0,
    yaw: 0, pitch: 0, _yawTarget: 0, _pitchTarget: 0,
    performance: { now: () => now },
    markDirty: () => { dirty++; },
    _sceneSettledForCalibration: () => true,
    setInterval: (fn, ms) => { assert.equal(ms, 100); tick = fn; },
    ...extra,
  });
  vm.runInContext(actual, context);
  const state = context.window.__lodPrefetch;
  Object.assign(state, { mesh, phase });
  return { context, state, tick: () => tick(), at: value => { now = value; tick(); }, dirty: () => dirty };
}

const activities = [
  ...['KeyR', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(key => [key, { keys: { [key]: true } }]),
  ['tap travel', { _clickNavigationController: { active: true } }],
  ['camera playback', { camAnim: { playing: true } }],
  ['vertical up button', { touchUpHeld: true }],
  ['vertical down button', { touchDnHeld: true }],
];

for (const phase of ['sweep', 'cams']) {
  for (const [name, activity] of activities) {
    test(`${phase}: ${name} releases remote overrides without prewarm wake`, () => {
      const h = fixture(phase, activity);
      h.tick();
      assert.equal(h.context.sparkRenderer.lodPosOverride, null);
      assert.equal(h.context.sparkRenderer.lodQuatOverride, null);
      assert.equal(h.dirty(), 0);
      assert.equal(h.context._splatActiveUntil, 0);
      assert.equal(h.state.idleAt, 11000);
      assert.equal(h.state.dir, 0);
      assert.equal(Object.keys(h.state.warmedCams).length, 0);
    });
  }
}

test('stopped tap/playback resumes sweep only after the existing one-second idle window', () => {
  const h = fixture('sweep', { _clickNavigationController: { active: true }, camAnim: { playing: true } });
  h.tick();
  h.context._clickNavigationController.active = false;
  h.context.camAnim.playing = false;
  h.at(10999);
  assert.equal(h.dirty(), 0);
  h.at(11000);
  assert.equal(h.dirty(), 1);
  assert.equal(h.context._splatActiveUntil, 11700);
});

for (const [name, activity] of [
  ['capture', { window: { _captureBusy: true } }],
  ['recording', { camAnim: { playing: true, _recCopyFn() {} } }],
  ['walk', { walkMode: { active: true } }],
]) {
  test(`${name} still takes priority over rotation lookahead`, () => {
    const h = fixture('cams', { ...activity, _yawTarget: 1 });
    h.tick();
    assert.equal(h.context.sparkRenderer.lodPosOverride, null);
    assert.equal(h.context.sparkRenderer.lodQuatOverride, null);
    assert.equal(h.dirty(), 0);
    assert.equal(h.state.idleAt, 0);
  });
}

test('rotation lookahead remains ahead of prewarm input guards', () => {
  const h = fixture('cams', { _yawTarget: 1, keys: { KeyR: true }, camAnim: { playing: true } });
  h.tick();
  assert.equal(h.context.sparkRenderer.lodPosOverride, null);
  assert.ok(h.context.sparkRenderer.lodQuatOverride);
  assert.equal(h.dirty(), 0);
  assert.equal(h.state.idleAt, 0);
});

test('existing WASD movement continues to suspend prewarm', () => {
  const h = fixture('sweep', { keys: { KeyW: true } });
  h.tick();
  assert.equal(h.context.sparkRenderer.lodQuatOverride, null);
  assert.equal(h.dirty(), 0);
});

test('hidden tab releases overrides and does not consume warmup headings', () => {
  const h = fixture('sweep', { document: { hidden: true } });
  h.tick();
  assert.equal(h.context.sparkRenderer.lodQuatOverride, null);
  assert.equal(h.context.sparkRenderer.lodPosOverride, null);
  assert.equal(h.dirty(), 0);
  assert.equal(h.context._splatActiveUntil, 0);
  h.at(30000);
  assert.equal(h.state.dir, 0);
  h.context.document.hidden = false;
  h.at(31000);
  assert.equal(h.dirty(), 1);
  assert.equal(h.state.dir, 0);
});

test('absent or null optional controllers keep idle prewarm working', () => {
  for (const extra of [{}, { _clickNavigationController: null, camAnim: null }]) {
    const h = fixture('sweep', extra);
    h.tick();
    assert.equal(h.dirty(), 1);
    assert.equal(h.context._splatActiveUntil, 10700);
  }
});

test('idle sweep still takes 12 headings at 500ms and saved camera dwell remains 1500ms', () => {
  const h = fixture();
  for (let dir = 0; dir < 12; dir++) {
    const at = 10000 + dir * 600;
    h.at(at);
    h.at(at + 499);
    assert.equal(h.state.dir, dir);
    h.at(at + 500);
    assert.equal(h.state.dir, dir + 1);
  }
  assert.equal(h.state.phase, 'cams');
  h.at(18000);
  assert.equal(h.context.sparkRenderer.lodPosOverride.x, 20);
  assert.equal(h.context._splatActiveUntil, 18400);
  h.at(19499);
  assert.equal(h.state.warmedCams[2], undefined);
  h.at(19500);
  assert.equal(h.state.warmedCams[2], true);
  assert.equal(h.context.sparkRenderer.lodPosOverride, null);
});
