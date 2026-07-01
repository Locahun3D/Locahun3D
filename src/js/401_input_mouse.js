// ── Layer pivot 3D-mesh hover highlight (similar to measurement axis hover) ──
let _prevLpvHovered = null;
function updateLpvHover(clientX, clientY) {
  if(msr.active || selectedLayerId==null || !lpv.group || !lpv.group.visible) {
    // Reset any lingering highlight
    if(_prevLpvHovered){ _resetLpvHighlight(_prevLpvHovered); _prevLpvHovered=null; }
    _hoveredLpv=null; return;
  }
  const hit = checkLpvHandle(clientX, clientY);

  // Reset previous
  if(_prevLpvHovered && _prevLpvHovered !== hit){
    _resetLpvHighlight(_prevLpvHovered);
    _prevLpvHovered=null;
  }
  // Apply new highlight
  if(hit && hit !== _prevLpvHovered){
    _applyLpvHighlight(hit);
    _prevLpvHovered=hit;
    canvas.style.cursor='crosshair';
    markDirty(2);
    // v26: highlight selected layer entry in panel
    if(selectedLayerId!=null){
      const lrEl=document.getElementById('lr-'+selectedLayerId);
      if(lrEl) lrEl.classList.add('lr-pivot-hover');
    }
  } else if(!hit && _prevLpvHovered){
    canvas.style.cursor='default';
    markDirty(2);
    // v26: remove panel highlight
    if(selectedLayerId!=null){
      const lrEl=document.getElementById('lr-'+selectedLayerId);
      if(lrEl) lrEl.classList.remove('lr-pivot-hover');
    }
  }
  _hoveredLpv=hit;
}
function _resetLpvHighlight(h){
  if(!h) return;
  if(h.isRot){
    const meshes=(lpv.rotHandles&&lpv.rotHandles[h.axisName])||[];
    meshes.forEach(m=>{ if(m.material){ m.material.color.setHex(h.color); m.material.opacity=.6; } });
  } else if(h.isSca){
    const meshes=(lpv.scaleHandles&&lpv.scaleHandles[h.axisName])||[];
    meshes.forEach(m=>{ if(m.material){ m.material.color.setHex(h.color); m.material.opacity=.85; } });
  } else {
    const meshes=lpv.handles[h.axisName]||[];
    meshes.forEach(m=>{ if(m.material){ m.material.color.setHex(h.color); m.material.opacity=.9; } });
  }
}
function _applyLpvHighlight(h){
  if(!h) return;
  if(h.isRot){
    const meshes=(lpv.rotHandles&&lpv.rotHandles[h.axisName])||[];
    meshes.forEach(m=>{ if(m.material){ m.material.color.setHex(0xffffff); m.material.opacity=1.0; } });
  } else if(h.isSca){
    const meshes=(lpv.scaleHandles&&lpv.scaleHandles[h.axisName])||[];
    meshes.forEach(m=>{ if(m.material){ m.material.color.setHex(0xffffff); m.material.opacity=1.0; } });
  } else {
    const meshes=lpv.handles[h.axisName]||[];
    meshes.forEach(m=>{ if(m.material){ m.material.color.setHex(0xffffff); m.material.opacity=1.0; } });
  }
}

canvas.addEventListener('mousemove',e=>{
  if(!msr.active && selectedLayerId!=null && !lpv.dragging){
    updateLpvHover(e.clientX, e.clientY);
  } else if(msr.active) {
    if(_prevLpvHovered){ _resetLpvHighlight(_prevLpvHovered); _prevLpvHovered=null; }
    _hoveredLpv=null;
  }
  if(!msr.active||msr.dragging||msr.axisDragging||msr.rightHold) return;
  if (checkAxisHandle(e.clientX, e.clientY)) {
    canvas.style.cursor = 'crosshair';
    updateAxisHover(e.clientX, e.clientY);
  } else {
    canvas.style.cursor = nearMarker(e.clientX,e.clientY) ? 'grab' : 'default';
    updateAxisHover(e.clientX, e.clientY);
  }
});

// Right-click placement is handled by mousedown(rightHold) + mouseup(commit)
canvas.addEventListener('contextmenu',e=>{ e.preventDefault(); });

// If the pointer lock is released for any reason (user pressed Esc, focus lost,
// alt-tab, etc.), make sure the right-drag look state is also reset so the
// camera doesn't keep "following" a phantom right-button-held state.
document.addEventListener('pointerlockchange', ()=>{
  if(document.pointerLockElement !== canvas){
    if(dragOn) dragOn = false;
  }
});

