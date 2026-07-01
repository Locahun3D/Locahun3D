// ══════════════════════════════════════════════════
//  CSS REPROJECTION  (input → canvas, runs at 60 Hz)
// ══════════════════════════════════════════════════
// On iPad / iPhone the WebGL animate() loop is rAF-throttled to ~11 Hz
// when scenes get heavy, even though touch events keep firing at 60 Hz.
// Pure JS frame interpolation can't help because rAF is the only animation
// clock the renderer can use. But the *visual feedback* of input can be
// driven from outside rAF: every time a touch / mouse / gyro event nudges
// _yawTarget / _pitchTarget, we apply a CSS translate3d to the canvas
// element so the rendered pixels appear to follow the input immediately.
// When the next WebGL render fires, the new frame contains the updated
// view AND we clear the CSS offset — the two changes cancel exactly so
// there's no visible "snap".
//
// Disabled inside AR mode (V1 or V2) — both AR variants do their own
// canvas compositing and a CSS transform would offset the camera-
// passthrough background incorrectly.
//
// Enabled ONLY on touch devices where rAF gets compositor-throttled
// to ~11 Hz on iPad. On desktop the animate loop already runs at the
// full 60 Hz display refresh, so applying a CSS offset every input
// event and snapping it back every render frame just causes visible
// "wobble" — the user reported this as PC views going ぐわんぐわん
// when panning left-right. Override:
//   ?smooth=1 : force enable (e.g. to test on a touchscreen laptop)
//   ?smooth=0 : force disable
let _reprojectionEnabled = (function(){
  if(/[?&]smooth=1/.test(location.search)) return true;
  // Default OFF everywhere (was: ON for touch devices). The predict-then-snap
  // offset is computed from _yawTarget, but the camera LERPS toward that target
  // over several frames — so the CSS offset overshoots what each render actually
  // shows and is yanked back every render. The user sees this as the whole view
  // juddering intermittently ("枠全体がガクっと断続的に動く" on iPhone), the same
  // ぐわんぐわん that already got it disabled on desktop. It only ever helped when
  // rAF was throttled to ~11 Hz on heavy iPad scenes; the wobble cost outweighs
  // that, so it's now opt-in via ?smooth=1.
  return false;
})();
let _lastRenderYaw   = 0;
let _lastRenderPitch = 0;
function _applyCanvasReprojection(){
  if(!_reprojectionEnabled) return;
  if(typeof arMode !== 'undefined' && arMode && arMode.active) return;
  // Camera tool: the scene is scissored into a FIXED safe-frame (black
  // letterbox outside + a DOM border overlay drawn as composition guide).
  // A whole-canvas translate would shift the rendered region AND the letterbox
  // but NOT the fixed frame border, so the frame edge appears to slide and then
  // snap back every render — the user-reported "フレームの端が移動してがくがく".
  // While framing, keep the frame rock-steady: skip reprojection and clear any
  // offset already applied (e.g. tool activated mid-drag).
  if(typeof cam !== 'undefined' && cam && cam.active){ _clearCanvasReprojection(); return; }
  if(!canvas || !camera) return;
  // FOV (radians) — vertical from camera.fov, horizontal derived via aspect
  const fovV = camera.fov * Math.PI / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV * 0.5) * (camera.aspect || (innerWidth / Math.max(1, innerHeight))));
  const dY = _yawTarget   - _lastRenderYaw;   // radians
  const dP = _pitchTarget - _lastRenderPitch; // radians
  // Pixel offset: a yaw delta of one FOV would shift the canvas one
  // viewport width; we scale linearly for small deltas (the small-angle
  // approximation is the dominant error term but is sub-perceptual under
  // typical drag distances).
  let pxX = (dY / fovH) * innerWidth;
  let pxY = (dP / fovV) * innerHeight;
  // Hard-clip the offset so a huge fling doesn't translate the canvas
  // off-screen (which looks worse than the original choppiness).
  const limX = innerWidth  * 0.5;
  const limY = innerHeight * 0.5;
  if(pxX >  limX) pxX =  limX; else if(pxX < -limX) pxX = -limX;
  if(pxY >  limY) pxY =  limY; else if(pxY < -limY) pxY = -limY;
  // translate3d forces the compositor to put the canvas on its own layer
  // (hardware-accelerated), which is what lets the offset update at 60 Hz
  // independent of the rAF-throttled animate loop.
  canvas.style.transform = 'translate3d(' + pxX.toFixed(2) + 'px,' + pxY.toFixed(2) + 'px,0)';
}
function _clearCanvasReprojection(){
  if(!canvas) return;
  if(canvas.style.transform) canvas.style.transform = '';
}
// Expose for the input handlers (touchmove / mousemove / joystick / gyro)
// to call after they nudge _yawTarget / _pitchTarget. Idempotent — safe to
// call from any event handler.
window._applyCanvasReprojection = _applyCanvasReprojection;

