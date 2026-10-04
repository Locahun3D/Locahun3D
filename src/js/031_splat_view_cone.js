// Spark's cone angles are degrees, not radians. A vertical 90° camera on a
// wide screen has corners beyond the default 90° detail cone. Include the
// actual projection (also zoom/view offsets) without raising memory budgets.
const _splatConeCorner=new THREE.Vector3();
function _updateSplatViewCone(viewCamera,viewRenderer){
  if(!viewCamera?.isPerspectiveCamera || sparkRenderer.lodQuatOverride)return;
  let halfAngle=0;
  for(const x of [-1,1])for(const y of [-1,1]){
    _splatConeCorner.set(x,y,0).applyMatrix4(viewCamera.projectionMatrixInverse);
    halfAngle=Math.max(halfAngle,Math.atan2(Math.hypot(_splatConeCorner.x,_splatConeCorner.y),-_splatConeCorner.z));
  }
  const detail=Math.min(180,Math.max(90,halfAngle*360/Math.PI+2));
  const outer=Math.min(180,detail+30);
  if(!Number.isFinite(detail))return;
  // The camera tool renders wide context then a narrower scissored frame.
  // Both share one LOD tree: don't shrink it on the second pass every frame.
  if(viewRenderer?.getScissorTest() && detail<=sparkRenderer.coneFov0)return;
  if(Math.abs(sparkRenderer.coneFov0-detail)>.01 || Math.abs(sparkRenderer.coneFov-outer)>.01){
    sparkRenderer.coneFov0=detail;
    sparkRenderer.coneFov=outer;
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
