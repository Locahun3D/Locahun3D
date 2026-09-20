let _navigationPoint=null,_navigationHold=null;
// 玉の見かけサイズ（2026-09-20 本人指摘「スマホだと大きい。スケールではなく画面サイズ？」）。
// 調査結果: サイズは元から「画面上およそ半径6px固定」で、キャンバスも CSS zoom 無しの
// innerWidth×innerHeight なので端末差は無い。大きく見えた実原因は次の3つ。
//  ①距離に視線軸の奥行きではなく直線距離を使っていた → 画面端では (d/z)² 倍に膨らむ。
//    縦FOV90°の縦持ちスマホは足元の地面が画面下端(軸から約40°)に来るので半径が約2倍(≈12px)。
//  ②下限 0.04m が近距離(約3m以内)で効き、1.5m先では半径≈11px になっていた。
//  ③同じ6pxでも幅390pxの画面では相対的に大きい（幅1440の約3.7倍の比率）。
// 対策: 奥行き z と軸外れの伸び(1/cosθ)を織り込んで「最大径」を狙いpxに合わせ、
// 下限を 0.02m に下げ、狭い画面は狙いpxを少し小さくする(390幅で約4.7px、480幅以上は6px)。
let _navigationFwd=null,_navigationRel=null;
function _navigationPointRadius(position){
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  const px=Math.max(4,Math.min(6,Math.min(w,h)*.012));
  const focal=(h/2)/Math.tan(camera.fov*Math.PI/360); // 焦点距離(CSS px)
  if(!_navigationFwd){_navigationFwd=new THREE.Vector3();_navigationRel=new THREE.Vector3();}
  camera.getWorldDirection(_navigationFwd);
  _navigationRel.copy(position).sub(camera.position);
  const d=_navigationRel.length(),z=Math.max(.05,_navigationRel.dot(_navigationFwd));
  // 球の投影の長径 ≈ r·focal·d/z² （軸上は d=z で従来式と一致）
  const radius=Math.max(.02,px*z*z/(focal*Math.max(d,.05)));
  return {radius,px:+(radius*focal*Math.max(d,.05)/(z*z)).toFixed(2)};
}
function _showNavigationPoint(point,valid){
  if(!_navigationPoint){
    _navigationPoint=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),
      new THREE.MeshBasicMaterial({color:0x63edbd,transparent:true,depthTest:false,depthWrite:false}));
    _navigationPoint.name='NavigationTarget';
    _navigationPoint.renderOrder=10000;
    _navigationPoint.raycast=()=>{};
    scene.add(_navigationPoint);
  }
  _navigationPoint.position.set(point.x,point.y+.08,point.z);
  const size=_navigationPointRadius(_navigationPoint.position);
  _navigationPoint.userData.size=size;
  _navigationPoint.scale.setScalar(size.radius/.075);
  _navigationPoint.material.color.setHex(valid?0x63edbd:0xff5353);
  _navigationPoint.visible=true;markDirty(2);
}
function _hideNavigationPoint(){
  if(_navigationPoint){_navigationPoint.visible=false;markDirty(2);}
}
function _navigationHoldReset(){
  if(_navigationHold){clearTimeout(_navigationHold.timer);_navigationHold=null;}
  if(!_clickNavigationController?.active)_hideNavigationPoint();
}
function _navigationHoldPreview(){
  const h=_navigationHold;if(!h?.active)return;
  const result=_clickNavigateAt(h.point.x,h.point.y,true);
  if(result?.point){_showNavigationPoint(result.point,result.valid);return;}
  _hideNavigationPoint();
  // 当たり判定が未準備だと玉が出ず「長押ししても無反応」に見える（2026-09-20）。
  // 長押し1回につき1度だけ準備を走らせ、整ったら押したままの位置に玉を出す。
  const unready=!walkSetup.core||walkSetup.importPending||walkSetup.settings.signature!==_walkSourceSignature();
  if(!unready||h.preparing||typeof globalThis.prepareCameraCollision!=='function')return;
  h.preparing=true;
  if(typeof showUndoToast==='function')showUndoToast((window._lang==='en'?'Preparing the ground at the destination':'移動先の地面を準備しています'));
  globalThis.prepareCameraCollision().then(ready=>{if(ready&&_navigationHold===h&&h.active)_navigationHoldPreview();}).catch(()=>{});
}
function _navigationHoldArm(kind,point){
  _navigationHoldReset();
  if(_clickNavigationBusy())return;
  const h=_navigationHold={kind,point:{...point},active:false,timer:null};
  h.timer=setTimeout(()=>{
    if(_navigationHold!==h||_clickNavigationBusy())return;
    h.active=true;_navigationHoldPreview();
  },350);
}
function _navigationHoldMove(kind,e){
  const h=_navigationHold;if(!h||h.kind!==kind)return false;
  const point=_clickPointerPoint(kind,e);
  if(!point||point.id!==h.point.id||(kind==='touch'&&e.touches.length!==1)){
    _navigationHoldReset();return false;
  }
  if(!h.active){
    if(Math.hypot(point.x-h.point.x,point.y-h.point.y)>=(kind==='touch'?12:5)){
      // マウスは左ドラッグに他の役割が無いので、押して動かした時点で「探り」を始める（測定ツールの A/B 点と同じ手触り。
      // 2026-09-20 本人指摘: 静止して 0.35 秒待たないと玉が出ず、動かすと取り消されて「選べない」）。
      // タッチの1本指ドラッグは見回しなので、従来どおり長押しだけで始める。
      if(kind!=='mouse'||_clickNavigationBusy()){_navigationHoldReset();return false;}
      clearTimeout(h.timer);h.active=true;h.point=point;_navigationHoldPreview();return true;
    }
    return false;
  }
  h.point=point;_navigationHoldPreview();return true;
}
function _navigationHoldTake(kind,e,consumed){
  const h=_navigationHold,point=_clickPointerPoint(kind,e);
  const accept=h?.active&&h.kind===kind&&point?.id===h.point.id&&!consumed&&
    e.target===canvas&&(kind==='touch'?e.touches.length===0:e.button===0);
  _navigationHoldReset();
  return accept?{...point,held:true}:null;
}
window.addEventListener('blur',_navigationHoldReset);
canvas.addEventListener('touchcancel',_navigationHoldReset,{passive:true});
// 診断用（自動テストから玉の状態を読む）。UI からは使わない。
window.__navPoint=()=>_navigationPoint?{visible:_navigationPoint.visible,x:+_navigationPoint.position.x.toFixed(3),y:+_navigationPoint.position.y.toFixed(3),z:+_navigationPoint.position.z.toFixed(3),ok:_navigationPoint.material.color.getHex()===0x63edbd,radius:+(_navigationPoint.userData.size?.radius||0).toFixed(4),px:_navigationPoint.userData.size?.px||0,hold:!!_navigationHold,active:!!(_navigationHold&&_navigationHold.active)}:{visible:false,hold:!!_navigationHold};
