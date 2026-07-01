// ══════════════════════════════════════════════════
//  RESIZABLE LAYER PANEL
// ══════════════════════════════════════════════════
(()=>{
  const handle=document.getElementById('lp-resize-handle');
  const panel=document.getElementById('layer-panel');
  if(!handle||!panel) return;
  let resizing=false, startX=0, startW=0;
  handle.addEventListener('mousedown',e=>{
    resizing=true; startX=e.clientX;
    startW=parseInt(window.getComputedStyle(panel).width)||285;
    document.body.style.cursor='col-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!resizing) return;
    const newW=Math.max(150,Math.min(420,startW+(e.clientX-startX)));
    panel.style.width=newW+'px';
    const ftBar=document.getElementById('lp-footer-bar');
    if(ftBar) ftBar.style.width=newW+'px';
    // Update ibox offset (hugs the panel right edge).
    // view-tl-btns is intentionally NOT updated here — per user request the
    // top-row buttons (カメラリセット / オブジェクト追加 / アバター歩行 /
    // AR) stay centered on the viewport regardless of layer-panel width.
    const ibox=document.querySelector('#hud .ibox');
    if(ibox) ibox.style.left=(newW+10)+'px';
    // Keep the bottom cbar centred within the (viewport - panel) area.
    if(typeof _updateLpWidthVar === 'function') _updateLpWidthVar();
  });
  document.addEventListener('mouseup',()=>{
    if(resizing){ resizing=false; document.body.style.cursor=''; }
  });
})();