// Scroll = FOV  |  Shift+Scroll = camera speed
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  if(e.shiftKey){
    camSpeed=Math.max(0.5,Math.min(20,camSpeed-e.deltaY*0.02));
    camSpeed=Math.round(camSpeed*10)/10;
    const _spd = document.getElementById('spdLabel');     if(_spd)  _spd.textContent  = camSpeed;
    const _spv = document.getElementById('spdVal');       if(_spv)  _spv.textContent  = camSpeed;
    const _sps = document.getElementById('spdSlider');    if(_sps)  _sps.value        = camSpeed;
  } else if(_useOrtho){
    _orthoSize=Math.max(0.5,Math.min(500,_orthoSize*(1+e.deltaY*0.001)));
    _syncOrthoCamera();
    markDirty(4);
  } else if(cam.active){
    // Camera tool is active: FOV is driven by lens × sensor. Repurpose the wheel
    // to step the focal length (zoom feel) instead of bypassing the lens math.
    const step = e.deltaY > 0 ? -2 : +2;       // wheel-up = longer lens (zoom in)
    const newFocal = Math.max(8, Math.min(400, cam.focal + step));
    if(newFocal !== cam.focal){
      cam.focal = newFocal;
      _camPushFields();
      _camHighlightFocal();
      applyCamSettings();
    }
  } else {
    fov=Math.max(20,Math.min(120,fov+e.deltaY*0.05));
    camera.fov=fov;camera.updateProjectionMatrix();
    const _fl = document.getElementById('fovLabel'); if(_fl) _fl.textContent = Math.round(fov)+'°';
    markDirty(4);
  }
},{passive:false});

// ── Shared drag-update helpers (used by BOTH mouse and touch paths) ──
// Extracted from the inline mousemove handler so the touch handlers can reuse
// the EXACT same math. Both take screen-space client coordinates.
function _updateAxisDragAt(clientX, clientY){
  if(!msr.axisDragging) return;
  const rect=canvas.getBoundingClientRect();
  _v2.set(((clientX-rect.left)/rect.width)*2-1,
          -((clientY-rect.top)/rect.height)*2+1);
  _ray.setFromCamera(_v2,camera);
  const hit=new THREE.Vector3();
  if(_ray.ray.intersectPlane(msr.axisDragging.dragPlane, hit)){
    let newPos;
    if(msr.axisDragging.isXZ){
      // Free XZ movement, Y locked
      newPos = new THREE.Vector3(
        msr.axisDragging.startPos.x + (hit.x - msr.axisDragging.startHit.x),
        msr.axisDragging.startPos.y,
        msr.axisDragging.startPos.z + (hit.z - msr.axisDragging.startHit.z)
      );
    } else {
      const delta=hit.clone().sub(msr.axisDragging.startHit);
      const proj=delta.dot(msr.axisDragging.axisDir);
      newPos=msr.axisDragging.startPos.clone()
        .addScaledVector(msr.axisDragging.axisDir, proj);
    }
    const dp = msr.axisDragging.point;
    if(dp==='A'){
      msr.ptA.copy(newPos); msr.markerA.position.copy(newPos);
    } else if(dp==='B'){
      msr.ptB.copy(newPos); msr.markerB.position.copy(newPos);
    } else if(dp==='C'){
      msr.ptC.copy(newPos); if(msr.markerC) msr.markerC.position.copy(newPos);
    }
    syncGizmoToMsr();
  }
}
function _updateMarkerDragAt(clientX, clientY){
  if(!msr.dragging) return;
  const rect=canvas.getBoundingClientRect();
  _v2.set(((clientX-rect.left)/rect.width)*2-1,
          -((clientY-rect.top)/rect.height)*2+1);
  _ray.setFromCamera(_v2,camera);
  const hit=new THREE.Vector3();
  if(_ray.ray.intersectPlane(msr.dragPlane,hit)){
    if(msr.dragging==='A'){msr.ptA.copy(hit);msr.markerA.position.copy(hit);}
    else if(msr.dragging==='B'){msr.ptB.copy(hit);msr.markerB.position.copy(hit);}
    else if(msr.dragging==='C'){msr.ptC.copy(hit);if(msr.markerC)msr.markerC.position.copy(hit);}
    syncGizmoToMsr();
  }
}

// Touch look
let tlId=-1,tlX=0,tlY=0;
// Pivot-gizmo touch-drag (v0.0.43): the finger identifier currently dragging a
// transform handle of the selected object. Lets iPad users grab the pivot and
// move/rotate/scale, mirroring the desktop mouse gizmo drag.
let _lpvTouchId=-1;
let _lpvTouchHit=null;   // the lpv handle currently highlighted for a touch-drag (reset on release)
// Generic handle touch-drag (2026-06): the finger identifier currently dragging
// a NON-lpv transform handle — measurement axis arrow / XZ plane, measurement
// marker, figure bone-rotation ring, figure IK handle, or path edit point.
// Mirrors the desktop mousedown→mousemove→mouseup path for these widgets, which
// previously had NO touch wiring at all (iPad/phone users couldn't drag them).
let _handleTouchId=-1;
let _handleTouchKind='';   // 'axis' | 'marker' | 'bone' | 'ik' | 'path'
