// ══════════════════════════════════════════════════
//  UI CONTROLS
// ══════════════════════════════════════════════════
let qOpen=false;
window.setGridVisible=function(v){
  const before = !!grid.visible;
  const after  = !!v;
  pushGenericUndo('grid-visible', before, after, val=>{
    grid.visible=!!val;
    const cb=document.getElementById('grid-toggle'); if(cb) cb.checked=!!val;
    markDirty(4);
  });
  grid.visible=after;
  markDirty(4);
};
// Legacy 設定 panel toggle — no-op now (panel removed). Kept so the API
// surface is stable for old onclick handlers / external code references.
window.toggleQPanel=function(){
  if(typeof toggleQualityPanel === 'function') return toggleQualityPanel();
};
// Sync the top-right always-visible quality badge label to the active
// preset. Called from setQuality and the undo callback so the badge can
// never drift out of step with the actual renderer pixel ratio.
function _updateQiBadgeLabel(idx){
  const el = document.getElementById('qib-lvl');
  const labels = [T('qt-low'),T('qt-mid'),T('qt-high')];
  if(el) el.textContent = labels[idx] || '?';
}
// The three user-pickable quality presets: 低 / 中 / 高.
//   idx 0 → 0.75  (低)
//   idx 1 → 1.0   (中)
//   idx 2 → 1.5   (高)
// Kept module-scope so the applier, the undo callback and the watchdog all
// agree on one table (the old code duplicated `[0.75,1.0,1.5]` in three
// places, which drifted).
const _QUALITY_SCALES = [0.75, 1.0, 1.5];

// ── Shared quality-tier applier ─────────────────────────────────────────
// ONE place that mutates qualScale/qualIdx and reflects the change to the
// renderer, RAD meshes, badge and panel. Every quality actor now routes
// through here — manual clicks (setQuality), the continuous watchdog, the
// post-load calibration path, and the battery one-shot — so those four
// previously-divergent code paths can no longer disagree about pixel ratio
// vs. RAD lodScale vs. badge (RC3). `opts`:
//   • source:    'manual' | 'watchdog' | 'calibration' | 'battery'
//   • immediate: true  → renderer.setPixelRatio() NOW (+ cancel pending swap)
//                 false → _queuePixelRatio() (applied on the next idle window)
// Only manual picks are immediate (the user expects instant feedback and no
// mid-motion flash is acceptable for a deliberate click); everything else is
// queued so the buffer reallocation lands between interactions.
function applyQualityTier(idx, opts){
  opts = opts || {};
  const source = opts.source || 'watchdog';
  const immediate = !!opts.immediate;
  const i = Math.max(0, Math.min(2, idx|0));
  qualIdx = i;
  qualScale = _QUALITY_SCALES[i];
  const pr = Math.min(devicePixelRatio, _PR_CAP) * qualScale;
  if(immediate){
    // Cancel any deferred swap so a queued change can't overwrite this one
    // when the next idle window opens.
    _pendingPixelRatio = null;
    renderer.setPixelRatio(pr);
  } else {
    _queuePixelRatio(pr);
  }
  // ALWAYS reapply RAD lodScale. RAD scenes use a per-mesh `lodScale` to
  // drive how aggressively Spark's LoD walker subdivides chunks; updating it
  // on the fly lets a preset change raise/lower in-view splat density without
  // rebuilding the mesh. PLY/SPLAT ignore lodScale (geometry is baked) — the
  // `mesh.paged` guard keeps this a no-op for them.
  try {
    const newLod = _radEffectiveLodScale();
    if(typeof layers !== 'undefined' && layers){
      for(const L of layers){
        if(L && L.mesh && L.mesh.paged && typeof L.mesh.lodScale === 'number'){
          L.mesh.lodScale = newLod;
        }
      }
    }
  } catch(_){}
  _updateQiBadgeLabel(i);
  document.querySelectorAll('#quality-panel #qbtns button').forEach((b,k)=>b.classList.toggle('on',k===i));
  if(source === 'manual'){
    // Manual pick = the new ceiling in BOTH directions (existing semantics):
    // the watchdog may still drop below it to defend 30 fps, but never
    // auto-climbs past the user's explicit choice.
    _qualPreferred = qualScale;
  }
  const _lbl = ['低','中','高'][i] || '?';
  console.info('[Locahun][Quality] ' + source + ' → ' + _lbl);
  markDirty(8);
}
// Expose for the calibration/watchdog fragments (concatenated into the same
// module scope, so a bare reference already resolves — this is just belt-and-
// suspenders for any external caller / diag console poking).
window._applyQualityTier = applyQualityTier;

window.setQuality=function(scale,idx){
  const before = qualIdx;
  // Delegate to the shared applier so a manual click is byte-for-byte the
  // same as before: immediate pixel-ratio, RAD lodScale reapply, badge +
  // panel sync, and _qualPreferred := the picked scale (manual = ceiling).
  applyQualityTier(idx, { source:'manual', immediate:true });
  // Reset watchdog streaks so it re-evaluates against the new ceiling cleanly
  // without immediately bouncing the user's pick. (manualOverride is NOT set
  // here — that flag is reserved for the ?qual= diag pin, matching prior
  // behavior; a normal manual click keeps the watchdog active as a floor
  // defender.)
  if(window._gpuWatchdog){
    window._gpuWatchdog.slowStreak = 0;
    window._gpuWatchdog.fastStreak = 0;
    window._gpuWatchdog.lastStep = performance.now();
  }
  pushGenericUndo('quality', before, idx, val=>{
    const i = Math.max(0, Math.min(2, val|0));
    // Undo/redo of a quality pick is also a manual choice → immediate + resets
    // the ceiling, identical to a fresh click on that preset.
    applyQualityTier(i, { source:'manual', immediate:true });
  });
};
