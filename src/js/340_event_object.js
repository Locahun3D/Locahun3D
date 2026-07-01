// ══════════════════════════════════════════════════
//  EVENT OBJECT
// ══════════════════════════════════════════════════
window.addEventLayer = function(posHint){
  const group = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.35, 0.45, 32);
  const ringMat = new THREE.MeshBasicMaterial({color:0xff8800, side:THREE.DoubleSide, transparent:true, opacity:0.9});
  group.add(new THREE.Mesh(ringGeo, ringMat));
  const circGeo = new THREE.CircleGeometry(0.34, 32);
  const circMat = new THREE.MeshBasicMaterial({color:0xffaa44, side:THREE.DoubleSide, transparent:true, opacity:0.35});
  group.add(new THREE.Mesh(circGeo, circMat));
  const dotGeo = new THREE.CircleGeometry(0.08, 16);
  const dotMat = new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.DoubleSide});
  group.add(new THREE.Mesh(dotGeo, dotMat));
  // Invisible hitbox sphere for easier click detection
  const hitGeo = new THREE.SphereGeometry(1.2, 8, 8);
  const hitMat = new THREE.MeshBasicMaterial({visible:false});
  const hitSphere = new THREE.Mesh(hitGeo, hitMat);
  group.add(hitSphere);
  group.userData.isBillboard = true;
  if(posHint) group.position.copy(posHint);
  else {
    // Spawn 1 m along the camera's forward vector so the event marker
    // appears directly in front of the user regardless of yaw / pitch.
    const _fwd = new THREE.Vector3(); camera.getWorldDirection(_fwd);
    group.position.copy(camPos).addScaledVector(_fwd, 1);
    _snapSpawnToGrid(group, 0.11); // ring r0.45 × scale0.25 ≈ 0.11 above floor
  }
  const p=group.position;
  group.scale.set(0.25,0.25,0.25);
  // Events are camera-facing billboards — a per-object rotation is meaningless and
  // made the pivot gizmo look "tilted" at placement. Use a WORLD-aligned pivot (no
  // tilt; position only) — matches the ZIP-restore default. user 2026-06-27.
  const L=addLayer({name:'Event '+_nextLayerNameNumber('event'), type:'event', mesh:group, size:{x:1,y:1,z:1}, pivotSpace:'world'});
  L.pos={x:p.x,y:p.y,z:p.z};
  L.scale={x:0.25,y:0.25,z:0.25};
  L.eventImage=null; L.eventImageName=null;
  pushGlobalUndo({type:'layer-add', id:L.id});  // Ctrl+Z removes the added event
  selectLayer(L.id);
  showUndoToast(T('ev-added'));
};

