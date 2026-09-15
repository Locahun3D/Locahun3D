function _syncWalkJumpButton(){
  const button=document.getElementById('walk-jump-button');
  if(!button)return;
  button.hidden=!walkMode.active;
  button.textContent=window._lang==='en'?'Jump':'ジャンプ';
  if(!walkMode.active)walkMode.jumpRequested=false;
}
(()=>{
  const button=document.getElementById('walk-jump-button');if(!button)return;
  let suppressClickUntil=0;
  button.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    suppressClickUntil=performance.now()+700;
    if(!walkMode.active)return;
    walkMode.jumpRequested=true;markDirty(3);
  });
  button.addEventListener('pointerup',()=>{suppressClickUntil=performance.now()+700;});
  button.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    if(e.detail!==0&&performance.now()<suppressClickUntil)return;
    if(!walkMode.active)return;
    walkMode.jumpRequested=true;markDirty(3);
  });
})();
