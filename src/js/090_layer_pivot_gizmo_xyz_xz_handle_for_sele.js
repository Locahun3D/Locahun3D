// ══════════════════════════════════════════════════
//  LAYER PIVOT GIZMO  (XYZ + XZ handle for selected layer)
// ══════════════════════════════════════════════════
const lpv = {
  group: null,
  handles: { x:[], y:[], z:[], xz:{} },
  scaleHandles: { x:[], y:[], z:[] },   // scale cube handles
  rotHandles: {},
  dragging: null,
  hoveredMesh: null,
};
const _lpvRay = new THREE.Raycaster();
const _lpvV2  = new THREE.Vector2();

function buildLayerPivot(){
  const g = new THREE.Group();
  g.renderOrder = 1000;
  g.visible = false;
  scene.add(g);
  lpv.group = g;

  // ── Translation arrows ──
  const SL=2.2, SR=0.14, HL=0.7, HR=0.35;
  // Y-up convention (matches numeric inputs / applyLayerTransform):
  //   x red = world X, y green = world Y (up), z blue = world Z (depth).
  // Arrow geometry points local +Y; orient each so it rides its world axis:
  //   X → rotZ -90° (+Y→+X) ; Y → no rot (+Y stays up) ; Z → rotX +90° (+Y→+Z depth)
  const AXIS_DEFS=[
    {name:'x',color:0xff3344,rotZ:-Math.PI/2,rotX:0},
    {name:'y',color:0x33ee55,rotZ:0,         rotX:0},
    {name:'z',color:0x3399ff,rotZ:0,         rotX:Math.PI/2},
  ];
  const AXIS_DIRS={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};

  for(const {name,color,rotZ,rotX} of AXIS_DEFS){
    const ag=new THREE.Group();
    if(rotZ) ag.rotation.z=rotZ;
    if(rotX) ag.rotation.x=rotX;
    ag.renderOrder=1000;
    const mat=new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.9});
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(SR,SR,SL,7),mat.clone());
    shaft.position.y=SL/2; shaft.renderOrder=1000;
    const head=new THREE.Mesh(new THREE.ConeGeometry(HR,HL,9),mat.clone());
    head.position.y=SL+HL/2; head.renderOrder=1000;
    ag.add(shaft,head);
    const meta={axisName:name,isXZ:false,axisDir:AXIS_DIRS[name].clone(),color,shaft,head};
    // Invisible hitbox: larger cylinder for easier mouse interaction
    const hitMat=new THREE.MeshBasicMaterial({visible:false,depthTest:false});
    const hitShaft=new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.45,SL+HL,7),hitMat);
    hitShaft.position.y=(SL+HL)/2; hitShaft.renderOrder=1000;
    hitShaft.userData.lpvHandle=meta;
    ag.add(hitShaft);
    shaft.userData.lpvHandle=meta; head.userData.lpvHandle=meta;
    g.add(ag);
    lpv.handles[name]=[shaft,head,hitShaft];
  }
  lpv.handles.xz=null;

  // ── Scale cube handles (rotation ringの外側に配置) ──
  const SCALE_DIST = 5.6;  // RING_R(4.2) より外側
  // Y-up convention: sx(red)→world X, sy(green)→world Y(up), sz(blue)→world Z(depth).
  // Cube geometry sits at local +Y; orient each so it rides its world axis:
  //   X → rotZ -90° (+Y→+X) ; Y → no rot (+Y stays up) ; Z → rotX +90° (+Y→+Z depth)
  const SCALE_DEFS=[
    {name:'sx',color:0xff6677,rotZ:-Math.PI/2,rotX:0,         axisDir:new THREE.Vector3(1,0,0)},
    {name:'sy',color:0x66ee88,rotZ:0,         rotX:0,         axisDir:new THREE.Vector3(0,1,0)},
    {name:'sz',color:0x77aaff,rotZ:0,         rotX:Math.PI/2, axisDir:new THREE.Vector3(0,0,1)},
  ];
  lpv.scaleHandles={};
  for(const {name,color,rotZ,rotX,axisDir} of SCALE_DEFS){
    const ag=new THREE.Group();
    if(rotZ) ag.rotation.z=rotZ;
    if(rotX) ag.rotation.x=rotX;
    ag.renderOrder=1001;
    const mat=new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.85});
    const cube=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.50,0.50),mat.clone());
    cube.position.y=SCALE_DIST; cube.renderOrder=1001;
    ag.add(cube);
    const meta={axisName:name,isSca:true,axisDir:axisDir.clone(),color,cube};
    cube.userData.lpvHandle=meta;
    g.add(ag);
    lpv.scaleHandles[name]=[cube];
  }

  // ── Rotation rings (larger, clearly outside translation arrows) ──
  const RING_R=4.2, RING_TUBE=0.16;
  // Y-up convention (matches numeric inputs / applyLayerTransform):
  //   rx red = world X, ry green = world Y (up), rz blue = world Z (depth).
  // Torus geometry lies in its local XY plane (axis = local +Z). Orient each
  // ring so its axis aligns with the intended world axis:
  //   X axis → rotate torus +90° about Y  → ring axis = world X
  //   Y axis → rotate torus -90° about X  → ring axis = world Y (up)
  //   Z axis → no rotation                → ring axis = world Z (depth)
  const rotRings=[
    {name:'rx',color:0xff3344, worldAxis:new THREE.Vector3(1,0,0), torusRotX:0,           torusRotY:Math.PI/2},
    {name:'ry',color:0x33ee55, worldAxis:new THREE.Vector3(0,1,0), torusRotX:-Math.PI/2,  torusRotY:0},
    {name:'rz',color:0x3399ff, worldAxis:new THREE.Vector3(0,0,1), torusRotX:0,           torusRotY:0},
  ];
  lpv.rotHandles={};
  for(const {name,color,worldAxis,torusRotX,torusRotY} of rotRings){
    const mat=new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.6,side:THREE.DoubleSide});
    const ring=new THREE.Mesh(new THREE.TorusGeometry(RING_R,RING_TUBE,8,64),mat);
    if(torusRotX) ring.rotation.x=torusRotX;
    if(torusRotY) ring.rotation.y=torusRotY;
    ring.renderOrder=996;
    const meta={axisName:name,isRot:true,worldAxis:worldAxis.clone(),color,mat};
    ring.userData.lpvHandle=meta;
    g.add(ring);
    lpv.rotHandles[name]=[ring];
  }
}
buildLayerPivot();

