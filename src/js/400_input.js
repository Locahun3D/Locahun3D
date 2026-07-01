// ══════════════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════════════
// Returns true when an editable element (text input, textarea, contenteditable) has
// focus — keyboard shortcuts that move the camera or trigger app actions are
// suppressed in that case so typing into a memo field doesn't pan the view.
function _isTypingInInput(){
  const ae = document.activeElement;
  if(!ae) return false;
  const tag = ae.tagName;
  if(tag === 'TEXTAREA') return true;
  if(tag === 'INPUT'){
    const t = (ae.type || 'text').toLowerCase();
    // Block for any text-bearing input (number/text/email/etc). Not for buttons/etc.
    return ['text','number','search','email','url','tel','password'].includes(t);
  }
  return !!ae.isContentEditable;
}

window.addEventListener('keydown',e=>{
  // Ctrl+Z / Cmd+Z and Ctrl+Y / Cmd+Y must work everywhere — including while focused
  // in adjustment-tool inputs. Blur the input first so the global stack reflects the
  // committed value, then run the undo/redo.
  if((e.ctrlKey||e.metaKey) && (e.code==='KeyZ'||e.code==='KeyY')){
    if(_isTypingInInput()){
      const ae=document.activeElement;
      if(ae && typeof ae.blur==='function') ae.blur();
    }
    e.preventDefault();
    if(e.code==='KeyZ'){
      if(msr.active && msr.undoStack.length) window.undoMeasure();
      else globalUndo();
    } else {
      globalRedo();
    }
    return;
  }
  // Ctrl/Cmd+D — duplicate selected layer(s) (intercept before browser bookmark dialog)
  if((e.ctrlKey||e.metaKey) && e.code==='KeyD'){
    e.preventDefault();
    if(_isTypingInInput()) return;
    const ids = (window.selectedLayerIds && window.selectedLayerIds.size)
      ? Array.from(window.selectedLayerIds)
      : (selectedLayerId!=null ? [selectedLayerId] : []);
    for(const id of ids) window.duplicateLayer(id);
    return;
  }
  // Ctrl/Cmd+C / Ctrl/Cmd+V — copy/paste selected layer when not typing
  if((e.ctrlKey||e.metaKey) && !e.shiftKey && e.code==='KeyC'){
    if(_isTypingInInput()) return;
    if(selectedLayerId!=null){ e.preventDefault(); window.copyLayer(selectedLayerId); return; }
  }
  if((e.ctrlKey||e.metaKey) && !e.shiftKey && e.code==='KeyV'){
    if(_isTypingInInput()) return;
    e.preventDefault(); window.pasteLayer(); return;
  }
  // Don't let camera / global shortcuts fire while the user is typing into a field.
  // Esc still escapes (browsers treat it specially anyway, and we use it to close).
  if(_isTypingInInput() && e.code !== 'Escape') return;
  // ── TV / game-console D-pad navigation (user 2026-06-28) ──
  // On no-hover devices (smart TV remote, controller, etc.) the D-pad maps to
  // the Arrow keys, which the browser uses for SPATIAL FOCUS NAVIGATION between
  // controls. This app otherwise eats the arrows to fly the camera — which would
  // make the UI un-navigable by remote. So: on hover:none devices, when a UI
  // control (button/input/link) is focused, let the arrows move focus instead of
  // the camera. The 3D view (body/canvas focus) keeps arrow camera control, and
  // DESKTOP (hover:hover) is entirely unaffected — WASD also always flies the
  // camera regardless of focus.
  if(e.code.startsWith('Arrow') && window.matchMedia && window.matchMedia('(hover: none)').matches){
    const _ae = document.activeElement;
    const _uiFocused = _ae && _ae !== document.body && _ae.id !== 'c' && _ae.id !== 'overlay'
      && _ae.matches && _ae.matches('button,a,input,select,textarea,[tabindex],[role="button"]');
    if(_uiFocused) return;   // let the browser move focus; don't record/eat the key
  }
  // While avatar walk is active, Space is the JUMP key — prevent the browser
  // default (page scroll / re-activating the focused button) so a Space press
  // doesn't toggle walk mode off via the previously-clicked button.
  if(e.code === 'Space' && walkMode.active){
    e.preventDefault();
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  keys[e.code]=true;
  // Movement / rotation keys that should drive continuous render frames.
  // Google Earth (desktop) scheme:
  //   Arrows / W A S D       — pan position (Ctrl+Arrows rotates instead)
  //   Ctrl                   — modifier: arrows rotate/tilt in place
  //   Page Up / Down, +/-    — zoom in / out (dolly)
  //   R/F (+ touch ▲▼)       — vertical up/down
  //   Shift                  — sprint
  if(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyR','KeyF',
      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
      'PageUp','PageDown','Equal','Minus','NumpadAdd','NumpadSubtract',
      'ControlLeft','ControlRight','MetaLeft','MetaRight',
      'ShiftLeft','ShiftRight'].includes(e.code)){
    markDirty(3);
    if(layers.some(L=>L.type==='splat')) bumpSplatActive(2000);
    // Arrows and Page Up/Down would otherwise scroll the page when nothing is
    // focused — eat them so camera control stays responsive.
    if(e.code.startsWith('Arrow') || e.code==='PageUp' || e.code==='PageDown') e.preventDefault();
  }
  if(e.code === 'Space' && walkMode.active) markDirty(3);
  // (KeyR no longer triggers flipOrientation — Earth Studio uses R for
  //  vertical UP. Per-layer X/Y/Z flip buttons in the transform panel
  //  cover the same orientation-fix use case manually.)
  if(e.code==='KeyM') toggleMeasure();
  // projection toggle removed
  if(e.code==='KeyZ'){ e.preventDefault();
    if(msr.active && msr.undoStack.length) window.undoMeasure();
    else globalUndo();
  }
  if(e.code==='KeyY'){ e.preventDefault(); globalRedo(); }
  if((e.code==='Delete'||e.code==='Backspace') && !msr.active){
    const activeEl=document.activeElement;
    const isInput=activeEl&&(activeEl.tagName==='INPUT'||activeEl.tagName==='TEXTAREA'||activeEl.isContentEditable);
    if(!isInput){
      const ids = (window.selectedLayerIds && window.selectedLayerIds.size)
        ? Array.from(window.selectedLayerIds)
        : (selectedLayerId!=null ? [selectedLayerId] : []);
      if(ids.length){
        e.preventDefault();
        // Snapshot first so removal of one doesn't shift others (defensive copy already done)
        for(const id of ids) window.removeLayer(id);
        if(window.selectedLayerIds) window.selectedLayerIds.clear();
      }
    }
  }
  if(e.code==='Escape'&&msr.active) toggleMeasure();
  if((e.ctrlKey||e.metaKey) && e.code==='KeyS'){
    e.preventDefault();
    if(layers.length>0) window.saveProjectZip();
    else showUndoToast(T('no-scene-save'));
  }
});
window.addEventListener('keyup',e=>{
  if(_isTypingInInput()) return;
  keys[e.code]=false;
  if(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyR','KeyF',
      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
      'PageUp','PageDown','Equal','Minus','NumpadAdd','NumpadSubtract',
      'ControlLeft','ControlRight','MetaLeft','MetaRight',
      'ShiftLeft','ShiftRight'].includes(e.code)){
    markDirty(8); // extra frames after movement stops (Spark re-sort settling)
    if(layers.some(L=>L.type==='splat')) bumpSplatActive(2500);
  }
  // Defensive: when Shift is released, force-clear all movement keys.
  // Some browsers (notably macOS Safari/Chrome) suppress keyup events for
  // letter keys that were pressed *while* Shift was held, which leaves
  // keys.KeyW etc. stuck "down" — the camera would keep flying with no
  // physical key actually held. Resync to "no movement" on Shift release.
  // If the user is actually still holding W, the next keydown auto-repeat
  // (typically within 30-50ms) will set it back to true.
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight'){
    if(!e.shiftKey){
      keys.KeyW = keys.KeyS = keys.KeyA = keys.KeyD =
        keys.KeyQ = keys.KeyE = keys.KeyR = keys.KeyF =
        keys.KeyT = keys.KeyG = false;
      keys.ArrowUp = keys.ArrowDown = keys.ArrowLeft = keys.ArrowRight = false;
    }
  }
});

