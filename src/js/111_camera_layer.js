// ══════════════════════════════════════════════════
//  CAMERA LAYER (multi-camera placement)
//
//  saveCameraLayer() captures the current viewport's camera state
//  (position / yaw / pitch / roll / fov / aspect / sensor / focal /
//  margin / WB / labels) into a new layer of type='camera'. Camera
//  layers live inside an auto-created "Camera" folder so they're
//  visually grouped in the layer panel.
//
//  Clicking a camera-type layer (single click → selectLayer →
//  _teleportToCameraLayer) teleports the live viewport back to the
//  saved pose and enables the camera tool, so the user can flip
//  between multiple saved framings.
// ══════════════════════════════════════════════════
// Which saved-camera layer the live viewport is currently "engaged" with.
// Only set by the 🎬 button (viewCameraLayer) or by (re-)locking a camera —
// NEVER by merely selecting a camera row. When non-null AND that camera is
// locked, the animate() snap-back hook holds the viewport at the saved pose
// so accidental WASD/drag is undone. Selecting any other layer clears it.
let _engagedCamId = null;

function _ensureCameraFolder(){
  // Find first non-deleted folder whose name starts with "Camera". If
  // missing, mint one via addFolder() then rename it. addFolder() places
  // it at the top of the layer list, which matches the "Camera フォルダ
  // を作成" requirement.
  for(const L of layers){
    if(L && L.type === 'folder' && /^camera\b/i.test(L.name || '')){
      return L;
    }
  }
  const F = window.addFolder();
  F.name = 'Camera';
  F.folderColor = '#88c5ff';
  return F;
}

// Cinema-convention shot ID: `s01_c0010`, `s01_c0020`, ... The "c"
// numbers count up in increments of 10 so the editor can later insert
// pickup shots (e.g. c0015) between adjacent slate numbers without
// having to re-number anything. Per-camera-layer scan only.
function _nextCameraShotName(){
  const SCENE = 's01';
  let maxC = 0;
  const rx = new RegExp('^' + SCENE + '_c(\\d+)\\s*$', 'i');
  for(const L of layers){
    if(!L || L.type !== 'camera') continue;
    const m = (L.name || '').match(rx);
    if(m){
      const n = parseInt(m[1], 10);
      if(isFinite(n) && n > maxC) maxC = n;
    }
  }
  // First save → 0010, then 0020, 0030, ... rounding up so manual mid-
  // sequence renames (e.g. s01_c0015) still produce the next "round"
  // 0020 as the next default.
  const nextC = (Math.floor(maxC / 10) + 1) * 10;
  return `${SCENE}_c${String(nextC).padStart(4, '0')}`;
}

window.saveCameraLayer = function(){
  try {
    // Pull current camera state from live state — works whether the
    // camera tool is open or not. We always source numerical fields from
    // the live cam camera (focal/aspect/sensor/etc) so the saved layer
    // captures exactly what the user is seeing right now.
    if(cam.active){ _camPullFields(); }
    const folder = _ensureCameraFolder();
    const tag = new THREE.Group();
    // Visible marker so the saved camera shows in the 3-D scene at its
    // saved position. A short cone aligned with the saved view direction.
    const coneGeo = new THREE.ConeGeometry(0.12, 0.32, 16);
    coneGeo.translate(0, -0.16, 0);
    coneGeo.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x88c5ff, transparent: true, opacity: 0.75
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.renderOrder = 998;
    tag.add(cone);
    tag.position.copy(camPos);
    // Apply yaw/pitch (no roll on the marker itself; the marker just
    // signals POSE direction).
    tag.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');
    const L = addLayer({
      name: _nextCameraShotName(),
      type: 'camera',
      mesh: tag,
    });
    L.parentId = folder.id;
    L.pos = { x: camPos.x, y: camPos.y, z: camPos.z };
    // Saved pose — stored in RADIANS because that's the unit live state
    // uses, no degree round-trip loss when teleporting back.
    L.savedPose = {
      pos:   { x: camPos.x, y: camPos.y, z: camPos.z },
      yaw,
      pitch,
      roll:  (typeof roll === 'number') ? roll : 0,
      fov,
      focal:  cam.focal,
      aspect: cam.aspect,
      sensor: cam.sensor,
      sw:     cam.sw,
      sh:     cam.sh,
      margin: cam.margin,
      wb:     cam.wb,
      rig:    cam.rig,
      shot:   cam.shot,
      env:    cam.env,
      note:   cam.note,
    };
    // Fresh saves default to LOCKED so the view that the user just
    // framed up stays exactly where they put it — accidental WASD /
    // drag is snapped back to the saved pose each frame. The 🔓 button
    // on the layer row toggles this off when the user wants to wander
    // away from the framing without losing the saved values.
    L.locked = true;
    renderLayerList();
    selectLayer(L.id);
    showUndoToast((window._lang === 'en') ? 'Camera saved' : 'カメラを保存しました');
    return L;
  } catch(e){
    console.warn('[saveCameraLayer] failed:', e);
    showUndoToast((window._lang === 'en') ? 'Save failed' : 'カメラ保存に失敗');
    return null;
  }
};

