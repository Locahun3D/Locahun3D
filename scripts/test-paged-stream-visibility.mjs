import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/291_render_loop.js', import.meta.url), 'utf8');
const start = source.indexOf('function _pagedStreamActive(now){');
const end = source.indexOf('function animate(now)', start);
assert.ok(start >= 0 && end > start);
const active = source.slice(start, end);

function fixture(layers) {
  const context = vm.createContext({ layers });
  vm.runInContext(active, context);
  return now => context._pagedStreamActive(now);
}

for (const hidden of ['layer', 'mesh']) {
  for (const count of [0, 100]) {
    test(`${hidden} hidden, ${count} points does not wake rendering`, () => {
      const layer = { visible: true, mesh: { visible: true, paged: { numSplats: count } } };
      (hidden === 'layer' ? layer : layer.mesh).visible = false;
      const run = fixture([layer]);
      assert.equal(run(1000), false);
      assert.equal(run(600000), false);
      assert.equal(layer.mesh._lastPagedNAt, undefined);
    });
  }
}

test('visible zero pending continues waking, including after being shown again', () => {
  const layer = { visible: true, mesh: { visible: true, paged: { numSplats: 0 } } };
  const run = fixture([layer]);
  assert.equal(run(1000), true);
  assert.equal(run(600000), true);
  layer.visible = layer.mesh.visible = false;
  assert.equal(run(601000), false);
  layer.visible = layer.mesh.visible = true;
  assert.equal(run(602000), true);
});

test('visible loaded stream retains plateau and count-change behavior', () => {
  const layer = { visible: true, mesh: { visible: true, paged: { numSplats: 100 } } };
  const run = fixture([layer]);
  assert.equal(run(1000), true);
  assert.equal(run(2499), true);
  assert.equal(run(2500), false);
  layer.mesh.paged.numSplats = 200;
  assert.equal(run(3000), true);
  layer.mesh._radTargetCount = 200;
  assert.equal(run(3001), false);
});

test('hidden entry does not prevent a later visible pending stream from waking', () => {
  const run = fixture([
    { visible: false, mesh: { paged: { numSplats: 0 } } },
    { visible: true, mesh: { visible: true, paged: { numSplats: 0 } } },
  ]);
  assert.equal(run(1000), true);
});

test('unspecified visibility keeps existing behavior; absent paged meshes stay idle', () => {
  assert.equal(fixture([{ mesh: { paged: { numSplats: 0 } } }])(1000), true);
  assert.equal(fixture([null, {}, { mesh: {} }])(1000), false);
  assert.equal(fixture([])(1000), false);
});
