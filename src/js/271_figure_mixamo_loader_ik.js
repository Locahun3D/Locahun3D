// ── Inverse Kinematics ────────────────────────────────────────────────────
// Lightweight CCD (Cyclic Coordinate Descent) solver — no skeleton modification needed.
// Each chain rotates its links so the last bone (effector) reaches a world-space target.
const _ikTmpV1 = new THREE.Vector3();
const _ikTmpV2 = new THREE.Vector3();
const _ikTmpV3 = new THREE.Vector3();
const _ikTmpQ  = new THREE.Quaternion();
const _ikTmpQ2 = new THREE.Quaternion();
function _solveCCDIK(chain, targetWorld, iterations){
  // chain[0]=root link, chain[chain.length-1]=effector
  if(chain.length < 2) return;
  const it = iterations || 6;
  const effector = chain[chain.length - 1];
  for(let pass=0; pass<it; pass++){
    let improved = false;
    for(let i = chain.length - 2; i >= 0; i--){
      const bone = chain[i];
      bone.updateMatrixWorld(true);
      effector.updateMatrixWorld(true);
      const bonePos = bone.getWorldPosition(_ikTmpV1);
      const effPos  = effector.getWorldPosition(_ikTmpV2);
      const toEff = _ikTmpV3.copy(effPos).sub(bonePos);
      const lenE  = toEff.length(); if(lenE < 1e-6) continue;
      toEff.divideScalar(lenE);
      const toTgt = new THREE.Vector3().copy(targetWorld).sub(bonePos);
      const lenT  = toTgt.length(); if(lenT < 1e-6) continue;
      toTgt.divideScalar(lenT);
      const dot = Math.max(-1, Math.min(1, toEff.dot(toTgt)));
      if(dot > 0.99995) continue;
      const angle = Math.acos(dot);
      const axisW = new THREE.Vector3().crossVectors(toEff, toTgt);
      if(axisW.lengthSq() < 1e-10) continue;
      axisW.normalize();
      // Convert world-space axis to bone-local rotation by going through parent's inverse
      bone.parent.updateMatrixWorld(true);
      const parentInvQ = bone.parent.getWorldQuaternion(_ikTmpQ).invert();
      const axisL = axisW.applyQuaternion(parentInvQ).normalize();
      _ikTmpQ2.setFromAxisAngle(axisL, angle);
      bone.quaternion.multiply(_ikTmpQ2);
      improved = true;
    }
    if(!improved) break;
  }
}

// Helper: rebuild a bone's orientation from its captured rest quaternion + per-axis pose deltas
const _figTmpEuler = new THREE.Euler();
const _figTmpQuat  = new THREE.Quaternion();
function _applyBonePose(bone, poseDeg){
  const rest = bone.userData && (bone.userData._restQ || null);
  _figTmpEuler.set(
    THREE.MathUtils.degToRad(poseDeg.x||0),
    THREE.MathUtils.degToRad(poseDeg.y||0),
    THREE.MathUtils.degToRad(poseDeg.z||0),
    'XYZ'
  );
  _figTmpQuat.setFromEuler(_figTmpEuler);
  if(rest){
    bone.quaternion.copy(rest).multiply(_figTmpQuat);
  } else {
    bone.quaternion.copy(_figTmpQuat);
  }
}

window.setFigureBoneRotation = function(layerId, boneName, axis, deg){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  const bone = L.figureBones && L.figureBones[boneName]; if(!bone) return;
  if(!L.figurePose[boneName]) L.figurePose[boneName] = {x:0,y:0,z:0};
  const v = parseFloat(deg); if(!isFinite(v)) return;
  // Debounced undo capture: snapshot pre-state once per drag session (~700ms idle window)
  if(!L._figUndoPending){
    L._figUndoPending = true;
    pushGlobalUndo({type:'figure-pose', id:L.id,
      pose: JSON.parse(JSON.stringify(L.figurePose||{})),
      lastPose: L.figureLastPose||''});
    if(L._figUndoT) clearTimeout(L._figUndoT);
    L._figUndoT = setTimeout(()=>{ if(L) L._figUndoPending=false; }, 700);
  } else if(L._figUndoT){
    // Extend window while user is still dragging
    clearTimeout(L._figUndoT);
    L._figUndoT = setTimeout(()=>{ if(L) L._figUndoPending=false; }, 700);
  }
  L.figurePose[boneName][axis] = v;
  L.figureLastPose = ''; // clear preset highlight when manually edited
  _applyBonePose(bone, L.figurePose[boneName]);
  markDirty(8);
};