// If the window/tab loses focus, clear ALL key state so keys held during the
// blur (which won't get a keyup) don't leave the camera flying when focus
// returns.
window.addEventListener('blur', ()=>{
  for(const k of Object.keys(keys)) keys[k] = false;
  joyDX = 0; joyDY = 0;
});

// ── Mouse: left-drag = look/marker; right-hold = placement preview ──
// Mouse mapping (UPDATED):
//   • LEFT click  = select / drag 3D handles. Plain left click = layer select.
//   • RIGHT drag  = rotate the camera (when measure mode is OFF).
//   • RIGHT hold  = measurement preview (when measure mode is ON).
canvas.addEventListener('mousedown',e=>{
  // Any click on the viewport (left or right) ends "typing mode" by blurring the
  // active text input. This way memo fields don't keep eating shortcuts.
  const _ae = document.activeElement;
  if(_ae && (_ae.tagName === 'INPUT' || _ae.tagName === 'TEXTAREA')) _ae.blur();
  // パス配置モード: 左クリック長押しで位置を探る（押している間プレビュー、離して確定）。
  // 右ボタンはこのモード中も視点回転に使える。
  if(_pathMode && e.button===0){
    _pathProbing=true; _pathUpdateProbe(e.clientX,e.clientY);
    e.preventDefault();
    return;
  }
  // 配置モード（Cube/Event/Figure）: 左クリック長押しで配置位置を探る
  if(_placeMode && e.button===0){
    _placeProbing=true; _placeUpdateProbe(e.clientX,e.clientY);
    e.preventDefault();
    return;
  }
  // パス編集: 選択中パスの4点ハンドルを左ドラッグで移動
  if(e.button===0 && _pathEditId!=null && !(typeof msr!=='undefined' && msr.active)){
    const h=_pathHandleAt(e.clientX,e.clientY);
    if(h>=0){ _pathDragH=h; e.preventDefault(); return; }
  }
  if(e.button===2){
    // RIGHT button = view-rotation drag (in any mode).
    e.preventDefault();
    dragOn = true; dragX = e.clientX; dragY = e.clientY;
    // Lock the pointer to the canvas so the cursor can't escape the viewport
    // while the user is sweeping a 360° look-around. Falls back to the legacy
    // clientX/Y delta path on browsers/contexts where lock is unavailable.
    if(canvas.requestPointerLock){
      // requestPointerLock returns a Promise in modern Chrome; sync try/catch
      // doesn't trap rejections (e.g. NotAllowedError when not a real user
      // gesture, or when lock is denied by browser policy). Catch both the
      // synchronous throw and the promise rejection so noise doesn't reach
      // the console — the legacy clientX/Y delta path will still work.
      try {
        const p = canvas.requestPointerLock({ unadjustedMovement: true });
        if(p && typeof p.then === 'function') p.catch(()=>{
          try {
            const p2 = canvas.requestPointerLock();
            if(p2 && typeof p2.then === 'function') p2.catch(()=>{});
          } catch(_){}
        });
      } catch(_e){
        try {
          const p2 = canvas.requestPointerLock();
          if(p2 && typeof p2.then === 'function') p2.catch(()=>{});
        } catch(_e2){}
      }
    }
    return;
  }
  if(e.button===0){
    // ── Bone-rotation gizmo (highest priority when a bone is selected) ──
    if(!msr.active){
      const ringHit = _checkBoneRotateRingHit(e.clientX, e.clientY);
      if(ringHit){
        _startBoneRotateDrag(ringHit, e.clientX, e.clientY);
        e.stopPropagation();
        return;
      }
    }
    // ── IK handle drag (figure layers in IK mode) ──
    if(!msr.active){
      const ikHit = _checkIKHandleHit(e.clientX, e.clientY);
      if(ikHit){
        _startIKHandleDrag(ikHit, e.clientX, e.clientY);
        e.stopPropagation();
        return;
      }
    }
    // ── Layer pivot drag (only outside measure mode) ──
    if(!msr.active && selectedLayerId!=null){
      const hit=checkLpvHandle(e.clientX,e.clientY);
      if(hit){ startLpvDrag(hit,e.clientX,e.clientY); e.stopPropagation(); return; }
    }
    if(msr.active){
      // ── Measurement: axis-constrained handle drag ──
      const axHit = checkAxisHandle(e.clientX, e.clientY);
      if (axHit) {
        pushUndo();
        startAxisDrag(axHit, e.clientX, e.clientY);
        e.stopPropagation();
        return;
      }
      // ── Measurement: existing-marker drag ──
      const hit=nearMarker(e.clientX,e.clientY);
      if(hit){
        pushUndo();
        msr.dragging=hit;
        const pt = _msrPt(hit);
        const camDir=new THREE.Vector3();
        camera.getWorldDirection(camDir);
        msr.dragPlane.setFromNormalAndCoplanarPoint(camDir,pt);
        e.stopPropagation();
        return;
      }
      // ── LEFT-click long-press = place point preview (was right-click) ──
      msr.rightHold = true;            // field name retained for compat — now triggered by left
      const pos = pickWorldPos(e.clientX, e.clientY);
      updatePreview(pos);
      e.preventDefault();
      return;
    }
    // Outside measure mode: plain left click = selection candidate
    _clickStartX=e.clientX; _clickStartY=e.clientY;
  }
});
window.addEventListener('mouseup',e=>{
  // パス編集ハンドルのドラッグ終了
  if(_pathDragH>=0){ _pathDragH=-1; if(typeof markDirty==='function') markDirty(6); return; }
  // パス配置: 左クリックを離したら、探っていた位置に点を確定（右は視点回転へ）
  if(_pathMode && e.button===0){
    if(_pathProbing){ _placePathPoint(e.clientX,e.clientY); _pathHideProbe(); }
    return;
  }
  // 配置モード: 左クリックを離したら探っていた位置にオブジェクトを生成
  if(_placeMode && e.button===0){
    if(_placeProbing){ _commitPlace(e.clientX,e.clientY); }
    return;
  }
  if(e.button===2){
    // End right-drag view rotation
    if(dragOn) dragOn = false;
    // Release pointer lock so normal cursor behaviour resumes
    if(document.pointerLockElement === canvas && document.exitPointerLock){
      try { document.exitPointerLock(); } catch(_e){}
    }
  }
  if(e.button===0){
    if(msr.active && msr.rightHold){
      // LEFT-button release in measure mode = commit the placed point
      msr.rightHold = false;
      commitPreview();
    } else if(!msr.active){
      // Click-to-select: mouse barely moved → it's a single click
      const dx=e.clientX-_clickStartX, dy=e.clientY-_clickStartY;
      if(!lpv.dragging && Math.hypot(dx,dy)<5){
        _trySelectByClick(e.clientX, e.clientY);
      }
    }
  }
  if(lpv.dragging){ lpv.dragging=null; markDirty(6); }
  if(_ikDrag.active) _endIKHandleDrag();
  if(_boneRotDrag.active) _endBoneRotateDrag();
  msr.dragging=null; msr.axisDragging=null; markDirty(6);
});
window.addEventListener('mousemove',e=>{
  // -- Event panel hover (v26: replaced viewport glow with panel highlight) --
  if(!msr.active && !dragOn && !lpv.dragging) updateEventPanelHover(e.clientX, e.clientY);
  // ── Bone marker / IK handle hover (highlight + pointer cursor) ──
  _updateFigureHover(e.clientX, e.clientY);
  // ── Bone rotation drag (highest priority) ──
  if(_boneRotDrag.active){ _updateBoneRotateDrag(e.clientX, e.clientY); return; }
  // ── IK handle drag ──
  if(_ikDrag.active){ _updateIKHandleDrag(e.clientX, e.clientY); return; }
  // ── Layer pivot drag ──
  if(lpv.dragging){ updateLpvDrag(e.clientX,e.clientY); return; }
  // ── パス: 配置プレビュー追従 / 編集ハンドルのドラッグ ──
  if(_pathMode && _pathProbing){ _pathUpdateProbe(e.clientX,e.clientY); return; }
  if(_placeMode && _placeProbing){ _placeUpdateProbe(e.clientX,e.clientY); return; }
  if(_pathDragH>=0){ _pathUpdateHandleDrag(e.clientX,e.clientY); return; }
  // ── Right-hold placement preview ──
  if(msr.rightHold && msr.active){
    const pos = pickWorldPos(e.clientX, e.clientY);
    updatePreview(pos);
    return;
  }
  // ── Axis drag (XZ plane or single axis) ──
  if(msr.axisDragging){ _updateAxisDragAt(e.clientX, e.clientY); return; }
  // ── Drag marker ──
  if(msr.dragging){ _updateMarkerDragAt(e.clientX, e.clientY); return; }
  // ── Look rotation ──
  if(!dragOn)return;
  // While pointer is locked to the canvas, e.clientX/Y don't update — use
  // the platform-provided movementX/movementY (in CSS pixels). When NOT
  // locked (lock unavailable / failed), fall back to clientX/Y deltas.
  const _locked = (document.pointerLockElement === canvas);
  const _dx = _locked ? (e.movementX || 0) : (e.clientX - dragX);
  const _dy = _locked ? (e.movementY || 0) : (e.clientY - dragY);
  _yawTarget   -= _dx * 0.003;
  _pitchTarget  = Math.max(-1.55, Math.min(1.55, _pitchTarget - _dy * 0.003));
  // CSS reprojection: instant visual response between rAF ticks (mostly a
  // no-op on desktop where rAF is 60 Hz, but harmless and consistent with
  // the touch path).
  if(typeof _applyCanvasReprojection === 'function') _applyCanvasReprojection();
  dragX=e.clientX; dragY=e.clientY;
  markDirty(3);
  if(layers.some(L=>L.type==='splat')) bumpSplatActive(2000);
  if(msr.active){
    canvas.style.cursor = nearMarker(e.clientX,e.clientY) ? 'grab' : 'default';
  }
});
