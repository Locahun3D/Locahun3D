import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';

const source = new URL('../src/js/215_walk_collision.js', import.meta.url);
const context = vm.createContext({ console, Float32Array, Uint32Array });
if (fs.existsSync(source)) vm.runInContext(fs.readFileSync(source, 'utf8'), context);
const Core = context.LocahunWalkCollision;
const floor = { center: [0, -0.1, 0], half: [20, 0.1, 20] };
const down = { x: 0, y: -0.1, z: 0 };
const near = (value, expected, tolerance = 0.025) =>
  assert.ok(Math.abs(value - expected) < tolerance, `${value} != ${expected}`);
async function scene(t, boxes = [floor], meshes = []) {
  assert.equal(typeof Core, 'function', 'collision core must be exposed without app globals');
  const core = await Core.create({ rapier: RAPIER });
  t.after(() => core.dispose());
  core.rebuild({ boxes, meshes });
  core.setCharacter({ x: 0, y: 0.02, z: 0 });
  return core;
}

test('capsule clearance excludes self and allows floor contact but rejects body overlap', async t => {
  const c=await scene(t);
  const feet={x:0,y:0,z:0};
  assert.equal(c.isCapsuleClear(feet),true);
  c.rebuild({boxes:[floor,{center:[.08,.5,.16],half:[.015,.04,.015]}]});
  assert.equal(c.isCapsuleClear(feet),false);
  c.rebuild({boxes:[floor,{center:[.205,.025,0],half:[.005,.005,.005]}]});
  assert.equal(c.isCapsuleClear(feet),true,'rounded foot is not a full-width cylinder');
});
test('capsule query detects trimeshes without creating or moving a character', async t => {
  const c=await Core.create({rapier:RAPIER});
  t.after(()=>c.dispose());
  c.rebuild({boxes:[],meshes:[{vertices:new Float32Array([.1,.4,-.2,.1,.6,-.2,.1,.5,.2]),indices:new Uint32Array([0,1,2])}]});
  const avatarBefore=c._avatar;
  assert.equal(c.isCapsuleClear({x:0,y:0,z:0}),false);
  assert.equal(c.isCapsuleClear({x:2,y:0,z:0}),true);
  assert.equal(c._avatar,avatarBefore);
  c.setCharacter({x:2,y:.02,z:0});
  const before=c._avatar.translation();
  assert.equal(c.isCapsuleClear({x:0,y:0,z:0}),false);
  assert.deepEqual(c._avatar.translation(),before);
});
test('capsule query validates dimensions and disposed state', async t => {
  const c=await scene(t);
  assert.equal(typeof c.isCapsuleClear,'function');
  assert.equal(c.isCapsuleClear({x:0,y:0,z:0}),true);
  assert.throws(()=>c.isCapsuleClear({x:NaN,y:0,z:0}));
  assert.throws(()=>c.isCapsuleClear({x:0,y:0,z:0},.3,.22));
  c.dispose();
  assert.throws(()=>c.isCapsuleClear({x:0,y:0,z:0}));
});