window.setFigureSelectedBone = function(layerId, boneName){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  L.figureSelectedBone = boneName;
  // Highlight active joint marker
  if(L.figureBones){
    const baseClr = new THREE.Color(L.figureJointColor||'#ff8844');
    const hotClr  = new THREE.Color(0xffee44);
    for(const n of FIGURE_BONE_ORDER){
      const b = L.figureBones[n]; if(!b) continue;
      for(const ch of b.children){
        if(ch.userData && ch.userData.jointMarker){
          ch.material.color.copy(n===boneName ? hotClr : baseClr);
        }
      }
    }
  }
  renderTransformPanel();
  markDirty(8);
};

window.applyFigurePose = function(layerId, poseName){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  // Capture pre-state for undo
  pushGlobalUndo({type:'figure-pose', id:L.id,
    pose: JSON.parse(JSON.stringify(L.figurePose||{})),
    lastPose: L.figureLastPose||''});
  const pose = FIGURE_POSES[poseName] || {};
  // Reset all bones first
  for(const n of FIGURE_BONE_ORDER){
    L.figurePose[n] = {x:0,y:0,z:0};
    const b = L.figureBones && L.figureBones[n]; if(!b) continue;
    _applyBonePose(b, L.figurePose[n]);
  }
  // Apply preset deltas
  for(const [name, rot] of Object.entries(pose)){
    const b = L.figureBones && L.figureBones[name]; if(!b) continue;
    L.figurePose[name] = {x:rot.x||0, y:rot.y||0, z:rot.z||0};
    _applyBonePose(b, L.figurePose[name]);
  }
  L.figureLastPose = poseName;
  renderTransformPanel();
  markDirty(8);
};

window.resetFigurePose = function(layerId){
  window.applyFigurePose(layerId, 'rest');
};

