// Spark's cone angles are degrees, not radians. A vertical 90° camera on a
// wide screen has corners beyond the default 90° detail cone. Include the
// actual projection (also zoom/view offsets) without raising memory budgets.
const _splatConeCorner=new THREE.Vector3();
const _splatTeleLod=!/[?&]teleLod=0(?:&|$)/.test(location.search);
function _updateSplatViewCone(viewCamera,viewRenderer){
  if(!viewCamera?.isPerspectiveCamera || sparkRenderer.lodQuatOverride)return;
  let halfAngle=0;
  for(const x of [-1,1])for(const y of [-1,1]){
    _splatConeCorner.set(x,y,0).applyMatrix4(viewCamera.projectionMatrixInverse);
    halfAngle=Math.max(halfAngle,Math.atan2(Math.hypot(_splatConeCorner.x,_splatConeCorner.y),-_splatConeCorner.z));
  }
  // 2026-10-14 望遠では画角の中に予算を集める（本人「望遠にすると遠距離描画が耐えられてない」「画角内のLODを最高画質に」）。
  // 以前は詳細域を最低90°に固定していたため、100mm（対角約25°）では予算の大半が画面の外に使われ、画角内の遠景が粗かった。
  // 画角が90°未満のときは「画角＋15%＋2°」だけを詳細域にする。広角（従来どおり90°以上）では何も変わらない。
  // ?teleLod=0 で従来の挙動に戻せる（A/B 比較用）。
  const frameDeg=halfAngle*360/Math.PI;
  const detail=Math.min(180,_splatTeleLod?Math.max(Math.min(90,frameDeg*1.15+2),frameDeg+2):Math.max(90,frameDeg+2));
  const outer=Math.min(180,detail+30);
  if(!Number.isFinite(detail))return;
  // The camera tool renders wide context then a narrower scissored frame.
  // Both share one LOD tree: don't shrink it on the second pass every frame.
  if(viewRenderer?.getScissorTest() && detail<=sparkRenderer.coneFov0)return;
  // 2026-10-14 望遠の続き: Spark の細かさの基準は画角に比例して細かくなる（焦点距離が長いほど1ピクセルが小さい）。
  // 画面の外（coneFoveate 0.4・背後 behindFoveate 0.2）もその基準で解像されるため、望遠では見えない周囲まで
  // 望遠並みに細かく読み、予算を食っていた。画面外の細かさを広角（対角90°）のときと同じに保つよう、
  // 画角が狭いぶんだけ係数を下げる。画角内は変えない。広角（90°以上）は Spark 既定の 0.4 / 0.2 のまま。
  const tele=_splatTeleLod?Math.min(1,Math.max(.05,Math.tan(Math.min(frameDeg,90)*Math.PI/360))):1;
  const foveate=.4*tele, behind=.2*tele;
  if(Math.abs(sparkRenderer.coneFov0-detail)>.01 || Math.abs(sparkRenderer.coneFov-outer)>.01 || Math.abs(sparkRenderer.coneFoveate-foveate)>.001){
    sparkRenderer.coneFov0=detail;
    sparkRenderer.coneFov=outer;
    sparkRenderer.coneFoveate=foveate;
    sparkRenderer.behindFoveate=behind;
    // Spark does not detect cone changes in its camera-change test.
    sparkRenderer.lodDirty=true;
  }
}
// Cover normal rendering, camera framing and captures at the same boundary.
const _splatBeforeRender=sparkRenderer.onBeforeRender;
sparkRenderer.onBeforeRender=function(renderer,scene,viewCamera,...rest){
  _updateSplatViewCone(viewCamera,renderer);
  return _splatBeforeRender.call(this,renderer,scene,viewCamera,...rest);
};
