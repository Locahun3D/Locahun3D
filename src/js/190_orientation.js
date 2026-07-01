// ══════════════════════════════════════════════════
//  ORIENTATION
// ══════════════════════════════════════════════════
function applyOrient(sm,flipped){sm.quaternion.set(flipped?1:0,0,0,flipped?0:1);}

// Apply Spark SplatMesh properties that limit per-splat screen footprint and prevent
// huge splats from smearing across the screen during fast camera pans. Spark exposes
// a few different property names depending on version; we set whichever exist.
function tuneSplatMesh(sm){
  if(!sm) return;
  try{
    sm.frustumCulled = false;            // let Spark do its own culling
    // ── Per-splat footprint / opacity cutoffs (device-class aware) ──
    // Source values come from _SPLAT_PARAMS, which is picked from
    // _SPLAT_TIERS at startup based on the detected device class. The
    // three knobs are the dominant fragment-shader cost in Spark: each
    // splat rasterises as a quad sized by maxStdDev × apparentRadius;
    // every covered fragment costs Gaussian-weight + alpha-blend work.
    //   phone tier:  1.3 / 1.0 / 16/255  (most aggressive — smartphone GPUs)
    //   tablet tier: 1.4 / 1.1 / 12/255  (iPad / Android tablet)
    //   weak laptop: 1.4 / 1.1 / 12/255  (Intel Mac, iGPU, software fallback)
    //   ok laptop:   1.5 / 1.15 / 8/255  (mid-tier laptop / unknown GPU)
    //   desktop:     1.6 / 1.2 / 6/255   (full splat quality)
    const _P = (typeof _SPLAT_PARAMS !== 'undefined' && _SPLAT_PARAMS)
               ? _SPLAT_PARAMS
               : { maxStdDev:1.6, apparentRadius:1.2, opacityThreshold:6/255, sortIntervalMs:0 };
    if('maxStdDev' in sm)        sm.maxStdDev        = _P.maxStdDev;
    if('apparentRadius' in sm)   sm.apparentRadius   = _P.apparentRadius;
    if('opacityThreshold' in sm) sm.opacityThreshold = _P.opacityThreshold;
    // ── High-resolution / no-progressive tuning (try every known Spark API name) ──
    // These properties exist on different Spark versions. We set whichever exist so the
    // splat renders at full quality from the first frame, with no LOD/streaming flicker.
    if('progressive'         in sm) sm.progressive         = false;
    if('progressiveLoad'     in sm) sm.progressiveLoad     = false;
    if('lodEnabled'          in sm) sm.lodEnabled          = false;
    if('adaptiveQuality'     in sm) sm.adaptiveQuality     = false;
    if('motionBlur'          in sm) sm.motionBlur          = false;
    // Throttle the sort on weaker tiers — desktops / strong laptops keep
    // sort-every-frame for crispest depth ordering during fast pans;
    // mobile / weak tiers accept a small ms gap between sorts (still
    // imperceptible at typical splat motion speeds).
    if('sortInterval'        in sm) sm.sortInterval        = _P.sortIntervalMs;
    if('maxSortBudget'       in sm) sm.maxSortBudget       = Infinity;
    if('immediateSort'       in sm) sm.immediateSort       = (_P.sortIntervalMs === 0);
    if('renderEveryFrame'    in sm) sm.renderEveryFrame    = true;
    const u = sm.material && sm.material.uniforms;
    if(u){
      if(u.maxStdDev)        u.maxStdDev.value        = _P.maxStdDev;
      if(u.apparentRadius)   u.apparentRadius.value   = _P.apparentRadius;
      if(u.opacityThreshold) u.opacityThreshold.value = _P.opacityThreshold;
    }
    if(window.DEBUG_PICK) console.log('[tuneSplatMesh] keys:', Object.keys(sm).slice(0,30), 'tier:', typeof _splatPerfTier!=='undefined'?_splatPerfTier:'?');
    // ── Force full spherical-harmonic count from the first frame ──
    // Spark 2.x starts a freshly-loaded mesh with dynoNumSh = 0 (DC-only
    // colour, flat shading per splat) and progressively ramps numSh up to
    // packedSplats.maxSh as it streams + parses higher SH degrees in a
    // worker. During camera rotation this ramp is plainly visible as a
    // "low-resolution → high-resolution" upgrade: view-dependent
    // reflections / specular pop in over ~0.2 s after motion settles.
    // We override that by calling setMaxSh(maxSh) on the SplatSource so
    // numSh starts at the full upper bound (3 for 3DGS PLYs), giving a
    // single consistent look from the very first rendered frame.
    //
    // packedSplats is created asynchronously inside SplatMesh, so the
    // .initialized promise gates the call. Fall back to scheduling on
    // sm.initialized if packedSplats isn't ready yet.
    // URL toggles (diagnostic A/B): allow temporarily disabling the
    // LOD-off / SH-ramp-off defenses to measure their cost/benefit.
    //   ?lod=1     → let Spark's runtime LOD heuristics run (was the
    //                cause of the "low↔high alternation" complaint)
    //   ?sh=ramp   → let Spark progressively raise numSh from 0 to maxSh
    //                (was the cause of visible "colour pop-in" on rotation)
    const _DEFENSE_LOD = !/[?&]lod=1/.test(location.search);
    const _DEFENSE_SH  = !/[?&]sh=ramp/.test(location.search);
    // RAD meshes (paged streaming format) REQUIRE LoD to be ON — it's the
    // whole point of the format. Without LoD, the chunk pager never fetches
    // any chunks and the scene shows zero splats. So skip the LoD defense
    // for paged meshes regardless of the ?lod=1 URL toggle.
    const _isPaged = !!sm.paged;
    const _forceFullSh = () => {
      try{
        if(_DEFENSE_LOD && !_isPaged){
          // ── LOD runtime fields ──
          if('enableLod' in sm) sm.enableLod = false;
          if('lodScale'  in sm) sm.lodScale  = 1;
          // ── Foveation runtime fields ── (paired with LOD defense)
          if('coneFov'        in sm) sm.coneFov        = Math.PI;
          if('coneFov0'       in sm) sm.coneFov0       = Math.PI;
          if('coneFoveate'    in sm) sm.coneFoveate    = 0;
          if('behindFoveate'  in sm) sm.behindFoveate  = 0;
        }
        // ── SH uniforms ──
        const ps = sm.packedSplats;
        if(!ps) return;
        const maxSh = typeof ps.maxSh === 'number' ? ps.maxSh : 3;
        if(_DEFENSE_SH){
          if(typeof ps.setMaxSh === 'function') ps.setMaxSh(maxSh);
          if(ps.dynoNumSh && ps.dynoNumSh.uniform){
            ps.dynoNumSh.uniform.value = maxSh;
            ps.dynoNumSh.value         = maxSh;
          }
        }
        // shMax uniform: per-degree quantisation range. Source the values
        // from splatEncoding.{sh1,sh2,sh3}Max if present (Spark stores
        // them at decode time), defaulting to 1 (the value the PLY ships).
        const enc = ps.splatEncoding || {};
        const sx = (typeof enc.sh1Max === 'number') ? enc.sh1Max : 1;
        const sy = (typeof enc.sh2Max === 'number') ? enc.sh2Max : 1;
        const sz = (typeof enc.sh3Max === 'number') ? enc.sh3Max : 1;
        if(ps.dynoShMax && ps.dynoShMax.value){
          ps.dynoShMax.value.x = sx; ps.dynoShMax.value.y = sy; ps.dynoShMax.value.z = sz;
        }
        if(ps.dynoShMax && ps.dynoShMax.uniform && ps.dynoShMax.uniform.value){
          ps.dynoShMax.uniform.value.x = sx; ps.dynoShMax.uniform.value.y = sy; ps.dynoShMax.uniform.value.z = sz;
        }
      }catch(e){ console.warn('forceFullSh failed:', e); }
    };
    if(sm.isInitialized){ _forceFullSh(); }
    else if(sm.initialized && typeof sm.initialized.then === 'function'){
      sm.initialized.then(_forceFullSh).catch(()=>{});
    } else {
      setTimeout(_forceFullSh, 300);
    }
    // Belt-and-braces: re-assert SH uniforms every frame. The init-time
    // call alone is enough on fast hardware, but on slower GPUs Spark's
    // own per-frame update path was observed to push `dynoNumSh.uniform`
    // back toward 0 mid-frame (the visible "low ↔ high alternation right
    // after rotating" the user reported). Bolting the assertion onto the
    // page's existing animate hook keeps the uniform pinned at maxSh for
    // every render Spark performs, with no measurable cost — it's three
    // numeric writes per frame.
    if(!sm.__shAssertHooked){
      sm.__shAssertHooked = true;
      const hookTick = () => {
        _forceFullSh();
        // Stop the loop if the mesh is gone (disposed / replaced) so we
        // don't leak rAF callbacks across multiple file loads.
        if(sm.parent || (sm.packedSplats && sm.packedSplats.numSplats)){
          requestAnimationFrame(hookTick);
        }
      };
      requestAnimationFrame(hookTick);
    }
  }catch(e){ console.warn('tuneSplatMesh failed:', e); }
}
window.flipOrientation=function(){
  if(!splatMesh)return;
  // Toggle the load-flip flag on the main splat layer and recompose its quaternion.
  const L = layers.find(l=>l.mesh===splatMesh && l.type==='splat');
  if(L){
    L._loadFlipped = !L._loadFlipped;
    splatFlipped = !!L._loadFlipped;
    applyLayerFlipQuat(L);
  } else {
    splatFlipped = !splatFlipped;
    splatMesh.quaternion.set(splatFlipped?1:0,0,0,splatFlipped?0:1);
  }
  document.getElementById('onote').style.display='none';
};