// Export current figure pose as a JSON-formatted string suitable for pasting into
// FIGURE_POSES. Bones with all-zero rotations are omitted to keep the output compact.
window.exportFigurePose = function(layerId){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  const pose = L.figurePose || {};
  const lines = [];
  for(const n of FIGURE_BONE_ORDER){
    const r = pose[n]; if(!r) continue;
    const rx = +(r.x||0).toFixed(1), ry = +(r.y||0).toFixed(1), rz = +(r.z||0).toFixed(1);
    if(Math.abs(rx)<0.05 && Math.abs(ry)<0.05 && Math.abs(rz)<0.05) continue;
    const parts = [];
    if(Math.abs(rx)>=0.05) parts.push(`x:${rx}`);
    if(Math.abs(ry)>=0.05) parts.push(`y:${ry}`);
    if(Math.abs(rz)>=0.05) parts.push(`z:${rz}`);
    lines.push(`  ${n}: {${parts.join(', ')}},`);
  }
  const out = lines.length
    ? `{\n${lines.join('\n')}\n}`
    : `{}`;
  // Copy to clipboard
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(out).catch(()=>{});
  }
  // Show in a transient overlay so user can copy manually if clipboard fails
  let box = document.getElementById('pose-export-box');
  if(!box){
    box = document.createElement('div');
    box.id = 'pose-export-box';
    box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;'
      + 'background:rgba(20,20,22,.97);border:1px solid #ffb454;border-radius:8px;'
      + 'padding:14px 16px;max-width:560px;width:90vw;color:#e0e0e0;font-family:ui-sans-serif,system-ui;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.6);';
    document.body.appendChild(box);
  }
  const _en = window._lang === 'en';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="color:#ffb454;font-size:.95em">📋 ${_en?'Pose JSON':'ポーズ JSON'}</strong>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#888;font-size:1.4em;cursor:pointer;line-height:1">✕</button>
    </div>
    <div style="font-size:.7em;color:#888;margin-bottom:6px">${_en?'Copied to clipboard. Paste into chat to save as preset.':'クリップボードにコピー済み。チャットに貼り付けてプリセット化してください。'}</div>
    <textarea readonly style="width:100%;height:240px;background:#0a0a0c;border:1px solid rgba(255,255,255,.15);color:#cce0ff;border-radius:4px;padding:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78em;line-height:1.5;resize:vertical;outline:none">${out}</textarea>`;
  showUndoToast(_en ? '📋 Pose JSON copied' : '📋 ポーズ JSON をコピーしました');
};

window.setFigureJointColor = function(layerId, hex){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  L.figureJointColor = hex;
  if(!L.mesh) return;
  L.mesh.traverse(o=>{
    if(o.userData && o.userData.jointMarker && o.material && o.material.color){
      o.material.color.set(hex);
    }
  });
  markDirty(8);
};

window.setFigureSkinColor = function(layerId, hex){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  L.figureSkinColor = hex;
  if(!L.mesh) return;
  L.mesh.traverse(o=>{
    if(o.isMesh && o.userData && o.userData.figureLimb){
      o.material.color.set(hex);
    }
  });
  markDirty(8);
};

window.toggleFigureJoints = function(layerId){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  L.figureShowJoints = !L.figureShowJoints;
  if(L.mesh) L.mesh.traverse(o=>{
    if(o.userData && o.userData.jointMarker) o.visible = L.figureShowJoints;
  });
  renderTransformPanel();
  markDirty(8);
};

// ── IK handle drag state + helpers (free drag on center sphere, axis-constrained on cones) ──
const _ikDrag = {
  active:false, handle:null, layerId:null, axisName:null,
  axisVec:new THREE.Vector3(), startPos:new THREE.Vector3(), startHit:new THREE.Vector3(),
  plane:new THREE.Plane(),
};
const _ikRay = new THREE.Raycaster();
const _ikV2 = new THREE.Vector2();

// ── Bone-rotation pivot gizmo (shown around selected bone, drag to rotate locally) ──
let _boneRotateGizmo = null;
const _boneRotDrag = {
  active:false, layerId:null, boneName:null, axis:null,
  bonePos:new THREE.Vector3(), localAxis:new THREE.Vector3(),
  startVec:new THREE.Vector3(), startQ:new THREE.Quaternion(),
  plane:new THREE.Plane(),
};
function _buildBoneRotateGizmo(){
  const grp = new THREE.Group();
  grp.userData.isBoneRotateGizmo = true;
  grp.renderOrder = 9999;
  grp.visible = false;
  const ringR = 0.18, tubeR = 0.006;  // half-thickness rings
  const axes = [
    {name:'x', col:0xff5566, rot:[0, Math.PI/2, 0]},  // ring around X axis (in YZ plane)
    {name:'y', col:0x55ee66, rot:[Math.PI/2, 0, 0]},  // ring around Y axis (in XZ plane)
    {name:'z', col:0x5599ff, rot:[0, 0, 0]},          // ring around Z axis (in XY plane)
  ];
  for(const a of axes){
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringR, tubeR, 10, 64),
      new THREE.MeshBasicMaterial({color: a.col, depthTest: false, depthWrite: false, transparent: true, opacity: 1})
    );
    ring.rotation.set(a.rot[0], a.rot[1], a.rot[2]);
    ring.userData.isBoneRotateRing = true;
    ring.userData.boneRotateAxis = a.name;
    ring.userData._baseColor = a.col;
    ring.renderOrder = 9999;
    grp.add(ring);
  }
  return grp;
}
window._updateBoneRotateGizmo = function(){
  const L = (typeof selectedLayerId !== 'undefined') ? findLayer(selectedLayerId) : null;
  if(!L || L.type!=='figure' || !L.figureBones || !L.figureSelectedBone){
    if(_boneRotateGizmo) _boneRotateGizmo.visible = false;
    return;
  }
  const bone = L.figureBones[L.figureSelectedBone];
  if(!bone){ if(_boneRotateGizmo) _boneRotateGizmo.visible = false; return; }
  if(!_boneRotateGizmo){
    _boneRotateGizmo = _buildBoneRotateGizmo();
    scene.add(_boneRotateGizmo);
  }
  bone.updateMatrixWorld(true);
  bone.getWorldPosition(_boneRotateGizmo.position);
  bone.getWorldQuaternion(_boneRotateGizmo.quaternion);
  _boneRotateGizmo.visible = true;
};
function _checkBoneRotateRingHit(clientX, clientY){
  if(!_boneRotateGizmo || !_boneRotateGizmo.visible) return null;
  const rings = [];
  _boneRotateGizmo.traverse(o=>{ if(o.userData && o.userData.isBoneRotateRing) rings.push(o); });
  if(!rings.length) return null;
  const rect = canvas.getBoundingClientRect();
  _ikV2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ikRay.setFromCamera(_ikV2, _useOrtho ? _orthoCamera : camera);
  const hits = _ikRay.intersectObjects(rings, false);
  return hits.length ? hits[0].object : null;
}
function _startBoneRotateDrag(ring, clientX, clientY){
  const L = findLayer(selectedLayerId);
  if(!L || !L.figureBones) return;
  const boneName = L.figureSelectedBone;
  const bone = L.figureBones[boneName]; if(!bone) return;
  // Capture undo
  pushGlobalUndo({
    type:'figure-bones', id:L.id,
    bones: _captureFigureBoneState(L),
    pose: JSON.parse(JSON.stringify(L.figurePose||{})),
    lastPose: L.figureLastPose||'',
  });
  _boneRotDrag.active = true;
  _boneRotDrag.layerId = L.id;
  _boneRotDrag.boneName = boneName;
  _boneRotDrag.axis = ring.userData.boneRotateAxis;
  _boneRotDrag.startQ.copy(bone.quaternion);
  // Bone-local axis vector
  _boneRotDrag.localAxis.set(
    _boneRotDrag.axis==='x'?1:0,
    _boneRotDrag.axis==='y'?1:0,
    _boneRotDrag.axis==='z'?1:0
  );
  // World axis = local axis transformed by bone's CURRENT world quaternion
  bone.updateMatrixWorld(true);
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const worldAxis = _boneRotDrag.localAxis.clone().applyQuaternion(worldQ).normalize();
  bone.getWorldPosition(_boneRotDrag.bonePos);
  _boneRotDrag.plane.setFromNormalAndCoplanarPoint(worldAxis, _boneRotDrag.bonePos);
  // Cache initial mouse-to-bone vector on plane (used as angular reference)
  const rect = canvas.getBoundingClientRect();
  _ikV2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ikRay.setFromCamera(_ikV2, _useOrtho ? _orthoCamera : camera);
  const startHit = new THREE.Vector3();
  _ikRay.ray.intersectPlane(_boneRotDrag.plane, startHit);
  _boneRotDrag.startVec.copy(startHit).sub(_boneRotDrag.bonePos);
  if(_boneRotDrag.startVec.lengthSq() < 1e-6) _boneRotDrag.startVec.set(1,0,0);
}
function _updateBoneRotateDrag(clientX, clientY){
  if(!_boneRotDrag.active) return;
  const L = findLayer(_boneRotDrag.layerId); if(!L||!L.figureBones) return;
  const bone = L.figureBones[_boneRotDrag.boneName]; if(!bone) return;
  const rect = canvas.getBoundingClientRect();
  _ikV2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ikRay.setFromCamera(_ikV2, _useOrtho ? _orthoCamera : camera);
  const hit = new THREE.Vector3();
  if(!_ikRay.ray.intersectPlane(_boneRotDrag.plane, hit)) return;
  const curVec = hit.sub(_boneRotDrag.bonePos);
  if(curVec.lengthSq() < 1e-6) return;
  // Signed angle from startVec to curVec around plane normal
  const a = _boneRotDrag.startVec.clone().normalize();
  const b = curVec.clone().normalize();
  const cosA = Math.max(-1, Math.min(1, a.dot(b)));
  const cross = new THREE.Vector3().crossVectors(a, b);
  const sign = Math.sign(cross.dot(_boneRotDrag.plane.normal));
  const angle = Math.acos(cosA) * (sign||1);
  // Apply: bone.quaternion = startQ * Q(localAxis, angle)
  const deltaQ = new THREE.Quaternion().setFromAxisAngle(_boneRotDrag.localAxis, angle);
  bone.quaternion.copy(_boneRotDrag.startQ).multiply(deltaQ);
  // Snap IK target handles back so they don't fight the rotation
  if(L.ikChains){
    for(const k in L.ikChains){
      const c = L.ikChains[k];
      const eff = c.chain[c.chain.length-1];
      eff.updateMatrixWorld(true);
      eff.getWorldPosition(c.target);
      if(c.handle) c.handle.position.copy(c.target);
    }
  }
  // Live-sync L.figurePose + slider display so the panel stays in sync with the rotation
  _syncFigurePoseFromBone(L, _boneRotDrag.boneName);
  _updateBonePoseSliderDisplay(L);
  markDirty(8);
}
function _endBoneRotateDrag(){
  if(_boneRotDrag.active){
    const L = findLayer(_boneRotDrag.layerId);
    if(L && _boneRotDrag.boneName){
      _syncFigurePoseFromBone(L, _boneRotDrag.boneName);
      renderTransformPanel();
    }
  }
  _boneRotDrag.active = false;
  _boneRotDrag.layerId = null;
  _boneRotDrag.boneName = null;
  _boneRotDrag.axis = null;
}

