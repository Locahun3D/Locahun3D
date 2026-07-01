// ── Long-press tap placement for measure mode ──
// In measure mode a finger held still for ~350 ms on the canvas enters
// "preview placement" — mirrors the desktop left-click-hold flow. The
// preview marker snaps to the nearest point-cloud point via pickWorldPos.
// Moving the finger more than 12 px before the timer fires cancels the
// hook and falls back to the normal touch-rotate. Lifting the finger
// after the preview is visible commits the placement.
let _msrLongPressTimer = null;
let _msrLongPressId = -1;    // touch identifier currently arming long-press
let _msrLongPressX = 0;
let _msrLongPressY = 0;
let _msrPlacingId = -1;      // touch identifier that successfully entered placement
const _MSR_LONG_PRESS_MS = 350;
const _MSR_LONG_PRESS_MOVE_PX = 12;
function _cancelMsrLongPress(){
  if(_msrLongPressTimer){ clearTimeout(_msrLongPressTimer); _msrLongPressTimer = null; }
  _msrLongPressId = -1;
}

canvas.addEventListener('touchstart',e=>{
  // ── Figure bone-rotation ring / IK handle touch-drag (highest priority) ──
  // Mirrors the desktop mousedown order (bone ring → IK → lpv). Only outside
  // measure mode and only when a figure widget is actually pickable. Previously
  // these had NO touch wiring, so iPad/phone users couldn't rotate bones or
  // drag IK targets.
  if(_handleTouchId === -1 && _lpvTouchId === -1 && !(msr && msr.active) && e.changedTouches.length){
    const tg = e.changedTouches[0];
    const cx = tg.clientX, cy = tg.clientY;
    let grabbed = false;
    if(typeof _checkBoneRotateRingHit === 'function'){
      const ringHit = _checkBoneRotateRingHit(cx, cy);
      if(ringHit){ _startBoneRotateDrag(ringHit, cx, cy);
        _handleTouchId = tg.identifier; _handleTouchKind = 'bone'; grabbed = true; }
    }
    if(!grabbed && typeof _checkIKHandleHit === 'function'){
      const ikHit = _checkIKHandleHit(cx, cy);
      if(ikHit){ _startIKHandleDrag(ikHit, cx, cy);
        _handleTouchId = tg.identifier; _handleTouchKind = 'ik'; grabbed = true; }
    }
    if(grabbed){
      try { if(navigator.vibrate) navigator.vibrate(12); } catch(_){}
      markDirty(6);
    }
  }
  // ── Pivot gizmo touch-drag (object translate / rotate / scale) ──
  // If a finger lands on a transform handle of the selected object, grab it
  // and drag instead of rotating the camera. The fat invisible hit-shafts make
  // the small arrows touch-friendly.
  if(_handleTouchId === -1 && _lpvTouchId === -1 && typeof lpv!=='undefined' && lpv.group && lpv.group.visible
     && !(msr && msr.active) && e.changedTouches.length){
    const tg = e.changedTouches[0];
    const hit = checkLpvHandle(tg.clientX, tg.clientY);
    if(hit){
      startLpvDrag(hit, tg.clientX, tg.clientY);
      _lpvTouchId = tg.identifier;
      // Highlight the grabbed handle (arrow / rotation ring / scale cube) so it's
      // obvious WHICH axis is being dragged on touch — there's no hover on a finger
      // (user 2026-06-27 "どこが長押しで選択されているかわかりずらい"). Reset on release.
      _lpvTouchHit = hit;
      if(typeof _applyLpvHighlight==='function') _applyLpvHighlight(hit);
      try { if(navigator.vibrate) navigator.vibrate(12); } catch(_){}
      markDirty(6);
    }
  }
  // ── Path edit handle touch-drag (path layers, outside measure mode) ──
  if(_handleTouchId === -1 && _lpvTouchId === -1 && typeof _pathEditId!=='undefined' && _pathEditId!=null
     && !(msr && msr.active) && e.changedTouches.length){
    const tg = e.changedTouches[0];
    const h = _pathHandleAt(tg.clientX, tg.clientY);
    if(h>=0){
      _pathDragH = h; _handleTouchId = tg.identifier; _handleTouchKind = 'path';
      try { if(navigator.vibrate) navigator.vibrate(12); } catch(_){}
      markDirty(6);
    }
  }
  // ── Measurement axis-arrow / XZ-plane / marker touch-drag (measure mode) ──
  // Mirrors the desktop mousedown order inside measure mode: axis handle first
  // (constrained drag along an arrow or the XZ plane), then a free marker grab.
  // These also had no touch wiring before — the user could place points but not
  // nudge them along an axis or move an existing marker with a finger.
  if(_handleTouchId === -1 && msr && msr.active && e.changedTouches.length){
    const tg = e.changedTouches[0];
    const cx = tg.clientX, cy = tg.clientY;
    const axHit = (typeof checkAxisHandle === 'function') ? checkAxisHandle(cx, cy) : null;
    if(axHit){
      pushUndo();
      startAxisDrag(axHit, cx, cy);
      _handleTouchId = tg.identifier; _handleTouchKind = 'axis';
      try { if(navigator.vibrate) navigator.vibrate(12); } catch(_){}
      markDirty(6);
    } else {
      const mHit = (typeof nearMarker === 'function') ? nearMarker(cx, cy) : null;
      if(mHit){
        pushUndo();
        msr.dragging = mHit;
        const pt = _msrPt(mHit);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        msr.dragPlane.setFromNormalAndCoplanarPoint(camDir, pt);
        _handleTouchId = tg.identifier; _handleTouchKind = 'marker';
        try { if(navigator.vibrate) navigator.vibrate(12); } catch(_){}
        markDirty(6);
      }
    }
  }
  // Measure-mode long-press scheduler — only when no placement is already
  // in progress AND a single finger is going down. Skip entirely if a measure
  // handle (axis/marker) was just grabbed, so dragging a handle doesn't also
  // arm a point-placement.
  if(msr.active && _handleTouchId === -1 && _msrPlacingId === -1 && _msrLongPressId === -1 && e.changedTouches.length){
    const t0 = e.changedTouches[0];
    _msrLongPressId = t0.identifier;
    _msrLongPressX = t0.clientX;
    _msrLongPressY = t0.clientY;
    _msrLongPressTimer = setTimeout(() => {
      _msrLongPressTimer = null;
      if(_msrLongPressId === -1) return;
      // Promote to active placement
      _msrPlacingId = _msrLongPressId;
      _msrLongPressId = -1;
      msr.rightHold = true;
      // Release the touch-rotate finger so look-around doesn't spin while
      // the user adjusts the placement.
      if(tlId === _msrPlacingId) tlId = -1;
      const pos = pickWorldPos(_msrLongPressX, _msrLongPressY);
      updatePreview(pos);
      // Haptic feedback so the user knows the long-press registered
      try { if(navigator.vibrate) navigator.vibrate(15); } catch(_){}
      markDirty(6);
    }, _MSR_LONG_PRESS_MS);
  }
  // Camera look-around (touch-drag rotate) activates on the RIGHT part of the
  // screen; the left strip is a dead zone so a look-drag doesn't fight the
  // joystick / ▲▼ arrows in the bottom-left. Widened the active zone leftward
  // (0.4 → 0.3 of the width) per user request 2026-06 so rotation responds across
  // more of the view. Safe vs the joystick/arrows: those are separate elements
  // (z-index 60, pointer-events) that capture their own touches before the canvas
  // sees them, so the only thing the wider zone claims is empty canvas left-of-centre.
  for(const t of e.changedTouches)
    if(t.identifier!==_lpvTouchId && t.identifier!==_handleTouchId && t.clientX>innerWidth*0.3){tlId=t.identifier;tlX=t.clientX;tlY=t.clientY;}
},{passive:true});
canvas.addEventListener('touchmove',e=>{
  // ── Pivot gizmo touch-drag update (highest priority) ──
  if(_lpvTouchId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _lpvTouchId){ updateLpvDrag(t.clientX, t.clientY); markDirty(3); return; }
    }
  }
  // ── Generic handle touch-drag update (bone ring / IK / axis / marker / path) ──
  if(_handleTouchId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _handleTouchId){
        const cx = t.clientX, cy = t.clientY;
        if(_handleTouchKind === 'bone'){ if(_boneRotDrag.active) _updateBoneRotateDrag(cx, cy); }
        else if(_handleTouchKind === 'ik'){ if(_ikDrag.active) _updateIKHandleDrag(cx, cy); }
        else if(_handleTouchKind === 'axis'){ _updateAxisDragAt(cx, cy); }
        else if(_handleTouchKind === 'marker'){ _updateMarkerDragAt(cx, cy); }
        else if(_handleTouchKind === 'path'){ if(_pathDragH>=0) _pathUpdateHandleDrag(cx, cy); }
        markDirty(3);
        return;
      }
    }
  }
  // ── Measure-mode placement preview update (active long-press) ──
  if(_msrPlacingId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _msrPlacingId){
        const pos = pickWorldPos(t.clientX, t.clientY);
        updatePreview(pos);
        markDirty(3);
        // Suppress the look-rotate path for the placement finger so
        // sliding to reposition doesn't also spin the camera.
        if(t.identifier === tlId){ tlX = t.clientX; tlY = t.clientY; }
        return;
      }
    }
  }
  // ── Long-press arm-cancel: if the finger moves too far before the
  //    timer fires, treat as drag-to-rotate instead of a long-press. ──
  if(_msrLongPressId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _msrLongPressId){
        if(Math.hypot(t.clientX - _msrLongPressX, t.clientY - _msrLongPressY) > _MSR_LONG_PRESS_MOVE_PX){
          _cancelMsrLongPress();
        }
        break;
      }
    }
  }
  for(const t of e.changedTouches)
    if(t.identifier===tlId){
      const dx = (t.clientX - tlX) * 0.004;
      const dy = (t.clientY - tlY) * 0.004;
      // AR mode (V1 or V2): the gyro handler continuously re-asserts
      // _yawTarget / _pitchTarget on every deviceorientation event
      // (~60 Hz), so writing directly to those targets here would be
      // erased instantly. Instead we shift the AR baselines by the same
      // amount — the gyro formula (`baseYaw + (yawNew - baselineYaw)`)
      // then carries the touch adjustment forward as a persistent offset
      // on top of live device orientation, exactly the way "drag-to-
      // recenter" should feel. Same hook applies to V2 (WebGL-integrated
      // passthrough); the two modes are mutually exclusive at runtime.
      const _arOn = (typeof arMode !== 'undefined' && arMode && arMode.active && arMode.baselineCaptured);
      if(_arOn){
        arMode.baselineYaw   += dx;
        arMode.baselinePitch += dy;
      } else {
        _yawTarget   -= dx;
        _pitchTarget  = Math.max(-1.55, Math.min(1.55, _pitchTarget - dy));
        // CSS reprojection: shift the canvas image to match the new yaw/
        // pitch target so the user sees instant feedback even when the
        // animate loop is rAF-throttled to ~11 Hz on iPad. Called outside
        // animate(), so it runs at the touchmove rate (~60 Hz on iOS).
        if(typeof _applyCanvasReprojection === 'function') _applyCanvasReprojection();
      }
      tlX=t.clientX;tlY=t.clientY;
      markDirty(3);
      if(layers.some(L=>L.type==='splat')) bumpSplatActive(1500);
    }
},{passive:true});
canvas.addEventListener('touchend',e=>{
  // End a pivot gizmo touch-drag when its finger lifts.
  if(_lpvTouchId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _lpvTouchId){
        _lpvTouchId = -1;
        if(_lpvTouchHit){ if(typeof _resetLpvHighlight==='function') _resetLpvHighlight(_lpvTouchHit); _lpvTouchHit=null; }
        if(typeof lpv!=='undefined' && lpv.dragging){ lpv.dragging=null; markDirty(6); }
        break;
      }
    }
  }
  // End a generic handle touch-drag (bone ring / IK / axis / marker / path)
  // when its finger lifts — mirrors the desktop mouseup cleanup.
  if(_handleTouchId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _handleTouchId){
        if(_handleTouchKind === 'bone'){ if(_boneRotDrag.active) _endBoneRotateDrag(); }
        else if(_handleTouchKind === 'ik'){ if(_ikDrag.active) _endIKHandleDrag(); }
        else if(_handleTouchKind === 'path'){ _pathDragH = -1; }
        if(_handleTouchKind === 'axis' || _handleTouchKind === 'marker'){ msr.dragging=null; msr.axisDragging=null; }
        _handleTouchId = -1; _handleTouchKind = '';
        markDirty(6);
        break;
      }
    }
  }
  // Commit a measure-mode placement if the finger that's being lifted
  // is the one currently holding the preview.
  if(_msrPlacingId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _msrPlacingId){
        _msrPlacingId = -1;
        msr.rightHold = false;
        commitPreview();
        markDirty(6);
        break;
      }
    }
  }
  // Cancel any pending long-press arming when the same finger lifts.
  if(_msrLongPressId !== -1){
    for(const t of e.changedTouches){
      if(t.identifier === _msrLongPressId){ _cancelMsrLongPress(); break; }
    }
  }
  for(const t of e.changedTouches)if(t.identifier===tlId){ tlId=-1; markDirty(6); }
});
canvas.addEventListener('touchcancel',e=>{
  // Abort a pivot gizmo touch-drag on cancel (e.g. iOS palm rejection).
  if(_lpvTouchId !== -1){
    _lpvTouchId = -1;
    if(_lpvTouchHit){ if(typeof _resetLpvHighlight==='function') _resetLpvHighlight(_lpvTouchHit); _lpvTouchHit=null; }
    if(typeof lpv!=='undefined' && lpv.dragging){ lpv.dragging=null; markDirty(6); }
  }
  // Abort a generic handle touch-drag on cancel (e.g. iOS palm rejection).
  if(_handleTouchId !== -1){
    if(_boneRotDrag.active) _endBoneRotateDrag();
    if(_ikDrag.active) _endIKHandleDrag();
    if(_pathDragH>=0) _pathDragH = -1;
    msr.dragging=null; msr.axisDragging=null;
    _handleTouchId = -1; _handleTouchKind = '';
    markDirty(6);
  }
  // Abort placement / arming on touchcancel (e.g. iOS palm rejection).
  if(_msrPlacingId !== -1){
    _msrPlacingId = -1;
    msr.rightHold = false;
    if(msr.previewMarker) msr.previewMarker.visible = false;
    markDirty(6);
  }
  _cancelMsrLongPress();
},{passive:true});