test('stand on a real floor with feet-origin capsule', async t => {
  const c = await scene(t);
  for (let i = 0; i < 60; i++) {
    const r = c.move(down);
    near(r.feet.y, 0.01);
    assert.equal(r.grounded, true);
  }
});
test('wall blocks capsule and diagonal movement slides', async t => {
  const c = await scene(t, [floor, { center: [2, 2, 0], half: [0.1, 2, 10] }]);
  for (let i = 0; i < 60; i++) c.move({ x: 0.1, y: -0.02, z: 0.05 });
  const r = c.move(down);
  near(r.feet.x, 1.67);
  assert.ok(r.feet.z > 2.8);
  assert.equal(r.grounded, true);
});
test('autostep climbs 20cm step but not 60cm wall', async t => {
  const c = await scene(t, [floor, { center: [2, 0.1, 0], half: [1, 0.1, 2] }]);
  for (let i = 0; i < 40; i++) c.move({ x: 0.05, y: -0.02, z: 0 });
  near(c.move(down).feet.y, 0.21);
  c.rebuild({ boxes: [floor, { center: [2, 0.3, 0], half: [1, 0.3, 2] }], meshes: [] });
  c.setCharacter({ x: 0, y: 0.02, z: 0 });
  for (let i = 0; i < 40; i++) c.move({ x: 0.05, y: -0.02, z: 0 });
  assert.ok(c.move(down).feet.x < 0.85);
});
test('snap follows a 15cm descending ledge', async t => {
  const c = await scene(t, [floor, { center: [-1, 0.075, 0], half: [1, 0.075, 2] }]);
  c.setCharacter({ x: -0.5, y: 0.17, z: 0 });
  c.move(down);
  const r = c.move({ x: 1, y: -0.001, z: 0 });
  near(r.feet.y, 0.01);
  assert.equal(r.grounded, true);
});
test('no geometry means falling, with no gravity invented by core', async t => {
  const c = await scene(t, []);
  c.setCharacter({ x: 0, y: 0, z: 0 });
  near(c.move({ x: 0, y: 0, z: 0 }).feet.y, 0);
  for (let i = 0; i < 10; i++) {
    const r = c.move(down);
    near(r.feet.y, -0.1 * (i + 1));
    assert.equal(r.grounded, false);
  }
});
test('teleport and resize take effect immediately; ray excludes avatar', async t => {
  const c = await scene(t);
  c.setCharacter({ x: 3, y: 5, z: 4 }, 2, 0.3);
  near(c.raycast({ x: 3, y: 6, z: 4 }, { x: 0, y: -2, z: 0 }, 10), 6);
  assert.equal(c.raycast({ x: 3, y: 6, z: 4 }, { x: 0, y: 1, z: 0 }, 10), null);
  const r = c.move({ x: 0, y: -10, z: 0 });
  near(r.feet.x, 3); near(r.feet.z, 4); near(r.feet.y, 0.01);
});
test('world-space trimesh is collidable and rebuild removes old geometry', async t => {
  const c = await scene(t, [], [{
    vertices: new Float32Array([-5, 2, -5, -5, 2, 5, 5, 2, 5, 5, 2, -5]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3])
  }]);
  c.setCharacter({ x: 0, y: 3, z: 0 });
  near(c.move({ x: 0, y: -2, z: 0 }).feet.y, 2.01);
  c.rebuild({ boxes: [], meshes: [] });
  assert.equal(c.raycast({ x: 0, y: 3, z: 0 }, down, 10), null);
  assert.equal(c.move(down).grounded, false);
});
test('invalid rebuild preserves previous world and character', async t => {
  const c = await scene(t);
  assert.throws(() => c.rebuild({ boxes: [{ center: [NaN, 0, 0], half: [1, 1, 1] }] }), /finite|bounds/i);
  assert.throws(() => c.rebuild({ meshes: [{ vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), indices: new Uint32Array([0, 1, 3]) }] }), /index|indices/i);
  assert.equal(c.move(down).grounded, true);
  assert.throws(() => c.setCharacter({ x: 0, y: 0, z: 0 }, 0.1, 0.22), /height/i);
  assert.throws(() => c.move({ x: NaN, y: 0, z: 0 }), /finite/i);
  assert.throws(() => c.raycast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5), /direction/i);
});
test('dispose is idempotent and subsequent operations reject', async t => {
  const c = await scene(t);
  c.dispose(); c.dispose();
  assert.throws(() => c.move(down), /disposed/i);
  assert.throws(() => c.rebuild({ boxes: [] }), /disposed/i);
  assert.throws(() => c.setCharacter({ x: 0, y: 0, z: 0 }), /disposed/i);
  assert.throws(() => c.raycast({ x: 0, y: 0, z: 0 }, down, 5), /disposed/i);
});
test('walkable slope climbs while steep slope stops upward motion', async t => {
  async function climb(angle) {
    const rise = 5 * Math.tan(angle * Math.PI / 180);
    const c = await scene(t, [floor], [{
      vertices: new Float32Array([0, 0, -3, 0, 0, 3, 5, rise, 3, 5, rise, -3]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3])
    }]);
    c.setCharacter({ x: -1, y: 0.02, z: 0 });
    let result;
    for (let i = 0; i < 100; i++) result = c.move({ x: 0.04, y: -0.02, z: 0 });
    return result;
  }
  const gentle = await climb(25);
  assert.ok(gentle.feet.x > 1.3 && gentle.feet.y > 0.6, JSON.stringify(gentle));
  const steep = await climb(65);
  assert.ok(steep.feet.x < 0.3 && steep.feet.y < 0.3, JSON.stringify(steep));
});
test('ray works immediately after rebuild without an avatar', async t => {
  const c = await Core.create({ rapier: RAPIER });
  t.after(() => c.dispose());
  c.rebuild({ boxes: [floor] });
  near(c.raycast({ x: 0, y: 5, z: 0 }, down, 10), 5);
  assert.equal(c.raycast({ x: 0, y: 5, z: 0 }, down, 4), null);
  assert.throws(() => c.move(down), /setCharacter/i);
});
test('voxel occupancy is deterministic, keeps thin floor, never fills doorway', () => {
  assert.equal(typeof Core, 'function');
  const points = new Float32Array([-0.31, 0.001, 0, -0.32, 0.001, 0, 0.31, 0.001, 0, 0.32, 0.001, 0]);
  const boxes = Core.voxelize(points);
  assert.equal(boxes.length, 2);
  assert.ok(boxes.every(b => Math.abs(b.center[0]) > 0.2 && b.half[1] === 0.1));
  const reversed = new Float32Array([...points.slice(6), ...points.slice(0, 6)]);
  assert.deepEqual(Core.voxelize(reversed), boxes);
  assert.equal(Core.voxelize(new Float32Array()).length, 0);
});
test('voxel invalid input and limits fail explicitly; nonfinite triplets filtered', () => {
  assert.equal(typeof Core, 'function');
  assert.throws(() => Core.voxelize([0, 0, 0]), /Float32Array/i);
  assert.throws(() => Core.voxelize(new Float32Array([0, 0])), /xyz|multiple/i);
  assert.throws(() => Core.voxelize(new Float32Array([NaN, 0, 0])), /finite/i);
  const p = new Float32Array([0, 0, 0, 0, 0, 0]);
  for (const options of [{ cellSize: 0 }, { cellSize: NaN }, { minPoints: 0 }, { maxCells: 0 }])
    assert.throws(() => Core.voxelize(p, options));
  assert.throws(() => Core.voxelize(new Float32Array([1e20, 0, 0])), /bounds/i);
  assert.throws(() => Core.voxelize(new Float32Array([0, 0, 0, 0.3, 0, 0]), { maxCells: 1 }), /maxCells/i);
  assert.equal(Core.voxelize(new Float32Array([...p, Infinity, 0, 0])).length, 1);
});
test('voxel bounds never emit boxes that rebuild rejects', () => {
  assert.throws(() => Core.voxelize(new Float32Array([10000, 0, 0]), { minPoints: 1 }), /bounds/i);
  assert.throws(() => Core.voxelize(new Float32Array([0, 0, 0, 1001, 0, 0])), /bounds/i);
});
test('exact floor spawn walks without sticking', async t => {
  const c = await scene(t);
  c.setCharacter({ x: 0, y: 0, z: 0 });
  let result;
  for (let i = 0; i < 100; i++) result = c.move({ x: 0.02, y: -0.01, z: 0 });
  // Rapier may lose a few small displacements while resolving its contact margin.
  assert.ok(result.feet.x > 1.8, JSON.stringify(result));
  assert.ok(result.feet.y >= -0.005);
  assert.equal(result.grounded, true);
});
test('many rebuild/resize/dispose cycles leave independent worlds usable', async () => {
  for (let i = 0; i < 40; i++) {
    const c = await Core.create({ rapier: RAPIER });
    try {
      for (let j = 0; j < 3; j++) {
        c.rebuild({ boxes: [floor] });
        c.setCharacter({ x: i, y: 3, z: 0 });
        c.setCharacter({ x: 0, y: 0.02, z: 0 }, 2, 0.3);
        assert.equal(c.move(down).grounded, true);
      }
    } finally { c.dispose(); }
  }
});
test('offline asset matches pinned vendor hashes and standalone ESM bytes', () => {
  const vendor = new URL('../vendor/rapier-walk/', import.meta.url);
  const provenance = JSON.parse(fs.readFileSync(new URL('provenance.json', vendor), 'utf8'));
  const esm = fs.readFileSync(new URL('rapier.mjs', vendor));
  const asset = fs.readFileSync(new URL('../src/assets/rapier_walk_b64.html', import.meta.url));
  const sha = value => createHash('sha256').update(value).digest('hex');
  const b64 = asset.toString().match(/window\.WALK_RAPIER_B64 = "([A-Za-z0-9+/=]+)"/)[1];
  const payload = Buffer.from(b64, 'base64');
  assert.equal(provenance.version, '0.20.0');
  assert.equal(sha(esm), provenance.esmSha256);
  assert.equal(sha(payload), provenance.payloadSha256);
  assert.equal(sha(asset), provenance.assetSha256);
  assert.equal(payload.toString(), esm.toString().replace(/^\/\/# sourceMappingURL=.*$/gm, ''));
});
test('mesh vertex budget is cumulative across meshes', async t => {
  const c = await scene(t);
  const vertices = new Float32Array(4500003);
  vertices.set([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const mesh = { vertices, indices: new Uint32Array([0, 1, 2]) };
  assert.throws(() => c.rebuild({ meshes: [mesh, mesh] }), /vertex limit/i);
  assert.equal(c.move(down).grounded, true);
});

function horizontalPatch(cellSize, y = 0.001, xOffset = 0) {
  return new Float32Array([
    xOffset + cellSize * 0.1, y, cellSize * 0.1,
    xOffset + cellSize * 0.8, y, cellSize * 0.1,
    xOffset + cellSize * 0.1, y, cellSize * 0.8,
    xOffset + cellSize * 0.8, y, cellSize * 0.8
  ]);
}
for (const cellSize of [0.25, 0.5]) {
  test(`optional horizontal fit preserves observed floor height for ${cellSize}m cells`, async t => {
    const points = horizontalPatch(cellSize);
    const defaults = Core.voxelize(points, { cellSize });
    near(defaults[0].center[1] + defaults[0].half[1], cellSize, 1e-8);
    assert.deepEqual(Core.voxelize(points, { cellSize, fitHorizontalSurfaces: false }), defaults);
    const boxes = Core.voxelize(points, { cellSize, fitHorizontalSurfaces: true });
    assert.equal(boxes.length, 1);
    const box = boxes[0];
    near(box.center[1] + box.half[1], points[1] + 0.005, 1e-8);
    near(box.half[1] * 2, 0.02, 1e-8);
    near(box.center[0], cellSize / 2, 1e-8);
    near(box.center[2], cellSize / 2, 1e-8);
    near(box.half[0], cellSize / 2, 1e-8);
    near(box.half[2], cellSize / 2, 1e-8);
    const c = await scene(t, boxes);
    c.setCharacter({ x: cellSize / 2, y: 1, z: cellSize / 2 });
    near(c.raycast({ x: cellSize / 2, y: 1, z: cellSize / 2 }, down, 2), 1 - points[1] - 0.005, 0.001);
    const result = c.move({ x: 0, y: -2, z: 0 });
    assert.equal(result.grounded, true);
    near(result.feet.y, points[1] + 0.015, 0.005);
  });
}
test('horizontal fit does not flatten vertical walls or insufficient/localized/noisy samples', () => {
  const samples = [
    new Float32Array([0.01, 0.01, 0.01, 0.01, 0.2, 0.01, 0.01, 0.01, 0.2, 0.01, 0.2, 0.2]),
    horizontalPatch(0.25).slice(0, 9),
    new Float32Array([0.01, 0.01, 0.01, 0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.01, 0.02]),
    new Float32Array([...horizontalPatch(0.25), 0.1, 0.2, 0.1])
  ];
  for (const points of samples) {
    const options = { cellSize: 0.25, minPoints: 1 };
    assert.deepEqual(Core.voxelize(points, { ...options, fitHorizontalSurfaces: true }), Core.voxelize(points, options));
  }
});
test('horizontal fit uses all observations and is independent of point order', () => {
  const points = new Float32Array([...horizontalPatch(0.5, -0.49, -0.5), -0.2, -0.46, 0.2,
    ...horizontalPatch(0.5, 0.02, 0.5), NaN, 0, 0]);
  const reversed = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 3) reversed.set(points.subarray(i, i + 3), points.length - i - 3);
  const options = { cellSize: 0.5, fitHorizontalSurfaces: true, maxCandidates: 8 };
  const boxes = Core.voxelize(points, options);
  assert.equal(boxes.length, 2);
  assert.deepEqual(Core.voxelize(reversed, options), boxes);
  near(boxes[0].center[1] + boxes[0].half[1], Math.fround(-0.46) + 0.005, 1e-8);
  near(boxes[0].half[1] * 2, Math.fround(-0.46) - Math.fround(-0.49) + 0.01, 1e-8);
  near(boxes[1].center[1] + boxes[1].half[1], Math.fround(0.02) + 0.005, 1e-8);
});
test('explicit candidate budget lets sparse noise be filtered before output limit', () => {
  const points = new Float32Array([...horizontalPatch(0.25), 1, 0, 0, 2, 0, 0, 3, 0, 0]);
  for (const fitHorizontalSurfaces of [false, true]) {
    const options = { cellSize: 0.25, maxCells: 1, fitHorizontalSurfaces };
    assert.throws(() => Core.voxelize(points, options), /maxCells/i);
    assert.equal(Core.voxelize(points, { ...options, maxCandidates: 4 }).length, 1);
    assert.throws(() => Core.voxelize(points, { ...options, maxCandidates: 3 }), /maxCandidates.*3/i);
  }
});
test('explicit candidate budget never bypasses emitted maxCells limit', () => {
  const points = new Float32Array([...horizontalPatch(0.25), ...horizontalPatch(0.25, 0.001, 1)]);
  for (const fitHorizontalSurfaces of [false, true])
    assert.throws(() => Core.voxelize(points, { cellSize: 0.25, maxCells: 1, maxCandidates: 4, fitHorizontalSurfaces }), /maxCells.*after/i);
});
test('candidate and fitting options reject invalid values, including on empty input', () => {
  for (const maxCandidates of [0, -1, 1.5, NaN, Infinity, 250001, null])
    assert.throws(() => Core.voxelize(new Float32Array(), { maxCandidates }), /maxCandidates/i);
  assert.throws(() => Core.voxelize(new Float32Array(), { fitHorizontalSurfaces: 'true' }), /fitHorizontalSurfaces/i);
  assert.equal(Core.voxelize(new Float32Array(), { maxCandidates: 250000, fitHorizontalSurfaces: true }).length, 0);
});
test('default 30000 output cap still applies with 120000 candidates', () => {
  const points = new Float32Array(30001 * 6);
  for (let i = 0; i < 30001; i++) {
    const x = (i % 300) * 0.25 + 0.01, z = Math.floor(i / 300) * 0.25 + 0.01;
    points.set([x, 0, z, x, 0, z], i * 6);
  }
  assert.throws(() => Core.voxelize(points, { cellSize: 0.25, maxCandidates: 120000 }), /maxCells \(30000\).*after/i);
  assert.equal(Core.voxelize(points.subarray(0, 30000 * 6), { cellSize: 0.25, maxCandidates: 120000 }).length, 30000);
});

// Actual full-scan SPLAT records, stride 6, identity world transform.
// Cell x=[-6.5,-6), y=[-1.5,-1), z=[8.5,9); source/procedure in notes.
const scanRoadCell = new Float32Array([
  -6.0124125480651855, -1.4482191801071167, 8.78486156463623,
  -6.24419641494751, -1.4202954769134521, 8.668933868408203,
  -6.059067249298096, -1.4258856773376465, 8.886053085327148,
  -6.213579177856445, -1.3974931240081787, 8.837496757507324,
  -6.072774410247803, -1.3869545459747314, 8.583287239074707,
  -6.3211283683776855, -1.3794960975646973, 8.516073226928711,
  -6.308412551879883, -1.3679269552230835, 8.707619667053223,
  -6.358372211456299, -1.3684196472167969, 8.723739624023438,
  -6.236727237701416, -1.3543018102645874, 8.991265296936035
]);
test('actual noisy road cell trims empty upper space without removing observed support', async t => {
  const options = { cellSize: 0.5, fitHorizontalSurfaces: true };
  const boxes = Core.voxelize(scanRoadCell, options), b = boxes[0];
  assert.equal(boxes.length, 1);
  near(b.center[1] + b.half[1], -1.3543018102645874 + 0.005, 1e-8);
  near(b.center[1] - b.half[1], -1.5, 1e-8);
  near(b.half[0], 0.25, 1e-8); near(b.half[2], 0.25, 1e-8);
  for (let i = 0; i < scanRoadCell.length; i += 3)
    for (let j = 0; j < 3; j++) assert.ok(Math.abs(scanRoadCell[i + j] - b.center[j]) <= b.half[j]);
  const c = await scene(t, boxes);
  c.setCharacter({ x: -6.25, y: 0, z: 8.75 });
  const result = c.move({ x: 0, y: -2, z: 0 });
  assert.equal(result.grounded, true);
  // Median observed road height is a diagnostic reference, not an asserted true surface.
  assert.ok(Math.abs(result.feet.y - -1.3869545459747314) < 0.06, JSON.stringify(result));
  const reversed = new Float32Array(scanRoadCell.length);
  for (let i = 0; i < scanRoadCell.length; i += 3)
    reversed.set(scanRoadCell.subarray(i, i + 3), scanRoadCell.length - 3 - i);
  assert.deepEqual(Core.voxelize(reversed, options), boxes);
});
test('noisy-road fallback rejects vertical and diagonal wall bands; retains doorway', async t => {
  const points = [];
  // Two fully sampled wall piers with a one-metre unsampled opening between them.
  for (const x of [0.05, 0.45, 1.55, 1.95])
    for (let y = 0.05; y < 2; y += 0.1)
      for (const z of [0.05, 0.45]) points.push(x, y, z);
  const input = new Float32Array(points), options = { cellSize: 0.5 };
  const boxes = Core.voxelize(input, { ...options, fitHorizontalSurfaces: true });
  assert.deepEqual(boxes, Core.voxelize(input, options));
  const c = await scene(t, [floor, ...boxes]);
  c.setCharacter({ x: 0.25, y: 0.02, z: -1 });
  for (let i = 0; i < 40; i++) c.move({ x: 0, y: -0.02, z: 0.05 });
  assert.ok(c.move(down).feet.z < -0.2, 'wall must stop capsule');
  c.setCharacter({ x: 1, y: 0.02, z: -1 });
  for (let i = 0; i < 40; i++) c.move({ x: 0, y: -0.02, z: 0.05 });
  assert.ok(c.move(down).feet.z > 0.9, 'unobserved doorway must stay open');
  const diagonal = new Float32Array(Array.from({ length: 9 }, (_, i) => [0.03 + i * 0.05, 0.03 + i * 0.05, 0.03 + i * 0.05]).flat());
  assert.deepEqual(Core.voxelize(diagonal, { ...options, fitHorizontalSurfaces: true }), Core.voxelize(diagonal, options));
});
test('late elevated observation prevents noisy-road trimming instead of erasing an obstacle', () => {
  const points = new Float32Array([...scanRoadCell, -6.25, -1.01, 8.75]);
  assert.deepEqual(Core.voxelize(points, { cellSize: 0.5, fitHorizontalSurfaces: true }),
    Core.voxelize(points, { cellSize: 0.5 }));
});
