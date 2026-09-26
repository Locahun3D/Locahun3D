// ══════════════════════════════════════════════════
//  EVENT OBJECT
// ══════════════════════════════════════════════════
// イベント目印の中央アイコン（白いカメラの形）。テクスチャは1枚を共有する。
let _eventIconTex=null;
function _eventIconMesh(){
  if(!_eventIconTex){
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d');g.fillStyle='#fff';
    const rr=(x,y,w,h,r)=>{g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();};
    rr(14,38,100,70,14);g.fill();            // 本体
    rr(44,26,40,18,6);g.fill();              // 上の出っ張り
    g.globalCompositeOperation='destination-out';
    g.beginPath();g.arc(64,73,24,0,Math.PI*2);g.fill();   // レンズの穴
    g.globalCompositeOperation='source-over';
    g.beginPath();g.arc(64,73,15,0,Math.PI*2);g.fill();   // レンズ
    _eventIconTex=new THREE.CanvasTexture(c);
    if('colorSpace' in _eventIconTex)_eventIconTex.colorSpace=THREE.SRGBColorSpace;
  }
  const m=new THREE.Mesh(new THREE.PlaneGeometry(.46,.46),
    new THREE.MeshBasicMaterial({map:_eventIconTex,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  m.name='EventIcon';m.position.z=.001;
  return m;
}
window.addEventLayer = function(posHint){
  const group = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.35, 0.45, 32);
  const ringMat = new THREE.MeshBasicMaterial({color:0xff8800, side:THREE.DoubleSide, transparent:true, opacity:0.9});
  group.add(new THREE.Mesh(ringGeo, ringMat));
  const circGeo = new THREE.CircleGeometry(0.34, 32);
  const circMat = new THREE.MeshBasicMaterial({color:0xffaa44, side:THREE.DoubleSide, transparent:true, opacity:0.35});
  group.add(new THREE.Mesh(circGeo, circMat));
  // 中央は白い点ではなく写真（カメラ）のアイコン（2026-09-27 本人FB「ほぼ画像にしか使っていないので写真アイコンの方が分かりやすい」）。
  group.add(_eventIconMesh());
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

