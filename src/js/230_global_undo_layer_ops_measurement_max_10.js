// ══════════════════════════════════════════════════
//  GLOBAL UNDO  (layer ops + measurement, max 10)
// ══════════════════════════════════════════════════
const MAX_GLOBAL_UNDO = 20;
const globalUndoStack = [];
const globalRedoStack = [];

// Suppress undo recording while we are APPLYING an undo/redo state — otherwise
// the apply path's setter would re-enter pushGlobalUndo and pollute the stack.
let _suppressUndoCapture = false;

function pushGlobalUndo(snapshot){
  if(_suppressUndoCapture) return;
  globalUndoStack.push(snapshot);
  if(globalUndoStack.length > MAX_GLOBAL_UNDO) globalUndoStack.shift();
  globalRedoStack.length = 0; // new action clears redo
}

// Debounced "generic" undo helper for simple value settings (camera focal,
// quality level, env preset, etc.). Captures one snapshot per ~700ms editing
// burst per `key`, with a stable apply function that takes a stored value
// and re-runs the original setter.
const _genericPending = new Map();
function pushGenericUndo(key, before, after, apply){
  if(_suppressUndoCapture) return;
  if(JSON.stringify(before) === JSON.stringify(after)) return;
  // Coalesce within a debounce window: keep the FIRST "before" but always
  // update the latest "after" — so a slider drag gives one undo entry, not 50.
  const pending = _genericPending.get(key);
  if(pending){
    pending.snap.after = after;
    clearTimeout(pending.timer);
    pending.timer = setTimeout(()=>_genericPending.delete(key), 700);
    return;
  }
  const snap = {type:'generic', key, before, after, apply};
  globalUndoStack.push(snap);
  if(globalUndoStack.length > MAX_GLOBAL_UNDO) globalUndoStack.shift();
  globalRedoStack.length = 0;
  const timer = setTimeout(()=>_genericPending.delete(key), 700);
  _genericPending.set(key, {snap, timer});
}

// Run any pending update synchronously (called by undo/redo so the very last
// sub-update isn't lost in the debounce window).
function _flushGenericPending(){
  for(const v of _genericPending.values()){ clearTimeout(v.timer); }
  _genericPending.clear();
}

