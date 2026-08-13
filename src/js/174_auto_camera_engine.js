// ══════════════════════════════════════════════════
//  AUTO CAMERA PLACEMENT — 幾何エンジン（純粋関数）
//
//  設計書: F:\Claude\docs\設計_カメラ初期位置の自動決定パイプライン_2026-08-13.md
//
//  「カメラ初期位置」を splat 点群の幾何だけで決定的に解く。画像認識は使わない。
//  ここには Spark / THREE / DOM への依存を一切置かない —— 点群(Float32Array の
//  x,y,z 連番)を渡せばスコアと位置が返るだけの純粋な計算。単体テストのため
//  (scripts/test-auto-camera.mjs が この1ファイルだけを eval して検証する)。
//
//  ブラウザ側の配線（splat の取り出し・ボタン・トースト）は 175 に置く。
// ══════════════════════════════════════════════════
(function (root) {
  'use strict';

  // ── パラメータ ────────────────────────────────────────────────
  // 設計書 §2 の数値をそのまま定数化してある。実データに合わせて動かすときは
  // ここだけを触ればよい（コード中に数値を散らさない）。★印は設計書に明示の
  // 数値が無く、こちらで決めた値。
  const P = {
    VOXEL: 0.3,                  // §2-1 占有グリッドのボクセル辺長 [m]
    VOXEL_LARGE: 0.5,            // §2-1 広い屋外はここまで緩和
    LARGE_SCENE_EXTENT: 60,      // ★ 水平の最大辺がこれを超えたら「広い屋外」[m]
    MAX_VOXELS: 40e6,            // ★ メモリ保護。超えたらボクセルを粗くする
    OCCUPANCY_MIN_POINTS: 3,     // §2-1 3点以上で占有（フローター対策）

    FLOOR_BIN: 0.1,              // §2-2 Yヒストグラムの刻み [m]
    FLOOR_PERCENTILE: 0.05,      // §2-2 累積5%より下は外れ値として無視
    // ★ 床候補ピークを探すのは高さレンジの下60%まで。天井を床と誤らないための
    //   上限だが、狭すぎると §2-2 の「多層構造では最も点数の多い層を採る」規定で
    //   2階側を拾えなくなる（下40%だと 0-8m のスキャンで y=4 の層が範囲外に
    //   落ちた）。室内の天井は必ずレンジ上端＝100%側に来るので 60% で両立する。
    FLOOR_SEARCH_FRACTION: 0.6,
    FLOOR_PEAK_MIN_RATIO: 0.25,  // ★ 最大ピークのこの割合未満は「密なピーク」と認めない
    EYE_HEIGHT: 1.5,             // §2-2 目線高さ = 床 + 1.5m

    CLEAR_RADIUS: 0.5,           // §2-3 水平これ以内は全て非占有であること [m]
    FLOOR_BELOW: 1.5,            // §2-3 真下これ以内に床(占有)があること [m]

    RAYS: 64,                    // §2-4 水平レイの本数
    RAY_MAX: 30,                 // §2-4 レイ距離の上限 [m]
    CONTENT_MIN: 3,              // §2-4 content はこの距離以上でのヒットを数える [m]
    HEADROOM_CAP: 5,             // ★ 真上レイの正規化上限 [m]
    W_OPEN: 0.35, W_CONTENT: 0.35, W_CENTRALITY: 0.20, W_HEADROOM: 0.10,  // §2-4 重み

    YAW_BINS: 72,                // §2-5 5°刻み
    YAW_FOV_DEG: 60,             // §2-5 水平画角
    YAW_MIN_DIST: 2,             // §2-5 近すぎる点は除外 [m]
    YAW_MAX_DIST: 30,            // §2-5 遠すぎる点は除外 [m]
    YAW_FALLOFF: 10,             // ★ 距離減衰 w = 1/(1+d/FALLOFF)

    CONFIDENCE_THRESHOLD: 70,    // §2-6 これ未満は needsReview
    MAX_CANDIDATES_SCORED: 2000, // ★ 採点する候補数の上限（等間隔で間引く）
    MAX_POINTS_FOR_YAW: 60000,   // ★ yaw 決定に使う点数の上限

    // ★ 偽陽性ガード（設計書 §5「明らかに悪い配置が信頼度70以上で通らないこと」）。
    //   スコアの重み付き和だけだと、壁に近すぎる/虚空を向く候補でも他の指標が
    //   高ければ 70 を超えうるので、上限でクリップする。
    WALL_TOO_CLOSE: 0.8, WALL_PENALTY_CAP: 40,
    CONTENT_TOO_LOW: 0.4, CONTENT_PENALTY_CAP: 50,

    // ★ openness の正規化上限。設計書は「上限30mでクランプ」だが、それを
    //   そのまま 0-1 化すると室内(見通し5-8m)は openness≈0.2 にしかならず、
    //   人手と同等の良い配置でも信頼度が 70 に届かない。シーンの水平サイズの
    //   半分（4〜30mでクランプ）で正規化し、「そのシーンとして見通せているか」
    //   を測る。レイ自体の打ち切りは設計書どおり 30m。
    OPEN_CAP_MIN: 4, OPEN_CAP_MAX: 30,
  };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ── 1. 占有グリッド ───────────────────────────────────────────
  // points: Float32Array(x,y,z,...) / count: 点数
  // 返り値の counts は各ボクセルの点数（0-65535 でクリップ）。occupied() で判定する。
  function buildOccupancy(points, count, opts) {
    opts = opts || {};
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minX)) return null;

    // ★ 上方向の余白。目線高さ(床+1.5m)と headroom レイ(5m)がグリッドの外に
    //   出ると候補ゼロになってしまう（平坦な広場のスキャン＝点群の最高点が
    //   1m しかない、等）。空のボクセルを上へ足しておく。
    maxY += P.EYE_HEIGHT + P.HEADROOM_CAP;

    const extentX = maxX - minX, extentY = maxY - minY, extentZ = maxZ - minZ;
    const horizExtent = Math.max(extentX, extentZ);
    // 広い屋外は 0.5m へ自動緩和（設計書 §2-1）
    let voxel = opts.voxel || (horizExtent > P.LARGE_SCENE_EXTENT ? P.VOXEL_LARGE : P.VOXEL);
    // メモリ保護: ボクセル数が上限を超えるうちは粗くしていく
    for (let guard = 0; guard < 12; guard++) {
      const n = ((extentX / voxel) + 2) * ((extentY / voxel) + 2) * ((extentZ / voxel) + 2);
      if (n <= P.MAX_VOXELS) break;
      voxel *= 1.5;
    }

    const nx = Math.max(1, Math.floor(extentX / voxel) + 1);
    const ny = Math.max(1, Math.floor(extentY / voxel) + 1);
    const nz = Math.max(1, Math.floor(extentZ / voxel) + 1);
    const counts = new Uint16Array(nx * ny * nz);
    for (let i = 0; i < count; i++) {
      const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      const ix = clamp(Math.floor((x - minX) / voxel), 0, nx - 1);
      const iy = clamp(Math.floor((y - minY) / voxel), 0, ny - 1);
      const iz = clamp(Math.floor((z - minZ) / voxel), 0, nz - 1);
      const k = (iy * nz + iz) * nx + ix;
      if (counts[k] < 65535) counts[k]++;
    }
    return {
      voxel, nx, ny, nz, counts,
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      horizExtent,
      minPoints: opts.minPoints != null ? opts.minPoints : P.OCCUPANCY_MIN_POINTS,
    };
  }

  function occupied(g, ix, iy, iz) {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= g.nx || iy >= g.ny || iz >= g.nz) return false;
    return g.counts[(iy * g.nz + iz) * g.nx + ix] >= g.minPoints;
  }

  // ── 2. 床面の検出 ─────────────────────────────────────────────
  // 0.1m 刻みの Y ヒストグラム。累積5パーセンタイル以降・高さレンジ下40%以内の
  // 「密なピーク」のうち最も点数の多いものを床とする（設計書 §2-2 の多層規定）。
  function detectFloor(points, count) {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const y = points[i * 3 + 1];
      if (!isFinite(y)) continue;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (!isFinite(minY)) return null;
    const span = Math.max(maxY - minY, 1e-6);
    const nb = Math.max(1, Math.ceil(span / P.FLOOR_BIN) + 1);
    const hist = new Int32Array(nb);
    let valid = 0;
    for (let i = 0; i < count; i++) {
      const y = points[i * 3 + 1];
      if (!isFinite(y)) continue;
      hist[clamp(Math.floor((y - minY) / P.FLOOR_BIN), 0, nb - 1)]++;
      valid++;
    }
    if (!valid) return null;

    // 累積5パーセンタイル（地下・ノイズを避ける）
    let cum = 0, startBin = 0;
    const need = valid * P.FLOOR_PERCENTILE;
    for (let b = 0; b < nb; b++) { cum += hist[b]; if (cum >= need) { startBin = b; break; } }
    // 探索範囲は高さレンジの下 FLOOR_SEARCH_FRACTION まで（天井を床と誤らないため）
    const endBin = Math.max(startBin, Math.min(nb - 1, Math.floor(nb * P.FLOOR_SEARCH_FRACTION)));

    let globalMax = 0;
    for (let b = startBin; b <= endBin; b++) if (hist[b] > globalMax) globalMax = hist[b];
    if (globalMax <= 0) return { y: minY, confident: false, hist, minY, binSize: P.FLOOR_BIN };

    // 局所ピーク（両隣以上）かつ最大ピークの FLOOR_PEAK_MIN_RATIO 以上を候補に。
    // 候補が複数＝多層構造なので、そのうち最も点数の多い層を採る。
    let bestBin = -1, bestVal = -1, peaks = 0;
    for (let b = startBin; b <= endBin; b++) {
      const v = hist[b];
      if (v < globalMax * P.FLOOR_PEAK_MIN_RATIO) continue;
      const prev = b > 0 ? hist[b - 1] : 0, next = b < nb - 1 ? hist[b + 1] : 0;
      if (v < prev || v < next) continue;
      peaks++;
      if (v > bestVal) { bestVal = v; bestBin = b; }
    }
    if (bestBin < 0) { bestBin = startBin; bestVal = hist[startBin]; }
    return {
      y: minY + bestBin * P.FLOOR_BIN,
      // 「はっきりした床」＝ピークが平均の2倍以上ある（信頼度に効かせる）
      confident: bestVal >= (valid / nb) * 2,
      peakCount: peaks, peakRatio: bestVal / valid,
      minY, maxY, hist, binSize: P.FLOOR_BIN,
    };
  }

  // ── 3. 水平レイ（2D DDA, Amanatides–Woo）────────────────────────
  // 目線スライス(iy固定)上を進み、最初に占有ボクセルへ当たるまでの距離を返す。
  // 当たらなければ maxDist（グリッド外へ出た場合も maxDist 扱い＝「開けている」）。
  function castRay2D(g, iy, ox, oz, dx, dz, maxDist) {
    let ix = clamp(Math.floor((ox - g.min.x) / g.voxel), 0, g.nx - 1);
    let iz = clamp(Math.floor((oz - g.min.z) / g.voxel), 0, g.nz - 1);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const invX = dx !== 0 ? 1 / Math.abs(dx) : Infinity;
    const invZ = dz !== 0 ? 1 / Math.abs(dz) : Infinity;
    const bx = g.min.x + (ix + (dx > 0 ? 1 : 0)) * g.voxel;
    const bz = g.min.z + (iz + (dz > 0 ? 1 : 0)) * g.voxel;
    let tMaxX = dx !== 0 ? Math.abs(bx - ox) * invX : Infinity;
    let tMaxZ = dz !== 0 ? Math.abs(bz - oz) * invZ : Infinity;
    const tDeltaX = g.voxel * invX, tDeltaZ = g.voxel * invZ;
    let t = 0;
    while (t <= maxDist) {
      if (tMaxX < tMaxZ) { ix += stepX; t = tMaxX; tMaxX += tDeltaX; }
      else { iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
      if (ix < 0 || iz < 0 || ix >= g.nx || iz >= g.nz) return maxDist;
      if (t > maxDist) return maxDist;
      if (occupied(g, ix, iy, iz)) return t;
    }
    return maxDist;
  }

  // 真上へのレイ（机の下・棚の中を弾く）
  function castRayUp(g, ix, iy, iz, maxDist) {
    const steps = Math.ceil(maxDist / g.voxel);
    for (let s = 1; s <= steps; s++) {
      const y = iy + s;
      if (y >= g.ny) return maxDist;
      if (occupied(g, ix, y, iz)) return Math.min(maxDist, s * g.voxel);
    }
    return maxDist;
  }

  // ── 4. 候補抽出 ───────────────────────────────────────────────
  // 目線高さのスライスで「非占有 / 水平0.5m以内が空 / 真下1.5m以内に床」。
  function findCandidates(g, eyeY, clearRadius) {
    const iy = Math.floor((eyeY - g.min.y) / g.voxel);
    if (iy < 0 || iy >= g.ny) return { iy, list: [] };
    const r = Math.max(1, Math.ceil((clearRadius != null ? clearRadius : P.CLEAR_RADIUS) / g.voxel));
    const below = Math.max(1, Math.ceil(P.FLOOR_BELOW / g.voxel));
    const list = [];
    for (let iz = 0; iz < g.nz; iz++) {
      for (let ix = 0; ix < g.nx; ix++) {
        if (occupied(g, ix, iy, iz)) continue;
        let clear = true;
        for (let dz = -r; dz <= r && clear; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (occupied(g, ix + dx, iy, iz + dz)) { clear = false; break; }
          }
        }
        if (!clear) continue;
        let hasFloor = false;
        for (let d = 1; d <= below; d++) {
          if (occupied(g, ix, iy - d, iz)) { hasFloor = true; break; }
        }
        if (!hasFloor) continue;
        list.push(ix, iz);
      }
    }
    return { iy, list };
  }

  // ── 5. 採点 ───────────────────────────────────────────────────
  function scoreCandidate(g, iy, ix, iz, ctx) {
    const ox = g.min.x + (ix + 0.5) * g.voxel;
    const oz = g.min.z + (iz + 0.5) * g.voxel;
    let sum = 0, minD = Infinity, contentHits = 0;
    for (let k = 0; k < P.RAYS; k++) {
      const a = (k / P.RAYS) * Math.PI * 2;
      const d = castRay2D(g, iy, ox, oz, Math.sin(a), Math.cos(a), P.RAY_MAX);
      sum += d;
      if (d < minD) minD = d;
      if (d >= P.CONTENT_MIN && d < P.RAY_MAX) contentHits++;
    }
    const meanD = sum / P.RAYS;
    const openness = clamp(meanD / ctx.openCap, 0, 1);
    const content = contentHits / P.RAYS;
    const dc = Math.hypot(ox - ctx.centroidX, oz - ctx.centroidZ);
    const centrality = 1 - clamp(dc / ctx.centralityNorm, 0, 1);
    const upDist = castRayUp(g, ix, iy, iz, P.HEADROOM_CAP);
    const headroom = clamp(upDist / P.HEADROOM_CAP, 0, 1);
    const score = P.W_OPEN * openness + P.W_CONTENT * content +
                  P.W_CENTRALITY * centrality + P.W_HEADROOM * headroom;
    return { ix, iz, x: ox, z: oz, score, openness, content, centrality, headroom, meanD, minD, upDist };
  }

  // ── 6. 向き（yaw）────────────────────────────────────────────
  // 5°刻み72ビン。各点を「その点が入るビン」に距離重みで積み、最後に
  // ±(画角/2) の窓で合計することで「視錐台内の密度」を O(N + bins) で得る。
  // 前方ベクトルは (sin yaw, *, cos yaw)（既存 070_3d.js の規約）。
  function chooseYaw(points, count, camX, camY, camZ) {
    const bins = new Float64Array(P.YAW_BINS);
    const stride = Math.max(1, Math.floor(count / P.MAX_POINTS_FOR_YAW));
    let used = 0;
    for (let i = 0; i < count; i += stride) {
      const dx = points[i * 3] - camX;
      const dy = points[i * 3 + 1] - camY;
      const dz = points[i * 3 + 2] - camZ;
      const d = Math.hypot(dx, dz);
      if (d < P.YAW_MIN_DIST || d > P.YAW_MAX_DIST) continue;
      // 仰角45°を超える点（真上のビル上部・真下の床）は「正面に見えるもの」では
      // ないので数えない。
      if (Math.abs(dy) > d) continue;
      let a = Math.atan2(dx, dz);
      if (a < 0) a += Math.PI * 2;
      const b = Math.floor(a / (Math.PI * 2) * P.YAW_BINS) % P.YAW_BINS;
      bins[b] += 1 / (1 + d / P.YAW_FALLOFF);
      used++;
    }
    const half = Math.round((P.YAW_FOV_DEG / 2) / (360 / P.YAW_BINS));
    let best = 0, bestVal = -1, total = 0;
    for (let b = 0; b < P.YAW_BINS; b++) {
      let s = 0;
      for (let o = -half; o <= half; o++) s += bins[(b + o + P.YAW_BINS) % P.YAW_BINS];
      total += s;
      if (s > bestVal) { bestVal = s; best = b; }
    }
    const mean = total / P.YAW_BINS;
    return {
      yaw: (best + 0.5) * (Math.PI * 2 / P.YAW_BINS),
      // 決定力: 最良ビンが平均の何倍か（1=どこを向いても同じ＝手掛かり無し）
      decisiveness: mean > 0 ? bestVal / mean : 0,
      usedPoints: used,
    };
  }

  // ── 7. 総合 ───────────────────────────────────────────────────
  // points: Float32Array(x,y,z...) / count: 点数
  // 返り値: { failed, position, yaw, pitch, confidence, needsReview, diagnostics }
  function autoPlaceCamera(points, count, opts) {
    opts = opts || {};
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const fail = (reason, extra) => Object.assign({
      failed: true, needsReview: true, confidence: 0, reason,
      position: null, yaw: 0, pitch: 0, diagnostics: { sampleCount: count },
    }, extra || {});

    if (!points || count < 100) return fail('too-few-points');
    const g = buildOccupancy(points, count, opts);
    if (!g) return fail('no-valid-points');
    const floor = detectFloor(points, count);
    if (!floor) return fail('no-floor');

    const eyeY = floor.y + P.EYE_HEIGHT;

    // 候補ゼロなら 1度だけ条件を緩めて再試行（極端に狭い室内・柱だらけの空間）。
    let cand = findCandidates(g, eyeY, P.CLEAR_RADIUS);
    let relaxed = false;
    if (cand.list.length === 0) {
      cand = findCandidates(g, eyeY, g.voxel);   // 水平クリアランスを1ボクセルへ
      relaxed = true;
    }
    if (cand.list.length === 0) {
      return fail('no-candidate', { diagnostics: { sampleCount: count, floorY: floor.y, eyeY, voxel: g.voxel } });
    }

    // 水平重心（centrality 用）
    let cxs = 0, czs = 0;
    for (let i = 0; i < count; i++) { cxs += points[i * 3]; czs += points[i * 3 + 2]; }
    const ctx = {
      centroidX: cxs / count, centroidZ: czs / count,
      centralityNorm: Math.max(g.horizExtent * 0.5, 1),
      openCap: clamp(g.horizExtent * 0.5, P.OPEN_CAP_MIN, P.OPEN_CAP_MAX),
    };

    const nCand = cand.list.length / 2;
    const stride = Math.max(1, Math.ceil(nCand / P.MAX_CANDIDATES_SCORED));
    let best = null;
    for (let i = 0; i < nCand; i += stride) {
      const s = scoreCandidate(g, cand.iy, cand.list[i * 2], cand.list[i * 2 + 1], ctx);
      if (!best || s.score > best.score) best = s;
    }
    if (!best) return fail('no-candidate');

    const yawRes = chooseYaw(points, count, best.x, eyeY, best.z);

    // pitch は 0（水平）が基本。天井が低い / 足元が遠いときだけ微調整（§2-5）。
    let pitch = 0;
    if (best.upDist < 1.0) pitch = -5 * Math.PI / 180;
    // 目線スライスの真下に床がどれだけ離れているか（高所＝下を向かせる）
    let floorDrop = 0;
    for (let d = 1; d <= Math.ceil(P.FLOOR_BELOW / g.voxel); d++) {
      if (occupied(g, best.ix, cand.iy - d, cand.iz)) { floorDrop = d * g.voxel; break; }
    }
    if (floorDrop > 2.5) pitch = -10 * Math.PI / 180;

    // 信頼度（§2-6）。基本はスコアをそのまま 0-100 にし、明らかな失敗パターンは
    // 上限でクリップして 70 を超えさせない。
    let confidence = Math.round(best.score * 100);
    const flags = [];
    if (best.minD < P.WALL_TOO_CLOSE) { confidence = Math.min(confidence, P.WALL_PENALTY_CAP); flags.push('wall-too-close'); }
    if (best.content < P.CONTENT_TOO_LOW) { confidence = Math.min(confidence, P.CONTENT_PENALTY_CAP); flags.push('low-content'); }
    if (!floor.confident) { confidence = Math.min(confidence, 65); flags.push('floor-uncertain'); }
    if (yawRes.decisiveness < 1.15) { confidence = Math.min(confidence, 65); flags.push('yaw-undecided'); }
    if (relaxed) { confidence = Math.min(confidence, 60); flags.push('relaxed-clearance'); }
    confidence = clamp(confidence, 0, 100);

    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return {
      failed: false,
      position: { x: best.x, y: eyeY, z: best.z },
      yaw: yawRes.yaw,
      pitch,
      confidence,
      needsReview: confidence < P.CONFIDENCE_THRESHOLD,
      flags,
      diagnostics: {
        sampleCount: count, voxel: g.voxel, floorY: floor.y, eyeY,
        floorConfident: floor.confident, floorPeaks: floor.peakCount,
        candidateCount: nCand, scoredCount: Math.ceil(nCand / stride), relaxed,
        score: best.score, openness: best.openness, content: best.content,
        centrality: best.centrality, headroom: best.headroom,
        meanRayDist: best.meanD, minRayDist: best.minD, upDist: best.upDist,
        yawDecisiveness: yawRes.decisiveness, floorDrop,
        sceneExtent: g.horizExtent, openCap: ctx.openCap,
        elapsedMs: Math.round(t1 - t0),
      },
    };
  }

  root.LocahunAutoCam = {
    PARAMS: P,
    buildOccupancy, occupied, detectFloor, findCandidates,
    castRay2D, castRayUp, scoreCandidate, chooseYaw, autoPlaceCamera,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
