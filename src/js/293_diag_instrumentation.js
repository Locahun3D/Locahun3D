// ── Self-installing sampler ───────────────────────────────────────────────
// Writes a 1Hz timeline + every setPixelRatio call + every quality change.
// Buffer is window.__diagLog (rolling, max 7200 entries = 2h at 1Hz).
// Pull from outside via: JSON.stringify(window.__diagLog.slice(-N)).
window.__diagLog = window.__diagLog || [];
window.__diagSummary = window.__diagSummary || { prChanges:0, qualChanges:0, shResets:0, lodReassertions:0, foveateAlerts:0, startedAt:performance.now() };
function _diagPush(rec){
  rec.t = performance.now();
  window.__diagLog.push(rec);
  if(window.__diagLog.length > 7200) window.__diagLog.shift();
}
// Patch renderer.setPixelRatio
try{
  const _origSetPR = renderer.setPixelRatio.bind(renderer);
  renderer.setPixelRatio = function(v){
    const stack = (new Error()).stack||'';
    const caller = stack.split('\n').slice(2,5).map(s=>s.trim()).join(' | ').slice(0,300);
    _diagPush({ev:'setPR', pr:v, caller});
    window.__diagSummary.prChanges++;
    return _origSetPR(v);
  };
}catch(e){ console.warn('[diag] PR patch failed', e); }
// 1Hz sampler
let _diagLastQual = null;
setInterval(()=>{
  const ds = window.__diagState;
  const snap = {
    ev:'snap',
    q: ds.qualScale, qi: ds.qualIdx, qp: ds.qualPreferred,
    pr: ds.renderer ? ds.renderer.getPixelRatio() : null,
    pendingPR: ds.pendingPR,
    ftAvg: ds.ftAvg, wallMs: ds.wallMsAvg, fps: ds.fps,
    splatActiveLeft: Math.max(0, ds.splatActiveUntil - performance.now()),
    slowStreak: window._gpuWatchdog ? window._gpuWatchdog.slowStreak : 0,
    fastStreak: window._gpuWatchdog ? window._gpuWatchdog.fastStreak : 0,
  };
  // renderer.info — exposes GPU resource counts and per-frame draw stats
  const r = ds.renderer;
  if(r && r.info){
    snap.calls = r.info.render.calls;
    snap.tris  = r.info.render.triangles;
    snap.geoms = r.info.memory.geometries;
    snap.txs   = r.info.memory.textures;
    snap.progr = r.info.programs ? r.info.programs.length : null;
  }
  const sm = ds.splatMesh;
  if(sm){
    snap.enableLod  = ('enableLod'  in sm) ? sm.enableLod  : null;
    snap.lodScale   = ('lodScale'   in sm) ? sm.lodScale   : null;
    snap.coneFov    = ('coneFov'    in sm) ? sm.coneFov    : null;
    snap.coneFoveate= ('coneFoveate'in sm) ? sm.coneFoveate: null;
    // Spark's internal state — try to surface anything that might oscillate
    for(const k of ['maxStdDev','apparentRadius','opacityThreshold','sortInterval','progressive','progressiveLoad','adaptiveQuality']){
      if(k in sm) snap['sm_'+k] = sm[k];
    }
    // Material uniforms (live values)
    const u = sm.material && sm.material.uniforms;
    if(u){
      if(u.maxStdDev && u.maxStdDev.value!=null) snap.u_maxStdDev = u.maxStdDev.value;
      if(u.apparentRadius && u.apparentRadius.value!=null) snap.u_apparentRadius = u.apparentRadius.value;
      if(u.opacityThreshold && u.opacityThreshold.value!=null) snap.u_opacityThreshold = u.opacityThreshold.value;
    }
    const ps = sm.packedSplats;
    if(ps){
      snap.maxSh = ps.maxSh;
      snap.numShU = (ps.dynoNumSh && ps.dynoNumSh.uniform) ? ps.dynoNumSh.uniform.value : null;
      snap.numShV = ps.dynoNumSh ? ps.dynoNumSh.value : null;
      snap.numSplats = ps.numSplats;
      if(snap.numShU != null && snap.maxSh != null && snap.numShU < snap.maxSh){
        _diagPush({ev:'shReset', u:snap.numShU, max:snap.maxSh});
        window.__diagSummary.shResets++;
      }
    }
    if(snap.enableLod === true){
      _diagPush({ev:'lodReassert'});
      window.__diagSummary.lodReassertions++;
    }
    if(typeof snap.coneFoveate === 'number' && snap.coneFoveate > 0){
      _diagPush({ev:'foveateAlert', v:snap.coneFoveate});
      window.__diagSummary.foveateAlerts++;
    }
  }
  if(_diagLastQual !== snap.q){
    _diagPush({ev:'qualChange', from:_diagLastQual, to:snap.q});
    window.__diagSummary.qualChanges++;
    _diagLastQual = snap.q;
  }
  _diagPush(snap);
}, 1000);
console.info('[Locahun-diag] Self-installing sampler ARMED (1 Hz). Buffer: window.__diagLog');

