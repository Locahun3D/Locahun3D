// カメラ初期位置エンジン(src/js/174_auto_camera_engine.js)の単体テスト。
// 合成データ（箱状の部屋 / 壁際 / 宙に浮いた点）でスコアと信頼度の挙動を検証する。
// 実行: node scripts/test-auto-camera.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, 'src/js/174_auto_camera_engine.js'), 'utf8');
// ブラウザ用の断片だが THREE/DOM 非依存の IIFE なので、そのまま eval できる。
(0, eval)(src);
const AC = globalThis.LocahunAutoCam;

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
};

// ── 合成データ生成 ────────────────────────────────────────────
// 床(y=0)・天井(y=h)・四方の壁を持つ箱。density は 1m あたりの点数。
function makeRoom({ w = 10, d = 10, h = 3, density = 20, ceiling = true } = {}) {
  const pts = [];
  const step = 1 / density;
  for (let x = 0; x <= w; x += step) for (let z = 0; z <= d; z += step) {
    pts.push(x, 0, z);
    if (ceiling) pts.push(x, h, z);
  }
  for (let x = 0; x <= w; x += step) for (let y = 0; y <= h; y += step) {
    pts.push(x, y, 0); pts.push(x, y, d);
  }
  for (let z = 0; z <= d; z += step) for (let y = 0; y <= h; y += step) {
    pts.push(0, y, z); pts.push(w, y, z);
  }
  return pts;
}
const toArr = (a) => ({ points: Float32Array.from(a), count: a.length / 3 });

// ── 1. 箱状の部屋 ─────────────────────────────────────────────
{
  console.log('箱状の部屋 10×10×3m');
  const { points, count } = toArr(makeRoom());
  const r = AC.autoPlaceCamera(points, count);
  ok(!r.failed, '成功する', r.reason);
  ok(Math.abs(r.diagnostics.floorY - 0) < 0.2, '床を y≈0 と判定', r.diagnostics.floorY);
  ok(Math.abs(r.position.y - 1.5) < 0.2, '目線高さ ≈ 床+1.5m', r.position.y);
  ok(r.position.x > 1 && r.position.x < 9 && r.position.z > 1 && r.position.z < 9,
     '部屋の内部に置かれる', r.position);
  ok(r.diagnostics.minRayDist > 1.0, '最も近い壁まで1m以上', r.diagnostics.minRayDist);
  ok(r.confidence >= 70 && !r.needsReview, '信頼度70以上', r.confidence);
  console.log('   → conf=' + r.confidence + ' pos=' + JSON.stringify(r.position) +
              ' yaw=' + (r.yaw * 180 / Math.PI).toFixed(0) + '° ' + r.diagnostics.elapsedMs + 'ms');
}

// ── 2. 壁際は選ばれない ───────────────────────────────────────
{
  console.log('壁際が選ばれないこと');
  const { points, count } = toArr(makeRoom({ w: 12, d: 12 }));
  const r = AC.autoPlaceCamera(points, count);
  const distToWall = Math.min(r.position.x, 12 - r.position.x, r.position.z, 12 - r.position.z);
  ok(distToWall > 1.5, '壁から1.5m以上離れる', distToWall);
}

// ── 3. 壁に貼り付いた位置は低スコア ───────────────────────────
{
  console.log('壁ぎわ候補の採点が中央より低いこと');
  const { points, count } = toArr(makeRoom({ w: 12, d: 12 }));
  const g = AC.buildOccupancy(points, count);
  const iy = Math.floor((1.5 - g.min.y) / g.voxel);
  const ctx = {
    centroidX: 6, centroidZ: 6,
    centralityNorm: Math.max(g.horizExtent * 0.5, 1),
    openCap: Math.max(4, Math.min(30, g.horizExtent * 0.5)),
  };
  const cell = (x, z) => [Math.floor((x - g.min.x) / g.voxel), Math.floor((z - g.min.z) / g.voxel)];
  const [cx, cz] = cell(6, 6); const [wx, wz] = cell(0.5, 6);
  const center = AC.scoreCandidate(g, iy, cx, cz, ctx);
  const wall = AC.scoreCandidate(g, iy, wx, wz, ctx);
  ok(center.score > wall.score, '中央 > 壁ぎわ', { center: center.score, wall: wall.score });
  ok(wall.minD < 1.0, '壁ぎわは最短レイが1m未満', wall.minD);
}

