// Card gestures are separate from canvas input; only a completed drop adds a layer.
(()=>{
  const menu=document.getElementById('obj-type-menu-top');if(!menu)return;
  let pending=null,suppressClickUntil=0;
  const kindOf=b=>b.dataset.equipmentId?'equipment:'+b.dataset.equipmentId:
    b.querySelector('#lbl-addfig-top')?'figure':b.querySelector('#obj-add-cube')?'cube':b.querySelector('#obj-add-event')?'event':null;
  function dispose(mesh){
    if(!mesh)return;scene.remove(mesh);
    const geometries=new Set(),materials=new Set(),skeletons=new Set();
    mesh.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());
  }
  function cancel(){
    const p=pending;if(!p)return;pending=null;clearTimeout(p.timer);
    if(p.active){suppressClickUntil=performance.now()+700;dispose(p.ghost);_placeHideProbe();}
    try{p.button.releasePointerCapture(p.id);}catch(_){}
    markDirty(2);
  }
  async function ghost(kind){
    let model;
    if(kind.startsWith('equipment:'))model=LocahunEquipment.build(THREE,kind.slice(10));
    else if(kind==='figure'){
      const figure=await _buildMixamoFigure(FIGURE_REF_HEIGHT_CM,{preview:true});model=figure.root;
      // Skeleton cloning shares geometry; the preview must own anything it disposes.
      model.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();});
      for(const marker of figure.figureMarkers||[])marker.visible=false;
    }else model=new THREE.Mesh(kind==='cube'?new THREE.BoxGeometry(1,1,1):new THREE.SphereGeometry(.25,16,12),new THREE.MeshBasicMaterial());
    model.traverse(o=>{
      if(!o.isMesh)return;
      for(const material of Array.isArray(o.material)?o.material:[o.material])material?.dispose();
      o.material=new THREE.MeshBasicMaterial({color:0x70bfb0,transparent:true,opacity:.4,depthWrite:false});
      o.raycast=()=>{};
    });
    return model;
  }
  function preview(p,x,y){
    p.x=x;p.y=y;
    const isCanvas=document.elementFromPoint(x,y)===canvas;
    p.point=null;
    if(isCanvas){
      const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
      const view=_useOrtho?_orthoCamera:camera;view.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),view);
      const surfaces=layers.filter(l=>l.visible!==false&&l.mesh?.visible!==false&&['splat','obj','cube'].includes(l.type)).map(l=>l.mesh);
      for(const surface of surfaces)surface.updateMatrixWorld(true);
      const hit=ray.intersectObjects(surfaces,true)[0];
      if(hit&&[hit.point.x,hit.point.y,hit.point.z].every(Number.isFinite))p.point=hit.point.clone();
    }
    if(p.ghost){p.ghost.visible=!!p.point;if(p.point)p.ghost.position.copy(p.point);}
    markDirty(2);
  }
  menu.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.isPrimary===false||pending)return;
    const button=e.target.closest('button'),kind=button&&kindOf(button);if(!kind)return;
    const p=pending={button,kind,id:e.pointerId,x:e.clientX,y:e.clientY,active:false,point:null,epoch:walkSetup.epoch};
    p.timer=setTimeout(async()=>{
      if(pending!==p)return;p.active=true;suppressClickUntil=performance.now()+700;
      _cancelClickNavigation();
      try{button.setPointerCapture(p.id);}catch(_){}
      try{
        const model=await ghost(kind);
        if(pending!==p||p.epoch!==walkSetup.epoch){dispose(model);return;}
        p.ghost=model;scene.add(model);preview(p,p.x,p.y);
      }catch(error){cancel();showUndoToast(error.message);}
    },350);
  });
  window.addEventListener('pointermove',e=>{
    const p=pending;if(!p||e.pointerId!==p.id)return;
    if(!p.active){if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>5)cancel();return;}
    if(e.cancelable)e.preventDefault();
    if(p.epoch!==walkSetup.epoch){cancel();return;}
    preview(p,e.clientX,e.clientY);
  },{passive:false});
  window.addEventListener('pointerup',e=>{
    const p=pending;if(!p||e.pointerId!==p.id)return;
    if(!p.active){cancel();return;}
    preview(p,e.clientX,e.clientY);
    const point=p.ghost&&p.point?.clone(),kind=p.kind,valid=p.epoch===walkSetup.epoch;
    cancel();if(!point||!valid)return;
    window.closeObjTypeMenuTop();
    if(kind.startsWith('equipment:'))window.addEquipmentLayer(kind.slice(10),point);
    else if(kind==='figure')window.addFigureLayer(point);
    else if(kind==='cube')window.addCubeLayer(point);
    else if(kind==='event')window.addEventLayer(point);
  });
  menu.addEventListener('click',e=>{
    if(performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  menu.addEventListener('dragstart',e=>e.preventDefault());
  window.addEventListener('pointerdown',e=>{if(pending&&e.pointerId!==pending.id)cancel();},true);
  menu.addEventListener('lostpointercapture',e=>{if(pending&&e.pointerId===pending.id)cancel();});
  new MutationObserver(()=>{if(pending&&menu.style.display!=='flex')cancel();}).observe(menu,{attributes:true,attributeFilter:['style']});
  window.addEventListener('pointercancel',cancel);
  window.addEventListener('blur',cancel);
  window.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
})();