// Spark 2.x defaults that we always force OFF — these knobs are only
// honoured if passed to the SplatMesh constructor (changing them after
// construction does nothing because the LOD geometry / pager are baked
// into the SplatSource at init time).
//
//   lod / enableLod : Spark's runtime LOD swap, which renders alternating
//                     low- and high-resolution variants of each splat
//                     depending on apparent size / frame budget. The
//                     visible "ぱかつき" (flicker between coarse and fine
//                     resolutions) the user reported is exactly this.
//   nonLod          : explicitly tells Spark to build the SplatSource in
//                     non-LOD mode (single high-quality pass only).
//   paged           : disables progressive streaming, so all splats are
//                     uploaded up-front. With paged on, big PLY scans pop
//                     in chunks for several seconds after the loader UI
//                     hides, which also looks like flicker.
const SPARK_QUALITY_OPTS = {
  // LOD off. Keeping `lod:false` + `enableLod:false` disables Spark's
  // runtime LOD swap. We deliberately DO NOT pass `nonLod:true` even
  // though it sounds like the right flag — in Spark 2.0.0 `nonLod:true`
  // locks the SplatSource into a fixed-numSh build where
  // `packedSplats.setMaxSh(n)` becomes a silent no-op and dynoNumSh
  // stays at 0 forever. That's exactly what produces the "low / high
  // alternation right after rotation" symptom: the splats render flat
  // DC-only colour, and the higher-order SH coefficients only kick in
  // briefly when a render burst happens to coincide with Spark's
  // internal sort window. Without nonLod, setMaxSh actually moves
  // dynoNumSh up to packedSplats.maxSh on init, giving consistent SH
  // shading every frame.
  lod: false,
  enableLod: false,
  paged: false,
  // Foveation off. Spark's default foveation reduces splat fidelity outside
  // a central viewing cone — fine when standing still, but the cone moves
  // with the camera, so during rotation what was "edge / low-detail" rotates
  // into the centre and is upgraded to high-detail, producing the exact
  // "low ↔ high alternation right after rotating" the user reported. Setting
  // both *Foveate factors to 0 disables the strength of the reduction, and
  // a 180° (π rad) cone makes every direction count as "centre" so even if
  // some residual factor is non-zero, no part of the view is ever degraded.
  coneFoveate: 0,
  behindFoveate: 0,
  coneFov: Math.PI,
  coneFov0: Math.PI,
};