// ── One-shot SplatMesh property dump (runs once after PLY loaded) ─────────
// Surfaces ALL property names on the SplatMesh + its packedSplats so we can
// find anything LOD/foveation-related that the existing defenses may miss.
(function dumpSplatMeshKeysWhenReady(){
  const tryDump = ()=>{
    const sm = (window.__diagState && window.__diagState.splatMesh) || null;
    if(!sm) return false;
    const dump = {
      sm_keys: [],
      sm_lod_related: {},
      ps_keys: [],
      ps_lod_related: {},
      proto_methods: [],
    };
    try {
      const allKeys = (o) => {
        const out = new Set();
        let cur = o;
        while(cur && cur !== Object.prototype){
          for(const k of Object.getOwnPropertyNames(cur)) out.add(k);
          cur = Object.getPrototypeOf(cur);
        }
        return Array.from(out);
      };
      const smk = allKeys(sm);
      dump.sm_keys = smk;
      const RE = /lod|foveate|fov|quality|adaptiv|progres|stream|page|sort|sh\b|maxStd|apparentRadius|opacity/i;
      for(const k of smk){
        if(RE.test(k)){
          try { dump.sm_lod_related[k] = typeof sm[k] === 'function' ? '<fn>' : sm[k]; }
          catch(_){ dump.sm_lod_related[k] = '<err>'; }
        }
      }
      const ps = sm.packedSplats;
      if(ps){
        const psk = allKeys(ps);
        dump.ps_keys = psk;
        for(const k of psk){
          if(RE.test(k)){
            try { dump.ps_lod_related[k] = typeof ps[k] === 'function' ? '<fn>' : ps[k]; }
            catch(_){ dump.ps_lod_related[k] = '<err>'; }
          }
        }
      }
      // Probe material.uniforms — Spark's GLSL knobs live here in 2.0
      dump.uniform_keys = [];
      try {
        const u = sm.material && sm.material.uniforms;
        if(u){
          dump.uniform_keys = Object.keys(u);
          for(const k of dump.uniform_keys){
            try {
              const v = u[k] && u[k].value;
              if(v != null && (typeof v === 'number' || typeof v === 'boolean')){
                dump.ps_lod_related['u_'+k] = v;
              } else if(v && v.x != null){
                dump.ps_lod_related['u_'+k] = `(${v.x},${v.y},${v.z||'?'})`;
              }
            } catch(_){}
          }
        }
      } catch(e){ dump.uniform_err = e.message; }
    } catch(e){ dump.error = e.message; }
    // POST it as a separate event
    try {
      fetch('/__diag', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ev:'splatMeshDump', t:performance.now(), dump}),
      }).catch(()=>{});
    } catch(_){}
    console.info('[Locahun-diag] SplatMesh property dump posted');
    return true;
  };
  // Poll until splatMesh is ready
  const iv = setInterval(()=>{
    if(tryDump()) clearInterval(iv);
  }, 1000);
  setTimeout(()=>clearInterval(iv), 60000);
})();