// ── On-demand rendering ──
// _renderDirtyTimer: render N more frames after any scene/state change.
// _splatActiveUntil: force continuous render during Spark 3DGS async loading/sorting.
let _renderDirtyTimer = 4;
let _splatActiveUntil = 0;
// Throttle state for explicit Spark sm.update(camera) sort hints — see the
// motion block in animate() for why this is throttled rather than per-frame.
let _lastSortAt = 0, _lastSortYaw = 0, _lastSortPitch = 0;
// (Adaptive low-res mode removed by request — render always at full pixel ratio)
let _lowResActive = false; // kept as constant-false for any external readers
// Tab/context state: skip animate() loop entirely when hidden or context lost
let _tabHidden = false;
let _ctxLost = false;
function markDirty(frames=6){
  _renderDirtyTimer = Math.max(_renderDirtyTimer, frames);
}

// ── Deferred pixel-ratio application ──
// Calling renderer.setPixelRatio() reallocates the WebGL drawing buffer, which
// causes a visible 1-frame flash + a sudden lower-resolution version of the
// splat to appear (the user-reported "low-res model swapped in" + "flicker").
// We queue any mid-session quality changes here and apply them only when the
// camera is fully idle for ~600ms — so the swap happens between user actions,
// not during them. The initial setPixelRatio at startup is unaffected.
let _pendingPixelRatio = null;
let _pendingPRStableSince = 0;
function _queuePixelRatio(pr){
  if(typeof pr !== 'number' || !isFinite(pr) || pr <= 0) return;
  // No-op if already at this ratio
  try { if(Math.abs(renderer.getPixelRatio() - pr) < 1e-3){ _pendingPixelRatio=null; return; } } catch(_){}
  _pendingPixelRatio = pr;
  _pendingPRStableSince = 0;
}
function _applyDeferredPixelRatio(now){
  if(_pendingPixelRatio == null) return;
  // Defer while any input/motion is in flight
  const moving = dragOn || (typeof joyDX!=='undefined' && (joyDX!==0||joyDY!==0)) ||
                 (keys.KeyW||keys.KeyS||keys.KeyA||keys.KeyD||keys.KeyQ||keys.KeyE||keys.ShiftLeft||keys.ShiftRight) ||
                 Math.abs(_yawTarget - yaw) > 1e-3 || Math.abs(_pitchTarget - pitch) > 1e-3 ||
                 (now < _splatActiveUntil);
  if(moving){ _pendingPRStableSince = 0; return; }
  if(_pendingPRStableSince === 0){ _pendingPRStableSince = now; return; }
  if(now - _pendingPRStableSince < 600) return;
  try {
    renderer.setPixelRatio(_pendingPixelRatio);
    markDirty(4);
  } catch(_){}
  _pendingPixelRatio = null;
  _pendingPRStableSince = 0;
}

// ── WebGL context loss recovery ──
// Safari/macOS occasionally drops the GPU context (system memory pressure, sleep, GPU
// process restart). Without handling, the canvas freezes black. We catch the loss,
// pause the render loop, and prompt the user to reload when context is restored.
canvas.addEventListener('webglcontextlost', (ev)=>{
  ev.preventDefault();
  _ctxLost = true;
  console.warn('[Locahun] WebGL context lost — pausing render');
}, false);
canvas.addEventListener('webglcontextrestored', ()=>{
  _ctxLost = false;
  console.info('[Locahun] WebGL context restored');
  // Three.js scene resources are now invalid; the cleanest recovery is a full reload.
  // Defer 200 ms so user sees the message in the toast/console before page reloads.
  if(typeof showUndoToast === 'function'){
    try { showUndoToast('GPU コンテキスト復帰のためページをリロードします…'); } catch(_){}
  }
  setTimeout(()=>location.reload(), 800);
}, false);

// ── Tab visibility: pause render loop when hidden (saves battery on Mac laptops) ──
document.addEventListener('visibilitychange', ()=>{
  _tabHidden = document.hidden;
  if(!_tabHidden){
    // Tab is back → request a few frames so the screen catches up
    markDirty(6);
    if(typeof bumpSplatActive === 'function' && typeof layers !== 'undefined'
       && layers.some(L=>L && L.type==='splat')) bumpSplatActive(1500);
  }
}, false);

