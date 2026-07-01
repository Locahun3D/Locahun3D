// ══════════════════════════════════════════════════
//  SPLAT DECIMATION  (user-toggled "low-poly mode")
// ══════════════════════════════════════════════════
// Spark 2.0.0 doesn't expose any live-toggle knob to cap splat count after
// SplatMesh construction (probed exhaustively — see L2984 comment), so the
// only way to halve the rendered count for iPad / iPhone fps relief is to
// decimate the input buffer BEFORE handing it to Spark. We do this for the
// formats whose binary layout we own (PLY + SPLAT). SPZ + KSPLAT use
// proprietary compression and pass through unchanged — the toggle is a no-op
// for those formats, and the UI label warns the user about that.
//
// IMPORTANT honesty: halving splat count on iOS does NOT halve frame time.
// The iOS Safari compositor is the dominant bottleneck for the AR / heavy
// scene case (GPU shows ~3 % load at 8 fps), so VRAM + sort-worker pressure
// drop but rAF is still gated by the compositor. Expect roughly +30-60 %
// fps in real scenes, not 2×.
function _splatStride(){
  // Read user preference from localStorage. 1 = full quality, 2 = halve,
  // 3 = quarter (kept available behind the same flag for power users).
  // Default is 1 (full) for ALL devices. The previous iPhone-default-2
  // behaviour was too aggressive for small files; instead, large files
  // on iPhone now auto-write '2' to localStorage at load time (see
  // loadSplatFile), so the toggle visually flips ON the first time the
  // user opens a >300 MB file and persists from then on.
  try {
    const raw = localStorage.getItem('locahun_splat_stride');
    if(raw != null){
      const v = parseInt(raw, 10);
      if(v >= 1 && v <= 8) return v;
    }
  } catch(_){}
  return 1;
}

// ── RAD の LoD は `lodScale` で制御する。意味は 2026-06 にライブ計測で確定 ──
// （!!旧コメントの想定は完全に逆だった!! Kousaten RAD / Spark 2.0.0 で実測）:
//   高い lodScale ほど LoD ウォーカーが多くのチャンクを解像する
//     = 高精細・遠距離まで密・シーンの大部分を先読み（→回転後の高LOD化も速い）。
//   低い lodScale ほど粗い（解像数が減る＝軽量）。
//   実測カーブ(単一ビュー): 0.5→0.65M / 0.7→1.04M / 1.0→1.64M / 1.4→2.39M /
//   2.0以上→~2.5M(Spark の per-view 上限に飽和)。
//   ※ foveation(coneFov/coneFoveate) は Spark デフォルトが最も多く解像する。
//     上書きすると減る／coneFoveate:0 は degenerate(1 splat) なので触らない。

// 間引き要求（「ポリゴン1/4」等）は RAD ではチャンクを間引けないので、
// lodScale を下げて軽量化する。stride1→1.0 / 2→0.71 / 4→0.5。
function _radLodScaleForStride(stride){
  if(!Number.isFinite(stride) || stride <= 1) return 1;
  return 1 / Math.sqrt(stride);
}

