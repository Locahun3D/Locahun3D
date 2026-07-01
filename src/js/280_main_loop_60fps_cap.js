// ══════════════════════════════════════════════════
//  MAIN LOOP  (60fps cap)
// ══════════════════════════════════════════════════
const TARGET_FPS = 60;
const FRAME_MS   = 1000 / TARGET_FPS;
let _lastFrameTime = 0;

// ── Frame time tracking for performance monitor ──
const _FT_WINDOW = 60;
const _ftSamples = [];
let _ftAvg = 0;
// Wall-clock frame-time tracker (separate from _ftAvg which is render-only).
// Under heavy CPU stress, JS work *outside* renderer.render() dominates;
// _ftAvg stays small while wall fps tanks. _wallMsAvg captures the full
// inter-frame interval so the watchdog can detect THAT bottleneck too.
const _wallSamples = [];
let _wallMsAvg = 0;
let _lastRenderInfo = { calls:0, triangles:0, geometries:0, textures:0 };
let _fpsCounts = 0, _fpsElapsed = 0, _fpsDisplay = 0;
let _lastPerfFrameTime = performance.now();

// ── Display refresh-rate detection ──
// The perf monitor must benchmark against the device's ACTUAL display
// refresh, not a hardcoded 60. Apple ProMotion panels (iPhone Pro / iPad
// Pro / MacBook Pro 14·16) run at 120 Hz, so a fixed 60-fps budget made a
// perfectly healthy 120 fps frame (~8.3 ms) look like it overshot the
// "16.7 ms budget" and left only ~50 % headroom — the numbers users on
// Apple hardware rightly called bogus. We sample raw rAF intervals and
// snap the estimate to the nearest standard refresh so the budget tracks
// the real panel.
const _STD_REFRESH = [60, 75, 90, 100, 120, 144, 165, 240];
const _rawDeltas = [];                 // recent raw inter-frame intervals (ms)
let _refreshHz = 60;                    // detected display Hz (default 60)
let _refreshBudgetMs = 1000 / 60;       // one display frame in ms
function _snapRefresh(hz){
  let best = _STD_REFRESH[0], bd = Infinity;
  for(const r of _STD_REFRESH){ const d = Math.abs(r - hz); if(d < bd){ bd = d; best = r; } }
  return best;
}
function _updateRefreshEstimate(){
  if(_rawDeltas.length < 24) return;    // need a meaningful sample first
  const sorted = _rawDeltas.slice().sort((a,b)=>a-b);
  // 10th-percentile interval ≈ the fastest the panel actually refreshes.
  // Using a low percentile (not the mean) ignores slow/heavy frames that
  // would otherwise underestimate Hz when the scene is briefly GPU-bound.
  const p10 = sorted[Math.floor(sorted.length * 0.10)];
  if(!(p10 > 0)) return;
  _refreshHz = _snapRefresh(1000 / p10);
  _refreshBudgetMs = 1000 / _refreshHz;
}

// Whether to cap fps at 60. True on touch hardware (iPad / iPhone /
// Android) where ProMotion 120 Hz panels waste battery + invite thermal
// throttling for no visible benefit on splat scenes. False on desktop:
// 144 / 165 Hz monitors clear the strict FRAME_MS-1 gate unevenly and
// would land at 48 fps, which is worse than uncapped native refresh.
// User request (v0.0.39): hard FPS ceiling of 60 on ALL devices (desktop
// included) — splat scenes gain nothing perceptual above 60 and high-refresh
// monitors just burn power. The old uneven FRAME_MS-1 gate dropped 144 Hz to
// 48 fps; the carry-based due-time gate below averages a true 60 instead.
let _fpsCap = true;
// ── URL override for ProMotion (120 Hz) smoothness testing ──
// The default 60-fps touch cap saves battery/thermal on heavy splat scenes,
// but on a 120 Hz iPhone/iPad Pro it makes LIGHT scenes (and fast pans) feel
// less smooth than the device's native 120 Hz. These flags let us A/B the
// difference on the real device before changing any default:
//   ?fpscap=off | 0   → disable the touch cap entirely (run native refresh)
//   ?fpscap=90 | 120  → cap at a custom fps instead of 60
// Default unchanged (60) when no flag is present.
let _touchFpsTarget = TARGET_FPS;
try {
  const _capParam = new URLSearchParams(location.search).get('fpscap');
  if(_capParam === 'off' || _capParam === '0'){ _fpsCap = false; }
  else if(_capParam && Number(_capParam) > 0){ _touchFpsTarget = Number(_capParam); }
} catch(_){}
const _touchFrameMs = 1000 / _touchFpsTarget;
let _nextFrameDue = 0; // carry-based 60-fps gate target (see animate loop)

