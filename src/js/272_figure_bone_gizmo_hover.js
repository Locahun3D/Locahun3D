// ── Hover state for bone markers + IK handles (yellow glow + pointer cursor) ──
let _hoverObj = null;
const _HOVER_COLOR = 0xffff44;
function _restoreHoverColor(o){
  if(o && o.material && o.material.color && o.userData && o.userData._baseColor != null){
    o.material.color.setHex(o.userData._baseColor);
  }
}
function _updateFigureHover(clientX, clientY){
  // Skip when actively dragging anything
  if(_ikDrag.active || (typeof lpv !== 'undefined' && lpv.dragging) || (msr && msr.active) || dragOn){
    if(_hoverObj){ _restoreHoverColor(_hoverObj); _hoverObj=null; document.body.style.cursor=''; }
    return;
  }
  // Collect hover targets across all visible figures
  const targets = [];
  for(const L of layers){
    if(L.type!=='figure' || !L.mesh || !L.visible) continue;
    if(L.figureMarkers){
      for(const mk of L.figureMarkers){
        if(mk.visible) targets.push(mk);
      }
    }
    if(L.ikChains){
      for(const k in L.ikChains){
        const h = L.ikChains[k].handle;
        if(!h || !h.visible) continue;
        h.traverse(child=>{
          if(child.userData && (child.userData.isIKHandleCenter || child.userData.isIKAxisHandle)){
            targets.push(child);
          }
        });
      }
    }
  }
  // Bone-rotation gizmo rings (one per scene, attached to selected bone)
  if(_boneRotateGizmo && _boneRotateGizmo.visible){
    _boneRotateGizmo.traverse(o=>{
      if(o.userData && o.userData.isBoneRotateRing) targets.push(o);
    });
  }
  if(targets.length === 0){
    if(_hoverObj){ _restoreHoverColor(_hoverObj); _hoverObj=null; document.body.style.cursor=''; }
    return;
  }
  const rect = canvas.getBoundingClientRect();
  _ikV2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ikRay.setFromCamera(_ikV2, _useOrtho ? _orthoCamera : camera);
  const hits = _ikRay.intersectObjects(targets, false);
  const hit = hits.length ? hits[0].object : null;
  if(hit !== _hoverObj){
    if(_hoverObj) _restoreHoverColor(_hoverObj);
    if(hit && hit.material && hit.material.color){
      hit.material.color.setHex(_HOVER_COLOR);
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = '';
    }
    _hoverObj = hit;
    markDirty(2);
  }
}
function _collectIKHandleParts(){
  const parts = [];
  for(const L of layers){
    if(L.type!=='figure' || !L.ikEnabled || !L.ikChains) continue;
    for(const k in L.ikChains){
      const h = L.ikChains[k].handle;
      if(!h || !h.visible) continue;
      h.traverse(child=>{
        if(child.userData && (child.userData.isIKHandleCenter || child.userData.isIKAxisHandle)){
          parts.push(child);
        }
      });
    }
  }
  return parts;
}
function _checkIKHandleHit(clientX, clientY){
  const parts = _collectIKHandleParts();
  if(!parts.length) return null;
  const rect = canvas.getBoundingClientRect();
  _ikV2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ikRay.setFromCamera(_ikV2, _useOrtho ? _orthoCamera : camera);
  const hits = _ikRay.intersectObjects(parts, false);
  return hits.length ? hits[0].object : null;
}
function _captureFigureBoneState(L){
  if(!L||!L.figureBones) return null;
  const snap = {};
  for(const n in L.figureBones){ snap[n] = L.figureBones[n].quaternion.clone(); }
  return snap;
}
// Recompute L.figurePose Euler from the bone's CURRENT quaternion vs its rest quaternion.
// Called after any direct bone manipulation (rotate gizmo or IK) so panel sliders stay in sync.
const _syncTmpQ = new THREE.Quaternion();
const _syncTmpE = new THREE.Euler();
function _syncFigurePoseFromBone(L, boneName){
  if(!L||!L.figureBones) return;
  const bone = L.figureBones[boneName]; if(!bone) return;
  const rest = bone.userData && bone.userData._restQ;
  if(rest){
    _syncTmpQ.copy(rest).invert().multiply(bone.quaternion);
  } else {
    _syncTmpQ.copy(bone.quaternion);
  }
  _syncTmpE.setFromQuaternion(_syncTmpQ, 'XYZ');
  if(!L.figurePose) L.figurePose = {};
  L.figurePose[boneName] = {
    x: THREE.MathUtils.radToDeg(_syncTmpE.x),
    y: THREE.MathUtils.radToDeg(_syncTmpE.y),
    z: THREE.MathUtils.radToDeg(_syncTmpE.z),
  };
  L.figureLastPose = ''; // user manually edited — clear preset highlight
}
function _syncFigurePoseFromAllBones(L){
  if(!L||!L.figureBones) return;
  for(const n in L.figureBones) _syncFigurePoseFromBone(L, n);
}
// Update the bone-rotation sliders/inputs in the panel WITHOUT re-rendering the whole panel
function _updateBonePoseSliderDisplay(L){
  if(!L) return;
  const sel = L.figureSelectedBone;
  const pose = (L.figurePose && L.figurePose[sel]) || {x:0,y:0,z:0};
  for(const ax of ['x','y','z']){
    const numEl = document.getElementById('lt-bone-r'+ax);
    const rngEl = document.getElementById('lt-bone-r'+ax+'-rng');
    if(numEl) numEl.value = (pose[ax]||0).toFixed(0);
    if(rngEl) rngEl.value = (pose[ax]||0).toFixed(1);
  }
}
function _startIKHandleDrag(child, clientX, clientY){
  // child is either central sphere or an axis cone — both inside the handle Group
  const handle = child.parent;
  if(!handle) return;
  _ikDrag.active = true;
  _ikDrag.handle = handle;
  _ikDrag.layerId = (handle.userData||{}).figureLayerId;
  _ikDrag.startPos.copy(handle.position);
  // Capture bone snapshot for undo (one per drag session)
  const L = findLayer(_ikDrag.layerId);
  if(L && L.figureBones){
    pushGlobalUndo({
      type:'figure-bones', id:L.id,
      bones: _captureFigureBoneState(L),
      pose: JSON.parse(JSON.stringify(L.figurePose||{})),
      lastPose: L.figureLastPose||'',
    });
  }

  const cam = _useOrtho ? _orthoCamera : camera;
  const camDir = new THREE.Vector3();
  cam.getWorldDirection(camDir);

  if(child.userData.isIKAxisHandle){
    // Axis-constrained: define a plane that contains the axis and faces camera
    _ikDrag.axisName = child.userData.ikAxis;
    _ikDrag.axisVec.set(_ikDrag.axisName==='x'?1:0, _ikDrag.axisName==='y'?1:0, _ikDrag.axisName==='z'?1:0);
    // plane normal = (cam × axis) × axis  → contains axis, perpendicular to camera view
    const planeN = new THREE.Vector3().crossVectors(camDir, _ikDrag.axisVec).cross(_ikDrag.axisVec);
    if(planeN.lengthSq() < 1e-6) planeN.set(0,1,0);  // degenerate (axis parallel to view)
    planeN.normalize();
    _ikDrag.plane.setFromNormalAndCoplanarPoint(planeN, handle.position);
  } else {
    // Free drag on plane perpendicular to view
    _ikDrag.axisName = null;
    _ikDrag.plane.setFromNormalAndCoplanarPoint(camDir, handle.position);
  }
  // Cache initial mouse-on-plane point as anchor for axis projection
  const rect = canvas.getBoundingClientRect();
  _ikV2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ikRay.setFromCamera(_ikV2, cam);
  _ikRay.ray.intersectPlane(_ikDrag.plane, _ikDrag.startHit);
}
function _updateIKHandleDrag(clientX, clientY){
  if(!_ikDrag.active || !_ikDrag.handle) return;
  const rect = canvas.getBoundingClientRect();
  _ikV2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ikRay.setFromCamera(_ikV2, _useOrtho ? _orthoCamera : camera);
  const hitPoint = new THREE.Vector3();
  if(!_ikRay.ray.intersectPlane(_ikDrag.plane, hitPoint)) return;
  if(_ikDrag.axisName){
    // Project (hit - startHit) onto axis to get scalar movement along that axis
    const delta = hitPoint.sub(_ikDrag.startHit);
    const along = delta.dot(_ikDrag.axisVec);
    _ikDrag.handle.position.copy(_ikDrag.startPos).addScaledVector(_ikDrag.axisVec, along);
  } else {
    _ikDrag.handle.position.copy(hitPoint);
  }
  const L = findLayer(_ikDrag.layerId);
  if(L && L.figureSelectedBone){
    // Live-sync slider for the currently selected bone
    _syncFigurePoseFromBone(L, L.figureSelectedBone);
    _updateBonePoseSliderDisplay(L);
  }
  markDirty(8);
}
function _endIKHandleDrag(){
  if(_ikDrag.active){
    const L = findLayer(_ikDrag.layerId);
    if(L){
      _syncFigurePoseFromAllBones(L);
      renderTransformPanel();
    }
  }
  _ikDrag.active = false;
  _ikDrag.handle = null;
  _ikDrag.layerId = null;
  _ikDrag.axisName = null;
}