// 画質プリセット → lodScale。中/高 ほど大きい値（=高精細＋遠距離＋先読み）。
// splat 数は GPU 負荷に直結し、qualScale/PR は解像度しか下げず splat 数を減らせ
// ないため、弱い端末で数百万 splat を出すと FPS を守れない。よって端末ティアで
// 上限を調整する（desktop=5090級はほぼ全精細まで引き上げる）。
//   desktop:     低0.8 / 中1.5 / 高2.2  (中≈2.4M, 高=cap~2.5M)
//   laptop_ok:   低0.7 / 中1.1 / 高1.6
//   laptop_weak: 低0.6 / 中0.9 / 高1.3
//   tablet:      低0.5 / 中0.8 / 高1.2
//   phone:       低0.45/ 中0.7 / 高1.0
function _radLodScaleForQuality(idx){
  const tier = (typeof _splatPerfTier !== 'undefined') ? _splatPerfTier : 'laptop_ok';
  let lo, mid, hi;
  if(tier === 'desktop')          { lo=0.8;  mid=1.5; hi=2.2; }
  else if(tier === 'laptop_ok')   { lo=0.7;  mid=1.1; hi=1.6; }
  else if(tier === 'laptop_weak') { lo=0.6;  mid=0.9; hi=1.3; }
  else if(tier === 'tablet')      { lo=0.5;  mid=0.8; hi=1.2; }
  else /* phone */                { lo=0.45; mid=0.7; hi=1.0; }
  return (idx === 0) ? lo : (idx === 2) ? hi : mid;
}
function _radEffectiveLodScale(){
  return _radLodScaleForStride(_splatStride())
       * _radLodScaleForQuality(typeof qualIdx === 'number' ? qualIdx : 1);
}
// ── [DIAG3] LOD予算(lodSplatCount)最適化（完了後撤去） ──
window.__loadRad = (url)=>{ try{ return loadFromURL(url,'RADtest'); }catch(e){ return 'err:'+e.message; } };
window.__nSplat = ()=> (typeof splatMesh!=='undefined'&&splatMesh&&splatMesh.paged)?splatMesh.paged.numSplats:-1;
window.__keepAlive = (ms)=>{ _splatActiveUntil=performance.now()+(ms||6000); markDirty(240); };
window.__setCam = (y,p)=>{ if(typeof yaw!=='undefined'){yaw=_yawTarget=y;} if(typeof pitch!=='undefined'){pitch=_pitchTarget=(p||0);} _splatActiveUntil=performance.now()+8000; markDirty(240); };
// sparkRenderer のLOD関連プロパティをライブ設定（lodSplatCount/lodSplatScale/coneFov等）
window.__setRenderer = (p)=>{ if(typeof sparkRenderer==='undefined') return 'no sr'; const out={}; for(const k in p){ sparkRenderer[k]=p[k]; out[k]=sparkRenderer[k]; } if(typeof markDirty==='function') markDirty(240); return out; };
window.__srDump = ()=>{ if(typeof sparkRenderer==='undefined') return 'no sr'; const o={}; for(const k of ['lodSplatCount','lodSplatScale','lodRenderScale','coneFov','coneFov0','coneFoveate','behindFoveate','maxPagedSplats','numLodFetchers','enableLod','enableDriveLod']){ o[k]=sparkRenderer[k]; } return o; };
// 予算設定→再ウォーク→収束numSplats と FPS を返す
window.__probeBudget = async function(lodSplatCount, settleMs){
  if(typeof sparkRenderer!=='undefined') sparkRenderer.lodSplatCount = lodSplatCount;
  window.__setCam((typeof yaw!=='undefined'?yaw:0)+0.05, 0); await new Promise(r=>setTimeout(r,300));
  window.__keepAlive((settleMs||2500)+1500); await new Promise(r=>setTimeout(r, settleMs||2500));
  let frames=0; const ft0=performance.now(); function fl(){ frames++; if(performance.now()-ft0<1000){requestAnimationFrame(fl);} } requestAnimationFrame(fl);
  await new Promise(r=>setTimeout(r,1050));
  return { lodSplatCount, numSplats: window.__nSplat(), fps: Math.round(frames/((performance.now()-ft0)/1000)) };
};
function subsamplePLY(rawBuf, stride){
  if(stride <= 1) return rawBuf;
  try {
    const hdrMax = Math.min(rawBuf.byteLength, 65536);
    const hdrText = new TextDecoder().decode(new Uint8Array(rawBuf, 0, hdrMax));
    if(!hdrText.startsWith('ply')) return null;
    const endTag = 'end_header\n';
    const endIdx = hdrText.indexOf(endTag);
    if(endIdx < 0) return null;
    const headerEnd = endIdx + endTag.length;
    let vCount = 0, inVert = false, perVertStride = 0;
    for(const line of hdrText.slice(0, endIdx).split('\n')){
      const p = line.trim().split(/\s+/);
      if(p[0] === 'element'){
        inVert = (p[1] === 'vertex');
        if(inVert) vCount = parseInt(p[2]) || 0;
      } else if(p[0] === 'property' && inVert){
        const sz = (p[1]==='double'||p[1]==='float64')?8 :
                   (p[1]==='uchar'||p[1]==='uint8')?1 :
                   (p[1]==='short'||p[1]==='int16'||p[1]==='ushort'||p[1]==='uint16')?2 : 4;
        perVertStride += sz;
      }
    }
    if(!vCount || !perVertStride) return null;
    const keepCount = Math.ceil(vCount / stride);
    // Rewrite the `element vertex N` line so Spark's parser sees the new
    // count. Keep all other header lines exactly as-is.
    const newHdrText = hdrText.slice(0, endIdx).replace(
      /element\s+vertex\s+\d+/,
      'element vertex ' + keepCount
    ) + endTag;
    const newHdrBytes = new TextEncoder().encode(newHdrText);
    const outBytes = new Uint8Array(newHdrBytes.length + keepCount * perVertStride);
    outBytes.set(newHdrBytes, 0);
    const srcBytes = new Uint8Array(rawBuf);
    let outOff = newHdrBytes.length;
    for(let i = 0; i < vCount; i += stride){
      const srcOff = headerEnd + i * perVertStride;
      if(srcOff + perVertStride > rawBuf.byteLength) break;
      outBytes.set(srcBytes.subarray(srcOff, srcOff + perVertStride), outOff);
      outOff += perVertStride;
    }
    console.info('[Locahun][Decimate] PLY '+vCount+' → '+keepCount+' splats (stride '+stride+')');
    return outBytes.buffer;
  } catch(e){
    console.warn('[subsamplePLY] failed, using original buffer:', e);
    return null;
  }
}
// .splat = fixed 32-byte rows (pos×3 float + scale×3 float + color×4 byte +
// quat×4 byte). No header to patch; just take every Nth row.
function subsampleSplatFile(rawBuf, stride){
  if(stride <= 1) return rawBuf;
  try {
    const rows = Math.floor(rawBuf.byteLength / 32);
    if(rows <= 1) return rawBuf;
    const keepCount = Math.ceil(rows / stride);
    const outBytes = new Uint8Array(keepCount * 32);
    const srcBytes = new Uint8Array(rawBuf);
    let outOff = 0;
    for(let i = 0; i < rows; i += stride){
      outBytes.set(srcBytes.subarray(i * 32, (i + 1) * 32), outOff);
      outOff += 32;
    }
    console.info('[Locahun][Decimate] SPLAT '+rows+' → '+keepCount+' splats (stride '+stride+')');
    return outBytes.buffer;
  } catch(e){
    console.warn('[subsampleSplatFile] failed:', e);
    return null;
  }
}
// Dispatch helper — call before handing rawBuf to Spark.
// Stride comes from `_splatStride()` (localStorage user preference,
// defaulting to 1). Per user direction (2026-05) the previous iPhone-
// only auto-escalation to stride ≥ 4 for files > 300 MB has been
// REMOVED so every device behaves identically: full quality unless
// the user explicitly toggles "ポリゴン 1/4" in the quality panel.
function maybeDecimateSplatBuffer(rawBuf, ext){
  const stride = _splatStride();
  if(stride <= 1) return rawBuf;
  if(ext === 'ply'){
    const out = subsamplePLY(rawBuf, stride);
    return out || rawBuf;
  }
  if(ext === 'splat'){
    const out = subsampleSplatFile(rawBuf, stride);
    return out || rawBuf;
  }
  // SPZ / KSPLAT pass through (proprietary compressed formats).
  return rawBuf;
}