// ── 4. 宙に浮いた点（フローター）は占有にならない ─────────────
{
  console.log('フローター耐性（3点未満は非占有）');
  const base = makeRoom({ w: 10, d: 10 });
  // 部屋の中央・目線高さに2点だけ浮かせる（本物の障害物ではない）
  base.push(5, 1.5, 5, 5.01, 1.5, 5.01);
  const { points, count } = toArr(base);
  const g = AC.buildOccupancy(points, count);
  const ix = Math.floor((5 - g.min.x) / g.voxel);
  const iy = Math.floor((1.5 - g.min.y) / g.voxel);
  const iz = Math.floor((5 - g.min.z) / g.voxel);
  ok(!AC.occupied(g, ix, iy, iz), '2点のボクセルは非占有', g.counts[(iy * g.nz + iz) * g.nx + ix]);
  const r = AC.autoPlaceCamera(points, count);
  ok(!r.failed && r.confidence >= 70, 'フローターがあっても通常どおり配置', r.confidence);
}

// ── 5. 虚空（床だけの平面 = 見るものが無い）は信頼度が下がる ───
{
  console.log('虚空シーン（床だけ・壁なし）は要確認になる');
  const pts = [];
  for (let x = 0; x <= 40; x += 0.1) for (let z = 0; z <= 40; z += 0.1) pts.push(x, 0, z);
  const { points, count } = toArr(pts);
  const r = AC.autoPlaceCamera(points, count);
  ok(r.failed || r.confidence < 70, '信頼度70未満 or failed', { failed: r.failed, conf: r.confidence, flags: r.flags });
}

// ── 6. 向き: 片側だけに構造物がある部屋 ───────────────────────
{
  console.log('yaw が「見るものがある方向」を向くこと');
  const pts = [];
  // 20×20 の床のみ（壁なし）＋ +Z 側の端に高い壁を1枚だけ立てる
  for (let x = 0; x <= 20; x += 0.1) for (let z = 0; z <= 20; z += 0.1) pts.push(x, 0, z);
  for (let x = 0; x <= 20; x += 0.05) for (let y = 0; y <= 6; y += 0.05) pts.push(x, y, 19.5);
  const { points, count } = toArr(pts);
  const r = AC.autoPlaceCamera(points, count);
  // forward = (sin yaw, *, cos yaw)。壁は +Z 側にあるので cos(yaw) > 0 を期待。
  ok(!r.failed && Math.cos(r.yaw) > 0.5, '+Z（壁のある方）を向く',
     { yawDeg: (r.yaw * 180 / Math.PI).toFixed(0), cos: Math.cos(r.yaw).toFixed(2) });
}

// ── 7. 多層（1階・2階）は点数の多い層を床にする ────────────────
{
  console.log('多層構造は点数の多い層を床とする');
  const pts = [];
  // 1階 y=0 は 10×10、2階 y=4 は 20×20（＝点が多い）
  for (let x = 0; x <= 10; x += 0.1) for (let z = 0; z <= 10; z += 0.1) pts.push(x, 0, z);
  for (let x = 0; x <= 20; x += 0.1) for (let z = 0; z <= 20; z += 0.1) pts.push(x, 4, z);
  for (let x = 0; x <= 20; x += 0.1) for (let y = 0; y <= 8; y += 0.1) { pts.push(x, y, 0); pts.push(x, y, 20); }
  const { points, count } = toArr(pts);
  const f = AC.detectFloor(points, count);
  ok(Math.abs(f.y - 4) < 0.3, '2階(y=4)を床に採る', f.y);
}

// ── 8. 点が少なすぎる / 空 ────────────────────────────────────
{
  console.log('異常入力');
  const r0 = AC.autoPlaceCamera(new Float32Array(0), 0);
  ok(r0.failed && r0.needsReview, '空入力は failed', r0.reason);
  const r1 = AC.autoPlaceCamera(Float32Array.from([0, 0, 0, 1, 1, 1]), 2);
  ok(r1.failed, '2点は failed', r1.reason);
}

// ── 9. 決定性 ─────────────────────────────────────────────────
{
  console.log('決定性（同じ入力なら同じ出力）');
  const { points, count } = toArr(makeRoom());
  const a = AC.autoPlaceCamera(points, count);
  const b = AC.autoPlaceCamera(points, count);
  ok(JSON.stringify(a.position) === JSON.stringify(b.position) && a.yaw === b.yaw && a.confidence === b.confidence,
     '2回実行で完全一致');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
