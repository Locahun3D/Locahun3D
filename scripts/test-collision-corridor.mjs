/**
 * 廊下の当たり判定（2026-09-22 本人指摘「当たり判定がシビアすぎて、廊下の通り抜けができないときがある」）。
 *
 *   node --test scripts/test-collision-corridor.mjs
 *
 * 幅0.8mの廊下（両側に壁・床）に、実データで多い「ほぼ透明なもや」と「宙に浮いた小さな塊」を置き、
 * 体（半径0.22m・高さ1m）が通る空間が残るかを見る。セルは本番と同じ 0.25m。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/216b_whole_collision.js';
import '../src/js/216c_collision_bake.js';
const I = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const toHalf = (v) => { f32[0] = v; const x = u32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff; if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | (m >>> 13); };
function scene(withFloater = false) {
  const pts = []; // [x,y,z,alpha]
  // 壁（x=±0.4）と床（y=0）を 5cm 間隔で。奥行き z=0〜3m。
  for (let z = 0; z <= 3; z += 0.05) for (let y = 0; y <= 2; y += 0.05) { pts.push([-0.4, y, z, 220], [0.4, y, z, 220]); }
  for (let z = 0; z <= 3; z += 0.05) for (let x = -0.4; x <= 0.4; x += 0.05) pts.push([x, 0, z, 220]);
  // 廊下の真ん中、腰の高さに「ほぼ透明なもや」（不透明度 0.1 相当＝RADでは半分で入るので 13）
  for (let z = 0.5; z <= 2.5; z += 0.1) for (const y of [0.6, 0.62]) pts.push([0.02, y, z, 13]);
  // 廊下の先の広い場所（x=3m）に、宙に浮いた小さな塊（不透明・1升ぶん）
  if (withFloater) pts.push([3.05, 0.9, 1.5, 200], [3.06, 0.91, 1.51, 200]);
  const packed = new Uint32Array(pts.length * 4), tree = new Uint32Array(pts.length * 4);
  pts.forEach(([x, y, z, a], i) => { packed[i * 4] = (a << 24) >>> 0; packed[i * 4 + 1] = (toHalf(x) | (toHalf(y) << 16)) >>> 0; packed[i * 4 + 2] = toHalf(z); });
  return { getRadMeta: async () => ({ meta: { count: pts.length, chunks: [{}] } }), fetchDecodeChunk: async () => ({ numSplats: pts.length, packedArray: packed, extra: { lodTree: tree } }) };
}
// 体が通る筒（中心 x=0、半径0.22、y=0.3〜1.0）に食い込む箱があるか
const blocked = (tiles) => tiles.flatMap((t) => t.boxes).some((b) => {
  const [cx, cy, cz] = b.center, [hx, hy, hz] = b.half;
  return Math.abs(cx) - hx < 0.22 && cy + hy > 0.3 && cy - hy < 1.0 && cz + hz > 0.3 && cz - hz < 2.7;
});

test('変更前の作り方（すべての点を数える）だと、腰の高さの薄いもやで廊下が塞がる', async () => {
  const r = await LocahunCollisionBake.generate([{ paged: scene(), matrix: I }], { cellSize: 0.25 });
  assert.equal(blocked(r.tiles), true);
});

test('ほぼ透明な点を数えないと、壁と床は残ったまま廊下が通れる', async () => {
  const r = await LocahunCollisionBake.generate([{ paged: scene(), matrix: I }], { cellSize: 0.25, opacityMin: 19, dropIsolated: true });
  assert.equal(blocked(r.tiles), false);
  const boxes = r.tiles.flatMap((t) => t.boxes);
  assert(boxes.some((b) => b.center[0] < -0.2), '左の壁が残る');
  assert(boxes.some((b) => b.center[0] > 0.2), '右の壁が残る');
  // 床は x=0 の升目の境目で2つの箱に分かれる。廊下の中央の左右どちらの足元にも床があることを見る。
  for (const x of [-0.1, 0.1]) assert(boxes.some((b) => b.center[1] - b.half[1] <= 0.01 && Math.abs(x - b.center[0]) <= b.half[0]), '床が残る x=' + x);
});

test('広い場所で宙に浮いた小さな塊は、孤立升として消える', async () => {
  const floater = (tiles) => tiles.flatMap((t) => t.boxes).some((b) => Math.abs(b.center[0] - 3.1) < 0.3 && b.center[1] > 0.5);
  const before = await LocahunCollisionBake.generate([{ paged: scene(true), matrix: I }], { cellSize: 0.25, opacityMin: 19 });
  const after = await LocahunCollisionBake.generate([{ paged: scene(true), matrix: I }], { cellSize: 0.25, opacityMin: 19, dropIsolated: true });
  assert.equal(floater(before.tiles), true);
  assert.equal(floater(after.tiles), false);
});