// ── Camera-motion stress driver (?stress=1) ───────────────────────────────
// Drives a synthetic yaw oscillation + occasional pitch nudges via the
// existing __dbg helpers, so we can sample under realistic load without
// requiring a human at the controls. Starts 8 s after autoload finishes.
// Opt-in GPU-cost probe (?gpuTime=1) — forces gl.finish() each frame for the
// definitive GPU time measurement. Cost: blocks the main thread while GPU is
// busy, so DO NOT enable in normal use.
if(/[?&]gpuTime=1/.test(location.search)){
  window.__gpuTimeProbe = true;
  console.info('[Locahun-diag] gl.finish() probe ENABLED — _ftAvg now reflects true GPU time');
}
// ── Pure rAF rate probe (?rafProbe=1) ────────────────────────────────────
// Measures the browser's actual rAF callback cadence with NO page work,
// so we can tell if Chrome is throttling vs. if our code is the bottleneck.
// Optional render-divider for testing whether compositor throttles by submit rate
if(/[?&]renderDiv=(\d+)/.test(location.search)){
  window.__renderDiv = parseInt(RegExp.$1,10) || 1;
  console.info('[Locahun-diag] renderDiv =', window.__renderDiv);
}
if(/[?&]rafProbe=1/.test(location.search)){
  let last = 0, count = 0, accum = 0, started = performance.now();
  const tick = (t) => {
    requestAnimationFrame(tick);
    if(last){
      accum += (t - last);
      count++;
      if(count >= 60){
        const avg = accum / count;
        const fps = 1000 / avg;
        fetch('/__diag', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ev:'rafProbe', t, avgMs:avg, fps, sinceStartMs: t - started}),
          keepalive:true,
        }).catch(()=>{});
        accum = 0; count = 0;
      }
    }
    last = t;
  };
  requestAnimationFrame(tick);
  console.info('[Locahun-diag] rAF rate probe ARMED');
}
// ── Per-section CPU profiler (?prof=1) ───────────────────────────────────
if(/[?&]prof=1/.test(location.search)){
  window.__prof = { preRenderMs:0, renderMs:0, gapMs:0 };
  // Every second, post averages and reset accumulators
  setInterval(()=>{
    const f = window.__profFrames || 1;
    const rec = {
      ev: 'prof',
      t: performance.now(),
      frames: f,
      // avg per-frame ms in each section
      preRenderAvg: window.__prof.preRenderMs / f,
      renderAvg:    window.__prof.renderMs    / f,
      gapAvg:       window.__prof.gapMs       / f,  // time between rAF callbacks
    };
    window.__diagLog.push(rec);
    window.__prof.preRenderMs = window.__prof.renderMs = window.__prof.gapMs = 0;
    window.__profFrames = 0;
  }, 1000);
  console.info('[Locahun-diag] CPU profiler ENABLED — per-section averages logged');
}
// Manual quality override (?qual=N where N = 0.5/0.75/1.0/1.5/2.0) — bypasses
// the _probeOptimalQuality + watchdog so we can sweep quality at the same load.
if(/[?&]qual=([\d.]+)/.test(location.search)){
  const q = parseFloat(RegExp.$1);
  if(q > 0 && q <= 3){
    setTimeout(()=>{
      try {
        if(typeof window.setQuality === 'function'){
          // Map scale → idx best-effort: 0.5→0, 0.75→1, 1.0→2, 1.5→3, else 3
          const idx = q < 0.6 ? 0 : q < 0.9 ? 1 : q < 1.2 ? 2 : 3;
          window.setQuality(q, idx);
          // Also pin the watchdog so it can't oscillate during the test
          window._gpuWatchdog = window._gpuWatchdog || {};
          window._gpuWatchdog.manualOverride = true;
          console.info('[Locahun-diag] qual override:', q, 'idx', idx);
        }
      } catch(e){ console.warn('qual override failed', e); }
    }, 6000);
  }
}
if(/[?&]stress=(\d+)/.test(location.search)){
  const stressLevel = parseInt(RegExp.$1, 10) || 1;
  setTimeout(()=>{
    console.info('[Locahun-diag] stress driver ENGAGED level='+stressLevel);
    let phase = 0;
    const tickMs = stressLevel >= 2 ? 16 : 50; // ~60Hz at level 2+
    const amp    = stressLevel >= 2 ? 0.05 : 0.025;
    setInterval(()=>{
      phase += 0.04;
      const delta = Math.sin(phase) * amp;
      if(window.__dbg && typeof window.__dbg.bumpYaw === 'function'){
        window.__dbg.bumpYaw(delta);
      }
      if(stressLevel >= 2 && Math.floor(phase*5) % 7 === 0){
        // Snap rotations to force Spark re-sort
        if(window.__dbg && typeof window.__dbg.bumpYaw === 'function'){
          window.__dbg.bumpYaw(0.4 * (Math.random() > 0.5 ? 1 : -1));
        }
      }
      // Note: the yaw target divergence already triggers motion + bumpSplatActive
      // via the animate() lerp path at the same code path as real input.
    }, tickMs);
  }, 8000);
}

