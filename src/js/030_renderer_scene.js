// ══════════════════════════════════════════════════
//  RENDERER / SCENE
// ══════════════════════════════════════════════════
// Antialiasing is expensive on Mac/iGPU and barely visible on splat scenes (splats already
// have natural edge falloff). Disable AA on heavy displays to claw back FPS.
renderer = new THREE.WebGLRenderer({
  canvas,
  // Disable hardware AA on heavy displays, every touch device, AND Mac.
  // Phones / iPads have very high-DPR panels where MSAA shifts the GPU
  // bottleneck from splat-fill to MSAA-resolve for almost no perceptual
  // benefit. Mac was added in 2026-05 after user testing showed that the
  // MSAA-resolve cost at Retina DPR was a primary source of Chrome's
  // compositor rAF throttle — wall time 120 ms with submit 0.25 ms on a
  // 13 M-splat scene at qualScale 1.0. Splat scenes already have natural
  // edge falloff so the visible quality difference is minimal.
  antialias: !_heavyDisplay && !isMobile && !(typeof _isMac !== 'undefined' && _isMac),
  powerPreference: 'high-performance',
  stencil: false,
  preserveDrawingBuffer: false,
  alpha: false,                    // opaque canvas — no body bleed-through during compositing
  premultipliedAlpha: true,        // matches Three.js default; prevents subpixel halos on splats
  depth: true,
  failIfMajorPerformanceCaveat: false, // allow software fallback gracefully on low-end machines
});
// PR cap per environment. Tier-aware so high-DPR devices don't pay a
// 4–9× pixel cost (DPR squared) for splats they can barely sort in time.
//   phone       (DPR≈3, mobile GPU)        : 1.5
//   tablet/iPad (DPR≈2, Apple A/M-series)  : 1.75
//   Mac         (Retina DPR=2, Chrome      : 1.5  ← Mac-specific cap
//                compositor throttles rAF
//                under heavy WebGL submit;
//                the 5090-class hardware
//                doesn't have this problem
//                because non-Mac Chrome is
//                less aggressive about it)
//   desktop / laptop (non-Mac)             : 2
// Mac at PR 2 with a 13 M-splat scene was 6 fps in user testing — even
// though submit time was 0.25 ms (= GPU idle). The 120 ms wall time was
// pure compositor throttle; reducing the canvas drawing buffer by 44 %
// (PR 1.5 vs PR 2) drops the per-frame composition cost below Chrome's
// rAF-throttle threshold. Visible quality difference is small because
// Retina output at PR 1.5 (= 1.5× native) still oversamples the panel.
const _PR_CAP = (_splatPerfTier === 'phone')  ? 1.5
              : (_splatPerfTier === 'tablet') ? 1.75
              : (typeof _isMac !== 'undefined' && _isMac) ? 1.5
              :                                 2;
// Camera-mode zoom supersampling (user 2026-06-27): when composing a shot at a
// long lens (≥50mm) the narrow FOV magnifies the splats and they look soft. Render
// the canvas at a higher pixel ratio so the framed splats keep detail. 50mm→×1.0,
// scaling with focal, capped at ×1.8 to bound the GPU cost. Reverts below 50mm or
// when the camera tool closes. PR > the normal cap is intentional here (a
// deliberate "compose a still" mode, not the live fly-around).
function _camZoomResBoost(){
  if(!(typeof cam!=='undefined' && cam.active)) return 1;
  const f = (cam.focal || 35);
  if(f < 50) return 1;
  return Math.min(1.8, 1 + (f - 50) / 150);   // 50→1.0, 125→1.5, ≥200→1.8(cap)
}
function _applyRenderPixelRatio(){
  const boost = _camZoomResBoost();
  // Allow the boost to exceed the normal _PR_CAP, but keep an absolute ceiling so
  // a huge DPR × boost can't allocate an enormous buffer.
  const basePR = Math.min(devicePixelRatio, _PR_CAP) * qualScale;
  const pr = Math.min(basePR * boost, (devicePixelRatio || 1) * 2.2);
  renderer.setPixelRatio(pr);
}
renderer.setPixelRatio(Math.min(devicePixelRatio, _PR_CAP) * qualScale);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000); // black — splat sort gaps blend cleanly with dark/night and don't flash gray

