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
window.setQuality=function(scale,idx){
  const before = qualIdx;
  qualScale=scale; qualIdx=idx;
  // Manual user choice → apply immediately; cancel any deferred swap so the
  // user's selection isn't overwritten when the next idle window opens.
  _pendingPixelRatio = null;
  renderer.setPixelRatio(Math.min(devicePixelRatio,_PR_CAP)*scale);
  document.querySelectorAll('#quality-panel #qbtns button').forEach((b,i)=>b.classList.toggle('on',i===idx));
  _updateQiBadgeLabel(idx);
  // RAD scenes use a per-mesh `lodScale` to drive how aggressively Spark's
  // LoD walker subdivides chunks. Updating it on the fly lets a quality
  // preset change (低/中/高) raise or lower splat density in view without
  // rebuilding the mesh. PLY/SPLAT ignore lodScale (geometry is baked).
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
  // The continuous watchdog stays ACTIVE even after a manual pick. The user's
  // choice becomes the new "ceiling" the watchdog up-steps toward; if render
  // time later threatens the 30 fps floor the watchdog will still drop
  // quality below this level to defend the framerate. (Watchdog runs in
  // the main animate loop, gated on _qualPreferred for its up-step path.)
  _qualPreferred = scale;
  // Reset streak counters so the watchdog re-evaluates against the new
  // ceiling cleanly without immediately bouncing the user's pick.
  if(window._gpuWatchdog){
    window._gpuWatchdog.slowStreak = 0;
    window._gpuWatchdog.fastStreak = 0;
    window._gpuWatchdog.lastStep = performance.now();
  }
  markDirty(8);
  const SCALES = [0.75, 1.0, 1.5];
  pushGenericUndo('quality', before, idx, val=>{
    const i = Math.max(0, Math.min(2, val|0));
    qualIdx = i; qualScale = SCALES[i];
    renderer.setPixelRatio(Math.min(devicePixelRatio,_PR_CAP)*qualScale);
    document.querySelectorAll('#quality-panel #qbtns button').forEach((b,k)=>b.classList.toggle('on',k===i));
    _updateQiBadgeLabel(i);
    markDirty(8);
  });
};