// ── Periodic POST to local diag collector ─────────────────────────────────
// Sends new entries every 5s to http://localhost:8765/__diag. Server appends
// to __diag.log so we have a persistent record even if the tab crashes.
let _diagPostedUpTo = 0;
setInterval(()=>{
  if(window.__diagLog.length <= _diagPostedUpTo) return;
  const chunk = window.__diagLog.slice(_diagPostedUpTo);
  _diagPostedUpTo = window.__diagLog.length;
  try{
    fetch('/__diag', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        ua: navigator.userAgent.slice(0,120),
        dpr: window.devicePixelRatio,
        nowPerf: performance.now(),
        nowISO: new Date().toISOString(),
        summary: window.__diagSummary,
        entries: chunk,
      }),
      keepalive: true,
    }).catch(()=>{});
  }catch(e){}
}, 5000);
} // ← end of ?diag=1 gate

// ══════════════════════════════════════════════════
//  LIGHT HALOS — make placed PointLights visibly "shine through" env-tint darkness
//  Renders DOM-based screen-blend halos at each light's projected screen position,
//  so the light source pierces night/sunset darkening instead of getting flattened
//  by the multiplicative env-tint. (Splats themselves still aren't truly re-lit —
//  this is a visual-only approximation that reads as "the light is glowing.")
// ══════════════════════════════════════════════════
// Allocation-free working state — reused every frame to avoid GC churn
const _haloVec   = new THREE.Vector3();
const _haloProj  = new THREE.Vector3();
let   _haloLightCache = null;       // cached filtered list (only re-derived on dirty)
let   _haloDarkCache  = { bg:'', dark:0 }; // env-tint parse cache

function _haloMarkDirty(){
  // Called when layers/lights/visibility change. Invalidates the filtered list
  // and updates the cheap "any lights active?" counter that gates the
  // per-frame updateLightHalos() call (see animate loop).
  _haloLightCache = null;
  let n = 0;
  if(typeof layers !== 'undefined'){
    for(let i=0;i<layers.length;i++){
      const L = layers[i];
      if(L && L.type === 'light' && L.mesh && L.visible !== false) n++;
    }
  }
  window._activeLightCount = n;
}