function updateLayerPivot(){
  // While a recording is capturing the canvas, keep the pivot gizmo hidden
  // so it doesn't bleed into the exported video (set by _setCaptureUIHidden).
  if(typeof _captureHideUI !== 'undefined' && _captureHideUI){
    lpv.group.visible=false; return;
  }
  const L=findLayer(selectedLayerId);
  if(!L || L.type==='splat' || L.type==='folder'){
    lpv.group.visible=false; return;
  }
  // Locked (inside a locked folder): no transform gizmo — editing disabled.
  if(typeof _isLayerLocked==='function' && _isLayerLocked(selectedLayerId)){
    lpv.group.visible=false; return;
  }
  lpv.group.visible=true;
  // ── Event: hide rotation and scale gizmos ──
  const _isEvt = L.type==='event';
  if(lpv.rotHandles) Object.values(lpv.rotHandles).forEach(arr=>arr.forEach(m=>{m.visible=!_isEvt;}));
  if(lpv.scaleHandles) Object.values(lpv.scaleHandles).forEach(arr=>arr.forEach(m=>{m.visible=!_isEvt;}));
  // ── ピボットはメッシュのオリジン（position）に配置 ──
  // 測定システムのマーカーと同様に、ピボット位置 = 座標入力値 が一致するようにする
  lpv.group.position.copy(L.mesh.position);
  const d=camPos.distanceTo(L.mesh.position);
  const s=Math.max(0.01, d*0.04);
  lpv.group.scale.setScalar(s);
  // ── ローカル / ワールド座標系 ──
  // Events (billboards) always use a world-aligned, untilted pivot regardless of
  // pivotSpace — copying the camera-facing mesh.rotation tilted the move arrows.
  if(L.pivotSpace==='local' && !_isEvt){
    lpv.group.rotation.copy(L.mesh.rotation);
  } else {
    lpv.group.rotation.set(0,0,0);
  }
}