// Re-decimate every currently-loaded splat layer and rebuild its SplatMesh
// with the latest stride applied. Used by the "ポリゴン半減" toggle so the
// change takes effect immediately rather than waiting for the user to
// reopen the file manually. Walks each layer's cached _rawBuffer through
// maybeDecimateSplatBuffer(), builds a fresh SplatMesh, preserves the
// existing transform (position / quaternion / scale / visibility) so the
// scene composition stays put, then swaps the old mesh out.
async function reloadAllSplatLayers(){
  const splatLayers = (typeof layers !== 'undefined' && layers)
    ? layers.filter(L => L && L.type === 'splat' && L._rawBuffer)
    : [];
  if(splatLayers.length === 0) return false;
  try {
    showLd(T('loading') || '読み込み中…');
    setBar(8);
    setMsg(T('building-3dgs') || '3DGS 再構築中…');
    for(let i = 0; i < splatLayers.length; i++){
      const L = splatLayers[i];
      const pct = 10 + (i / splatLayers.length) * 80;
      setBar(pct);
      // Determine extension. Prefer the cached _rawExt set by the loaders;
      // fall back to the layer name (stripped of trailing version suffix).
      let ext = (L._rawExt || '').toLowerCase();
      if(!ext){
        const name = L.name || '';
        ext = (name.split('.').pop() || 'ply').toLowerCase();
      }
      const newBytes = maybeDecimateSplatBuffer(L._rawBuffer, ext);
      const opts = {
        fileBytes: newBytes,
        fileName: (L.name || 'scene') + '.' + ext,
        ...SPARK_QUALITY_OPTS,
      };
      const _ft = _splatFileTypeFor(ext);
      if(_ft !== undefined) opts.fileType = _ft;
      // RAD: build PagedSplats explicitly (see loadSplatFile for why).
      if(ext === 'rad'){
        const _radBytes = newBytes instanceof ArrayBuffer
          ? new Uint8Array(newBytes)
          : newBytes;
        opts.paged = new PagedSplats({
          fileBytes: _radBytes,
          fileType: _splatFileTypeFor('rad'),
        });
        opts.lod = true;
        opts.enableLod = true;
        opts.lodScale = _radEffectiveLodScale();
        delete opts.fileBytes;
        delete opts.fileType;
        delete opts.coneFoveate;
        delete opts.behindFoveate;
        delete opts.coneFov;
        delete opts.coneFov0;
      }
      const _radTargetCount3 = (ext === 'rad')
        ? _parseRadHeaderCount(newBytes instanceof ArrayBuffer ? new Uint8Array(newBytes) : newBytes)
        : 0;
      let newMesh;
      try {
        newMesh = new SplatMesh(opts);
      } catch(e){
        console.warn('[reload-splat] SplatMesh build failed for layer', L.name, e);
        continue;
      }
      if(_radTargetCount3 > 0) newMesh._radTargetCount = _radTargetCount3;
      tuneSplatMesh(newMesh);
      // Preserve the existing world transform exactly so the camera doesn't
      // jump and the user's framing stays. Copying the live transform also
      // means we don't have to re-derive flip × userRot from L.flip flags.
      try {
        const oldMesh = L.mesh;
        if(oldMesh){
          newMesh.position.copy(oldMesh.position);
          newMesh.quaternion.copy(oldMesh.quaternion);
          newMesh.scale.copy(oldMesh.scale);
          newMesh.visible = oldMesh.visible;
          if(oldMesh.userData){
            newMesh.userData = Object.assign(newMesh.userData || {}, oldMesh.userData);
          }
          scene.remove(oldMesh);
        }
      } catch(_){}
      L.mesh = newMesh;
      scene.add(newMesh);
      // If this was the primary splat reference, update it too so other
      // code paths (snapshot, project save) keep pointing at the live mesh.
      if(typeof splatMesh !== 'undefined' && L._isMain){
        try { splatMesh = newMesh; } catch(_){}
      }
    }
    setBar(100);
    setMsg(T('done') || '完了');
    await sleep(150);
    hideLd();
    // Bump Spark's active-sort window so the freshly-built meshes finish
    // their first sort without the user having to nudge the camera.
    _splatActiveUntil = performance.now() + _SPLAT_ACTIVE_MS;
    markDirty(12);
    return true;
  } catch(e){
    console.error('[reload-splat] failed:', e);
    try { hideLd(); } catch(_){}
    return false;
  }
}

