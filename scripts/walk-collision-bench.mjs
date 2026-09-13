import fs from 'node:fs';
import vm from 'node:vm';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const context = vm.createContext({ Float32Array, Uint32Array });
vm.runInContext(fs.readFileSync(new URL('../src/js/215_walk_collision.js', import.meta.url), 'utf8'), context);
const Core = context.LocahunWalkCollision;
// 30k occupied cells in a thin floor, two points per cell, no hull/interior fill.
const points = new Float32Array(30000 * 2 * 3);
for (let i = 0; i < 30000; i++) {
  const x = (i % 200) * 0.2 + 0.05;
  const z = Math.floor(i / 200) * 0.2 + 0.05;
  points.set([x, -0.05, z, x + 0.01, -0.05, z], i * 6);
}
const start = performance.now();
const boxes = Core.voxelize(points);
const voxelMs = performance.now() - start;
const core = await Core.create({ rapier: RAPIER });
try {
  const rebuildStart = performance.now();
  core.rebuild({ boxes });
  const rebuildMs = performance.now() - rebuildStart;
  core.setCharacter({ x: 1, y: 0.02, z: 1 });
  const moveStart = performance.now();
  for (let i = 0; i < 600; i++) core.move({ x: 0.02, y: -0.01, z: 0 });
  console.log(JSON.stringify({ points: points.length / 3, boxes: boxes.length,
    voxelMs, rebuildMs, meanMoveMs: (performance.now() - moveStart) / 600,
    heapUsedMiB: process.memoryUsage().heapUsed / 1048576 }, null, 2));
} finally { core.dispose(); }