function checkLpvHandle(clientX,clientY){
  const L=findLayer(selectedLayerId);
  if(!L||L.type==='splat'||!lpv.group.visible) return null;
  const rect=canvas.getBoundingClientRect();
  _lpvV2.set(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
  _lpvRay.setFromCamera(_lpvV2, _useOrtho ? _orthoCamera : camera);
  const meshes=[];
  for(const ax of['x','y','z']) meshes.push(...lpv.handles[ax]);
  // include scale handles
  if(lpv.scaleHandles) for(const sk of Object.keys(lpv.scaleHandles)) meshes.push(...lpv.scaleHandles[sk]);
  // include rotation rings
  if(lpv.rotHandles) for(const rk of Object.keys(lpv.rotHandles)) meshes.push(...lpv.rotHandles[rk]);
  const hits=_lpvRay.intersectObjects(meshes,false);
  if(hits.length) return hits[0].object.userData.lpvHandle;

  return null;
}

function startLpvDrag(hit,clientX,clientY){
  const L=findLayer(selectedLayerId); if(!L) return;
  if(typeof _isLayerLocked==='function' && _isLayerLocked(selectedLayerId)) return; // locked: no editing
  const markerPos=lpv.group.position.clone();
  const dp=new THREE.Plane();
  const rect=canvas.getBoundingClientRect();
  _lpvV2.set(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
  _lpvRay.setFromCamera(_lpvV2,camera);
  const startHit=new THREE.Vector3();
  pushGlobalUndo({type:'layer-transform',id:L.id,pos:{...L.pos},rot:{...L.rot},size:{...L.size},scale:{...L.scale}});

  if(hit.isRot){
    // ── ローカルモード時: worldAxisをメッシュ回転で変換してドラッグ平面を正確に設定 ──
    let effAxis=hit.worldAxis.clone();
    if(L.pivotSpace==='local'){
      effAxis.applyEuler(L.mesh.rotation);
      effAxis.normalize();
    }
    dp.setFromNormalAndCoplanarPoint(effAxis.clone().normalize(), markerPos);
    _lpvRay.ray.intersectPlane(dp,startHit);
    const toHit=startHit.clone().sub(markerPos);
    const tanA=new THREE.Vector3(); const tanB=new THREE.Vector3();
    const rn=effAxis.clone().normalize();
    if(Math.abs(rn.x)<0.9) tanA.set(0,rn.z,-rn.y).normalize();
    else tanA.set(rn.z,0,-rn.x).normalize();
    tanB.crossVectors(rn,tanA).normalize();
    const startAngle=Math.atan2(toHit.dot(tanB),toHit.dot(tanA));
    lpv.dragging={...hit, layerId:L.id,
      startRot:{...L.rot}, startAngle, tanA, tanB, dragPlane:dp,
      effAxis};  // actual world-space axis (local-adjusted)

  } else if(hit.isSca){
    // ── スケールドラッグ ──
    let worldAxisDir=hit.axisDir.clone();
    if(L.pivotSpace==='local') worldAxisDir.applyEuler(L.mesh.rotation);
    const camDir=new THREE.Vector3(); camera.getWorldDirection(camDir);
    const pn=camDir.clone().sub(worldAxisDir.clone().multiplyScalar(camDir.dot(worldAxisDir)));
    if(pn.lengthSq()<0.0001) pn.set(0,1,0); else pn.normalize();
    dp.setFromNormalAndCoplanarPoint(pn,markerPos);
    _lpvRay.ray.intersectPlane(dp,startHit);
    lpv.dragging={...hit, layerId:L.id,
      startScale:{...L.scale}, effectiveAxisDir:worldAxisDir,
      startHit:startHit.clone(), dragPlane:dp};

  } else {
    // ── 移動ドラッグ ──
    let worldAxisDir=hit.axisDir.clone();
    if(L.pivotSpace==='local') worldAxisDir.applyEuler(L.mesh.rotation);
    const camDir=new THREE.Vector3(); camera.getWorldDirection(camDir);
    const pn=camDir.clone().sub(worldAxisDir.clone().multiplyScalar(camDir.dot(worldAxisDir)));
    if(pn.lengthSq()<0.0001) pn.set(0,1,0); else pn.normalize();
    dp.setFromNormalAndCoplanarPoint(pn,markerPos);
    _lpvRay.ray.intersectPlane(dp,startHit);
    lpv.dragging={...hit, layerId:L.id, effectiveAxisDir:worldAxisDir,
      startWorldPos:{x:L.pos.x,y:L.pos.y,z:L.pos.z},
      startHit:startHit.clone(), dragPlane:dp};
  }
}

function updateLpvDrag(clientX,clientY){
  if(!lpv.dragging) return;
  const L=findLayer(lpv.dragging.layerId); if(!L) return;
  const rect=canvas.getBoundingClientRect();
  _lpvV2.set(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
  _lpvRay.setFromCamera(_lpvV2,camera);

  if(lpv.dragging.isRot){
    const hit=new THREE.Vector3();
    if(!_lpvRay.ray.intersectPlane(lpv.dragging.dragPlane,hit)) return;
    const toHit=hit.clone().sub(lpv.group.position);
    const curAngle=Math.atan2(toHit.dot(lpv.dragging.tanB),toHit.dot(lpv.dragging.tanA));
    let delta=THREE.MathUtils.radToDeg(curAngle-lpv.dragging.startAngle);
    if(lpv._ctrlHeld) delta=Math.round(delta/5)*5;
    const sr=lpv.dragging.startRot;
    const ax=lpv.dragging.axisName;

    if(L.pivotSpace==='local' && lpv.dragging.effAxis){
      // ── ローカル回転: クォータニオンで正確に適用 ──
      const startQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(sr.x),
        THREE.MathUtils.degToRad(sr.y),
        THREE.MathUtils.degToRad(sr.z),'XYZ'));
      // effAxis is the local axis in world space – rotate around it
      const deltaQ=new THREE.Quaternion().setFromAxisAngle(
        lpv.dragging.effAxis, THREE.MathUtils.degToRad(delta));
      const newQ=deltaQ.multiply(startQ);
      const euler=new THREE.Euler().setFromQuaternion(newQ,'XYZ');
      L.rot={
        x:THREE.MathUtils.radToDeg(euler.x),
        y:THREE.MathUtils.radToDeg(euler.y),
        z:THREE.MathUtils.radToDeg(euler.z),
      };
    } else {
      // ── ワールド回転: Eulerで直接適用 (Y-up 規約 / 数値入力と一致) ──
      // rx(赤)→World X軸, ry(緑)→World Y軸(上), rz(青)→World Z軸(奥行き)
      // 符号: worldX→+delta, worldZ→+delta は幾何どおり。worldY は幾何上は
      // -delta だが、実機で緑リングの回転方向が反転して見えた(ユーザー報告
      // 2026-06)ため +delta に反転して合わせる。
      if     (ax==='rx') L.rot={...sr, x:sr.x+delta}; // World X軸
      else if(ax==='ry') L.rot={...sr, y:sr.y+delta}; // World Y軸(上) ※実機で反転確認→符号反転
      else if(ax==='rz') L.rot={...sr, z:sr.z+delta}; // World Z軸(奥行き)
    }

  } else if(lpv.dragging.isSca){
    // ── スケールドラッグ ──
    const hit=new THREE.Vector3();
    if(!_lpvRay.ray.intersectPlane(lpv.dragging.dragPlane,hit)) return;
    const sp=lpv.dragging.startScale;
    const delta=hit.clone().sub(lpv.dragging.startHit);
    const proj=delta.dot(lpv.dragging.effectiveAxisDir||lpv.dragging.axisDir);
    // Y-up convention: sy(green)→worldY→L.scale.y, sz(blue)→worldZ→L.scale.z
    const scaleAxis=lpv.dragging.axisName;
    const scaleKeyMap={'sx':'x','sy':'y','sz':'z'};
    const skey=scaleKeyMap[scaleAxis]||scaleAxis[1];
    const newS=Math.max(0.01, sp[skey] + proj * 0.5);
    L.scale={...L.scale, [skey]:newS};

  } else {
    // ── 移動ドラッグ ──
    const hit=new THREE.Vector3();
    if(!_lpvRay.ray.intersectPlane(lpv.dragging.dragPlane,hit)) return;
    const sp=lpv.dragging.startWorldPos;
    const delta=hit.clone().sub(lpv.dragging.startHit);
    const proj=delta.dot(lpv.dragging.effectiveAxisDir||lpv.dragging.axisDir);
    const moved=(lpv.dragging.effectiveAxisDir||lpv.dragging.axisDir).clone().multiplyScalar(proj);
    L.pos={x:sp.x+moved.x, y:sp.y+moved.y, z:sp.z+moved.z};
  }
  applyLayerTransform(L.id);
  renderTransformPanel();
}


// ── Scale markers so they're always visible at a fixed screen size ──
function updateMarkerScale() {
  for (const [g, pt] of [[msr.markerA, msr.ptA],[msr.markerB, msr.ptB],[msr.markerC, msr.ptC]]) {
    if (!g || !g.visible) continue;
    const d = camPos.distanceTo(pt);
    const s = Math.max(0.01, d * 0.03);
    g.scale.setScalar(s);
  }
  // Preview ghost marker
  if (msr.previewMarker && msr.previewMarker.visible) {
    const pt = msr.previewMarker.position;
    const d = camPos.distanceTo(pt);
    const s = Math.max(0.01, d * 0.03);
    msr.previewMarker.scale.setScalar(s);
    // Pulsing ring opacity
    const t = clock.elapsedTime;
    msr.previewMarker.userData.ringLine.material.opacity = 0.3 + 0.35 * Math.abs(Math.sin(t * 3.5));
  }
}

// Diagnostics: set to true (or call window.DEBUG_PICK=true in console) to log every
// pick attempt. Helps diagnose "point placed too deep" by exposing the matrix/cache state.
window.DEBUG_PICK = window.DEBUG_PICK !== false;
let _pickLogThrottle = 0;

// ── Pick: find nearest cached splat to the ray, else use depth fallback ──
function pickWorldPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  _v2.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  _ray.setFromCamera(_v2, camera);
  const origin = _ray.ray.origin;
  const dir    = _ray.ray.direction;

  // ── First: try Spark's WASM-backed raycaster against any splat mesh ──
  // The CPU-side `_splatCache` is only built for PLY / SPLAT (where we
  // parse positions out of the buffer at load time). For .rad scenes the
  // splat positions live exclusively inside Spark's packed GPU texture
  // and are reached via SplatMesh.raycast(), which delegates to a WASM
  // helper that does ray-vs-anisotropic-ellipsoid tests on the on-chip
  // splat data. Using THREE.Raycaster keeps PLY/SPLAT picking accurate
  // too (handy when the cache is stale, e.g. right after a reload).
  {
    if(!pickWorldPos._raycaster) pickWorldPos._raycaster = new THREE.Raycaster();
    const rc = pickWorldPos._raycaster;
    rc.setFromCamera(_v2, camera);
    const splatMeshes = [];
    for(const L of layers){
      if(L && L.visible && L.type === 'splat' && L.mesh) splatMeshes.push(L.mesh);
    }
    if(splatMeshes.length){
      const hits = rc.intersectObjects(splatMeshes, false);
      if(hits && hits.length){
        const h = hits[0];
        msr.placeDepth = Math.min(50, Math.max(0.3, h.distance));
        return h.point.clone();
      }
    }
  }
  // ── Gather pickable splat layers (each with its own matrixWorld + cache) ──
  // Fallback: per-layer position cache (only set for PLY / SPLAT at load
  // time via estimatePLYStats / estimateSplatStats). This branch is used
  // when SplatMesh.raycast() returned no hits — typically because we're
  // pointing at empty space and only want the closest surface candidate
  // anywhere within a screen-space tolerance.
  const m11 = (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const pxRadius = 5;
  const THR_MIN = 0.30;
  const THR_MAX = 1.50;
  const ox0 = origin.x, oy0 = origin.y, oz0 = origin.z;
  const dx0 = dir.x,    dy0 = dir.y,    dz0 = dir.z;

  let bestT = Infinity, bestX=0, bestY=0, bestZ=0, hasBest=false;
  let totalInspected = 0, totalCandidates = 0, layersChecked = 0;

  // Build the candidate list. Prefer per-layer caches (works for additional splats too);
  // fall back to legacy global msr.cachedPts only if the main layer has no per-layer cache.
  const candidates = [];
  for(const L of layers){
    if(L.type!=='splat' || !L.visible || !L.mesh) continue;
    if(L._splatCache && L._splatCacheCount > 0){
      candidates.push({ pts:L._splatCache, cnt:L._splatCacheCount, mesh:L.mesh });
    }
  }
  if(candidates.length === 0 && msr.cachedPts && msr.cachedCount > 0 && splatMesh){
    candidates.push({ pts:msr.cachedPts, cnt:msr.cachedCount, mesh:splatMesh });
  }

  const _pickMat = (pickWorldPos._mat = pickWorldPos._mat || new THREE.Matrix4());

  for(const c of candidates){
    const pts = c.pts, cnt = c.cnt, mesh = c.mesh;
    layersChecked++;
    // Compose the mesh's world matrix from its current position/quaternion/scale,
    // then prepend the parent's matrixWorld in case it lives inside a folder group.
    _pickMat.compose(mesh.position, mesh.quaternion, mesh.scale);
    if(mesh.parent && mesh.parent.matrixWorld){
      _pickMat.premultiply(mesh.parent.matrixWorld);
    }
    const m = _pickMat.elements;
    const e00=m[0], e01=m[4], e02=m[8],  e03=m[12];
    const e10=m[1], e11=m[5], e12=m[9],  e13=m[13];
    const e20=m[2], e21=m[6], e22=m[10], e23=m[14];

    for (let i = 0; i < cnt * 3; i += 3) {
      const lx = pts[i], ly = pts[i+1], lz = pts[i+2];
      const wx = e00*lx + e01*ly + e02*lz + e03;
      const wy = e10*lx + e11*ly + e12*lz + e13;
      const wz = e20*lx + e21*ly + e22*lz + e23;
      const ox = wx - ox0, oy = wy - oy0, oz = wz - oz0;
      const t  = ox*dx0 + oy*dy0 + oz*dz0;
      if (t < 0.05) continue;
      if (t >= bestT) continue;
      totalInspected++;
      const cx = ox - t*dx0, cy = oy - t*dy0, cz = oz - t*dz0;
      const perp2 = cx*cx + cy*cy + cz*cz;
      const thrPx = (t * pxRadius) / m11;
      const thr   = Math.min(THR_MAX, Math.max(THR_MIN, thrPx));
      if (perp2 < thr * thr) {
        bestT = t;
        bestX = wx; bestY = wy; bestZ = wz;
        hasBest = true;
        totalCandidates++;
      }
    }
  }

  if (window.DEBUG_PICK && (++_pickLogThrottle % 15 === 0 || !hasBest)) {
    const meshSample = candidates[0]?.mesh;
    if(meshSample){
      _pickMat.compose(meshSample.position, meshSample.quaternion, meshSample.scale);
      const m = _pickMat.elements;
      console.log('[pick]', { hasBest, bestT: hasBest?bestT.toFixed(2):null,
        layers: layersChecked, inspected: totalInspected, candidates: totalCandidates,
        origin: origin.toArray().map(v=>+v.toFixed(2)),
        dir:    dir.toArray().map(v=>+v.toFixed(3)),
        meshDiag:  [m[0].toFixed(3), m[5].toFixed(3), m[10].toFixed(3)],
        meshTrans: [m[12].toFixed(2), m[13].toFixed(2), m[14].toFixed(2)] });
    } else {
      console.log('[pick] no candidate caches', { layers: layers.length });
    }
  }

  if (hasBest) {
    msr.placeDepth = Math.min(50, Math.max(0.3, bestT));
    return new THREE.Vector3(bestX, bestY, bestZ);
  }

  if (window.DEBUG_PICK) console.log('[pick] FALLBACK', msr.placeDepth);
  // ── Fallback: fixed depth along ray (clamped to a sane range) ──
  const fb = Math.min(20, Math.max(0.5, msr.placeDepth));
  return origin.clone().addScaledVector(dir, fb);
}

function updateMeasureLine() {
  if (msr.step >= 2){
    const arr = msr.line.geometry.attributes.position.array;
    arr[0]=msr.ptA.x; arr[1]=msr.ptA.y; arr[2]=msr.ptA.z;
    arr[3]=msr.ptB.x; arr[4]=msr.ptB.y; arr[5]=msr.ptB.z;
    msr.line.geometry.attributes.position.needsUpdate = true;
    const dist = msr.ptA.distanceTo(msr.ptB);
    // 0.01 m (1cm) 精度に丸め、端数（3桁目以降）を削除（user 2026-06-27）。
    document.getElementById('measDist').textContent = dist.toFixed(2) + ' m';
    // Component deltas
    const compEl = document.getElementById('distComp');
    compEl.style.display = 'flex';
    document.getElementById('dcX').textContent = Math.abs(msr.ptB.x-msr.ptA.x).toFixed(2);
    document.getElementById('dcY').textContent = Math.abs(msr.ptB.y-msr.ptA.y).toFixed(2);
    document.getElementById('dcZ').textContent = Math.abs(msr.ptB.z-msr.ptA.z).toFixed(2);
  }
  // Update vertical A↔C line + height readout
  if (msr.heightOn && msr.lineAC && msr.step >= 1){
    const arr = msr.lineAC.geometry.attributes.position.array;
    arr[0]=msr.ptA.x; arr[1]=msr.ptA.y; arr[2]=msr.ptA.z;
    arr[3]=msr.ptC.x; arr[4]=msr.ptC.y; arr[5]=msr.ptC.z;
    msr.lineAC.geometry.attributes.position.needsUpdate = true;
    const h = msr.ptA.distanceTo(msr.ptC);
    const hEl = document.getElementById('measHeight');
    if(hEl) hEl.textContent = h.toFixed(2) + ' m';
  }
}

// Refresh the per-point status chips (placed / not). The simplified panel
// no longer shows world coordinates — just which of A / B / C are placed.
function updateMeasureStatuses() {
  const set = (rowId, statId, placed) => {
    const row = document.getElementById(rowId);
    const st  = document.getElementById(statId);
    if(row) row.classList.toggle('placed', !!placed);
    if(st)  st.textContent = placed ? '✓' : '—';
  };
  set('msr-row-a','msr-stat-a', msr.step >= 1);
  set('msr-row-b','msr-stat-b', msr.step >= 2);
  set('msr-row-c','msr-stat-c', msr.heightOn && !!(msr.markerC && msr.markerC.visible));
}

// Show/hide the Point C row + height readout and reflect the on/off state on
// the add-C button. Centralised so toggle / clear / undo stay consistent.
function _applyHeightUI(on){
  const row = document.getElementById('msr-row-c');
  if(row) row.style.display = on ? 'flex' : 'none';
  const heightRow = document.getElementById('heightRow');
  if(heightRow) heightRow.style.display = on ? '' : 'none';
  const btn = document.getElementById('msr-add-c');
  if(btn) btn.classList.toggle('on', on);
  const lbl = document.getElementById('giz-height-lbl');
  if(lbl) lbl.textContent = on ? T('giz-height-rm') : T('giz-height-lbl');
}

function syncGizmoToMsr() {
  // Per-point coordinate inputs were removed in the simplification — just
  // keep the line, the distance/height readouts and the status chips fresh.
  updateMeasureStatuses();
  updateMeasureLine();
}

// Defensive no-op: the per-point number inputs no longer exist, so there is
// nothing to read. Kept (and guarded) only so any stray reference is safe.
window.onGizmo = function() {
  if(!document.getElementById('mAx')) return;
};

// Add-C button handler — toggles height mode (Point C) on/off.
window.toggleHeightBtn = function(){
  toggleHeightMode(!msr.heightOn);
};

// Toggle the optional height marker (Point C). When enabled, C is placed
// 1 m above A and rendered with a vertical connecting line.
window.toggleHeightMode = function(on){
  if(typeof pushUndo === 'function') pushUndo();
  msr.heightOn = !!on;
  _applyHeightUI(msr.heightOn);
  if(msr.markerC) msr.markerC.visible = on;
  if(msr.lineAC) msr.lineAC.visible = on && msr.step >= 1;
  if(on){
    // Default: C = A + 1m up
    if(msr.step >= 1){
      msr.ptC.copy(msr.ptA).add(new THREE.Vector3(0, 1, 0));
    } else {
      // No A yet — drop C in front of camera as a placeholder
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      msr.ptC.copy(camPos).addScaledVector(fwd, 2.5);
      msr.ptC.y += 1.0;
    }
    if(msr.markerC) msr.markerC.position.copy(msr.ptC);
  }
  syncGizmoToMsr();
  markDirty(4);
};

window.clearMeasure = function() {
  msr.step = 0;
  msr.markerA.visible = msr.markerB.visible = msr.line.visible = false;
  if(msr.markerC) msr.markerC.visible = false;
  if(msr.lineAC)  msr.lineAC.visible  = false;
  msr.ptC.set(0,0,0); msr.heightOn = false;
  _applyHeightUI(false);
  document.getElementById('measDist').textContent = '-';
  document.getElementById('distComp').style.display = 'none';
  { const _mh=document.getElementById('msr-hint'); if(_mh){ _mh.style.display='block'; _mh.textContent=T('msr-h0'); } }
  updateMeasureStatuses();
  markDirty(4);
};

// ── Right-hold preview helpers ──
function updatePreview(pos) {
  if (!msr.previewMarker) return;
  msr.previewMarker.position.copy(pos);
  msr.previewMarker.visible = true;
  // Color by which point we're placing
  const isA = (msr.step === 0 || msr.step === 2);
  msr.previewMarker.children[0].material.color.setHex(isA ? 0xffff44 : 0xff8833);
  // Hint text
  const hint = isA ? '🟡 点 A を配置 — 離して確定' : '🟠 点 B を配置 — 離して確定';
  document.getElementById('msr-hint').textContent = hint;
}
function commitPreview() {
  if (!msr.previewMarker || !msr.previewMarker.visible) return;
  const pos = msr.previewMarker.position.clone();
  msr.previewMarker.visible = false;
  pushUndo();
  if (msr.step === 0 || msr.step === 2) {
    msr.ptA.copy(pos); msr.markerA.position.copy(pos);
    msr.markerA.visible = true;
    msr.markerB.visible = false;
    msr.line.visible = false;
    msr.step = 1;
    document.getElementById('measDist').textContent = '-';
    document.getElementById('distComp').style.display = 'none';
    // 「左クリックで点 B を配置」(msr-h1) は全端末で非表示（user request 2026-06-19）。
    // 点A配置後はガイドバナーを隠し、点B配置後の再測定ヒント(msr-h2)で復帰させる。
    { const _mh=document.getElementById('msr-hint'); if(_mh) _mh.style.display='none'; }
  } else {
    msr.ptB.copy(pos); msr.markerB.position.copy(pos);
    msr.markerB.visible = true;
    msr.line.visible = true;
    msr.step = 2;
    { const _mh=document.getElementById('msr-hint'); if(_mh) _mh.style.display='block'; }
    document.getElementById('msr-hint').textContent = T('msr-h2');
    updateMeasureLine();
  }
  syncGizmoToMsr();
  markDirty(6);
}

// ── Panel exclusivity helper ──
function closeAllPanels(opts){
  // opts.keepCamTool / opts.keepCamAnim let the カメラ tool and カメラアニメ panel
  // COEXIST (user request 2026-06: build a camera path while the camera tool is
  // framing each shot). Same idea as the 日照 panel exemption below — those two
  // are the only panels allowed open together; every other caller passes no opts
  // and still closes everything.
  opts = opts || {};
  // Quality panel + FPS readout
  _qualPanelOpen=false;
  document.getElementById('quality-panel').style.display='none';
  { const _qb = document.getElementById('qi-badge'); if(_qb) _qb.classList.remove('qib-open'); }
  if(_perfInterval){ clearInterval(_perfInterval); _perfInterval=null; }
  // Legacy settings panel
  qOpen=false;
  const _qp = document.getElementById('qpanel'); if(_qp) _qp.classList.remove('show');
  const _bq = document.getElementById('btnQ');   if(_bq) _bq.classList.remove('on');
  // Measure
  if(msr.active) _closeMeasureOnly();
  // Camera tool — calling toggleCamTool() while cam.active is true closes
  // the panel + HUD + restores fov; we replicate the minimum without
  // re-entering toggleCamTool to avoid an infinite mutual-close loop.
  // (Skipped when opening カメラアニメ so the two coexist — opts.keepCamTool.)
  if(!opts.keepCamTool && typeof cam !== 'undefined' && cam && cam.active){
    cam.active = false;
    const _cbtn = document.getElementById('btnCamTool');
    if(_cbtn) _cbtn.classList.remove('on');
    const _chud = document.getElementById('cam-hud');
    if(_chud) _chud.style.display = 'none';
    const _cpan = document.getElementById('cam-panel');
    if(_cpan) _cpan.style.display = 'none';
    const _ctint = document.getElementById('cam-wb-tint');
    if(_ctint) _ctint.style.display = 'none';
    const _cframe = document.getElementById('cam-frame');
    if(_cframe) _cframe.style.display = 'none';
    // Restore user FOV (cam mode locked camera.fov to sensor VFov).
    if(typeof cam.prevFOV === 'number'){
      fov = cam.prevFOV;
      camera.fov = cam.prevFOV;
      camera.aspect = innerWidth / Math.max(1, innerHeight);
      camera.updateProjectionMatrix();
    }
    // カメラを閉じたので、開いている日照パネルは右下へ戻す
    if(typeof _sunUpdatePanelPos === 'function') _sunUpdatePanelPos();
    if(typeof _camHideLetterbox === 'function') _camHideLetterbox();
    document.body.classList.remove('cam-active');
    markDirty(4);
  }
  // Env panel (note: env preset stays applied — we only hide the panel)
  if(typeof env !== 'undefined' && env && env.panelOpen){
    env.panelOpen = false;
    const _ep = document.getElementById('env-panel'); if(_ep) _ep.style.display = 'none';
    const _eb = document.getElementById('btn-env');   if(_eb) _eb.classList.remove('on');
  }
  // 日照(Sun)パネルは独立。他ツール(特にカメラ)と同時表示・同時操作できるよう、
  // closeAllPanels では閉じない。日照の開閉は btn-sun トグルのみで制御する。
  // Camera-animation panel — behave like the env button: when any other
  // tool is launched the panel + its 3-D editing visuals get hidden so they
  // don't clutter the view. Don't stop an in-progress playback/recording.
  // (Skipped when opening the カメラ tool so the two coexist — opts.keepCamAnim.)
  if(!opts.keepCamAnim) _hideCamAnimPanel();
}

// Hide the camera-animation panel + its 3-D editing visuals. Shared by
// closeAllPanels() (mutual-exclusion) and resetCameraToInitial() (🏠 home)
// so the panel never lingers after the user leaves the feature. A live
// playback / record is left alone — closing it mid-capture would corrupt
// the export.
function _hideCamAnimPanel(){
  if(typeof camAnim === 'undefined' || !camAnim.open || camAnim.playing) return;
  camAnim.open = false;
  const _cap = document.getElementById('cam-anim-panel');
  if(_cap) _cap.style.display = 'none';
  const _cab = document.getElementById('btnCamAnim');
  if(_cab) _cab.classList.remove('on');
  if(typeof _camAnimSetVisualsVisible === 'function') _camAnimSetVisualsVisible(false);
}
function _closeMeasureOnly(){
  msr.active=false;
  document.body.classList.remove('msr-active');
  document.getElementById('btnMeasure').classList.remove('on');
  document.getElementById('btnMeasure').innerHTML='📐 <span id="lbl-measure">'+T('lbl-measure')+'</span>';
  // Restore the gizmo End button to its idle label
  const _btnEnd = document.getElementById('btnMeasureEnd');
  if(_btnEnd) _btnEnd.innerHTML = '<span id="msr-end-lbl-init">'+T('msr-end-lbl-init')+'</span>';
  document.getElementById('gizmo').style.display='none';
  document.getElementById('gizmo').style.top=''; // reset to CSS default
  document.getElementById('gizmo').style.maxHeight='';
  document.getElementById('msr-hint').style.display='none';
  if(msr.previewMarker) msr.previewMarker.visible=false;
  msr.rightHold=false;
  msr.markerA.visible=msr.markerB.visible=msr.line.visible=false;
  msr.step=0; msr.dragging=null; msr.axisDragging=null;
  // Clear any in-flight touch long-press state too (could leak if user
  // taps "終了" mid-press).
  if(typeof _msrLongPressTimer !== 'undefined' && _msrLongPressTimer){
    clearTimeout(_msrLongPressTimer); _msrLongPressTimer = null;
  }
  if(typeof _msrLongPressId !== 'undefined') _msrLongPressId = -1;
  if(typeof _msrPlacingId   !== 'undefined') _msrPlacingId   = -1;
}

