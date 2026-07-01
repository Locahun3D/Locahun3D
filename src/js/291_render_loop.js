// ── Battery-aware quality (Mac laptops, when running unplugged + low battery) ──
// One-shot reduction: if battery falls under 25 % and not charging, drop qualScale
// to 0.7 (unless user already manually set quality). Logs to console for transparency.
if(typeof navigator.getBattery === 'function'){
  navigator.getBattery().then(bat => {
    function _checkBattery(){
      if(window._gpuWatchdog && window._gpuWatchdog.manualOverride) return;
      if(!bat.charging && bat.level < 0.25 && qualScale > 0.7){
        qualScale = 0.7;
        // Defer the actual setPixelRatio swap to an idle window — applying it
        // mid-interaction would cause a visible flash + low-res frame.
        _queuePixelRatio(Math.min(devicePixelRatio, _PR_CAP) * qualScale);
        console.info('[Locahun] Battery low (' + Math.round(bat.level*100) + '%) — quality queued at 0.7 (apply on idle)');
      }
    }
    bat.addEventListener('chargingchange', _checkBattery);
    bat.addEventListener('levelchange',    _checkBattery);
    _checkBattery();
  }).catch(()=>{});
}
// Keep Spark's async sort/streaming active for `ms` more milliseconds. Call this on
// camera-pan input so the splat sort keeps running and edges don't stay black after a fast turn.
// Default bumped from 2000 → 3000 ms so post-pan sort consistently completes.
function bumpSplatActive(ms=3000){
  const t = performance.now() + ms;
  if(t > _splatActiveUntil) _splatActiveUntil = t;
}
// Window length for the post-load + post-interaction "splat active"
// continuous-render mode. On Mac this is cut roughly in half — Chrome's
// compositor on Mac throttles rAF more aggressively when the renderer
// stays in continuous-submit mode for long stretches, so a shorter
// active window lets rAF settle back to vsync sooner after the user
// stops interacting. Everywhere else stays at the standard 4 s.
const _SPLAT_ACTIVE_MS = (typeof _isMac !== 'undefined' && _isMac) ? 1800 : 4000;

