// Feedback inspects only the selected path's handles, on pointer events.
(() => {
  let hover=-1, selected=-1, pressed=false;
  const enabled=()=>_pathEditId!=null&&!(typeof msr!=='undefined'&&msr.active);
  function screenSize(h){
    const viewPosition=new THREE.Vector3(), viewport=new THREE.Vector4();
    let lastScale=-1;
    h.onBeforeRender=(renderer,_scene,viewCamera)=>{
      let height=canvas.clientHeight;
      if(renderer?.getCurrentViewport){
        renderer.getCurrentViewport(viewport);
        height=viewport.w/(renderer.getPixelRatio?.()||1);
      }
      if(!(height>0))return;
      viewPosition.setFromMatrixPosition(h.matrixWorld).applyMatrix4(viewCamera.matrixWorldInverse);
      const depth=viewCamera.isPerspectiveCamera?-viewPosition.z:1;
      if(!(depth>0))return;
      // 14 CSS pixels at rest; no extra frame loop or scene raycast.
      const scale=14*2*depth/(height*Math.abs(viewCamera.projectionMatrix.elements[5])*.26)*(h.userData.feedbackScale||1);
      if(!Number.isFinite(scale)||Math.abs(scale-lastScale)<1e-6)return;
      lastScale=scale;h.scale.setScalar(scale);h.updateMatrixWorld(true);
    };
  }
  function paint(){
    let changed=false;
    for(let i=0;i<_pathHandles.length;i++){
      const h=_pathHandles[i];
      if(!h.userData.feedbackState)screenSize(h);
      const state=i===selected?(pressed?'drag':'selected'):i===hover?'hover':'idle';
      if(h.userData.feedbackState===state)continue;
      h.userData.feedbackState=state;
      h.material.color.setHex({idle:0xffd24a,hover:0xffffff,selected:0x39d8ed,drag:0xff893d}[state]);
      h.userData.feedbackScale={idle:1,hover:1.25,selected:1.35,drag:1.5}[state];
      changed=true;
    }
    if(changed&&typeof markDirty==='function')markDirty(2);
  }
  window._pathResetFeedback=()=>{hover=-1;selected=-1;pressed=false;};
  window._pathPaintFeedback=paint;
  canvas.addEventListener('pointermove',event=>{
    if(!enabled()||pressed)return;
    const next=event.pointerType==='touch'?-1:_pathHandleAt(event.clientX,event.clientY);
    if(next===hover)return;hover=next;paint();
  },{passive:true});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||!enabled()||pressed)return;
    const hit=_pathHandleAt(event.clientX,event.clientY);
    if(hit<0)return;
    selected=hit;hover=-1;pressed=true;paint();
  },{passive:true});
  function release(){if(!pressed)return;pressed=false;paint();}
  canvas.addEventListener('pointerup',release,{passive:true});
  window.addEventListener('pointerup',release,{passive:true});
  window.addEventListener('pointercancel',release,{passive:true});
  window.addEventListener('blur',release);
  canvas.addEventListener('pointerleave',()=>{if(hover<0)return;hover=-1;paint();},{passive:true});
})();
