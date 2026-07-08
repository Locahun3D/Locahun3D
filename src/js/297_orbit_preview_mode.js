// ══════════════════════════════════════════════════
//  ?orbit=1 — Slow 360° auto-orbit for inline preview embeds (online SaaS
//  property listing pages). Waits for the scene to load, then gently
//  rotates yaw a full turn over ~10 s. Stops on any pointer/wheel/touch/key
//  interaction so the user can take manual control. OFF by default — zero
//  effect unless the URL explicitly requests it, so this is inert in the
//  standalone app.
// ══════════════════════════════════════════════════
if(/[?&]orbit=1/.test(location.search)){
  (function(){
    // Preview mode: hide ALL UI, show only the rotating 3D scene
    const style = document.createElement('style');
    style.textContent = '#topbar,#hud,#layer-panel,#overlay,#dropzone,#orient-lock,#sun-panel,#immersive-exit,#env-tint,#light-halo-layer,#view-tl-btns,#qp-panel,[id^="lfi-"],[id^="obj-type-menu"]{display:none!important}body{overflow:hidden!important;margin:0!important}#c{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:0!important}';
    document.head.appendChild(style);

    // When capture=1 is also active, capture code drives the orbit itself.
    if(/[?&]capture=1/.test(location.search)) return;

    const ORBIT_DURATION_S = 10;
    const RAD_PER_S = (2 * Math.PI) / ORBIT_DURATION_S;
    let orbitRaf = 0;
    let baseYaw = 0;
    // ユーザー操作(ポインタ/ホイール/タッチ/キー)で自動回転を止め、手動操作に譲る。
    let orbitStopped = false;
    const stopOrbit = ()=>{ if(orbitStopped) return; orbitStopped = true; if(orbitRaf) cancelAnimationFrame(orbitRaf); };
    ['pointerdown','wheel','touchstart','keydown'].forEach(ev =>
      window.addEventListener(ev, stopOrbit, { passive:true, once:true }));

    const hasScene = ()=> (typeof layers!=='undefined' && layers.some(L=>L&&L.mesh&&L.type!=='camera'));

    async function startOrbit(){
      for(let i=0; i<160 && !hasScene(); i++) await new Promise(r=>setTimeout(r,500));
      if(!hasScene()) return;
      await new Promise(r=>setTimeout(r,1500));

      baseYaw = yaw;
      let prev = performance.now();

      (function loop(now){
        if(orbitStopped) return;
        const dt = (now - prev) / 1000;
        prev = now;
        _yawTarget += RAD_PER_S * dt;
        yaw = _yawTarget;
        if(typeof markDirty === 'function') markDirty(2);
        if(yaw - baseYaw >= 2 * Math.PI) return;
        orbitRaf = requestAnimationFrame(loop);
      })(performance.now());
    }
    setTimeout(startOrbit, 200);
  })();
}
