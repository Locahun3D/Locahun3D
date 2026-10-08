// ══════════════════════════════════════════════════
//  SPLAT PERF TIER (drives Spark splat tuning + renderer caps)
// ══════════════════════════════════════════════════
// Two tiers only now: phone/tablet (touch devices) vs desktop (everything
// else). Laptop sub-variants were collapsed into desktop in 2026-05 — the
// previous tier-based splat tuning (maxStdDev/apparentRadius/opacityThreshold)
// is dead code in Spark 2.0.0 anyway (see NOTE below), and the continuous
// watchdog defends fps via pixel-ratio downsteps. Keeping fewer tiers means
// laptops get the full desktop experience: MSAA, full-res shadows, PR cap 2.
const _shortEdge = Math.min(innerWidth, innerHeight);
const _splatPerfTier = (function(){
  if(isMobile){
    return _shortEdge < 700 ? 'phone' : 'tablet';
  }
  return 'desktop';
})();
const _SPLAT_TIERS = {
  // maxStdDev      — Gaussian tail clipping (smaller = smaller quad per splat)
  // apparentRadius — hard upper bound on screen-space splat radius
  // opacityThreshold — α floor below which fragments are discarded
  // sortIntervalMs — minimum ms between splat sorts (0 = every frame)
  phone:       { maxStdDev: 1.3, apparentRadius: 1.0,  opacityThreshold: 16/255, sortIntervalMs: 33 },
  tablet:      { maxStdDev: 1.4, apparentRadius: 1.1,  opacityThreshold: 12/255, sortIntervalMs: 16 },
  laptop_weak: { maxStdDev: 1.4, apparentRadius: 1.1,  opacityThreshold: 12/255, sortIntervalMs: 16 },
  laptop_ok:   { maxStdDev: 1.5, apparentRadius: 1.15, opacityThreshold:  8/255, sortIntervalMs:  0 },
  desktop:     { maxStdDev: 1.6, apparentRadius: 1.2,  opacityThreshold:  6/255, sortIntervalMs:  0 },
};
// NOTE (2026-05): Probing live SplatMesh objects under Spark 2.0.0 confirmed
// that `maxStdDev`, `apparentRadius`, and `opacityThreshold` do NOT exist as
// either instance properties or material.uniforms entries — Spark 2.x drives
// shading via its own `dyno` graph (dynoNumSh, dynoShMax, showLodPageDyno).
// The `tuneSplatMesh()` assignments below are kept as forward-compat
// belt-and-braces for future Spark versions, but they are currently silent
// no-ops. Splat softness on thin/distant features (wires, hedges, far
// buildings) is therefore intrinsic to Spark's WASM rasterizer and the PLY
// data; it is NOT something this code can tune from JS in 2.0.0.
const _SPLAT_PARAMS = _SPLAT_TIERS[_splatPerfTier] || _SPLAT_TIERS.laptop_ok;
console.info('[Locahun][PerfTier]', _splatPerfTier, _SPLAT_PARAMS);
// 標準の画角（2026-10-08 本人指示「デフォルトの画角をもっと大きめに」）。縦 90° は横長の画面では十分広いが、
// 縦長（スマホ縦・iPad 縦）だと横が 55〜75° まで狭くなる。横の画角が 90° に満たない画面では縦を広げる（上限 110°）。
// 利用者が FOV を変えたら（fov !== _autoFov）以後は触らない。
function _autoFovFor(aspect){
  const v=2*Math.atan(1/Math.max(.2,aspect||1))*180/Math.PI;
  return Math.round(Math.min(110,Math.max(90,v)));
}
let fov = _autoFovFor(innerWidth/Math.max(1,innerHeight));
let _autoFov = fov;
// Touch devices (iPad / iPhone) felt too fast at the desktop default of 5
// — the virtual joystick + touch-look make a given camSpeed cover more
// ground per gesture than keyboard WASD, and at full joystick deflection
// the sprint multiplier (×5) compounds it. Seed a gentler 3 on touch so
// the scene is comfortable to explore out of the box; the slider (0.5–20)
// still lets users dial it up.
let camSpeed = 2; // 2026-09-26 本人指示: 既定の移動速度は 2（09-23 は 1、2026-09-20 は 3、それ以前は PC=5）

const clock = new THREE.Clock();