// Joystick
// Centre / radius constants match the 1.6× CSS dimensions: container is
// 176×176, knob 70×70, so the centre lives at (88,88) and the knob can
// travel up to R=51 px (≈ 32 × 1.6) from centre before clamping.
//
// Previously two bugs combined to make the joystick "let go" while the
// user was still dragging:
//   1. `e.touches[0]` was used everywhere — but touches[0] isn't
//      necessarily the joystick finger when a second touch (e.g. the
//      touch-look / AR drag) is also active. The handler would then read
//      coordinates from the wrong finger and either jump or release.
//   2. window's touchend fired on EVERY finger lift — including the
//      touch-look finger — so lifting the OTHER finger reset the
//      joystick's `on=false`, snapping joyDX/joyDY to 0.
// Fix: track the specific touch identifier captured at touchstart, and
// only react to events for that identifier.
//
// Slack zone: per user request, drags up to 3.0× R (200% beyond the
// visible circle) still register as "full deflection" rather than
// snapping the joystick off. Beyond 3.0× R the joystick auto-releases.
(()=>{
  const joy=document.getElementById('joy'),knob=document.getElementById('jknob');
  const R=51;        // visible joystick radius (px, post-CSS scaling)
  const SLACK=R*3.0; // outer "still tracking" radius (200% beyond visible)
  const C=88;
  let on=false, jId=-1, bx=88, by=88;
  function resetKnob(){
    on=false; jId=-1; joyDX=0; joyDY=0;
    knob.style.left=C+'px'; knob.style.top=C+'px';
  }
  joy.addEventListener('touchstart',e=>{
    e.preventDefault();
    if(on) return; // already engaged — ignore secondary fingers on the pad
    const r=joy.getBoundingClientRect();
    for(const t of e.changedTouches){
      // First new finger that landed on the joystick element wins.
      jId = t.identifier;
      on = true;
      bx = t.clientX - r.left;
      by = t.clientY - r.top;
      break;
    }
  },{passive:false});
  window.addEventListener('touchmove',e=>{
    if(!on) return;
    // Find OUR specific touch in the current touch list (NOT touches[0],
    // which becomes the touch-look finger when both are active and would
    // jerk the joystick to wherever the other finger is).
    let t=null;
    for(const ct of e.touches){ if(ct.identifier===jId){ t=ct; break; } }
    if(!t) return;
    const r=joy.getBoundingClientRect();
    let dx=(t.clientX-r.left)-bx, dy=(t.clientY-r.top)-by;
    const l=Math.sqrt(dx*dx+dy*dy);
    // Beyond the slack zone (3.0× R) the user has clearly slid OFF the
    // joystick — release rather than keep moving forever, which feels
    // worse than the previous "snap-to-zero on edge" bug.
    if(l > SLACK){
      resetKnob();
      return;
    }
    // Visual knob clamps to R (inside the ring); the actual joyDX/joyDY
    // magnitude clamps to 1.0 even inside the slack zone so the world
    // motion speed doesn't double when the user drags well outside.
    const visScale = (l > R) ? (R/l) : 1;
    const vx = dx * visScale, vy = dy * visScale;
    knob.style.left=(C+vx)+'px'; knob.style.top=(C+vy)+'px';
    const inputScale = (l > R) ? (1/l) : (1/R); // both yield magnitude ≤ 1
    joyDX = dx * inputScale;
    joyDY = dy * inputScale;
    // Final safety clamp in case of floating-point drift.
    const jl = Math.sqrt(joyDX*joyDX + joyDY*joyDY);
    if(jl > 1){ joyDX/=jl; joyDY/=jl; }
    if(layers.some(L=>L.type==='splat')) bumpSplatActive(2000);
  });
  window.addEventListener('touchend',e=>{
    if(!on) return;
    for(const t of e.changedTouches){
      if(t.identifier===jId){ resetKnob(); break; }
    }
  });
  window.addEventListener('touchcancel',e=>{
    if(!on) return;
    for(const t of e.changedTouches){
      if(t.identifier===jId){ resetKnob(); break; }
    }
  });
})();

