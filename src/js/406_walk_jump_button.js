function _syncWalkJumpButton(){
  const button=document.getElementById('walk-jump-button');
  if(!button)return;
  button.hidden=!walkMode.active;
  const label=window._lang==='en'?'Jump':'ジャンプ';
  button.setAttribute('aria-label',label);
  button.title=label;
  document.body.classList.toggle('walk-active',walkMode.active);
  if(!walkMode.active)walkMode.jumpRequested=false;
}
(()=>{
  const button=document.getElementById('walk-jump-button');if(!button)return;
  let pointer=null;
  const jump=e=>{
    e.preventDefault();e.stopPropagation();
    if(!walkMode.active)return;
    walkMode.jumpRequested=true;markDirty(3);
  };
  button.addEventListener('pointerdown',e=>{
    if(pointer!==null||e.button!==0)return;
    pointer=e.pointerId;
    try{button.setPointerCapture(pointer);}catch(_){}
    button.classList.add('held');
    jump(e);
  });
  const release=e=>{
    if(e.pointerId!==pointer)return;
    pointer=null;button.classList.remove('held');
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  window.addEventListener('blur',()=>{pointer=null;button.classList.remove('held');});
  button.addEventListener('contextmenu',e=>e.preventDefault());
  button.addEventListener('click',e=>{
    // Keyboard/assistive activation only; pointerdown already queued the jump.
    if(e.detail===0&&!e.pointerType)jump(e);
    else {e.preventDefault();e.stopPropagation();}
  });
})();
