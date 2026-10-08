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
// 画質ごとの描画予算（2026-10-08 本人「画質設定の差が無く死に機能」「低はローエンド向けに再調整」「性能を引き出せていない」）。
// 実測（RTX 5090・GPU時間）: 中=250万点 2.5ms / 高=500万点 4.7ms / 1000万点＋細かさ2倍 9.3ms（渋谷スクランブル）。
//   低: 端末の既定予算の半分＋LODを 1.25 倍粗く（スマホ 0.5〜0.75M・PC 1.25M）。古い端末・iGPU 向け。
//   中: Spark の端末別既定（PC 250万・iPhone 150万・Android 100万）。
//   高: PC 500万（タブレット等は既定の 1.6 倍）。読み込み直後の GPU 実測で余裕が大きい機種だけ 1000万＋細かさ 2 倍（_qualTop）。
let _qualTop = false;
function _qualBudget(i){
  const base = (sparkRenderer && typeof sparkRenderer.defaultSplatTarget === 'function') ? sparkRenderer.defaultSplatTarget() : 2500000;
  const tier = (typeof _splatPerfTier !== 'undefined') ? _splatPerfTier : 'desktop';
  if(i === 0) return { count: Math.round(base * 0.5), renderScale: 1.25 };
  if(i === 2){
    if(tier === 'desktop') return _qualTop ? { count: 10000000, renderScale: 0.5 } : { count: 5000000, renderScale: 1 };
    return { count: Math.round(base * 1.6), renderScale: 1 };
  }
  return { count: undefined, renderScale: 1 };
}

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
  // ── 高画質時のLOD総予算拡大 (spec S2) ──
  // lodScale を 2.0 超に上げても総予算 lodSplatCount(desktop既定250万)が先に
  // 頭打ちになり広範囲が精細化しない(実測で飽和確認済み)。「高」の時だけ予算も
  // 引き上げ、低/中では undefined に戻して Spark の端末別既定に委ねる。
  // VRAM上限 maxPagedSplats(desktop 1677万) は別枠なので触らない。
  try {
    if(typeof sparkRenderer !== 'undefined' && sparkRenderer){
      const B = _qualBudget(i);
      sparkRenderer.lodSplatCount = B.count;
      sparkRenderer.lodRenderScale = B.renderScale;
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
// 起動時の画質の予算も表に合わせる（以前は「高」を選んだときしか予算を設定しておらず、低でも中と同じ量を描いていた）。
try { if(typeof sparkRenderer !== 'undefined' && sparkRenderer){ const B=_qualBudget(qualIdx); sparkRenderer.lodSplatCount=B.count; sparkRenderer.lodRenderScale=B.renderScale; } } catch(_){}

// ── 読み込み直後の GPU 実測で最初の画質を決める（2026-10-08 本人「デバイスの性能を引き出せていない」）──
// 自動画質（ウォッチドッグ）は RAD の読み込み中は判定しない作りで、オンラインの ZIP 経由では較正も呼ばれず、
// RTX 5090 でもずっと「中」のままだった。シーンが落ち着いたら（最長 25 秒）、今の画質で 1 秒ほど描いて
// GPU 時間（EXT_disjoint_timer_query）の中央値を測り、1 回だけ画質を決める。利用者が画質を選んでいたら何もしない。
// 移動中に画質を上げ下げする仕組みではない（決めるのは起動直後の 1 回だけ）。
//   PC の「中」で ≤3ms → 高（1000万点＋細かさ 2 倍。実測で中の約 3.7 倍）/ ≤6ms → 高（約 1.9 倍）/ ≥14ms → 低。
//   どれも 60fps（16.7ms）に収まる見込みの範囲。タッチ端末の「低」で ≤3ms → 中。
//   GPU 時間が測れない環境（Safari 等）は今までどおり。
(function(){
  const q = new URLSearchParams(location.search);
  if(['capture','orbit','headless','qual'].some(k => q.has(k))) return;
  let since = 0, done = false;
  const iv = setInterval(() => {
    if(done || window._qualManual){ clearInterval(iv); return; }
    const main = typeof layers !== 'undefined' && layers.find(L => L._isMain && L.mesh);
    if(!main){ since = 0; return; }
    const now = performance.now();
    if(!since) since = now;
    const streaming = typeof _pagedStreamActive === 'function' && _pagedStreamActive(now);
    if(now - since < 6000 || (streaming && now - since < 25000)) return;
    done = true; clearInterval(iv);
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if(!ext) return;
    const samples = [], pending = []; let depth = 0;
    const orig = renderer.render;
    renderer.render = function(...a){
      while(pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)){
        const qq = pending.shift(); if(!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(qq);
      }
      if(depth++ > 0){ try { return orig.apply(this, a); } finally { depth--; } }
      const qq = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qq);
      try { return orig.apply(this, a); } finally { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(qq); depth--; }
    };
    const t0 = performance.now();
    const tick = setInterval(() => {
      markDirty(4);
      if(samples.length < 30 && performance.now() - t0 < 4000) return;
      clearInterval(tick); renderer.render = orig;
      for(const qq of pending) gl.deleteQuery(qq);
      if(samples.length < 10 || window._qualManual) return;
      samples.sort((x, y) => x - y);
      const m = samples[samples.length >> 1], cur = qualIdx, desktop = _splatPerfTier === 'desktop';
      let next = cur;
      if(desktop && cur === 1){ if(m <= 3){ _qualTop = true; next = 2; } else if(m <= 6) next = 2; else if(m >= 14) next = 0; }
      else if(!desktop && cur === 0 && m <= 3) next = 1;
      console.info('[Locahun][AutoQuality] GPU ' + m.toFixed(2) + ' ms at ' + ['低','中','高'][cur] + ' → ' + ['低','中','高'][next] + (_qualTop ? '+' : ''));
      window.__qualCalib = { gpuMs: m, from: cur, to: next, top: _qualTop };
      if(next !== cur){ applyQualityTier(next, { source:'calibration' }); _qualPreferred = Math.max(_qualPreferred, _QUALITY_SCALES[next]); }
    }, 30);
  }, 1000);
})();

window.setQuality=function(scale,idx){
  window._qualManual = true;
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