scene = new THREE.Scene();

// Spark 2.x requires a SparkRenderer object placed in the scene; it does the
// per-frame splat sort + accumulator work that the older Spark API handled
// inside SplatMesh itself. Without this, SplatMesh instances are present in
// the scene graph but never get drawn (renderer.info.render.calls stays 0
// because Spark's accumulator never executes).
// numLodFetchers: RAD(paged)チャンクの並列フェッチ数。Spark既定は 3 で、
// R2 等の高遅延配信では「視点を向けた先の高LOD化が遅い(>1秒)」の主因だった
// （実測: 120ms/chunk 模擬でフル解像 fetchers3=5.6s → 12=3.0s、本番R2の
//  HTTP/2 多重化では更に効く）。共有 SplatPager に渡り全RADに適用される。
// モバイルは従量/帯域に配慮して控えめ。
const _numLodFetchers = isMobile ? 6 : 12;
const sparkRenderer = new SparkRenderer({ renderer, numLodFetchers: _numLodFetchers });
scene.add(sparkRenderer);

// ── Spark file-type lookup (extension → SplatFileType enum) ──
// Spark 2.0.0 ships with 7 splat file types:
//   PLY / SPZ / SPLAT / KSPLAT / PCSOGS / PCSOGSZIP / RAD
// Confirmed by direct inspection of the published dist module —
// each value is registered both as SplatFileType.<KEY> and via the
// internal extensionToFileType("rad"|"pcsogs"|...) helper.
//
// _splatFileTypeFor(ext) returns the enum value for the given file
// extension, or undefined if Spark doesn't know it. The probe walks
// multiple candidate key names so a future SDK rename doesn't break
// the dispatch silently (we tried RADIANCE / RADIANCE_FIELD before
// the official key turned out to be just "RAD").
const _SPLAT_FILE_TYPE_KEYS = {
  'splat':     ['SPLAT'],
  'ply':       ['PLY'],
  'ksplat':    ['KSPLAT'],
  'spz':       ['SPZ'],
  'sog':       ['SOG','PCSOGS'],          // .sog files use the PCSOGS path
  'pcsogs':    ['PCSOGS'],
  'pcsogszip': ['PCSOGSZIP'],
  'rad':       ['RAD','RADIANCE','RADIANCE_FIELD'],
};
function _splatFileTypeFor(ext){
  if(!ext) return undefined;
  const keys = _SPLAT_FILE_TYPE_KEYS[String(ext).toLowerCase()];
  if(!keys) return undefined;
  for(const k of keys){
    if(SplatFileType && Object.prototype.hasOwnProperty.call(SplatFileType, k)){
      return SplatFileType[k];
    }
  }
  return undefined;
}
// Surface which formats this Spark build understands. Helps debug
// "RAD doesn't load" reports — if RAD isn't logged here, the bundled
// Spark version hasn't shipped it yet.
try {
  const _detected = Object.keys(_SPLAT_FILE_TYPE_KEYS).filter(e => _splatFileTypeFor(e) !== undefined);
  console.info('[Locahun] Spark splat formats available:', _detected.join(', '));
} catch(_){}

// ── RAD JSON-header parser ──────────────────────────────────────────────
// The .rad file is `RAD0IO\0\0` (8 bytes) + JSON header + chunks. The JSON
// header has `{ "version": 1, "type": "gsplat", "count": N, ... }`. We need
// `count` to know when streaming is "done" so the render loop can go idle.
// Spark's WASM decoder gives us the same value via radMetaPromise eventually,
// but parsing it ourselves up-front lets us gate the render loop from frame 1.
function _parseRadHeaderCount(uint8){
  try {
    // Magic check
    if(uint8.length < 64) return 0;
    if(uint8[0]!==0x52||uint8[1]!==0x41||uint8[2]!==0x44||uint8[3]!==0x30) return 0;
    // Brace-match the JSON between bytes 8 and ~1MB
    const limit = Math.min(uint8.length, 1024*1024);
    let depth = 0, inStr = false, esc = false, start = -1, end = -1;
    for(let i = 8; i < limit; i++){
      const c = uint8[i];
      if(esc){ esc = false; continue; }
      if(c === 0x5C){ esc = true; continue; } // backslash
      if(c === 0x22){ inStr = !inStr; continue; } // "
      if(inStr) continue;
      if(c === 0x7B){ if(depth===0) start = i; depth++; continue; } // {
      if(c === 0x7D){ depth--; if(depth===0){ end = i+1; break; } } // }
    }
    if(start < 0 || end < 0) return 0;
    const jsonText = new TextDecoder('utf-8').decode(uint8.subarray(start, end));
    const meta = JSON.parse(jsonText);
    return (meta && typeof meta.count === 'number') ? meta.count : 0;
  } catch(_) {
    return 0;
  }
}

