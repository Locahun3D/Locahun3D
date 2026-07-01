// ══════════════════════════════════════════════════
//  TYPE VISIBILITY FILTER
// ══════════════════════════════════════════════════
const _typeHidden = {splat:false, obj:false, event:false, light:false};
window.toggleTypeVis = function(type){
  _typeHidden[type] = !_typeHidden[type];
  const btn = document.getElementById('flt-'+type);
  if(btn) btn.classList.toggle('flt-off', _typeHidden[type]);
  for(const L of layers){
    if(L.type === type){
      const vis = !_typeHidden[type] && L.visible;
      if(L.mesh) L.mesh.visible = vis;
      if(L.wireMesh) L.wireMesh.visible = vis && L.wireframe;
    }
  }
  renderLayerList();
  markDirty(6);
};

