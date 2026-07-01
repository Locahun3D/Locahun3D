// ══════════════════════════════════════════════════
//  AXIS HANDLE HIT DETECTION & DRAG
// ══════════════════════════════════════════════════
// ── Screen-space XZ handle detection (avoids fillMesh raycasting bug) ──
const XZ_INNER_PX = 24; // px - skip the central sphere zone
const XZ_OUTER_PX = 52; // px - outer edge of XZ square visual
// Helper: which point set is currently editable, given step / heightOn state
function _msrActivePoints(){
  const out = [];
  if(msr.step >= 1) out.push('A');
  if(msr.step >= 2) out.push('B');
  if(msr.heightOn && msr.markerC && msr.markerC.visible) out.push('C');
  return out;
}
function _msrPt(pt){ return pt==='A'?msr.ptA : pt==='B'?msr.ptB : msr.ptC; }
function _msrMarker(pt){ return pt==='A'?msr.markerA : pt==='B'?msr.markerB : msr.markerC; }

function checkXZHandle(clientX, clientY) {
  for (const pt of _msrActivePoints()) {
    const marker = _msrMarker(pt);
    if (!marker || !marker.visible) continue;
    const sp = screenPos(_msrPt(pt));
    if (sp.behind) continue;
    const d = Math.hypot(clientX - sp.x, clientY - sp.y);
    if (d >= XZ_INNER_PX && d <= XZ_OUTER_PX) {
      return msr.axisHandles[pt]['_xzVisual'];
    }
  }
  return null;
}

function checkAxisHandle(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  _v2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ray.setFromCamera(_v2, camera);
  // Only raycast xyz arrows (NOT xz — that uses screen-space check)
  const allMeshes = [];
  for (const pt of _msrActivePoints()) {
    const marker = _msrMarker(pt);
    if (!marker || !marker.visible) continue;
    for (const ax of ['x','y','z']) {
      if (msr.axisHandles[pt][ax]) allMeshes.push(...msr.axisHandles[pt][ax]);
    }
  }
  if (allMeshes.length) {
    const hits = _ray.intersectObjects(allMeshes, false);
    if (hits.length) return hits[0].object.userData.axisHandle;
  }
  // Fallback: screen-space XZ check
  return checkXZHandle(clientX, clientY);
}

let _hoveredAxis = null;
function updateAxisHover(clientX, clientY) {
  const hit = checkAxisHandle(clientX, clientY);

  // Reset previous hover
  if (_hoveredAxis && _hoveredAxis !== hit) {
    const prev = _hoveredAxis;
    if (prev.isXZ) {
      const v = msr.axisHandles[prev.point]['_xzVisual'];
      if (v) { v.sqLine.material.opacity = 0.75; v.crossLine.material.opacity = 0.28; }
    } else {
      for (const m of (msr.axisHandles[prev.point][prev.axisName]||[])) {
        m.material.color.setHex(prev.color); m.material.opacity = 0.92;
      }
    }
    _hoveredAxis = null;
  }

  if (hit && hit !== _hoveredAxis) {
    if (hit.isXZ) {
      const v = msr.axisHandles[hit.point]['_xzVisual'];
      if (v) { v.sqLine.material.opacity = 1.0; v.crossLine.material.opacity = 0.65; }
    } else {
      for (const m of (msr.axisHandles[hit.point][hit.axisName]||[])) {
        m.material.color.setHex(0xffffff); m.material.opacity = 1.0;
      }
    }
    _hoveredAxis = hit;
    canvas.style.cursor = 'crosshair';
  }
}

function startAxisDrag(axisData, clientX, clientY) {
  const { point, axisDir, isXZ } = axisData;
  const markerPos = _msrPt(point).clone();

  const dp = new THREE.Plane();
  const rect = canvas.getBoundingClientRect();
  _v2.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
  _ray.setFromCamera(_v2, camera);
  const startHit = new THREE.Vector3();

  if (isXZ) {
    // Horizontal plane Y = markerPos.y
    dp.set(new THREE.Vector3(0,1,0), -markerPos.y);
    const ok = _ray.ray.intersectPlane(dp, startHit);
    if (!ok) startHit.copy(markerPos); // fallback: treat marker as start hit
    msr.axisDragging = { point, isXZ:true, startPos:markerPos.clone(),
                         startHit:startHit.clone(), dragPlane:dp };
  } else {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const planeNormal = camDir.clone()
      .sub(axisDir.clone().multiplyScalar(camDir.dot(axisDir)));
    if (planeNormal.lengthSq() < 0.0001) {
      planeNormal.set(axisDir.y!==0?1:0, axisDir.y!==0?0:1, 0).normalize();
    } else { planeNormal.normalize(); }
    dp.setFromNormalAndCoplanarPoint(planeNormal, markerPos);
    _ray.ray.intersectPlane(dp, startHit);
    msr.axisDragging = { point, axisDir:axisDir.clone(), isXZ:false,
                         startPos:markerPos.clone(), startHit:startHit.clone(), dragPlane:dp };
  }
}