// Debug surface — module-scoped vars exposed on window for in-browser probing.
// Safe to leave on; just lets DevTools / smoke tests inspect engine state.
window.__dbg = { THREE };
Object.defineProperty(window.__dbg, 'scene',     { get: () => scene });
Object.defineProperty(window.__dbg, 'renderer',  { get: () => renderer });
Object.defineProperty(window.__dbg, 'camera',    { get: () => camera });
Object.defineProperty(window.__dbg, 'splatMesh', { get: () => splatMesh });
Object.defineProperty(window.__dbg, 'layers',    { get: () => layers });
Object.defineProperty(window.__dbg, 'camPos',    { get: () => camPos });
Object.defineProperty(window.__dbg, 'yaw',       { get: () => yaw });
Object.defineProperty(window.__dbg, 'pitch',     { get: () => pitch });
// Test hook: write directly to the same yaw target the mouse/pointer-lock
// pipeline uses, so a smoke test can drive a continuous rotation without
// pretending to be a pointer device.
window.__dbg.bumpYaw = (delta) => { _yawTarget += delta; if(typeof markDirty==='function') markDirty(60); };
window.__dbg.setYaw  = (value) => { _yawTarget = value; if(typeof markDirty==='function') markDirty(60); };
// Touch elevation-pad accessors so smoke tests can verify the ▲/▼ button
// state flips and the per-frame fly-camera compositor consumes it.
Object.defineProperty(window.__dbg, 'touchUpHeld', { get: () => touchUpHeld });
Object.defineProperty(window.__dbg, 'touchDnHeld', { get: () => touchDnHeld });
window.__dbg.runFlyCamera = (dt) => updateFlyCamera(dt);
Object.defineProperty(window.__dbg, 'yawTarget',   { get: () => _yawTarget   });
Object.defineProperty(window.__dbg, 'pitchTarget', { get: () => _pitchTarget });
// camAnim getter so headless verification can read the curve + visuals
// state without each test having to expose them per-run. Camera tool's
// internal `camAnim` object isn't on window (it's module-scoped), so
// this is the documented hook for that data.
Object.defineProperty(window.__dbg, 'camAnim', { get: () => (typeof camAnim !== 'undefined') ? camAnim : null });
Object.defineProperty(window.__dbg, 'camAnimSampleAt', { get: () => (typeof _camAnimSampleAt === 'function') ? _camAnimSampleAt : null });
// Dispatcher accessor so headless smoke tests can simulate a user
// drop / file-pick without needing a real DataTransfer object (Chrome
// strips synthetic DataTransfer payloads from dispatched DragEvents).
Object.defineProperty(window.__dbg, 'dispatchFiles', { get: () => (typeof dispatchFiles === 'function') ? dispatchFiles : null });
// __dbg.camPos / yaw / layers / camera / etc are already defined above.
// Additional accessors used by the lock-snap-back smoke test:
Object.defineProperty(window.__dbg, 'selectedLayerId', { get: () => selectedLayerId });
Object.defineProperty(window.__dbg, 'findLayer', { get: () => (typeof findLayer === 'function') ? findLayer : null });
Object.defineProperty(window.__dbg, 'engagedCamId', { get: () => (typeof _engagedCamId !== 'undefined') ? _engagedCamId : 'undef' });
Object.defineProperty(window.__dbg, 'captureHideUI', { get: () => (typeof _captureHideUI !== 'undefined') ? _captureHideUI : 'undef' });
// near=0.3: prevents very-close giant splats from swallowing the entire screen
// (rainbow streak artifact during fast pans in big PortalCam scans).
// 0.3m ≈ arm's length; below that, splats are clipped before they smear.
camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.3, 2000);