// User-facing toggle: stride 2 (halve) on, stride 1 (full) off. Persisted
// to localStorage so the choice survives reload. Per user request, the
// toggle now AUTO-RELOADS every loaded splat layer so the change is
// visible immediately (Spark 2.0.0 has no live count knob, so a rebuild
// is the only option). Project-ZIP reload also picks up the new stride.
window.setLowPolyMode = function(on){
  const want = !!on;
  // Dedupe: iPad / iOS Safari often fires BOTH 'change' and 'click' for
  // a single checkbox tap. Without dedupe the user's tap would kick off
  // two parallel reloadAllSplatLayers() calls — the second one races
  // the first and the panel ends up in an inconsistent state. Skip if
  // the persisted state already matches the requested state.
  try {
    const cur = localStorage.getItem('locahun_splat_stride');
    const curOn = (cur === '2' || cur === '3' || cur === '4' ||
                   cur === '5' || cur === '6' || cur === '7' || cur === '8');
    if(curOn === want){
      // Still sync UI in case visuals drifted, but skip the reload.
      const cb0 = document.getElementById('lowpoly-toggle');
      if(cb0 && cb0.checked !== want) cb0.checked = want;
      return;
    }
  } catch(_){}
  try {
    // '4' = keep every 4th splat (1/4 of total). User-facing label is
    // now "ポリゴン 1/4" — was "ポリゴン半減" (stride=2). The more
    // aggressive default gives users a bigger perf delta from a single
    // toggle, since on Mac/iPad even halving wasn't enough to recover
    // interactive fps on heavy scenes.
    localStorage.setItem('locahun_splat_stride', want ? '4' : '1');
  } catch(_){}
  const cb = document.getElementById('lowpoly-toggle');
  if(cb && cb.checked !== want) cb.checked = want;
  if(typeof showUndoToast === 'function'){
    if(want){
      showUndoToast(T('lowpoly-on') || '🎚 ポリゴン 1/4 を適用中…');
    } else {
      showUndoToast(T('lowpoly-off') || '🎚 ポリゴン 1/4 を解除中…');
    }
  }
  if(typeof reloadAllSplatLayers === 'function'){
    reloadAllSplatLayers().catch(e => console.warn('[reload-splat]', e));
  }
};
// Initialize the toggle checkbox to match the persisted state on first
// render so refreshing the page keeps the user's choice visible.
document.addEventListener('DOMContentLoaded', () => {
  const cb = document.getElementById('lowpoly-toggle');
  if(cb) cb.checked = (_splatStride() >= 2);
}, { once:true });

