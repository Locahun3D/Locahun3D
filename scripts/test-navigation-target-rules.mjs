// 2026-09-21: 2026-09-20 に入れた3つの純ロジックを固定する。
//  ① 移動先の玉の半径（見かけ px 一定・軸外れで太らない・下限 0.02m）
//  ② 見えている 3DGS 面が判定の当たり位置よりはっきり手前なら行き先を拒む
//  ③ 自由カメラの当たり球 _FREE_CAMERA_RADIUS=0.06m が moveCamera に渡る
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';

const read = name => fs.readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');

// ---- ① 玉の半径 -------------------------------------------------------------
const preview = read('405_navigation_target_preview.js');
const sizing = preview.slice(0, preview.indexOf('function _showNavigationPoint'));
assert.ok(sizing.includes('function _navigationPointRadius'), 'radius helper moved');

// 2026-09-20 以前の式（画面上 6px 固定・カメラからの直線距離・下限 0.04m）。
const legacyRadius = (distance, fov, clientHeight) =>
  Math.max(.04, distance * 2 * Math.tan(fov * Math.PI / 360) * 6 / Math.max(1, clientHeight));

function sizer({ width = 1440, height = 900, fov = 90 } = {}) {
  const context = vm.createContext({
    THREE: { Vector3: THREE.Vector3 }, Math, console,
    canvas: { clientWidth: width, clientHeight: height },
    camera: { fov, position: new THREE.Vector3(0, 0, 0), getWorldDirection(v) { return v.set(0, 0, -1); } },
  });
  vm.runInContext(sizing, context);
  const focal = (height / 2) / Math.tan(fov * Math.PI / 360);
  // 視線軸から angle 度ずれた、カメラから distance の点。
  const at = (distance, angle = 0) => {
    const t = angle * Math.PI / 180;
    return new THREE.Vector3(Math.sin(t) * distance, 0, -Math.cos(t) * distance);
  };
  return { focal, at, size: (distance, angle) => context._navigationPointRadius(at(distance, angle)) };
}

test('on-axis the ball keeps the old constant-pixel size exactly', () => {
  const f = sizer(); // 1440x900 なので狙い px は上限の 6 で、旧式と同じ条件
  // 3m 未満は旧式の下限 0.04m に当たる領域なので、素の式が出る 3m 以上で比べる。
  for (const distance of [3, 5, 10, 30]) {
    const { radius, px } = f.size(distance);
    assert.ok(Math.abs(radius - legacyRadius(distance, 90, 900)) < 1e-9, distance + 'm: ' + radius);
    assert.ok(Math.abs(px - 6) < .01, distance + 'm: ' + px);
  }
});

test('off-axis the ball no longer grows: same screen pixels at any angle', () => {
  const f = sizer(), distance = 6, onAxis = f.size(distance).radius;
  let previous = onAxis;
  for (const angle of [20, 40, 60]) {
    const { radius, px } = f.size(distance, angle);
    assert.ok(Math.abs(px - 6) < .01, angle + '°: ' + px);
    assert.ok(radius < previous, angle + '° must shrink, not grow');
    previous = radius;
    // 旧式は同じ半径のまま画面端へ行くので 1/cos²θ 倍に見えていた（60° で 4 倍 = 24px）。
    const legacyPx = 6 / Math.cos(angle * Math.PI / 180) ** 2;
    assert.ok(legacyPx > 6.7, angle + '°: legacy ' + legacyPx);
  }
  assert.ok(Math.abs(f.size(distance, 60).radius - onAxis * .25) < 1e-9, '半径は cos²θ で縮む');
});

test('the radius floor is 0.02 m, half of the old 0.04 m', () => {
  const f = sizer();
  for (const distance of [.3, .6, 1]) {
    const { radius } = f.size(distance);
    assert.ok(radius >= .02, distance + 'm: ' + radius);
    assert.ok(radius <= legacyRadius(distance, 90, 900), distance + 'm must not exceed the old size');
  }
  assert.equal(f.size(.3).radius, .02, '至近では下限がそのまま出る');
  assert.equal(legacyRadius(.3, 90, 900), .04, '旧式の下限は 0.04m だった');
});

test('the pixel target is clamp(min(w,h)*0.012, 4, 6)', () => {
  for (const [width, height, expected] of [[1440, 900, 6], [1024, 768, 6], [390, 844, 390 * .012], [200, 200, 4]]) {
    const { px } = sizer({ width, height }).size(6);
    assert.ok(Math.abs(px - expected) < .01, width + 'x' + height + ': ' + px);
  }
});

