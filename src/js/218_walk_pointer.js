// Share the existing analog movement channel; leave touch navigation untouched.
(()=>{
  const pad=document.getElementById('joy'),knob=document.getElementById('jknob');
  let pointer=null;
  function reset(){
    if(pointer===null)return;
    const id=pointer;pointer=null;
    if(pad.hasPointerCapture(id))pad.releasePointerCapture(id);
    joyDX=0;joyDY=0;
    knob.style.left='50%';knob.style.top='50%';markDirty(3);
  }
  function update(e){
    const r=pad.getBoundingClientRect(),radius=r.width*.29;
    const dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;
    const length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;
    joyDX=dx*scale/radius;joyDY=dy*scale/radius;
    knob.style.left=(r.width/2+dx*scale)+'px';knob.style.top=(r.height/2+dy*scale)+'px';
    markDirty(3);bumpSplatActive(2000);
  }
  pad.addEventListener('pointerdown',e=>{
    if(!walkMode.active||e.pointerType==='touch'||e.button!==0||pointer!==null)return;
    e.preventDefault();e.stopPropagation();pointer=e.pointerId;
    pad.setPointerCapture(pointer);update(e);
  });
  pad.addEventListener('pointermove',e=>{if(e.pointerId===pointer)update(e);});
  pad.addEventListener('pointerup',e=>{if(e.pointerId===pointer)reset();});
  pad.addEventListener('pointercancel',reset);
  pad.addEventListener('lostpointercapture',reset);
  window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  window.addEventListener('walk-mode-exit',reset);
})();