// toggleFigureIK is now a no-op (figure IK mode has been removed). Kept as
// an exported stub so any stale onclick / saved-project metadata referencing
// it resolves cleanly instead of throwing ReferenceError.
window.toggleFigureIK = function(){};

// Figure IK mode has been removed. _updateFigureIK is now a no-op kept only
// so the animate-loop call site (`if(window._updateFigureIK) ...`) still
// resolves cheaply, and so any external code paths that reference it don't
// throw. The CCD-IK solver and per-frame solve loop are no longer run.
window._updateFigureIK = function(){};

// Per-frame: sync world-space bone marker positions to their linked bones.
window._updateFigureMarkers = function(){
  for(const L of layers){
    if(L.type!=='figure' || !L.figureMarkers) continue;
    for(const mk of L.figureMarkers){
      const b = mk.userData._linkedBone; if(!b) continue;
      b.updateMatrixWorld(true);
      b.getWorldPosition(mk.position);
    }
  }
};

window.toggleFigureBones = function(layerId){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  L.figureShowBones = !L.figureShowBones;
  // Use the central visibility sync — it respects current selection state and
  // turns the helper / markers off if the layer isn't selected anyway.
  _syncFigureBoneVisibility();
  renderTransformPanel();
  markDirty(8);
};

// Restore figure rig from serialized pose data (used by ZIP load) — async to allow GLB load
window._restoreFigureFromEntry = async function(entry){
  const heightCm   = entry.figureHeight || FIGURE_REF_HEIGHT_CM;
  const source     = entry.figureSource || 'procedural';
  const skinColor  = entry.figureSkinColor  || '#dcd8d2';
  const jointColor = entry.figureJointColor || '#888888';
  let figure;
  if(source==='mixamo' || source==='quaternius'){
    try {
      figure = await _buildMixamoFigure(heightCm, {skinColor, jointColor});
    } catch(e){
      console.warn('[restore] Mixamo GLB load failed, falling back to procedural:', e);
      figure = _addProceduralFigureToScene(heightCm);
    }
  } else {
    figure = _addProceduralFigureToScene(heightCm);
  }
  const { root, bones } = figure;
  const pose = entry.figurePose || _emptyPoseData();
  for(const [name, rot] of Object.entries(pose)){
    const b = bones[name]; if(!b) continue;
    _applyBonePose(b, rot);
  }
  if(entry.figureSkinColor){
    root.traverse(o=>{
      if((o.isMesh||o.isSkinnedMesh) && o.userData && o.userData.figureLimb && !(o.userData && o.userData.jointMarker)){
        if(o.material && o.material.color) o.material.color.set(entry.figureSkinColor);
      }
    });
  }
  if(entry.figureJointColor){
    root.traverse(o=>{
      if(o.userData && o.userData.jointMarker && o.material && o.material.color){
        o.material.color.set(entry.figureJointColor);
      }
    });
  }
  return { root, bones, pose, source:figure.source };
};

