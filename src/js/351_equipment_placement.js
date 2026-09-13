// Extend the shared mouse/touch placement dispatcher without changing its owned source.
(() => {
  const commitExisting=_commitPlace;
  _commitPlace=function(clientX,clientY){
    if(typeof _placeMode!=='string'||!_placeMode.startsWith('equipment:'))return commitExisting(clientX,clientY);
    const id=_placeMode.slice('equipment:'.length),point=pickWorldPos(clientX,clientY,{groundFallback:true});
    _cancelPlace();
    if(point)window.addEquipmentLayer(id,point.clone());
  };
})();
