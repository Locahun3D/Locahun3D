// ══════════════════════════════════════════════════
//  EVENT PANEL HOVER (v26: viewport hover replaced with panel highlight)
// ══════════════════════════════════════════════════
let _panelHoverLayerId = null;
const _panelHoverRay = new THREE.Raycaster();
const _panelHoverV2  = new THREE.Vector2();
function _clearPanelHover(){
  if(_panelHoverLayerId!=null){
    const el=document.getElementById('lr-'+_panelHoverLayerId);
    if(el) el.classList.remove('lr-pivot-hover');
    _panelHoverLayerId=null;
  }
}
function updateEventPanelHover(cx,cy){
  const rect=canvas.getBoundingClientRect();
  _panelHoverV2.set(((cx-rect.left)/rect.width)*2-1, -((cy-rect.top)/rect.height)*2+1);
  const cam = _useOrtho ? _orthoCamera : camera;
  _panelHoverRay.setFromCamera(_panelHoverV2, cam);
  const meshMap=new Map();
  for(const L of layers){
    if(L.type==='folder'||L.type==='splat'||!L.mesh||!L.visible) continue;
    L.mesh.traverse(function(ch){ if(ch.isMesh) meshMap.set(ch, L); });
  }
  const hits=_panelHoverRay.intersectObjects([...meshMap.keys()], false);
  if(hits.length>0){
    const hitL=meshMap.get(hits[0].object);
    if(hitL && hitL.id !== _panelHoverLayerId){
      _clearPanelHover();
      _panelHoverLayerId=hitL.id;
      const el=document.getElementById('lr-'+hitL.id);
      if(el) el.classList.add('lr-pivot-hover');
    }
    canvas.style.cursor='pointer';
  } else {
    _clearPanelHover();
    canvas.style.cursor='';
  }
}