// Touch-device perf hint shown once per session after the first scene
// loads. Floating card at bottom-left, above the joystick. Contains:
//   • Notification text ("動作が重い場合 ポリゴン半減を ON")
//   • Inline checkbox the user can toggle directly (live-bound to the
//     same setLowPolyMode flow that the quality panel uses)
//   • ✕ button at top-right to dismiss the card
//   • Guidance line pointing the user to the FPS badge (right-top) as
//     the permanent place this setting lives
// Auto-fades after 12 s so it doesn't linger if ignored.

// Universal perf hint card — see showLowPolyHint() below. The previous
// iPad-specific top-center popup was unified into the single bottom-left
// card to keep one consistent UX surface across all devices.
window.showLowPolyHint = function(){
  // Disabled (v0.0.40): the ポリゴン 1/4 feature and its auto guide-popup were
  // retired per user request. Kept as a no-op so existing call sites are safe.
  const _stale = document.getElementById('lowpoly-hint');
  if(_stale) _stale.remove();
  return;
  // eslint-disable-next-line no-unreachable
  const card = document.createElement('div');
  card.id = 'lowpoly-hint';
  // Position: directly under the top-right #qi-badge (the 画質 / FPS
  // pill). The badge lives at top:54 / right:14 on desktop and
  // top:30 / right:6 on smartphones; the card slots in just below so
  // the hint's "FPS 表示ボタンからも切り替えられます" guidance line
  // points physically at the badge. Anchoring to the badge instead of
  // an absolute pixel offset lets us read the badge's actual layout
  // box at runtime — this is robust against the smartphone media
  // query, future topbar resizes, and notched viewports.
  let _topPx = 84;
  let _rightPx = 14;
  try {
    const _badge = document.getElementById('qi-badge');
    if(_badge){
      const r = _badge.getBoundingClientRect();
      if(r && r.bottom > 0){
        _topPx   = Math.round(r.bottom + 8);
        _rightPx = Math.round(Math.max(6, innerWidth - r.right));
      }
    }
  } catch(_){}
  card.style.cssText =
    'position:fixed;' +
    'top:' + _topPx + 'px;right:' + _rightPx + 'px;z-index:140;' +
    'background:rgba(20,20,22,.96);border:1px solid rgba(255,180,84,.55);' +
    'border-radius:10px;padding:11px 14px 12px;max-width:300px;' +
    'box-shadow:0 6px 18px rgba(0,0,0,.55);' +
    'color:#ffe4b3;font-size:.82em;line-height:1.45;letter-spacing:.02em;' +
    'font-family:inherit;pointer-events:auto;' +
    'transition:opacity .35s ease;';
  const lang = (window._lang === 'en') ? 'en' : 'ja';
  const title  = (lang === 'en')
    ? 'If performance is heavy, turn ON "Reduce splats to 1/4".'
    : '動作が重い場合は「ポリゴン 1/4」を ON';
  const cbLbl  = (lang === 'en') ? 'Reduce to 1/4' : 'ポリゴン 1/4';
  const hint   = (lang === 'en')
    ? 'You can also toggle this from the top-right FPS badge later.'
    : 'この設定は右上の FPS 表示ボタンからも切り替えられます';
  const dismissLbl = (lang === 'en') ? 'Dismiss' : '閉じる';
  const checked = (_splatStride() >= 2) ? 'checked' : '';
  card.innerHTML =
    // Header row: title + ✕ button
    '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">' +
      '<div style="flex:1;font-weight:600;">⚡ ' + title + '</div>' +
      '<button id="lph-x" aria-label="' + dismissLbl + '" ' +
        'style="background:transparent;border:none;color:rgba(255,228,179,.7);' +
        'font-size:1.15em;line-height:1;cursor:pointer;padding:2px 4px;' +
        'border-radius:4px;margin:-2px -4px 0 0;">✕</button>' +
    '</div>' +
    // Inline checkbox row — live-bound to setLowPolyMode
    '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;' +
      'padding:5px 8px;margin:2px 0 8px -2px;border-radius:6px;' +
      'background:rgba(255,180,84,.10);border:1px solid rgba(255,180,84,.35);' +
      'user-select:none;">' +
      '<input type="checkbox" id="lph-cb" ' + checked + ' ' +
        'style="accent-color:#ffb454;cursor:pointer;width:16px;height:16px;">' +
      '<span style="font-size:.95em;color:#ffe4b3;">🎚 ' + cbLbl + '</span>' +
    '</label>' +
    // Guidance line — small, faded, points the user at the FPS badge
    '<div style="font-size:.78em;color:rgba(255,228,179,.65);line-height:1.4;' +
      'padding-top:2px;border-top:1px dashed rgba(255,180,84,.25);">' +
      '💡 ' + hint +
    '</div>';
  document.body.appendChild(card);
  const dismiss = ()=>{
    card.style.opacity = '0';
    setTimeout(()=>{ if(card.parentNode) card.remove(); }, 400);
  };
  const xBtn = card.querySelector('#lph-x');
  const cb   = card.querySelector('#lph-cb');
  const lbl  = cb ? cb.closest('label') : null;
  if(xBtn) xBtn.addEventListener('click', dismiss);
  // iPad / iOS Safari is flaky about firing 'change' on checkboxes
  // nested inside custom-styled labels — the visual flip happens but
  // the change event sometimes never dispatches, so setLowPolyMode is
  // never called. Listen for click on the input, change on the input,
  // AND click on the wrapping label, and dedupe by the actual
  // post-event cb.checked state so we don't double-apply.
  let _lphLastApplied = (cb && cb.checked) ? 1 : 0;
  const _lphApply = () => {
    if(!cb) return;
    const newState = !!cb.checked;
    const key = newState ? 1 : 0;
    if(key === _lphLastApplied) return;
    _lphLastApplied = key;
    try { window.setLowPolyMode(newState); } catch(e){ console.warn('[lph]', e); }
    const panelCb = document.getElementById('lowpoly-toggle');
    if(panelCb) panelCb.checked = newState;
  };
  if(cb){
    cb.addEventListener('change', _lphApply);
    cb.addEventListener('click',  () => setTimeout(_lphApply, 0));
  }
  if(lbl){
    // Tap on the label area (label/icon span) — fires on iPad when the
    // change event on the nested input fails to dispatch.
    lbl.addEventListener('click', () => setTimeout(_lphApply, 0));
  }
  // Auto-dismiss after 12 s if user doesn't interact.
  setTimeout(dismiss, 12000);
};