// Teleport the live viewport back to a saved camera pose. Called from
// the patched selectLayer when the clicked layer is type==='camera'.
function _teleportToCameraLayer(L){
  if(!L || !L.savedPose) return;
  const sp = L.savedPose;
  if(sp.pos){
    camPos.set(sp.pos.x, sp.pos.y, sp.pos.z);
  }
  if(typeof sp.yaw   === 'number'){ yaw   = sp.yaw;   _yawTarget   = sp.yaw;   }
  if(typeof sp.pitch === 'number'){ pitch = sp.pitch; _pitchTarget = sp.pitch; }
  if(typeof sp.roll  === 'number'){ roll  = sp.roll;  }
  // Re-apply sensor / aspect / focal so the camera tool re-opens with the
  // same framing the user saved.
  if(typeof sp.focal  === 'number'){ cam.focal  = sp.focal;  }
  if(typeof sp.aspect === 'number'){ cam.aspect = sp.aspect; }
  if(typeof sp.sensor === 'string'){ cam.sensor = sp.sensor; }
  if(typeof sp.sw     === 'number'){ cam.sw     = sp.sw;     }
  if(typeof sp.sh     === 'number'){ cam.sh     = sp.sh;     }
  if(typeof sp.margin === 'number'){ cam.margin = sp.margin; }
  if(typeof sp.wb     === 'number'){ cam.wb     = sp.wb;     }
  if(typeof sp.rig  === 'string'){ cam.rig  = sp.rig;  }
  if(typeof sp.shot === 'string'){ cam.shot = sp.shot; }
  if(typeof sp.env  === 'string'){ cam.env  = sp.env;  }
  if(typeof sp.note === 'string'){ cam.note = sp.note; }
  // Force the camera tool ON (per spec — "camera function activates")
  if(!cam.active){
    try { window.toggleCamTool(); } catch(e){}
  } else {
    // Already active — just push the updated cam fields into the UI.
    try { _camPushFields(); setCamAspect(cam.aspect); applyCamSettings(); } catch(e){}
  }
  markDirty(8);
}
window._teleportToCameraLayer = _teleportToCameraLayer;

// Overwrite a camera layer's saved pose + 3-D marker with the CURRENT
// live viewport pose. Used when (re-)locking after the user unlocked,
// flew to a new framing, and wants that new framing to stick.
function _updateCameraSavedPoseFromLive(L){
  if(!L || L.type !== 'camera') return;
  if(cam && cam.active){ try { _camPullFields(); } catch(e){} }
  L.pos = { x: camPos.x, y: camPos.y, z: camPos.z };
  L.savedPose = {
    pos:   { x: camPos.x, y: camPos.y, z: camPos.z },
    yaw,
    pitch,
    roll:  (typeof roll === 'number') ? roll : 0,
    fov,
    focal:  cam.focal,
    aspect: cam.aspect,
    sensor: cam.sensor,
    sw:     cam.sw,
    sh:     cam.sh,
    margin: cam.margin,
    wb:     cam.wb,
    rig:    cam.rig,
    shot:   cam.shot,
    env:    cam.env,
    note:   cam.note,
  };
  // Move the 3-D marker cone to the new pose so it visually tracks.
  if(L.mesh){
    L.mesh.position.copy(camPos);
    L.mesh.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');
  }
  markDirty(8);
}

// 🔒/🔓 button: flip a camera layer's `locked` flag and re-render the
// row so the icon + opacity update immediately. Transitioning OFF → ON
// (re-locking) re-captures the CURRENT live viewport pose as the saved
// pose, so a user who unlocked, moved, then re-locked keeps the NEW
// framing instead of snapping back to the stale pre-unlock pose. It also
// engages the snap-back hold so the freshly-locked shot stays put.
window.toggleCameraLayerLock = function(id){
  const L = findLayer(id);
  if(!L || L.type !== 'camera') return;
  const becomingLocked = !L.locked;
  L.locked = becomingLocked;
  if(becomingLocked){
    _updateCameraSavedPoseFromLive(L);
    _engagedCamId = L.id;       // hold the live view here from now on
  } else if(_engagedCamId === L.id){
    _engagedCamId = null;       // unlocked → free to wander, no snap-back
  }
  renderLayerList();
  if(typeof showUndoToast === 'function'){
    showUndoToast(
      L.locked
        ? (window._lang === 'en' ? '🔒 Camera locked'   : '🔒 カメラをロックしました')
        : (window._lang === 'en' ? '🔓 Camera unlocked' : '🔓 ロックを解除しました')
    );
  }
};

// 🎬 button: explicit "go to this camera" — same effect as the
// existing click-to-teleport selectLayer hook, but reachable from a
// dedicated button so the user can re-apply the saved pose / framing
// without having to deselect first (e.g. they unlocked the camera,
// wandered around, and now want to snap back).
window.viewCameraLayer = function(id){
  const L = findLayer(id);
  if(!L || L.type !== 'camera') return;
  _teleportToCameraLayer(L);
  // Select the row. selectLayer's wrapper clears _engagedCamId, so we set
  // the hold AFTER selecting. Only a locked camera holds; an unlocked one
  // teleports once and then lets the user wander freely.
  if(selectedLayerId !== L.id) selectLayer(L.id);
  _engagedCamId = L.locked ? L.id : null;
};

// NOTE: the camera snap-back release on selection lives INSIDE the
// canonical window.selectLayer (defined much later in this file). An
// earlier attempt to wrap selectLayer here was dead code — the canonical
// definition runs afterwards and clobbers any wrapper installed at this
// point — so the logic was inlined into the real definition instead.
// Selecting a camera layer NEVER reproduces its pose; only the 🎬 button
// (viewCameraLayer) or re-locking engages the snap-back.