function globalRedo(){
  _flushGenericPending();
  if(!globalRedoStack.length){ showUndoToast(T('redo-none')); return; }
  const s = globalRedoStack.pop();
  if(s.type==='generic'){
    globalUndoStack.push(s);
    _suppressUndoCapture = true;
    try { s.apply(s.after); } finally { _suppressUndoCapture = false; }
    showUndoToast(T('redo-move'));
    markDirty(4);
    return;
  }
  if(s.type==='layer-transform'){
    const L=findLayer(s.id); if(!L) return;
    // re-apply the "after" state
    L.pos={...s.posAfter}; L.rot={...s.rotAfter}; if(s.sizeAfter) L.size={...s.sizeAfter}; if(s.scaleAfter) L.scale={...s.scaleAfter};
    applyLayerTransform(s.id);
    renderTransformPanel();
    showUndoToast(T('redo-move'));
  } else if(s.type==='figure-height'){
    const L = findLayer(s.id); if(!L) return;
    L.figureHeight = s.heightAfter;
    if(L.mesh){
      const sg = L.mesh.children.find(c=>c.userData && c.userData.isHeightScale);
      if(sg){
        const naturalM = sg.userData.naturalMeters || (FIGURE_REF_HEIGHT_CM / 100);
        sg.scale.setScalar((s.heightAfter / 100) / naturalM);
      }
    }
    renderTransformPanel();
    showUndoToast(T('redo-move'));
  } else if(s.type==='folder-delete'){
    for(const e of s.entries){
      if(e.mesh) scene.remove(e.mesh);
      if(e.wireMesh) scene.remove(e.wireMesh);
      // Re-detach figure bone markers + IK handles
      if(e.sceneAttachments) for(const obj of e.sceneAttachments){
        if(obj && obj.parent) obj.parent.remove(obj);
      }
      const idx=layers.findIndex(l=>l.id===e.id);
      if(idx>=0) layers.splice(idx,1);
      if(selectedLayerId===e.id) selectedLayerId=null;
    }
    renderLayerList(); renderTransformPanel();
    showUndoToast(T('redo-del-toast'));
    markDirty(8);
    globalUndoStack.push(s);
  } else if(s.type==='layer-delete'){
    // redo = delete again
    scene.remove(s.mesh);
    if(s.wireMesh) scene.remove(s.wireMesh);
    const idx=layers.findIndex(l=>l.id===s.id);
    if(idx>=0) layers.splice(idx,1);
    if(selectedLayerId===s.id) selectedLayerId=null;
    renderLayerList(); renderTransformPanel();
    showUndoToast(T('redo-del'));
    markDirty(8);
    // push back to undo so it can be undone again
    globalUndoStack.push(s);
  } else if(s.type==='layer-add'){
    // Redo an ADD = re-insert the captured mesh/layer.
    const e=s.entry; if(!e) return;
    if(e.mesh){ scene.add(e.mesh); e.layer.mesh=e.mesh; e.mesh.visible=true; e.layer.visible=true; }
    if(e.wireMesh){ scene.add(e.wireMesh); e.layer.wireMesh=e.wireMesh; }
    if(e.sceneAttachments) for(const obj of e.sceneAttachments){ if(obj && !obj.parent) scene.add(obj); }
    layers.push(e.layer);
    globalUndoStack.push({type:'layer-add', id:e.layer.id});
    renderLayerList();
    showUndoToast(window._lang==='en'?'↪ Add redone':'↪ 追加をやり直し');
    markDirty(8);
    if(typeof _recountLayerActivity==='function') _recountLayerActivity();
    if(typeof _haloMarkDirty==='function') _haloMarkDirty();
  } else if(s.type==='figure-pose'){
    const L=findLayer(s.id); if(!L||L.type!=='figure') return;
    // re-apply the "after" state
    L.figurePose = JSON.parse(JSON.stringify(s.poseAfter||{}));
    L.figureLastPose = s.lastPoseAfter||'';
    if(L.figureBones){
      for(const n of FIGURE_BONE_ORDER){
        const b=L.figureBones[n]; if(!b) continue;
        _applyBonePose(b, L.figurePose[n] || {x:0,y:0,z:0});
      }
    }
    renderTransformPanel();
    showUndoToast(T('redo-pose'));
    markDirty(8);
    globalUndoStack.push({type:'figure-pose', id:s.id, pose:s.pose, lastPose:s.lastPose,
      poseAfter:s.poseAfter, lastPoseAfter:s.lastPoseAfter});
  } else if(s.type==='figure-bones'){
    const L=findLayer(s.id); if(!L||L.type!=='figure'||!L.figureBones) return;
    // Re-apply "after" bone state
    for(const n in s.bonesAfter){
      if(L.figureBones[n]) L.figureBones[n].quaternion.copy(s.bonesAfter[n]);
    }
    L.figurePose = JSON.parse(JSON.stringify(s.poseAfter||{}));
    L.figureLastPose = s.lastPoseAfter||'';
    if(L.ikChains){
      for(const k in L.ikChains){
        const c = L.ikChains[k];
        const eff = c.chain[c.chain.length-1];
        eff.updateMatrixWorld(true);
        eff.getWorldPosition(c.target);
        if(c.handle) c.handle.position.copy(c.target);
      }
    }
    renderTransformPanel();
    showUndoToast(T('redo-pose'));
    markDirty(8);
    globalUndoStack.push({type:'figure-bones', id:s.id,
      bones: s.bones, pose: s.pose, lastPose: s.lastPose,
      bonesAfter: s.bonesAfter, poseAfter: s.poseAfter, lastPoseAfter: s.lastPoseAfter,
    });
  }
}

