(()=>{
  const touch=matchMedia('(pointer:coarse) and (any-hover:none)');
  const ids=['cam-panel','sun-panel','gizmo','cam-anim-panel','quality-panel'];
  const buttons={'btnCamTool':'cam-panel','btn-sun':'sun-panel','btnMeasure':'gizmo','btnCamAnim':'cam-anim-panel','qi-badge':'quality-panel'};
  let preferred=null,timer=null;
  const open=e=>e&&getComputedStyle(e).display!=='none';
  function layout(){
    const panels=ids.map(id=>document.getElementById(id)).filter(Boolean);
    if(!touch.matches){for(const p of panels)p.removeAttribute('data-touch-occluded');return;}
    const available=panels.filter(open),selected=available.find(p=>p.id===preferred)||available.at(-1);
    for(const p of panels){const value=String(open(p)&&p!==selected);if(p.dataset.touchOccluded!==value)p.dataset.touchOccluded=value;}
    const top=document.getElementById('view-tl-btns')?.getBoundingClientRect().bottom||84;
    const bar=document.querySelector('#hud .cbar')?.getBoundingClientRect();
    const vv=window.visualViewport,bottom=Math.min(innerHeight,vv?vv.offsetTop+vv.height:innerHeight);
    const limit=Math.min(bar?.height?bar.top-8:bottom-88,bottom-104);
    document.documentElement.style.setProperty('--touch-panel-top',(top+8)+'px');
    document.documentElement.style.setProperty('--touch-panel-height',Math.max(48,limit-top-8)+'px');
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(layout,0);};
  // The quality chip handles touchend itself and suppresses the synthetic click.
  document.getElementById('qi-badge')?.addEventListener('touchend',()=>{preferred='quality-panel';schedule();},{passive:true});
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('button,#qi-badge'),id=buttons[button?.id];
    if(id&&touch.matches){
      const panel=document.getElementById(id);
      preferred=id;
      // Reveal an already active inspector without toggling its tool off.
      if(open(panel)&&panel.dataset.touchOccluded==='true'){e.preventDefault();e.stopImmediatePropagation();layout();return;}
    }
    schedule();
  },true);
  for(const event of ['resize','pageshow'])window.addEventListener(event,schedule);
  window.addEventListener('orientationchange',()=>{schedule();setTimeout(layout,250);});
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);
  touch.addEventListener('change',schedule);
  window._layoutTouchPanels=layout;
  schedule();
})();