function updateLightHalos(){
  const layerDiv = document.getElementById('light-halo-layer');
  if(!layerDiv || typeof layers === 'undefined' || !camera) return;

  // Cheap activity gate — early bail without allocating
  const tintEl = document.getElementById('env-tint');
  const tintActive = tintEl && tintEl.style.display !== 'none';
  if(!tintActive){
    if(layerDiv.style.display !== 'none') layerDiv.style.display = 'none';
    return;
  }

  // Re-derive filtered light list only when dirty (much cheaper than filter() per frame)
  if(!_haloLightCache){
    _haloLightCache = [];
    for(let i=0;i<layers.length;i++){
      const L = layers[i];
      if(L && L.type === 'light' && L.mesh && L.visible !== false) _haloLightCache.push(L);
    }
  }
  const lights = _haloLightCache;
  if(lights.length === 0){
    if(layerDiv.style.display !== 'none') layerDiv.style.display = 'none';
    return;
  }
  if(layerDiv.style.display !== 'block') layerDiv.style.display = 'block';

  // Sync DOM halo elements (only when count changed)
  if(layerDiv.childElementCount !== lights.length){
    // Add halos for new lights
    for(let i=0;i<lights.length;i++){
      const L = lights[i];
      if(L._halo && L._halo.parentNode === layerDiv) continue;
      const halo = document.createElement('div');
      halo.style.cssText = 'position:absolute;pointer-events:none;border-radius:50%;transform:translate(-50%,-50%);will-change:transform,opacity;';
      layerDiv.appendChild(halo);
      L._halo = halo;
    }
    // Remove halos whose owner light was deleted
    for(let i=layerDiv.children.length-1;i>=0;i--){
      const h = layerDiv.children[i];
      let found = false;
      for(let j=0;j<lights.length;j++) if(lights[j]._halo === h){ found = true; break; }
      if(!found) h.remove();
    }
  }

  // env-tint dark factor — only re-parse when background string actually changed
  const bg = tintEl ? (tintEl.style.background || '') : '';
  if(bg !== _haloDarkCache.bg){
    let dark = 0;
    // Parse without regex/match (avoids array allocation)
    const lp = bg.indexOf('('), rp = bg.indexOf(')');
    if(lp > -1 && rp > lp){
      const parts = bg.slice(lp+1, rp).split(',');
      if(parts.length >= 3){
        const r = parseInt(parts[0]) || 0, g = parseInt(parts[1]) || 0, b = parseInt(parts[2]) || 0;
        const lum = (r*0.299 + g*0.587 + b*0.114) / 255;
        dark = lum > 1 ? 0 : (lum < 0 ? 1 : 1 - lum);
      }
    }
    _haloDarkCache.bg = bg;
    _haloDarkCache.dark = dark;
  }
  const darkFactor = _haloDarkCache.dark;

  // Project each light to screen and update its halo
  const w = window.innerWidth, h = window.innerHeight;
  for(let i=0;i<lights.length;i++){
    const L = lights[i];
    if(!L._halo) continue;
    L.mesh.getWorldPosition(_haloVec);
    const dist = _haloVec.distanceTo(camPos);
    // Reuse _haloProj (no clone allocation)
    _haloProj.copy(_haloVec).project(camera);

    if(_haloProj.z > 1 || _haloProj.z < -1){
      if(L._halo.style.opacity !== '0') L._halo.style.opacity = '0';
      continue;
    }

    const x = (_haloProj.x * 0.5 + 0.5) * w;
    const y = (-_haloProj.y * 0.5 + 0.5) * h;

    // Halo size: light's reach (lightDistance) projected to pixels at this depth.
    // Falls back to intensity-based sizing.
    const reach = L.lightDistance || 20;
    // Pixels-per-world-unit at this distance (perspective heuristic)
    const ppw = (h * 0.5) / Math.max(0.01, dist) / Math.tan((camera.fov || 60) * Math.PI / 360);
    const sizePx = Math.max(80, Math.min(1400, reach * ppw * 0.85));

    const intensity = Math.max(0, L.lightIntensity || 1.5);
    // Opacity: scales with intensity AND darkness — halos disappear in daylight.
    // ×0.1 so the halo stays subtle relative to the actual PointLight contribution.
    const op = Math.max(0, Math.min(1, (intensity * 0.35) * (0.25 + darkFactor * 1.1) * 0.1));

    const col = L.lightColor || '#ffee88';
    // Use translate3d for compositor-only updates (no layout, no allocation per axis)
    // Round + integer compare to avoid sub-pixel thrash
    const xR = (x|0), yR = (y|0), sR = (sizePx|0);
    const opR = Math.round(op * 100); // integer % for stable compare
    const last = L._haloLast || (L._haloLast = { x:-1, y:-1, s:-1, op:-1, col:'' });

    // Position via transform: GPU-only, no layout invalidation
    if(last.x !== xR || last.y !== yR){
      L._halo.style.transform = 'translate3d(' + (xR - (last.s>=0?last.s:sR)/2) + 'px,' + (yR - (last.s>=0?last.s:sR)/2) + 'px,0)';
      // Simpler: use top/left only on size change, transform for x/y is more efficient overall
      // ...but simplest working: keep top/left strings; cache prevents repeated writes
      L._halo.style.left = xR + 'px';
      L._halo.style.top  = yR + 'px';
      L._halo.style.transform = 'translate(-50%,-50%)';
      last.x = xR; last.y = yR;
    }
    if(last.s !== sR){
      L._halo.style.width  = sR + 'px';
      L._halo.style.height = sR + 'px';
      L._halo.style.filter = 'blur(' + (sR * 0.04 < 8 ? 8 : (sR * 0.04 | 0)) + 'px)';
      last.s = sR;
    }
    if(last.op !== opR){
      L._halo.style.opacity = (opR / 100);
      last.op = opR;
    }
    if(last.col !== col){
      // Soft radial gradient (single template, only rebuilt on color change — once or twice ever)
      L._halo.style.background = 'radial-gradient(circle,' +
        col + 'dd 0%,' + col + '99 14%,' + col + '44 38%,' + col + '1a 60%,transparent 92%)';
      last.col = col;
    }
  }
}
// Halos are updated synchronously inside the main animate() loop (after renderer.render),
// so they only repaint when something actually changes — no standalone RAF loop here.
// updateLightHalos() also caches its writes (skips DOM updates if values are unchanged)
// to avoid forcing unnecessary repaints/reflows.

