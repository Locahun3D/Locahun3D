// ══════════════════════════════════════════════════
//  LAYER MANAGER
// ══════════════════════════════════════════════════
let _layerNextId = 1;

// Pick the next "Type N" suffix for a freshly added layer of `type`.
// Walks the CURRENT layers list and returns max-existing-suffix + 1, so:
//   • empty scene  → 1   (resets after the user deletes everything)
//   • renamed layers don't block reuse of their original number
//   • adding without conflicting with any existing "Type N" name
function _nextLayerNameNumber(type){
  let max = 0;
  for(const L of layers){
    if(!L || L.type !== type || !L.name) continue;
    const m = String(L.name).match(/(\d+)\s*$/);
    if(m){
      const n = parseInt(m[1], 10);
      if(isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}
const layers = [];
let selectedLayerId = null;

function findLayer(id){ return layers.find(l=>l.id===id); }

function addLayer(opts){
  const _mp = opts.mesh ? opts.mesh.position : {x:0,y:0,z:0};
  const _mr = opts.mesh ? opts.mesh.rotation : {x:0,y:0,z:0};
  const L = {
    id: _layerNextId++,
    name: opts.name || ((typeof window!=='undefined'&&window._lang==='en')?'Layer':'レイヤー'),
    type: opts.type,
    mesh: opts.mesh,
    visible: true,
    pos: opts.pos || {x:_mp.x||0, y:_mp.y||0, z:_mp.z||0},
    rot: opts.rot || {x:THREE.MathUtils.radToDeg(_mr.x||0), y:THREE.MathUtils.radToDeg(_mr.y||0), z:THREE.MathUtils.radToDeg(_mr.z||0)},
    size:  opts.size||{x:1,y:1,z:1},
    scale: opts.scale||{x:1,y:1,z:1},
    // New objects & imports default to LOCAL pivot space (user request v0.0.40).
    // Restore passes an explicit pivotSpace so saved files keep their choice.
    pivotSpace: opts.pivotSpace || 'local',
    wireframe: false,
    wireMesh: null,
  };
  scene.add(L.mesh);
  layers.push(L);
  window.localProject?.changed?.();
  // Maintain cheap activity counters so the animate loop can skip the
  // billboard / splat-sort iterations when zero of that type exist. Computed
  // by walking layers once here (cheap), not by maintaining +/- 1 increments
  // (which would drift on bulk imports / project restore).
  _recountLayerActivity();
  renderLayerList();
  markDirty(8);
  if(typeof _haloMarkDirty === 'function') _haloMarkDirty();
  return L;
}

// Recompute the per-frame gating counters from the current layers array.
// Called whenever layers are added or removed. Tiny scan (worst-case dozens
// of layers) vs a per-frame O(N) iteration in animate().
function _recountLayerActivity(){
  let splats = 0, billboards = 0, figures = 0;
  for(let i=0;i<layers.length;i++){
    const L = layers[i];
    if(!L) continue;
    if(L.type === 'splat' && L.mesh) splats++;
    if(L.type === 'event' && L.mesh && L.mesh.userData && L.mesh.userData.isBillboard && L.visible) billboards++;
    if(L.type === 'figure' && L.mesh) figures++;
  }
  window._activeSplatCount     = splats;
  window._activeBillboardCount = billboards;
  window._activeFigureCount    = figures;
}
window._recountLayerActivity = _recountLayerActivity;

// ── Layer duplication / copy / paste ──
let _layerClipboard = null; // remembers the source layer id for paste

window.duplicateLayer = function(id){
  const L = findLayer(id); if(!L) return null;
  const off = new THREE.Vector3(0.3, 0, 0); // small lateral offset
  const newPos = {x:(L.pos?.x||0) + off.x, y:(L.pos?.y||0) + off.y, z:(L.pos?.z||0) + off.z};
  const newName = (L.name || 'Layer') + ' (copy)';

  if(L.type==='cube' || L.type==='sphere'){
    const isSphere = L.type==='sphere';
    const s = L.size || {x:1,y:1,z:1};
    const geo = isSphere ? new THREE.SphereGeometry(s.x*0.5,24,16) : new THREE.BoxGeometry(s.x,s.y,s.z);
    const mat = new THREE.MeshStandardMaterial({color: L.cubeColor||(isSphere?'#44aaff':'#ffffff'), roughness:0.78, metalness:0.0, transparent:true, opacity:(L.cubeOpacity!=null?L.cubeOpacity:0.85), side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const group = new THREE.Group(); group.add(mesh);
    const wgeo = new THREE.EdgesGeometry(geo);
    const wireMesh = new THREE.LineSegments(wgeo, new THREE.LineBasicMaterial({color:0xffffff}));
    wireMesh.visible = !!L.wireframe;
    scene.add(wireMesh);
    const NL = addLayer({name:newName, type:L.type, mesh:group, size:{...s}});
    NL.cubeColor = L.cubeColor; NL.cubeOpacity = L.cubeOpacity;
    NL.wireMesh = wireMesh; NL.wireframe = !!L.wireframe;
    NL.pos = newPos; NL.rot = {...L.rot}; NL.scale = {...(L.scale||{x:1,y:1,z:1})};
    NL.parentId = L.parentId || null;
    applyLayerTransform(NL.id);
    selectLayer(NL.id);
    return NL;
  }
  if(L.type==='light'){
    const lc = L.lightColor || '#ffffff';
    const li = L.lightIntensity != null ? L.lightIntensity : 1.5;
    const ld = L.lightDistance != null ? L.lightDistance : 20;
    const light = new THREE.PointLight(new THREE.Color(lc), li, ld);
    light.decay = 1; // softer linear falloff
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({color:new THREE.Color(lc), depthTest:false}));
    sphere.renderOrder = 999; light.add(sphere);
    const NL = addLayer({name:newName, type:'light', mesh:light});
    NL.lightColor=lc; NL.lightIntensity=li; NL.lightDistance=ld;
    NL.pos = newPos; NL.parentId = L.parentId || null;
    applyLayerTransform(NL.id);
    selectLayer(NL.id);
    return NL;
  }
  if(L.type==='event'){
    const newGroup = L.mesh.clone(true);
    const NL = addLayer({name:newName, type:'event', mesh:newGroup, size:{...(L.size||{x:1,y:1,z:1})}});
    NL.pos = newPos; NL.parentId = L.parentId || null;
    NL.eventImage = L.eventImage; NL.eventImageName = L.eventImageName; NL.eventGuide = L.eventGuide;
    applyLayerTransform(NL.id);
    selectLayer(NL.id);
    return NL;
  }
  if(L.type==='obj'){
    const newMesh = L.mesh.clone(true);
    const NL = addLayer({name:newName, type:'obj', mesh:newMesh});
    NL.pos = newPos; NL.rot = {...L.rot}; NL.scale = {...(L.scale||{x:1,y:1,z:1})};
    NL.objColor = L.objColor; NL.objOpacity = L.objOpacity;
    NL.objWireframe = L.objWireframe; NL.upAxis = L.upAxis;
    NL.parentId = L.parentId || null;
    if(L._rawBuffer){ NL._rawBuffer = L._rawBuffer; NL._rawExt = L._rawExt; }
    applyLayerTransform(NL.id);
    selectLayer(NL.id);
    return NL;
  }
  if(L.type==='figure'){
    // Async rebuild — copy pose data into the new figure
    const heightCm = L.figureHeight || FIGURE_REF_HEIGHT_CM;
    const skinColor = L.figureSkinColor || '#dcd8d2';
    const source = L.figureSource || 'mixamo';
    const poseSnap = JSON.parse(JSON.stringify(L.figurePose||{}));
    const lastPose = L.figureLastPose || '';
    const parentId = L.parentId || null;
    (async ()=>{
      let figure;
      try {
        if(source==='mixamo' || source==='quaternius'){
          figure = await _buildMixamoFigure(heightCm, {skinColor});
        } else {
          figure = _addProceduralFigureToScene(heightCm);
        }
      } catch(e){
        figure = _addProceduralFigureToScene(heightCm);
      }
      const NL = addLayer({name:newName, type:'figure', mesh:figure.root, size:{x:1,y:1,z:1}});
      NL.pos = newPos; NL.rot = {...L.rot}; NL.scale = {...(L.scale||{x:1,y:1,z:1})};
      NL.parentId = parentId;
      NL.figureBones = figure.bones;
      NL.figurePose = poseSnap;
      NL.figureSelectedBone = L.figureSelectedBone || 'pelvis';
      NL.figureSkinColor = skinColor;
      NL.figureHeight = heightCm;
      NL.figureSource = figure.source;
      NL.figureLastPose = lastPose;
      if(NL.figureBones){
        for(const n of FIGURE_BONE_ORDER){
          const b = NL.figureBones[n]; if(!b) continue;
          _applyBonePose(b, NL.figurePose[n] || {x:0,y:0,z:0});
        }
      }
      applyLayerTransform(NL.id);
      selectLayer(NL.id);
    })();
    return null; // async — caller can't access NL synchronously
  }
  if(L.type==='folder'){
    const NL = addLayer({name:newName, type:'folder', mesh:new THREE.Group()});
    NL.expanded = L.expanded;
    NL.parentId = L.parentId || null;
    selectLayer(NL.id);
    return NL;
  }
  if(L.type==='splat'){
    showUndoToast(window._lang==='en' ? 'Splat layer duplication is not supported' : 'Splat レイヤーは複製非対応');
    return null;
  }
  return null;
};

window.copyLayer = function(id){
  const L = findLayer(id); if(!L) return;
  _layerClipboard = id;
  showUndoToast((window._lang==='en' ? '📋 Copied: ' : '📋 コピー: ') + L.name);
};

window.pasteLayer = function(){
  if(_layerClipboard==null){
    showUndoToast(window._lang==='en' ? 'Clipboard is empty' : 'クリップボードが空です');
    return;
  }
  const L = findLayer(_layerClipboard);
  if(!L){
    showUndoToast(window._lang==='en' ? 'Source layer is gone' : '元レイヤーが見つかりません');
    _layerClipboard = null;
    return;
  }
  const NL = window.duplicateLayer(_layerClipboard);
  if(NL) showUndoToast((window._lang==='en' ? '📋 Pasted: ' : '📋 貼り付け: ') + NL.name);
};

// Collect every scene-root attachment associated with a layer (figure layers
// add bone markers and IK handles to the scene root, NOT under the layer mesh,
// so they need to be tracked & removed explicitly when the layer is deleted).
function _collectLayerSceneAttachments(L){
  const out = [];
  if(L.figureMarkers && L.figureMarkers.length){
    for(const mk of L.figureMarkers) if(mk) out.push(mk);
  }
  if(L.ikChains){
    for(const k of Object.keys(L.ikChains)){
      const h = L.ikChains[k] && L.ikChains[k].handle;
      if(h) out.push(h);
    }
  }
  return out;
}
function _detachLayerSceneAttachments(L){
  for(const obj of _collectLayerSceneAttachments(L)){
    if(obj && obj.parent) obj.parent.remove(obj);
  }
}
function _reattachLayerSceneAttachments(L){
  for(const obj of _collectLayerSceneAttachments(L)){
    if(obj && !obj.parent) scene.add(obj);
  }
}

// ── Folder edit-lock ──────────────────────────────────────────────
// A locked folder disables editing of itself and ALL its descendants
// (gizmo move/rotate/scale, transform-panel inputs, delete). Toggle via the
// 🔒/🔓 button on the folder row. Persisted in project ZIP.
function _isLayerLocked(id){
  let L=findLayer(id); let guard=0;
  while(L && guard++<128){
    if(L.type==='folder' && L.locked) return true;
    if(L.parentId==null) break;
    L=findLayer(L.parentId);
  }
  return false;
}
window.toggleFolderLock=function(id){
  const L=findLayer(id); if(!L||L.type!=='folder') return;
  L.locked=!L.locked;
  // If we just locked a folder whose descendant is selected, hide the gizmo and
  // refresh the (now read-only) transform panel.
  if(L.locked && typeof lpv!=='undefined' && lpv.group) lpv.group.visible=false;
  renderLayerList();
  if(typeof renderTransformPanel==='function') renderTransformPanel();
  showUndoToast(L.locked
    ? (window._lang==='en'?'🔒 Folder locked — its contents can’t be edited':'🔒 フォルダーをロック — 中身は編集できません')
    : (window._lang==='en'?'🔓 Folder unlocked':'🔓 フォルダーのロックを解除'));
  markDirty(6);
};

window.removeLayer=function(id){
  const L=findLayer(id); if(!L) return;
  // Block deletion of locked folders / their locked descendants.
  if(_isLayerLocked(id)){
    showUndoToast(window._lang==='en'?'🔒 Locked — unlock the folder first':'🔒 ロック中です — 先にフォルダーのロックを解除してください');
    return;
  }
  const toDelete = [L];
  if(L.type==='folder'){
    (function collectChildren(pid){
      for(const ch of layers){
        if(ch.parentId===pid){
          toDelete.push(ch);
          if(ch.type==='folder') collectChildren(ch.id);
        }
      }
    })(L.id);
  }
  const undoEntries = toDelete.map(d=>({
    id:d.id, mesh:d.mesh, wireMesh:d.wireMesh||null,
    sceneAttachments: _collectLayerSceneAttachments(d),
    layer:Object.assign({},d)
  }));
  pushGlobalUndo({type:'folder-delete', entries:undoEntries});
  for(const d of toDelete){
    if(d.mesh) scene.remove(d.mesh);
    if(d.wireMesh) scene.remove(d.wireMesh);
    _detachLayerSceneAttachments(d);
    const idx=layers.indexOf(d); if(idx>=0) layers.splice(idx,1);
  }
  const _deletedSelected = toDelete.some(d=>d.id===selectedLayerId);
  if(_deletedSelected) selectedLayerId=null;
  if(window.selectedLayerIds) for(const d of toDelete) window.selectedLayerIds.delete(d.id);
  // ── Hide singleton gizmos that the per-frame loop won't refresh anymore ──
  // animate() gates `updateLayerPivot()` on `selectedLayerId != null`, and
  // `_updateBoneRotateGizmo()` on `_activeFigureCount > 0`. After deleting the
  // last selected / last figure layer, those gates close immediately and the
  // singleton's `visible=true` from the previous frame would otherwise persist.
  if(_deletedSelected){
    if(typeof lpv !== 'undefined' && lpv && lpv.group) lpv.group.visible = false;
    if(typeof _boneRotateGizmo !== 'undefined' && _boneRotateGizmo) _boneRotateGizmo.visible = false;
  }
  // If any deleted layer was a figure, also kill the bone-rotate ring (it's a
  // singleton tied to whichever figure was last selected; the gate will close
  // when _activeFigureCount drops to 0 below).
  if(toDelete.some(d=>d.type==='figure')){
    if(typeof _boneRotateGizmo !== 'undefined' && _boneRotateGizmo) _boneRotateGizmo.visible = false;
  }
  renderLayerList();
  renderTransformPanel();
  // (削除トーストは非表示 — user 2026-06-27「これ表示いらない」。取り消しは Ctrl+Z、
  //  やり直しは Ctrl+Y で可能。)
  markDirty(8);
  if(typeof _haloMarkDirty === 'function') _haloMarkDirty();
  if(typeof _recountLayerActivity === 'function') _recountLayerActivity();
}

window.setLayerVisible=function(id,v){
  const L=findLayer(id); if(!L) return;
  L.visible=v;
  if(L.mesh) L.mesh.visible=v;
  if(L.wireMesh) L.wireMesh.visible=v && L.wireframe;
  if(L.type==='folder'){
    (function cascade(pid,vis){
      for(const ch of layers){
        if(ch.parentId===pid){
          ch.visible=vis;
          if(ch.mesh) ch.mesh.visible=vis;
          if(ch.wireMesh) ch.wireMesh.visible=vis && ch.wireframe;
          if(ch.type==='folder') cascade(ch.id, vis);
        }
      }
    })(id, v);
  }
  renderLayerList();
  markDirty(6);
  if(typeof _haloMarkDirty === 'function') _haloMarkDirty();
}
// Multi-selection: Ctrl/Cmd-click toggles a layer in/out of the selection set without
// affecting the others. Plain click selects only the clicked layer (toggle off if same).
// `selectedLayerId` always reflects the "primary" (most-recently clicked) layer used by
// the transform panel and pivot gizmo.
window.selectedLayerIds = new Set();
window.selectLayer=function(id, ev){
  const additive = !!(ev && (ev.ctrlKey || ev.metaKey));
  if (additive) {
    if (window.selectedLayerIds.has(id)) {
      window.selectedLayerIds.delete(id);
      // If the primary was the one we removed, fall back to any remaining selection
      if (selectedLayerId === id) {
        selectedLayerId = window.selectedLayerIds.size
          ? Array.from(window.selectedLayerIds).pop()
          : null;
      }
    } else {
      window.selectedLayerIds.add(id);
      selectedLayerId = id;
    }
  } else {
    if (selectedLayerId === id && window.selectedLayerIds.size <= 1) {
      // Plain click on the only selected layer → deselect
      selectedLayerId = null;
      window.selectedLayerIds.clear();
    } else {
      selectedLayerId = id;
      window.selectedLayerIds.clear();
      window.selectedLayerIds.add(id);
    }
  }
  // Selecting any layer OTHER than the engaged camera releases the locked-
  // camera snap-back hold so the user isn't trapped at the previewed pose.
  // Merely selecting a camera NEVER reproduces its pose — only the 🎬 button
  // (viewCameraLayer) or re-locking engages it, and those set _engagedCamId
  // AFTER calling selectLayer, so they survive this clear.
  if(typeof _engagedCamId !== 'undefined' && _engagedCamId != null && _engagedCamId !== id){
    _engagedCamId = null;
  }
  renderLayerList();
  renderTransformPanel();
  _syncFigureBoneVisibility();
  // パス選択時は4点の編集ハンドルを表示／非パスでは隠す
  if(typeof _pathSyncHandles==='function') _pathSyncHandles();
}

// Show bone markers / skeleton helper / IK handles ONLY for the currently
// selected figure layer. Called whenever the selection changes so unselected
// figures stay clean.
function _syncFigureBoneVisibility(){
  const selSet = window.selectedLayerIds || new Set();
  for(const L of layers){
    if(L.type !== 'figure' || !L.mesh) continue;
    const isSel = (selectedLayerId === L.id) || selSet.has(L.id);
    const showBones = isSel && (L.figureShowBones !== false);
    L.mesh.traverse(o=>{
      if(o.userData && o.userData.isSkeletonHelper) o.visible = showBones;
    });
    if(L.figureMarkers){
      for(const mk of L.figureMarkers) mk.visible = showBones;
    }
    // IK handles: only visible if selected AND IK mode is on
    if(L.ikChains){
      for(const k of Object.keys(L.ikChains)){
        const h = L.ikChains[k] && L.ikChains[k].handle;
        if(h) h.visible = isSel && !!L.ikEnabled;
      }
    }
  }
  markDirty(4);
}

function applyLayerTransform(id){
  const L=findLayer(id); if(!L) return;
  L.mesh.position.set(L.pos.x,L.pos.y,L.pos.z);
  if(L.type === 'splat'){
    // Splat layers compose user rotation with the orientation flip
    // (load-time PLY/SPZ flip + axis flips) so that pos/scale edits
    // don't clobber the carefully applied orientation.
    applyLayerFlipQuat(L);
  } else {
    L.mesh.rotation.set(
      THREE.MathUtils.degToRad(L.rot.x),
      THREE.MathUtils.degToRad(L.rot.y),
      THREE.MathUtils.degToRad(L.rot.z),'XYZ');
  }
  const sc=L.scale||{x:1,y:1,z:1};
  L.mesh.scale.set(sc.x,sc.y,sc.z);
  if(L.wireMesh){
    L.wireMesh.position.copy(L.mesh.position);
    L.wireMesh.rotation.copy(L.mesh.rotation);
    L.wireMesh.scale.copy(L.mesh.scale);
  }
  // パスを移動/回転/拡縮したら編集ハンドルも追従
  if(L.type==='path' && _pathEditId===id && typeof _pathRefreshHandles==='function') _pathRefreshHandles();
  markDirty(8);
}

// 北合わせ用: シーン全体を鉛直軸まわりに deltaDeg 度回す（2026-10-07）。
// 3D本体（splat）の向きだけを変えると、人が置いたもの（区画パス・イベント・初期視点・
// 歩行の開始位置など）がずれる。全部を同じ軸（本体の位置を通る鉛直軸）で一緒に回す。
// 歩行の判定（whole 等）は軸に沿った箱の集まりで回転できないので捨てる（作り直しが必要）。
function _rotateSceneCore(deltaDeg, pivot){
  const d=Number(deltaDeg);
  if(!Number.isFinite(d) || Math.abs(d)<1e-9) return;
  const rad=THREE.MathUtils.degToRad(d);
  const qD=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), rad);
  const v=new THREE.Vector3();
  const rotP=p=>{ v.set(p.x-pivot.x, p.y-pivot.y, p.z-pivot.z).applyQuaternion(qD); return {x:v.x+pivot.x, y:p.y, z:v.z+pivot.z}; };
  const toRad=THREE.MathUtils.degToRad, toDeg=THREE.MathUtils.radToDeg;
  for(const L of layers){
    if(!L.pos || L.type==='folder') continue;
    L.pos=rotP(L.pos);
    if(L.rot && !(L.rot.x||0) && !(L.rot.z||0)){
      // 傾きの無いもの（3D本体・パスなど大半）は rot.y に足すだけ。-180〜180 に収める（人が見ても分かる値のまま）。
      let y=(L.rot.y||0)+d; y=((y+180)%360+360)%360-180;
      L.rot={x:L.rot.x||0, y, z:L.rot.z||0};
    } else if(L.rot){
      // Euler 'XYZ' は Rx·Ry·Rz なので rot.y に足すだけでは x≠0 のとき合わない。クォータニオンで合成する。
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(toRad(L.rot.x||0), toRad(L.rot.y||0), toRad(L.rot.z||0), 'XYZ'));
      const e=new THREE.Euler().setFromQuaternion(q.premultiply(qD), 'XYZ');
      L.rot={x:toDeg(e.x), y:toDeg(e.y), z:toDeg(e.z)};
    }
    if(L.savedPose && L.savedPose.pos){ L.savedPose.pos=rotP(L.savedPose.pos); L.savedPose.yaw=(L.savedPose.yaw||0)+rad; }
    if(L.mesh) applyLayerTransform(L.id);
  }
  // 視点（YXZ 順なので yaw に足す。前方 = (sin yaw, 0, cos yaw)）
  const cp=rotP(camPos); camPos.set(cp.x, cp.y, cp.z);
  setCamRotImmediate(yaw+rad, pitch);
  const ip=rotP(_initCamPos); _initCamPos.set(ip.x, ip.y, ip.z); _initYaw+=rad;
  for(const k of (camAnim.keys||[])){ if(k && k.pos){ const kp=rotP(k.pos); k.pos.x=kp.x; k.pos.y=kp.y; k.pos.z=kp.z; k.yaw=(k.yaw||0)+rad; } }
  // 歩行: 人が決めた開始位置・向きは回す。自動生成の判定は捨てる。
  const ws=walkSetup.settings;
  if(ws.spawn) ws.spawn=rotP(ws.spawn);
  if(Number.isFinite(ws.spawnYaw)) ws.spawnYaw+=rad;
  ws.whole=null; ws.navigation=null; ws.navigationRegions=undefined; delete ws.navigationRegions;
  ws.boxes=[]; ws.region=null; ws.detailRegion=null; ws.signature='';
  walkSetup.wholeIndex=null;
  if(walkMode.active && typeof _avatarWalkExit==='function') _avatarWalkExit();
  if(typeof renderTransformPanel==='function') renderTransformPanel();
  markDirty(8);
  window.localProject?.changed?.();
}
window.rotateSceneAboutY=function(deltaDeg, opts={}){
  const d=Number(deltaDeg);
  if(!Number.isFinite(d) || Math.abs(d)<1e-9) return null;
  const main=layers.find(L=>L.type==='splat' && L.isMain) || layers.find(L=>L.type==='splat');
  const pivot=opts.pivot ? {x:+opts.pivot.x, y:+opts.pivot.y, z:+opts.pivot.z} : (main ? {...main.pos} : {x:0, y:0, z:0});
  _rotateSceneCore(d, pivot);
  pushGlobalUndo({type:'generic', key:'scene-rotate', before:{delta:-d}, after:{delta:d},
                  apply:s=>_rotateSceneCore(s.delta, pivot), undoKey:'undo-move', redoKey:'redo-move'});
  return {deltaDeg:d, pivot};
};

window.readTransformInputs=function(id){
  const L=findLayer(id); if(!L) return;
  // Push undo snapshot once per focus session (debounced)
  if(!L._undoPending){
    L._undoPending=true;
    pushGlobalUndo({type:'layer-transform',id:L.id,pos:{...L.pos},rot:{...L.rot},size:{...L.size},scale:{...(L.scale||{x:1,y:1,z:1})}});
    setTimeout(()=>{ if(L) L._undoPending=false; },800);
  }
  const g=s=>parseFloat(document.getElementById(s)?.value)||0;
  L.pos.x=g('lt-px'); L.pos.y=g('lt-py'); L.pos.z=g('lt-pz');
  L.rot.x=g('lt-rx'); L.rot.y=g('lt-ry'); L.rot.z=g('lt-rz');
  if(!L.scale) L.scale={x:1,y:1,z:1};
  L.scale.x=Math.max(0.001,g('lt-scx')||1);
  L.scale.y=Math.max(0.001,g('lt-scy')||1);
  L.scale.z=Math.max(0.001,g('lt-scz')||1);
  if(L.type==='cube'||L.type==='sphere'){
    if(document.getElementById('lt-sw')){   // サイズ入力がある(球)ときだけ読む。立方体は非表示なので既存値を維持。
      L.size.x=Math.max(0.01,g('lt-sw')||1);
      L.size.y=Math.max(0.01,g('lt-sh')||1);
      L.size.z=Math.max(0.01,g('lt-sd')||1);
    }
    updateCubeGeometry(id);
  }
  applyLayerTransform(id);
}

function updateCubeGeometry(id){
  const L=findLayer(id); if(!L||(L.type!=='cube'&&L.type!=='sphere')) return;
  const mesh=L.mesh.children[0];
  if(!mesh) return;
  const geo=L.type==='sphere'
    ? new THREE.SphereGeometry(L.size.x*0.5,24,16)
    : new THREE.BoxGeometry(L.size.x,L.size.y,L.size.z);
  mesh.geometry.dispose(); mesh.geometry=geo;
  if(L.wireMesh){
    L.wireMesh.geometry.dispose();
    L.wireMesh.geometry=new THREE.EdgesGeometry(geo);
  }
}

window.toggleCubeWireframe=function(id){
  const L=findLayer(id); if(!L||(L.type!=='cube'&&L.type!=='sphere')) return;
  L.wireframe=!L.wireframe;
  if(L.wireMesh) L.wireMesh.visible=L.visible&&L.wireframe;
  const cb=document.getElementById('lt-wire');
  if(cb) cb.checked=L.wireframe;
  markDirty(4);
}