// Headless/automated mode (?headless=1): drive the loop with setTimeout — which,
// unlike requestAnimationFrame, keeps firing in a BACKGROUNDED tab — and ignore
// the tab-hidden gate. This lets an automated/offscreen browser load the streamed
// (RAD-paged) demo scene and render+capture it for WYSIWYG verification, which is
// otherwise impossible because a background tab pauses rAF so Spark's LoD walker
// never ticks and the splats never finish streaming. Zero effect for normal users
// (flag is off unless explicitly present in the URL).
const _headless = /[?&]headless=1/.test(location.search);
const _protected = /[?&]protected=1/.test(location.search);
if(_protected){
  document.body.classList.add('protected-mode');
}
function animate(now) {
  if(_headless) setTimeout(()=>animate(performance.now()), 16);
  else          requestAnimationFrame(animate);
  // Hard gates: GPU context lost or tab hidden → don't render, don't compute.
  // Headless mode bypasses the hidden gate so streaming/rendering keep running.
  if(_ctxLost || (_tabHidden && !_headless)) return;
  // パス編集ハンドルは「選択中のパス」だけに表示。選択が外れた/削除されたら消す。
  if(_pathEditId!=null){
    const _pl=findLayer(_pathEditId);
    const _sel=_pl && ((selectedLayerId===_pathEditId) || (window.selectedLayerIds && window.selectedLayerIds.has(_pathEditId)));
    if(!_sel) _pathClearHandles();
  }
  // ── 60 fps soft cap on TOUCH devices only ──
  // iPad Pro (120 Hz ProMotion) and 120 Hz iPhones used to render at the
  // panel's native refresh, which on heavy splat scenes doubles GPU work
  // for negligible perceptual gain (splat motion blur is intrinsic to the
  // rasterisation; extra frames don't sharpen it) AND speeds up thermal
  // throttling on phones. Capping rAF to 60 Hz keeps the experience
  // responsive without overworking the device.
  //
  // On DESKTOP the cap is intentionally OFF: a strict FRAME_MS gate on
  // 144 Hz / 165 Hz displays ends up dropping below 60 fps because the
  // rAF tick interval (6-7 ms) divides into 16.67 ms unevenly — you have
  // to skip 2-3 rAFs to clear the gate, landing at ~48 fps. Better to
  // let desktop run free at its native refresh; the GPU on those rigs is
  // never the limiting factor on a single-splat scene.
  // Carry-based 60-fps cap (all devices). Advance the due time by exactly one
  // frame each render so high-refresh monitors average a true 60 fps instead
  // of the 48 fps the old fixed FRAME_MS-1 gate produced on 144/165 Hz.
  if(_fpsCap){
    if(now < _nextFrameDue) return;
    _nextFrameDue += _touchFrameMs;
    if(_nextFrameDue < now) _nextFrameDue = now + _touchFrameMs; // resync after a stall
  }
  const elapsed = now - _lastFrameTime;
  _lastFrameTime = now;

  // ── Wall-clock FPS (always tracked) ──
  const wallDelta = now - _lastPerfFrameTime;
  _lastPerfFrameTime = now;

  const dt = Math.min(clock.getDelta(), 0.05);

  // ── Conditions that require continuous rendering ──
  const hasCamKey = keys.KeyW||keys.KeyS||keys.KeyA||keys.KeyD||
                    keys.KeyQ||keys.KeyE||keys.KeyR||keys.KeyF||
                    keys.KeyT||keys.KeyG||
                    keys.ArrowUp||keys.ArrowDown||keys.ArrowLeft||keys.ArrowRight||
                    keys.ShiftLeft||keys.ShiftRight||
                    touchUpHeld||touchDnHeld;
  const hasDrag      = dragOn || !!lpv.dragging;
  const hasJoy       = joyDX!==0 || joyDY!==0;
  const hasMsrInteract = !!(msr.dragging||msr.axisDragging||msr.rightHold);
  const splatStreaming  = now < _splatActiveUntil;
  // Gamepad poll: cheap activity check for ANY non-zero stick or trigger.
  // Gated on _gpEverConnected — a one-shot flag the 'gamepadconnected'
  // event listener sets when a controller is first seen. Users without
  // a gamepad never run the poll, saving navigator.getGamepads()
  // (browser-internal cost) every frame.
  let hasGamepad = false;
  if(window._gpEverConnected && typeof navigator.getGamepads === 'function'){
    const pads = navigator.getGamepads();
    if(pads){
      for(let i=0;i<pads.length;i++){
        const p = pads[i];
        if(!p || !p.connected) continue;
        const ax = p.axes || [];
        if(Math.abs(ax[0]||0) > _GP_DEADZONE){ hasGamepad = true; break; }
        if(Math.abs(ax[1]||0) > _GP_DEADZONE){ hasGamepad = true; break; }
        if(Math.abs(ax[2]||0) > _GP_DEADZONE){ hasGamepad = true; break; }
        if(Math.abs(ax[3]||0) > _GP_DEADZONE){ hasGamepad = true; break; }
        if((p.buttons[6] && p.buttons[6].value) > _GP_DEADZONE){ hasGamepad = true; break; }
        if((p.buttons[7] && p.buttons[7].value) > _GP_DEADZONE){ hasGamepad = true; break; }
        if(p.buttons[0] && p.buttons[0].pressed){ hasGamepad = true; break; }
      }
    }
  }

  // .RAD streaming guard: when a paged SplatMesh is present we MUST keep
  // rendering. SparkRenderer's LoD walker runs inside renderer.render();
  // without it being ticked, fetched chunks pile up in pager.lodTreeUpdates
  // but never get consumed → record.rootPage is never set → next traversal
  // can't request more chunks → the scene shows zero splats forever.
  //
  // We keep rendering as long as the paged splat hasn't reached its target
  // splat count (`_radTargetCount`, stashed on the mesh at construction
  // time from the RAD JSON header). After it does, we stop the continuous
  // tick so the page goes idle; camera motion will wake it back up via
  // the regular shouldRender path.
  let hasPagedLoading = false;
  if(typeof layers !== 'undefined' && layers && layers.length){
    for(let i=0;i<layers.length;i++){
      const _L = layers[i];
      const _mesh = _L && _L.mesh;
      const _pm = _mesh && _mesh.paged;
      if(!_pm) continue;
      const _target = _mesh._radTargetCount || 0;
      if(_target === 0 || (_pm.numSplats||0) < _target){
        hasPagedLoading = true;
        break;
      }
    }
  }

  const shouldRender = hasCamKey||hasDrag||hasJoy||hasMsrInteract||hasGamepad||
                       splatStreaming||_renderDirtyTimer>0||hasPagedLoading;

  // ── Edge vignette during camera motion ──
  // Adaptive low-res mode is intentionally NOT used (caused visible flicker
  // on stop). Instead, a feathered black rim (defined in the #motion-vignette
  // CSS rule) fades in during motion to mask Spark's async sort-lag at the
  // newly-revealed frustum edges. The on/off toggle previously flashed
  // because the opacity flipped instantly; the .28s CSS transition on
  // #motion-vignette now smooths both directions so the user sees only a
  // gentle darkening of the absolute outer rim, not a flash.
  const motion = hasCamKey || dragOn || hasJoy ||
                 Math.abs(_yawTarget - yaw) > 1e-3 || Math.abs(_pitchTarget - pitch) > 1e-3;
  const _vig = document.getElementById('motion-vignette');
  if (_vig){
    const want = motion ? '1' : '0';
    if (_vig.style.opacity !== want) _vig.style.opacity = want;
  }

  // ── FPS display ──
  // The legacy top-left #fps span was removed; the live FPS now lives in
  // #qib-fps (updated by updatePerfStats). We still track fpsN/fpsT so
  // _fpsDisplay stays correct, but skip DOM writes when #fps is absent.
  if(shouldRender){
    _fpsCounts++; _fpsElapsed+=wallDelta;
    // Rolling 500 ms window so the displayed FPS reflects CURRENT performance.
    // The old code only reset these counters when the loop went idle, so during
    // a long continuous-render session _fpsDisplay became a cumulative average
    // over minutes that drifted and lagged reality — the "perf monitor numbers
    // are wrong" report. Recompute + reset every ~500 ms instead.
    if(_fpsElapsed>=500){
      _fpsDisplay = Math.round(_fpsCounts/_fpsElapsed*1000);
      _fpsCounts=0; _fpsElapsed=0;
    }
    fpsN++; fpsT+=dt;
    if(fpsT>=0.5){
      const _fpsEl = document.getElementById('fps');
      if(_fpsEl) _fpsEl.textContent = Math.round(fpsN/fpsT);
      fpsN=0; fpsT=0;
    }
  } else {
    // Idle — clear stale fps
    if(_fpsElapsed>=500){
      const _fpsEl = document.getElementById('fps');
      if(_fpsEl) _fpsEl.textContent = '—';
      fpsN=0;fpsT=0;_fpsCounts=0;_fpsElapsed=0;
    } else {
      _fpsElapsed+=wallDelta;
    }
    return; // ← skip all rendering when nothing has changed
  }

  if(_renderDirtyTimer>0) _renderDirtyTimer--;

  // Lerp displayed yaw/pitch toward target with frame-rate-independent rate.
  // Coefficient kept at 60 (~63 %/frame catchup) for responsive feel — the
  // actual cause of the long black-edge stalls turned out to be a GPU
  // readback in the minimap path (now deferred during motion), not the
  // lerp speed. Slowing the lerp also makes the camera feel sluggish, which
  // is exactly what the user noticed.
  {
    const k = 1 - Math.exp(-60 * dt);
    const dy = _yawTarget - yaw;
    const dp = _pitchTarget - pitch;
    if (Math.abs(dy) > 1e-5 || Math.abs(dp) > 1e-5) {
      yaw   += dy * k;
      pitch += dp * k;
      markDirty(2);
      // Short tail (300 ms) — Spark's sort worker re-converges within a few
      // frames after the lerp settles. The previous 1000 ms tail kept
      // renderer.render() submitting for 700 ms after the user stopped
      // moving, which on Chrome held the compositor in throttled-rAF mode
      // (~45 fps) far longer than necessary. 300 ms is the empirical
      // shortest window that still hides Spark's edge sort-lag.
      if(layers.some(L=>L.type==='splat')) bumpSplatActive(300);
    } else {
      yaw   = _yawTarget;
      pitch = _pitchTarget;
    }
  }

  updateCamera();
  updateFlyCamera(dt);
  // Camera-layer LOCK snap-back. Engaged ONLY via the 🎬 button or by
  // (re-)locking a camera — NEVER by merely selecting a camera row (that
  // used to teleport unexpectedly). When _engagedCamId points at a still-
  // locked camera and we're NOT mid cam-anim preview / record (which
  // legitimately drives camPos itself), pin the live view to the saved
  // pose every frame: WASD / drag nudges _yawTarget / _pitchTarget but the
  // next frame snaps back, so the shot reads as immovable. 🔓 releases it.
  if(_engagedCamId != null
     && !(typeof camAnim !== 'undefined' && camAnim.playing)){
    const _selL = findLayer(_engagedCamId);
    if(_selL && _selL.type === 'camera' && _selL.locked && _selL.savedPose){
      const sp = _selL.savedPose;
      if(sp.pos) camPos.set(sp.pos.x, sp.pos.y, sp.pos.z);
      if(typeof sp.yaw   === 'number'){ yaw   = _yawTarget   = sp.yaw;   }
      if(typeof sp.pitch === 'number'){ pitch = _pitchTarget = sp.pitch; }
      if(typeof sp.roll  === 'number'){ roll  = sp.roll;  }
    } else {
      // Engaged camera was deleted or unlocked elsewhere — release.
      _engagedCamId = null;
    }
  }
  updateCamera();
  // Measurement-marker pulse / scale only matters when the measure tool is
  // active OR a marker is currently visible. Skip the 3-entry iteration
  // and the clock.elapsedTime read otherwise.
  if(msr && (msr.active || msr.step > 0)) updateMarkerScale();
  // Layer pivot gizmo only matters when a non-splat / non-folder layer is
  // selected. Skip the findLayer call entirely when nothing is selected.
  if(selectedLayerId != null) updateLayerPivot();
  else if(typeof lpv !== 'undefined' && lpv.group && lpv.group.visible) lpv.group.visible=false; // 選択が外れたらギズモを確実に消す
  // Figure-related per-frame updates: gated on the active-figure count.
  // The count is 0 in the common case (no figure has been added) so we
  // skip findLayer + layers[] iteration every frame.
  if(window._activeFigureCount){
    if(window._updateFigureMarkers) window._updateFigureMarkers();
    if(window._updateBoneRotateGizmo) window._updateBoneRotateGizmo();
  }
  // HUD info-box (#hud .ibox) DOM updates removed: the element was deleted
  // earlier and the 9 getElementById lookups + .toFixed allocations were
  // pure waste every active frame. The camera tool's own HUD readout is
  // still refreshed below via updateCamHud().
  if(cam.active) updateCamHud();
  // Keep the env dome centered on the camera so it never reveals its boundary
  if(env.mesh && env.mesh.visible) env.mesh.position.copy(camPos);
  // 日照3D可視化(コンパス/太陽軌道)も camPos 追従させ、常にビュー中心の球面に保つ
  if(typeof sunViz !== 'undefined' && sunViz.group && sunViz.group.visible) sunViz.group.position.copy(camPos);

  // -- Billboard (event objects face camera) --
  // Gated on a counter that's only > 0 when an event-layer with isBillboard
  // exists in the scene. Without an event placed, this loop is skipped
  // entirely instead of iterating layers[] every frame.
  if(window._activeBillboardCount){
    for(const L of layers){
      if(L.type==='event' && L.mesh && L.mesh.userData.isBillboard && L.visible){
        L.mesh.quaternion.copy(camera.quaternion);
      }
    }
  }
  // -- Nudge Spark to re-sort splats only when the camera direction changed
  // SIGNIFICANTLY since the last explicit sort, AND not more often than every
  // ~50 ms. renderer.render() already triggers Spark's automatic sort each
  // frame; the explicit sm.update(camera) here is a defensive extra hint.
  // Calling it every motion frame doubles worker pressure — Chrome traces of
  // big scenes showed the sort worker stuck running 36 % of total time and
  // single GPU upload stalls of 87-94 ms (= the user's "4 frames of black").
  // Throttling cuts those stalls without measurably increasing edge gaps,
  // since render()'s built-in sort still fires every frame.
  // Gate the explicit Spark sort-hint on _activeSplatCount: when no splat
  // layer is loaded the inner loop and the layers[] iteration both become
  // no-ops. Counter is bumped in addLayer / removed in remove paths.
  if (motion && window._activeSplatCount &&
      !(typeof arMode !== 'undefined' && arMode && arMode.active)) {
    // In AR mode (either variant) the gyro nudges yaw/pitch on every
    // device-orientation event (~60–100 Hz), so `motion` is true
    // essentially every frame. Calling sm.update(camera) per layer at
    // 50 ms cadence then saturates Spark's sort worker — but Spark
    // already runs its automatic sort inside renderer.render(), so the
    // explicit hint here is redundant for the AR case. Skipping it
    // removes a major iOS-Safari rAF stall source. Non-AR paths keep
    // the hint (it does help with fast pans).
    const _now = now;
    const _dyaw   = yaw   - (_lastSortYaw   || 0);
    const _dpitch = pitch - (_lastSortPitch || 0);
    const _moved  = (_dyaw*_dyaw + _dpitch*_dpitch) > (0.012*0.012); // ~0.7°
    if (_moved && (_now - (_lastSortAt||0)) > 50) {
      for(const L of layers){
        if(L.type!=='splat' || !L.mesh) continue;
        const sm = L.mesh;
        try {
          if (typeof sm.update === 'function')      sm.update(camera);
          else if (typeof sm.sort === 'function')   sm.sort(camera);
          else if (typeof sm.requestSort === 'function') sm.requestSort();
        } catch(e){}
      }
      _lastSortAt    = _now;
      _lastSortYaw   = yaw;
      _lastSortPitch = pitch;
    }
  }
  // ── Render ──
  // When the camera tool's safe-frame is active, actually CONSTRAIN the
  // GL viewport to the frame rect so the scene literally renders inside
  // the frame instead of being rendered full-screen and then visually
  // covered by an overlay mask. The surrounding area is cleared once to
  // black for the surrounding "letterbox" look; the scissor then keeps
  // subsequent draws inside the frame. camera.aspect also tracks the
  // frame so the projected view fits the frame exactly.
  const _t0 = performance.now();
  const _camActiveNow = (cam && cam.active);
  let _camViewportRect = null;
  if(_camActiveNow){
    try {
      _camViewportRect = _camFrameRect();
      const r = _camViewportRect;
      // ── Keep the on-screen safe-frame guide (white border + thirds grid)
      // LOCKED to the rect we actually render into. _camFrameRect() depends on
      // the live panel layout, which can shift AFTER the tool first laid the
      // frame out (the camera panel's content/scrollbar settles, the viewport
      // resizes, etc.). If the cam-frame element + grid stayed at the old rect,
      // the user composes against a frame that no longer matches what's rendered
      // — and the capture (which uses this same _camFrameRect) then looks
      // "shifted / wider" than the grid they framed with. Re-sync cheaply, only
      // when it has actually moved.
      const _gf = document.getElementById('cam-frame');
      if(_gf){
        const _lx = parseFloat(_gf.style.left) || 0;
        const _lw = parseFloat(_gf.style.width) || 0;
        const _lh = parseFloat(_gf.style.height) || 0;
        if(Math.abs(_lx - r.x) > 0.5 || Math.abs(_lw - r.w) > 0.5 || Math.abs(_lh - r.h) > 0.5){
          _gf.style.left   = r.x + 'px';
          _gf.style.top    = r.y + 'px';
          _gf.style.width  = r.w + 'px';
          _gf.style.height = r.h + 'px';
          if(typeof drawCamGrid === 'function'){ try { drawCamGrid(); } catch(_){} }
        }
      }
      // ── Two-pass render: show the scene at 20% brightness OUTSIDE the
      // safe-frame so the user has spatial context beyond the crop, then
      // re-render the frame area at full brightness with the correct
      // sensor aspect ratio for precise composition. ──
      const yFromBottom = r.viewportH - r.y - r.h;

      // The frame (Pass 2) shows the true lens vertical FOV (`fov` = sensor VFOV)
      // across the SHORTER frame height r.h. For the dim CONTEXT (Pass 1) to be
      // continuous with the frame — same angular scale (deg per pixel), so the
      // scene doesn't visibly jump scale at the frame edge (user 2026-06-27
      // "枠内とレンズ画角が違う") — Pass 1 must use a WIDER vertical FOV that fills the
      // full viewport height H at that same scale: fov_context = fov · (H / r.h).
      const _lensVFov = fov;
      // ★枠の内外を完全に連続させる: 同じ「焦点距離(px)」かつ同じ「主点(光軸が当たる点)」で描く。
      //   焦点距離 f_px = (h/2)/tan(fov/2)。主点は枠の中心(_fcx,_fcy)に合わせる。
      //   枠は画面中心からズレているので、Pass1は setViewOffset で主点を枠中心へ寄せた
      //   非対称フラスタムにする（これでスケールだけでなく位置も連続する）。
      const _fovRad = _lensVFov * Math.PI / 180;
      const _fpx = (r.h / 2) / Math.tan(_fovRad / 2);          // 焦点距離(px・縦)
      const _fcx = r.x + r.w / 2, _fcy = r.y + r.h / 2;        // 枠の中心＝主点に合わせる
      const _Hw  = Math.max(_fcx, innerWidth  - _fcx);
      const _Hh  = Math.max(_fcy, innerHeight - _fcy);
      const _fullW = 2 * _Hw, _fullH = 2 * _Hh;

      // Pass 1 — outside context: 主点を枠中心に合わせた拡張フラスタム（焦点距離は枠と一致）。
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      camera.aspect = _fullW / Math.max(1, _fullH);
      camera.fov = 2 * Math.atan(_Hh / _fpx) * 180 / Math.PI;
      camera.setViewOffset(_fullW, _fullH, _Hw - _fcx, _Hh - _fcy, innerWidth, innerHeight);
      camera.updateProjectionMatrix();
      if(_useOrtho){ _syncOrthoCamera(); renderer.render(scene,_orthoCamera); }
      else renderer.render(scene, camera);

      // Pass 2 — frame composition: 主点=枠中心の対称フラスタム（オフセット解除）。
      camera.clearViewOffset();
      renderer.setViewport(r.x, yFromBottom, r.w, r.h);
      renderer.setScissor(r.x, yFromBottom, r.w, r.h);
      renderer.setScissorTest(true);
      renderer.clear();
      camera.aspect = r.w / Math.max(1, r.h);
      camera.fov = _lensVFov;
      camera.updateProjectionMatrix();

      // Update the CSS letterbox overlay that darkens the outside area.
      _camUpdateLetterbox(r);
    } catch(e){ _camViewportRect = null; }
  }
  if(_useOrtho){ _syncOrthoCamera(); renderer.render(scene,_orthoCamera); }
  else renderer.render(scene,camera);
  if(_camActiveNow && _camViewportRect){
    // Restore full-viewport state so HUD overlays, RT passes etc.
    // outside the render loop continue to behave normally.
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.setScissor(0, 0, innerWidth, innerHeight);
    camera.clearViewOffset();   // Pass1のオフセットが残らないよう確実に解除
    camera.aspect = innerWidth / Math.max(1, innerHeight);
    camera.updateProjectionMatrix();
  }
  if(camAnim._recCopyFn) camAnim._recCopyFn();
  const _renderMs = performance.now() - _t0;
  // CSS reprojection bookkeeping: the freshly-rendered frame embeds the
  // current yaw/pitch, so any predictive canvas offset that was applied
  // by input handlers since the last render must be cleared and the
  // reference yaw/pitch advanced. Cheap (one DOM write per frame).
  if(_reprojectionEnabled &&
     !(typeof arMode !== 'undefined' && arMode && arMode.active)){
    _lastRenderYaw   = yaw;
    _lastRenderPitch = pitch;
    if(canvas && canvas.style.transform) canvas.style.transform = '';
  }
  // Sync DOM-based light halos with the freshly rendered frame. The UI to
  // add lights is gone (the light feature has been removed), so in normal
  // use no light layers exist and this hot-loop call is wasteful. Gate it
  // on a cheap counter that's only incremented when a light layer is
  // actually present (e.g. via project-ZIP restore). When the counter is
  // zero we skip the function call entirely.
  if(window._activeLightCount && typeof updateLightHalos === 'function'){
    try { updateLightHalos(); } catch(e){}
  }

  // renderer.info accessors iterate internal WebGL state every call — they
  // were called every frame just to populate a debug snapshot. Throttle to
  // ~10 Hz (every ~16 frames) so they don't compete with the splat submit on
  // mobile / weak hardware.
  if((window.__riCounter = (window.__riCounter||0) + 1) % 16 === 0){
    _lastRenderInfo = {
      calls:     renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries:renderer.info.memory.geometries,
      textures:  renderer.info.memory.textures,
    };
  }
  _ftSamples.push(_renderMs);
  if(_ftSamples.length>_FT_WINDOW) _ftSamples.shift();
  _ftAvg = _ftSamples.reduce((a,b)=>a+b,0)/_ftSamples.length;
  // Wall-clock frame time: critical for detecting CPU-bound (not GPU-bound)
  // slowdowns. wallDelta is computed at the top of animate() — even if the
  // render call itself is fast, if JS work between frames is heavy this
  // captures it. Clamp to a sane max so a single very-long idle gap
  // doesn't poison the rolling average.
  const _wallSample = Math.min(wallDelta, 200);
  _wallSamples.push(_wallSample);
  if(_wallSamples.length>_FT_WINDOW) _wallSamples.shift();
  _wallMsAvg = _wallSamples.reduce((a,b)=>a+b,0)/_wallSamples.length;
  // Feed the raw interval into the refresh-rate detector. Discard sub-1 ms
  // (rAF coalescing artifacts) and >100 ms (idle/tab-switch gaps) so they
  // can't skew the percentile estimate of the panel's true refresh.
  if(wallDelta > 1 && wallDelta < 100){
    _rawDeltas.push(wallDelta);
    if(_rawDeltas.length > 240) _rawDeltas.shift();
  }
  // (_fpsDisplay is now maintained as a rolling 500 ms window in the FPS-display
  //  block above — no per-frame cumulative recompute here, which used to make
  //  the number drift over a long render session.)

  // ══════════════════════════════════════════════════
  //  CONTINUOUS QUALITY WATCHDOG  (target ≥ 30 fps)
  // ══════════════════════════════════════════════════
  // Runs every frame after render. Tracks rolling _ftAvg and steps qualScale
  // up or down to keep the user above the 30 fps floor — works on laptop /
  // iPad / iPhone uniformly, and stays active for the whole session (not
  // just at first file load).
  //
  // • Down-step trigger: _ftAvg > 28 ms sustained for 180 active frames
  //   (~3 s). 28 ms is the "danger zone" before the 33.33 ms = 30 fps
  //   wall, so we trim before the user actually sees stutter.
  // • Up-step trigger:   _ftAvg < 11 ms sustained for 600 active frames
  //   (~10 s). 11 ms = > 80 fps render budget, plenty of headroom to
  //   risk a higher pixel-ratio.
  // • Up-steps NEVER exceed _qualPreferred (the device-tier default, or
  //   the user's most recent manual pick from the quality panel). Down-
  //   steps freely go below it to enforce the 30 fps floor.
  // • Setting pixel-ratio is QUEUED via _queuePixelRatio(), so the actual
  //   GPU buffer reallocation lands only when the camera is idle for
  //   ~600 ms (no visible mid-motion flash).
  // • Manual quality picks DON'T disable the watchdog anymore — they only
  //   adjust the ceiling (_qualPreferred). The user's preference is
  //   respected as a cap; below it the watchdog still defends 30 fps.
  if(!window._gpuWatchdog) window._gpuWatchdog = { slowStreak:0, fastStreak:0, lastStep:0 };
  const _wd = window._gpuWatchdog;
  // STEPS_ALL matches the three user-pickable presets. The watchdog
  // normally doesn't go below 低 (0.75) — at that point the recommended
  // next step is the "ポリゴン半減" toggle. EXCEPTION: when wall time is
  // dire (> 80 ms ≈ <12 fps) AND the device is Mac (where the Chrome
  // compositor rAF throttle is the dominant slow-state), the watchdog
  // is permitted to drop below 0.75 to 0.5 or 0.35 as an emergency to
  // recover an interactive frame rate. Those emergency steps aren't
  // user-pickable from the panel; the badge just continues to show 低.
  const _dire = (typeof _wallMsAvg === 'number' && _wallMsAvg > 80);
  const _allowEmergencyFloor =
    _dire && typeof _isMac !== 'undefined' && _isMac;
  const STEPS_ALL = _allowEmergencyFloor
    ? [0.35, 0.5, 0.75, 1.0, 1.5]
    : [0.75, 1.0, 1.5];
  const PRESET_FOR_SCALE = s => {
    // Map a qualScale value back to a 0..2 preset index for the badge.
    //   1.5 → 高 (2), 1.0 → 中 (1), 0.75 and lower → 低 (0)
    if(s >= 1.4)  return 2;
    if(s >= 0.95) return 1;
    return 0;
  };
  if(_ftSamples.length >= 30 && (now - _wd.lastStep) > 4000){
    // Trigger on either signal:
    //   • _ftAvg > 28 ms : GPU-bound (render call itself is expensive)
    //   • _wallMsAvg > 30 ms : CPU-bound (JS work between frames eats the
    //     wall-clock budget). 30 ms wall = ~33 fps, leaving headroom
    //     before we actually fall below the 30 fps user-facing target.
    if(_ftAvg > 28 || _wallMsAvg > 30){
      _wd.slowStreak++;
      _wd.fastStreak = 0;
      // Three-tier down-step trigger:
      //   • normal:    180 active frames (~3 s at 60 fps)
      //   • severe:     60 active frames (~1 s)  when render > 45 ms OR
      //                                          wall > 45 ms (~22 fps)
      //   • dire:       12 active frames (~0.2 s) when wall > 80 ms
      //                                          (~12 fps or worse)
      // The "dire" tier catches Mac Chrome's compositor-throttled state
      // where wall jumps to 100+ ms while GPU submit stays under 1 ms —
      // waiting 60 active frames at 6 fps is 10 seconds of pain.
      const _severe = (_ftAvg > 45 || _wallMsAvg > 45);
      // _dire is already declared in outer scope (same condition) —
      // reuse it here rather than redeclaring.
      const _streakThreshold = _dire ? 12 : (_severe ? 60 : 180);
      if(_wd.slowStreak > _streakThreshold){
        const cur = qualScale;
        const next = STEPS_ALL.slice().reverse().find(s => s < cur - 0.001);
        if(next !== undefined && next < cur){
          qualScale = next;
          qualIdx = PRESET_FOR_SCALE(qualScale);
          _queuePixelRatio(Math.min(devicePixelRatio, _PR_CAP) * qualScale);
          if(typeof _updateQiBadgeLabel === 'function') _updateQiBadgeLabel(qualIdx);
          document.querySelectorAll('#quality-panel #qbtns button')
            .forEach((b,i)=>b.classList.toggle('on', i === qualIdx));
          _wd.lastStep = now;
          _wd.slowStreak = 0;
          console.info('[Locahun] Auto-quality DOWN →', qualScale.toFixed(2),
            `(render ~${_ftAvg.toFixed(1)} ms, wall ~${_wallMsAvg.toFixed(1)} ms, target 30 fps)`);
        }
      }
    } else if(_ftAvg < 11 && _wallMsAvg < 14 && qualScale < _qualPreferred - 0.001 &&
              !(typeof arMode !== 'undefined' && arMode && arMode.active)){
      // While EITHER AR variant is active we intentionally hold the
      // pixel-ratio at the AR-entry override so iOS Safari compositor /
      // texImage2D cost stays manageable. Letting the watchdog up-step
      // here would defeat the override and pull fps back down.
      _wd.fastStreak++;
      _wd.slowStreak = Math.max(0, _wd.slowStreak - 2);
      if(_wd.fastStreak > 600){
        const cur = qualScale;
        const next = STEPS_ALL.find(s => s > cur + 0.001 && s <= _qualPreferred + 0.001);
        if(next !== undefined && next > cur){
          qualScale = next;
          qualIdx = PRESET_FOR_SCALE(qualScale);
          _queuePixelRatio(Math.min(devicePixelRatio, _PR_CAP) * qualScale);
          if(typeof _updateQiBadgeLabel === 'function') _updateQiBadgeLabel(qualIdx);
          document.querySelectorAll('#quality-panel #qbtns button')
            .forEach((b,i)=>b.classList.toggle('on', i === qualIdx));
          _wd.lastStep = now;
          _wd.fastStreak = 0;
          console.info('[Locahun] Auto-quality UP →', qualScale.toFixed(2),
            `(render ~${_ftAvg.toFixed(1)} ms, plenty of headroom)`);
        }
      }
    } else {
      _wd.slowStreak = Math.max(0, _wd.slowStreak - 1);
      _wd.fastStreak = Math.max(0, _wd.fastStreak - 1);
    }
  }

  // Apply any queued pixel-ratio change ONLY when the camera has been idle
  // for ~600 ms (see _applyDeferredPixelRatio). Keeps the watchdog/battery
  // downstep from causing a visible flash + low-res frame mid-interaction.
  _applyDeferredPixelRatio(now);

  updateOverlay();
}
// Start the loop. In headless mode the initial tick must come from setTimeout too,
// because a backgrounded tab never fires the first rAF (so the loop would never start).
if(_headless) setTimeout(()=>animate(performance.now()), 50);
else          requestAnimationFrame(animate);