// ---- ② 見えている面より奥の当たり位置は行き先にしない ------------------------
function navigator_({ visible, solid, prepared = null, hasPick = true }) {
  const camera = new THREE.PerspectiveCamera(90, 1440 / 900, .1, 1000);
  camera.position.set(0, 1.6, 0); camera.lookAt(0, 1.6, -1); camera.updateMatrixWorld(true);
  const calls = [];
  const context = vm.createContext({
    console, Math, Number, Array, JSON, THREE, performance: { now: () => 1000 },
    setTimeout: fn => { calls.push(fn); return 1; }, clearTimeout() {},
    window: { addEventListener() {} }, document: { getElementById: () => null },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900, right: 1440, bottom: 900 }) },
    camera, _useOrtho: false, camPos: Object.assign(new THREE.Vector3(0, 1.6, 0), { set: THREE.Vector3.prototype.set }),
    msr: { active: false, placeDepth: 7 }, markDirty() {},
    walkSetup: { core: { raycastSurface: () => (solid ? { point: solid, normal: { x: 0, y: 1, z: 0 } } : null) },
      settings: { signature: 'sig' }, epoch: 1, importPending: false, wholeIndex: null },
    _walkSourceSignature: () => 'sig',
  });
  if (hasPick) context.pickWorldPos = () => visible;
  vm.runInContext(read('404_click_navigation.js'), context);
  return { context, run: p => context._clickNavigateAt(720, 450, p, prepared) };
}

const FAR_FLOOR = { x: 0, y: 0, z: -8 };

test('a visible surface well in front of the collision hit refuses the destination', () => {
  // 窓や薄い壁は判定形状に穴が空きうる。見えている壁 (3m) の向こうの地面 (8m) は行き先にしない。
  const f = navigator_({ visible: { x: 0, y: 1.2, z: -3 }, solid: FAR_FLOOR });
  const shown = f.run(true);
  // vm 側で作られたオブジェクトなので prototype 比較を避けて中身で見る。
  assert.equal(JSON.stringify(shown), JSON.stringify({ point: { x: 0, y: 1.2, z: -3 }, valid: false }), '玉は見えている面の上に赤で出る');
  assert.equal(navigator_({ visible: { x: 0, y: 1.2, z: -3 }, solid: FAR_FLOOR }).run(false), false, '実移動は始まらない');
});

test('a floor seen through a doorway still travels: both hits agree', () => {
  const f = navigator_({ visible: { x: 0, y: 0, z: -7.9 }, solid: FAR_FLOOR });
  const shown = f.run(true);
  assert.equal(JSON.stringify(shown.point), JSON.stringify(FAR_FLOOR));
  assert.equal(shown.valid, true);
});

test('the refusal needs a clear 0.75 m gap, and never applies to a prepared hit', () => {
  // 目線の高さ (y=1.6) に並べて、カメラからの距離差をそのまま z 差にする。
  const level = { x: 0, y: 1.6, z: -8 };
  const near = { x: 0, y: 1.6, z: -7.3 }; // 0.70m 手前
  assert.equal(navigator_({ visible: near, solid: level }).run(true).valid, true, '0.75m 以内の差は通す');
  const far = { x: 0, y: 1.6, z: -7.2 }; // 0.80m 手前
  assert.equal(navigator_({ visible: far, solid: level }).run(true).valid, false, '0.75m を超えたら拒む');
  assert.equal(navigator_({ visible: far, solid: level,
    prepared: { point: level, normal: { x: 0, y: 1, z: 0 } } }).run(true).valid, true, '経路側が用意した当たりは対象外');
  assert.equal(navigator_({ visible: null, solid: level, hasPick: false }).run(true).valid, true, 'pickWorldPos が無い構成では効かない');
});

// ---- ③ 自由カメラの当たり球 --------------------------------------------------
test('free camera collision sweeps with the 6 cm sphere, not the walking radius', () => {
  const bridge = read('217_walk_collision_bridge.js');
  const source = bridge.slice(bridge.indexOf('const _FREE_CAMERA_RADIUS'), bridge.indexOf('function _walkCameraCollision'));
  const seen = [];
  const context = vm.createContext({
    console, Math, camPos: { x: 1, y: 1.6, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    cameraCollisionEnabled: true, layers: [{ id: 1, type: 'splat', visible: true, mesh: {} }],
    walkSetup: { settings: { signature: 'sig', meshIds: [] }, importPending: false, pending: false, wholeIndex: null,
      core: { moveCamera(start, delta, radius) { seen.push(radius); return { x: .5, y: 1.6, z: 0 }; } } },
    _walkSourceSignature: () => 'sig', _walkNeedsRegion: () => false,
    _walkUpdateCameraReadiness() {}, _walkGenerateCollision() {}, _walkWholeCoverage: () => true,
  });
  // const はコンテキストのプロパティにならないので、明示的に取り出す。
  vm.runInContext(source + '\nglobalThis.__freeCameraRadius=_FREE_CAMERA_RADIUS;', context);
  assert.equal(context.__freeCameraRadius, .06);
  context._applyFreeCameraCollision({ x: 0, y: 1.6, z: 0 });
  assert.deepEqual(seen, [.06], 'moveCamera へ 6cm が渡る（既定の 15cm では廊下に入れない）');
  assert.deepEqual([context.camPos.x, context.camPos.y, context.camPos.z], [.5, 1.6, 0]);
});