// Exposed for the top-bar "↩ 戻る" button (inline onclick runs in GLOBAL scope and
// can't see the module-scoped globalUndo). Mirrors the Ctrl+Z behaviour: undo the
// last measurement step while measuring, else the last scene action.
window.topbarUndo = function(){
  if(typeof msr!=='undefined' && msr.active && msr.undoStack && msr.undoStack.length) window.undoMeasure();
  else globalUndo();
};
function globalUndo(){
  _flushGenericPending();
  if(!globalUndoStack.length){ showUndoToast(T('undo-none')); return; }
  const s = globalUndoStack.pop();
  if(s.type==='generic'){
    globalRedoStack.push(s);
    _suppressUndoCapture = true;
    try { s.apply(s.before); } finally { _suppressUndoCapture = false; }
    showUndoToast(T('undo-move'));
    markDirty(4);
    return;
  }
  if(s.type==='layer-transform'){
    const L=findLayer(s.id); if(!L) return;
    // Save current for redo
    globalRedoStack.push({type:'layer-transform', id:s.id,
      posAfter:{...L.pos}, rotAfter:{...L.rot}, sizeAfter:{...L.size}, scaleAfter:{...(L.scale||{x:1,y:1,z:1})},
      pos:{...s.pos}, rot:{...s.rot}, size:{...s.size}});
    L.pos={...s.pos}; L.rot={...s.rot}; if(s.size) L.size={...s.size}; if(s.scale) L.scale={...s.scale};
    applyLayerTransform(s.id);
    renderTransformPanel();
    showUndoToast(T('undo-move'));
  } else if(s.type==='figure-height'){
    const L = findLayer(s.id); if(!L) return;
    globalRedoStack.push({type:'figure-height', id:s.id,
      heightAfter:L.figureHeight||FIGURE_REF_HEIGHT_CM, height:s.height});
    L.figureHeight = s.height;
    if(L.mesh){
      const sg = L.mesh.children.find(c=>c.userData && c.userData.isHeightScale);
      if(sg){
        const naturalM = sg.userData.naturalMeters || (FIGURE_REF_HEIGHT_CM / 100);
        sg.scale.setScalar((s.height / 100) / naturalM);
      }
    }
    renderTransformPanel();
    showUndoToast(T('undo-move'));
  } else if(s.type==='folder-delete'){
    globalRedoStack.push(s);
    for(const e of s.entries){
      if(e.mesh){ scene.add(e.mesh); e.layer.mesh=e.mesh; e.mesh.visible=true; e.layer.visible=true; }
      if(e.wireMesh){ scene.add(e.wireMesh); e.layer.wireMesh=e.wireMesh; }
      // Re-attach figure bone markers + IK handles to scene root
      if(e.sceneAttachments) for(const obj of e.sceneAttachments){
        if(obj && !obj.parent) scene.add(obj);
      }
      layers.push(e.layer);
    }
    renderLayerList();
    showUndoToast(T('undo-del-toast'));
    markDirty(8);
  } else if(s.type==='layer-delete'){
    globalRedoStack.push(s); // redo = delete again
    scene.add(s.mesh);
    s.layer.mesh = s.mesh;
    s.layer.visible = true;
    s.mesh.visible = true;
    if(s.wireMesh){ scene.add(s.wireMesh); s.layer.wireMesh=s.wireMesh; }
    layers.push(s.layer);
    renderLayerList();
    showUndoToast(T('undo-del'));
    markDirty(8);
  } else if(s.type==='layer-add'){
    // Undo an object ADD = remove it (capture for redo). Mirrors the delete
    // capture so redo can re-add the exact same mesh/layer.
    const L=findLayer(s.id); if(!L) return;
    const entry={ id:L.id, mesh:L.mesh, wireMesh:L.wireMesh||null,
      sceneAttachments:_collectLayerSceneAttachments(L), layer:Object.assign({},L) };
    globalRedoStack.push({type:'layer-add', entry});
    if(L.mesh) scene.remove(L.mesh);
    if(L.wireMesh) scene.remove(L.wireMesh);
    _detachLayerSceneAttachments(L);
    const idx=layers.indexOf(L); if(idx>=0) layers.splice(idx,1);
    if(selectedLayerId===L.id) selectedLayerId=null;
    if(window.selectedLayerIds) window.selectedLayerIds.delete(L.id);
    if(typeof lpv!=='undefined' && lpv && lpv.group && selectedLayerId==null) lpv.group.visible=false;
    renderLayerList(); renderTransformPanel();
    showUndoToast(window._lang==='en'?'↩ Add undone':'↩ 追加を取り消し');
    markDirty(8);
    if(typeof _recountLayerActivity==='function') _recountLayerActivity();
    if(typeof _haloMarkDirty==='function') _haloMarkDirty();
  } else if(s.type==='figure-pose'){
    const L=findLayer(s.id); if(!L||L.type!=='figure') return;
    // Save current pose for redo
    globalRedoStack.push({type:'figure-pose', id:s.id,
      pose:{...JSON.parse(JSON.stringify(L.figurePose||{}))},
      lastPose:L.figureLastPose||'',
      poseAfter:s.pose, lastPoseAfter:s.lastPose});
    // Restore prev pose
    L.figurePose = JSON.parse(JSON.stringify(s.pose||{}));
    L.figureLastPose = s.lastPose||'';
    if(L.figureBones){
      for(const n of FIGURE_BONE_ORDER){
        const b=L.figureBones[n]; if(!b) continue;
        _applyBonePose(b, L.figurePose[n] || {x:0,y:0,z:0});
      }
    }
    renderTransformPanel();
    showUndoToast(T('undo-pose'));
    markDirty(8);
  } else if(s.type==='figure-bones'){
    const L=findLayer(s.id); if(!L||L.type!=='figure'||!L.figureBones) return;
    // Save current state for redo
    globalRedoStack.push({type:'figure-bones', id:s.id,
      bones:_captureFigureBoneState(L),
      pose: JSON.parse(JSON.stringify(L.figurePose||{})),
      lastPose: L.figureLastPose||'',
      bonesAfter: s.bones, poseAfter: s.pose, lastPoseAfter: s.lastPose,
    });
    // Restore bone quaternions
    for(const n in s.bones){
      if(L.figureBones[n]) L.figureBones[n].quaternion.copy(s.bones[n]);
    }
    L.figurePose = JSON.parse(JSON.stringify(s.pose||{}));
    L.figureLastPose = s.lastPose||'';
    // Snap IK target handles back to current effector positions so they don't drift
    if(L.ikChains){
      for(const k in L.ikChains){
        const c = L.ikChains[k];
        const eff = c.chain[c.chain.length-1];
        eff.updateMatrixWorld(true);
        eff.getWorldPosition(c.target);
        if(c.handle) c.handle.position.copy(c.target);
      }
    }
    renderTransformPanel();
    showUndoToast(T('undo-pose'));
    markDirty(8);
  } else if(s.type==='measure'){
    if(msr.active){
      msr.undoStack.push(s.msrState);
      window.undoMeasure();
    } else {
      showUndoToast(T('undo-msr'));
      globalUndoStack.push(s);
    }
  }
}

