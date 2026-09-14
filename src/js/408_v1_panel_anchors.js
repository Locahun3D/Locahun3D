(()=>{
  const touch=matchMedia('(pointer:coarse) and (any-hover:none)');
  let frame=0,settled=0;
  const visible=e=>e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;
  const set=(name,value)=>document.documentElement.style.setProperty(name,value+'px');
  function layout(){
    frame=0;if(!touch.matches)return;
    const header=document.getElementById('topbar').getBoundingClientRect();
    set('--v1-header-bottom',header.bottom);
    if(Math.min(innerWidth,innerHeight)>=700){
      const layer=document.getElementById('layer-panel');
      const width=visible(layer)?layer.getBoundingClientRect().width:0;
      const camera=document.getElementById('cam-panel');
      const right=visible(camera)?camera.getBoundingClientRect().left:innerWidth;
      set('--v1-tools-width',Math.max(120,right-width-16));set('--v1-tools-center',(right+width)/2);
      return;
    }
    const vv=visualViewport;
    const bottom=Math.min(innerHeight,vv?vv.offsetTop+vv.height:innerHeight);
    const toolbar=document.getElementById('view-tl-btns');
    const obstacles=[...document.querySelectorAll('#hud .cbar>button,#joy,#joy-vert')].filter(visible).map(e=>e.getBoundingClientRect());
    for(const [id,prefix] of [['cam-panel','camera'],['sun-panel','sun']]){
      const panel=document.getElementById(id);if(!visible(panel))continue;
      const r=panel.getBoundingClientRect();
      const overlap=b=>r.left<b.right&&r.right>b.left;
      let top=header.bottom+4,limit=bottom-12;
      if(visible(toolbar)){
        for(const e of toolbar.querySelectorAll('button,#qi-badge'))if(visible(e)){
          const b=e.getBoundingClientRect();if(overlap(b))top=Math.max(top,b.bottom+8);
        }
      }
      for(const b of obstacles)if(overlap(b)&&b.top>=top)limit=Math.min(limit,b.top-8);
      set('--v1-'+prefix+'-height',Math.max(48,limit-top));
      if(prefix==='camera')set('--v1-camera-top',top);
      else set('--v1-sun-bottom',innerHeight-limit);
    }
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(layout);};
  const resize=()=>{schedule();clearTimeout(settled);settled=setTimeout(schedule,280);};
  for(const name of ['resize','pageshow','orientationchange'])window.addEventListener(name,resize);
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);
  document.addEventListener('click',schedule,true);
  touch.addEventListener('change',schedule);
  new ResizeObserver(schedule).observe(document.getElementById('topbar'));
  new ResizeObserver(schedule).observe(document.getElementById('layer-panel'));
  new ResizeObserver(schedule).observe(document.querySelector('#hud .cbar'));
  schedule();
})();
