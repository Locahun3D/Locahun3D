function _syncWalkJumpButton(){
  const button=document.getElementById('walk-jump-button');
  if(!button)return;
  button.hidden=!walkMode.active;
  button.textContent=window._lang==='en'?'Jump':'ジャンプ';
  if(!walkMode.active)walkMode.jumpRequested=false;
}
(()=>{
  const button=document.getElementById('walk-jump-button');if(!button)return;
  button.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    if(!walkMode.active)return;
    walkMode.jumpRequested=true;markDirty(3);
  });
})();
