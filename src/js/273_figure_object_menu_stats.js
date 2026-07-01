// ── Object type menu ──
window.toggleObjTypeMenu = function(btn){
  const menu=document.getElementById('obj-type-menu');
  if(!menu) return;
  menu.style.display=menu.style.display==='flex'?'none':'flex';
};
window.closeObjTypeMenu = function(){
  const menu=document.getElementById('obj-type-menu');
  if(menu) menu.style.display='none';
};
// Close menu on outside click
document.addEventListener('click',e=>{
  const wrapper=document.querySelector('#hud .cbar div');
  if(wrapper&&!wrapper.contains(e.target)) window.closeObjTypeMenu();
});

// ── Layer list / properties divider drag ──
(()=>{
  const divider=document.getElementById('lp-divider');
  const list=document.getElementById('layer-list');
  const transform=document.getElementById('layer-transform');
  if(!divider||!list||!transform) return;
  let dragging=false, startY=0, startH=0;
  // Shared start/move/end so BOTH mouse and touch can drag the divider — on
  // iPad/iPhone the mouse-only handlers never fired, so the layer↔object-info
  // split couldn't be adjusted by long-press/drag (user 2026-06-27).
  function onStart(clientY){
    dragging=true; startY=clientY;
    startH=list.getBoundingClientRect().height;
    document.body.style.cursor='ns-resize';
  }
  function onMove(clientY){
    if(!dragging) return;
    const divH=divider.getBoundingClientRect().height||4;
    const listTop=list.getBoundingClientRect().top;
    const panel=document.getElementById('layer-panel');
    const panelBottom=panel?panel.getBoundingClientRect().bottom:window.innerHeight;
    const maxH=Math.max(60,panelBottom-listTop-divH-80);
    const newH=Math.max(60,Math.min(maxH,startH+(clientY-startY)));
    list.style.flex='none'; list.style.height=newH+'px';
  }
  function onEnd(){ if(dragging){ dragging=false; document.body.style.cursor=''; } }
  divider.addEventListener('mousedown',e=>{ onStart(e.clientY); e.preventDefault(); });
  document.addEventListener('mousemove',e=>onMove(e.clientY));
  document.addEventListener('mouseup',onEnd);
  // Touch (iPad / phone): mirror the mouse drag. touchstart is non-passive so we
  // can preventDefault and stop the panel from scrolling while resizing.
  divider.addEventListener('touchstart',e=>{
    if(!e.touches.length) return;
    onStart(e.touches[0].clientY); e.preventDefault();
  },{passive:false});
  document.addEventListener('touchmove',e=>{
    if(!dragging||!e.touches.length) return;
    onMove(e.touches[0].clientY); e.preventDefault();
  },{passive:false});
  document.addEventListener('touchend',onEnd);
  document.addEventListener('touchcancel',onEnd);
  // Show divider when transform is visible
  const _origRTP=renderTransformPanel;
  // Hook: show/hide divider based on layer-transform visibility
  const obs=new MutationObserver(()=>{
    divider.style.display=transform.style.display==='none'?'none':'block';
  });
  obs.observe(transform,{attributes:true,attributeFilter:['style']});
})();
window.triggerAddSplat=function(){ document.getElementById('lfi-splat').click(); };
window.triggerAddObj=function(){ document.getElementById('lfi-obj').click(); };
// Unified import — accepts any supported file type. Used by the merged
// "📁 インポート" button at the bottom of the layer panel.
window.triggerImportAny=function(){ document.getElementById('lfi-any').click(); };

async function loadAdditionalSplat(file){
  try{
    showLd(T('loading'));
    setMsg(T('preparing')); setBar(5);
    const ext=file.name.split('.').pop().toLowerCase();
    setMsg(T('loading-file')); setBar(15);
    const rawBuf=await file.arrayBuffer();  // read for caching
    setBar(45);
    // Full-quality load on every device — load-time decimation removed
    // (per user direction 2026-05). Users opt in to "ポリゴン 1/4" via
    // the quality panel toggle if they hit memory / FPS issues.
    const _splatBytes = rawBuf;
    // Force-sync any stale `locahun_splat_stride` preference + visible
    // toggle UI to OFF so the user sees the truth: load was full quality.
    {
      try { localStorage.setItem('locahun_splat_stride', '1'); } catch(_){}
      const _qpCb = document.getElementById('lowpoly-toggle');
      if(_qpCb) _qpCb.checked = false;
      const _hCb = document.getElementById('lph-cb');
      if(_hCb) _hCb.checked = false;
    }
    // Spark 2.x: fileBytes path (see loadSplatFile comment above).
    const opts={fileBytes:_splatBytes, fileName:file.name, ...SPARK_QUALITY_OPTS};
    {
      const _ft = _splatFileTypeFor(ext);
      if(_ft !== undefined) opts.fileType = _ft;
      else if(ext === 'rad'){
        throw new Error('このファイル形式は Spark が認識できませんでした。対応形式: PLY / SPLAT / SPZ / KSPLAT / RAD / SOG / PCSOGS');
      }
    }
    let _radTargetCount2 = 0;
    if(ext === 'rad'){
      // Same PagedSplats trick as in loadSplatFile() — see comment there.
      const _radBytes = _splatBytes instanceof ArrayBuffer
        ? new Uint8Array(_splatBytes)
        : _splatBytes;
      _radTargetCount2 = _parseRadHeaderCount(_radBytes);
      opts.paged = new PagedSplats({
        fileBytes: _radBytes,
        fileType: _splatFileTypeFor('rad'),
      });
      opts.lod = true;
      opts.enableLod = true;
      opts.lodScale = _radEffectiveLodScale();
      delete opts.fileBytes;
      delete opts.fileType;
      // Strip foveation overrides — see loadSplatFile() for the rationale.
      delete opts.coneFoveate;
      delete opts.behindFoveate;
      delete opts.coneFov;
      delete opts.coneFov0;
    }
    setMsg(T('building-3dgs')); setBar(60);
    const sm=new SplatMesh(opts);
    if(_radTargetCount2 > 0) sm._radTargetCount = _radTargetCount2;
    const flipped=(ext==='ply'||ext==='spz');
    tuneSplatMesh(sm);
    const L=addLayer({name:file.name.replace(/\.[^.]+$/,''),type:'splat',mesh:sm,rot:{x:0,y:0,z:0}});
    L._loadFlipped=flipped;
    applyLayerFlipQuat(L);
    // Cache decimated bytes, not the original — same memory rationale as
    // loadSplatFile() above. Frees the original buffer on phone tier.
    L._rawBuffer=_splatBytes; L._rawExt=ext;
    // Build per-layer pick cache so measurement works on this splat too
    if(ext==='ply'||ext==='splat'){
      setMsg(T('parsing')); setBar(80);
      const stats2 = (ext==='ply') ? estimatePLYStats(rawBuf, true) : estimateSplatStats(rawBuf);
      L._splatCache = stats2.cache;
      L._splatCacheCount = stats2.cacheCount;
    }
    selectLayer(L.id);
    _splatActiveUntil = performance.now() + _SPLAT_ACTIVE_MS;
    setBar(100); setMsg(T('done'));
    await sleep(250); hideLd();
    showUndoToast('✨ ' + L.name + T('add-suffix'));
  }catch(e){
    console.error(e);
    setTimeout(hideLd, 600);
    showUndoToast(T('load-fail')+e.message);
  }
}

async function loadObjFile(file){
  try{
    showLd(T('loading'));
    setMsg(T('preparing')); setBar(5);
    const ext=file.name.split('.').pop().toLowerCase();
    setMsg(T('loading-file')); setBar(15);
    let object3d;
    const buf=await file.arrayBuffer();
    setBar(40);
    setMsg(T('parsing'));
    if(ext==='obj'){
      const Cls = await _addonLoader('OBJLoader');
      if(!Cls) throw new Error('OBJLoader をロードできません（オフライン時はインターネット接続が必要）');
      const text=new TextDecoder().decode(buf);
      const loader=new Cls();
      object3d=loader.parse(text);
    } else if(ext==='fbx'){
      try {
        const Cls = await _addonLoader('FBXLoader');
        if(!Cls) throw new Error('FBXLoader をロードできません（オフライン時はインターネット接続が必要）');
        const loader = new Cls();
        object3d = loader.parse(buf);
      } catch(fbxErr) {
        throw new Error('FBX読み込み失敗: ' + fbxErr.message);
      }
    } else {
      const Cls = await _addonLoader('GLTFLoader');
      if(!Cls) throw new Error('GLTFLoader をロードできません（オフライン時はインターネット接続が必要）');
      const loader=new Cls();
      const gltf=await new Promise((res,rej)=>loader.parse(buf,'',res,rej));
      object3d=gltf.scene;
    }
    setBar(70);
    // ── Convert ALL meshes to MeshBasicMaterial (no lights needed) ──
    let meshCount=0;
    object3d.traverse(o=>{
      if(!o.isMesh) return;
      meshCount++;
      const applyBasic=(mat)=>{
        if(!mat) return new THREE.MeshBasicMaterial({color:0xaaaaaa,side:THREE.DoubleSide});
        if(mat.type==='MeshBasicMaterial') return mat;
        return new THREE.MeshBasicMaterial({
          color: mat.color ? mat.color.clone() : new THREE.Color(0xcccccc),
          map: mat.map||null,
          transparent: mat.transparent||false,
          opacity: (mat.opacity!=null)?mat.opacity:1,
          side: THREE.DoubleSide,
          vertexColors: mat.vertexColors||false,
          wireframe: mat.wireframe||false,
        });
      };
      if(Array.isArray(o.material)) o.material=o.material.map(applyBasic);
      else o.material=applyBasic(o.material);
    });
    if(meshCount===0){ hideLd(); showUndoToast(T('no-mesh')+file.name); return; }
    setBar(85);
    // ── Auto-scale: normalise to ~2 units ──
    const bbox=new THREE.Box3().setFromObject(object3d);
    const sz=new THREE.Vector3(); bbox.getSize(sz);
    const maxDim=Math.max(sz.x,sz.y,sz.z,0.001);
    if(maxDim>10||maxDim<0.01){
      const scale=2/maxDim;
      object3d.scale.setScalar(scale);
    }
    // ── Place in front of camera ──
    const camFwd=new THREE.Vector3(); camera.getWorldDirection(camFwd);
    const placePos=camPos.clone().addScaledVector(camFwd,3);
    object3d.position.copy(placePos);
    const L=addLayer({name:file.name.replace(/\.[^.]+$/,''),type:'obj',mesh:object3d});
    L.pos={x:placePos.x,y:placePos.y,z:placePos.z};
    L.objColor=null; L.objOpacity=1.0; L.objWireframe=false;
    L.upAxis='y';
    L.pivotSpace='local';  // imported objects default to local pivot (v0.0.40)
    L._rawBuffer=buf; L._rawExt=ext;  // cache original file for project save
    selectLayer(L.id);
    setBar(100); setMsg(T('done'));
    await sleep(250); hideLd();
    showUndoToast('📐 '+L.name+T('add-suffix')+(window._lang==='en'?` (${meshCount} meshes)`:` (${meshCount}メッシュ)`));
  }catch(e){
    console.error('loadObjFile error:',e);
    setTimeout(hideLd, 600);
    showUndoToast(T('load-fail')+e.message);
  }
}

// ── Performance stats update for quality panel ──
let _perfInterval = null;
function updatePerfStats(){
  if(!document.getElementById('qp-fps')) return;

  // ── FPS & render time ──
  const _fpsFb = document.getElementById('fps');
  const fps  = _fpsDisplay || (_fpsFb ? Math.round(parseFloat(_fpsFb.textContent)||0) : 0);
  // Two distinct timings — show both because they answer different
  // questions:
  //   submitMs = synchronous renderer.render() wrap; the wall-clock time
  //              the JS thread spent SUBMITTING GPU commands. On a high-
  //              end GPU this is effectively the GPU load (~0.3 ms on a
  //              5090 even with 26 M splats), but tells you nothing about
  //              actual frame interval if Safari's compositor throttles.
  //   wallMs   = real per-frame wall clock = 1000 / actual fps. Reflects
  //              rAF cadence + everything between frames, NOT GPU work.
  // Naming convention adopted here:
  //   "GPU 負荷"          → submit / budget  (what the GPU is actually doing)
  //   "余剰 (ヘッドルーム)" → 100 - GPU 負荷  (GPU spare capacity)
  //   "フレーム時間"        → wallMs detailed (frame interval line)
  // This restores the original meaning of the GPU-load bar: on a 5090 at
  // any fps the bar should sit at near-zero, never at 109% just because
  // the panel was conflating wall-clock latency with GPU work.
  // Refresh the detected display Hz before computing anything against it.
  _updateRefreshEstimate();

  const fpsDerived = fps > 0 ? (1000 / fps) : 0;
  const wallMs = (typeof _wallMsAvg === 'number' && _wallMsAvg > 0)
                 ? _wallMsAvg
                 : fpsDerived;
  const submitMs = Math.max(0.01, _ftAvg);
  const renderMs = Math.max(0.01, wallMs > 0 ? wallMs : submitMs);
  // Budget = one frame at the device's ACTUAL refresh (detected), not a
  // hardcoded 60. On a 120 Hz ProMotion panel this is ~8.33 ms, so the
  // "予算" shown next to an 8.3 ms frame is finally consistent instead of
  // claiming a 16.7 ms budget the panel never had.
  const budget   = (typeof _refreshBudgetMs === 'number' && _refreshBudgetMs > 0)
                   ? _refreshBudgetMs : FRAME_MS;

  // GPU 負荷 = how much of one display frame the GPU command submit ate
  // (essentially "is the GPU saturated?"). Stays low on capable hardware
  // regardless of whether rAF is throttled — that's the desired semantics.
  const util    = Math.min(200, (submitMs / budget) * 100);
  // 余剰 (ヘッドルーム) = true GPU spare capacity = 100 − GPU 負荷.
  // We deliberately base this on GPU submit work, NOT on the wall-clock
  // frame interval: under vsync the frame interval is pinned to the refresh
  // period even when the GPU is idle, so a wall-time headroom would read
  // ~0 % on a 120 Hz device cruising at a locked 120 fps — exactly the bogus
  // reading reported on Apple hardware. A struggling device (e.g. iPad
  // throttled to 30 fps) is instead surfaced by the FPS value + its colour
  // grade below, which is the honest place for "actual frame rate is bad".
  const surplus = Math.max(0, 100 - Math.min(100, util));

  // Colour grade
  const utilCol   = util < 50 ? '#2a7a2a' : util < 80 ? '#7a7a20' : util < 100 ? '#8a5a10' : '#8a2020';
  const surplusCol= surplus > 50 ? '#2a6a2a' : surplus > 20 ? '#5a6a20' : '#6a2020';
  const fpsCol    = fps >= 55 ? '#88ee88' : fps >= 30 ? '#eeee44' : '#ee5544';

  const s = id => document.getElementById(id);

  s('qp-fps').textContent  = fps;
  s('qp-fps').style.color  = fpsCol;
  // Frame-time line: real wall time + GPU submit in parentheses so the
  // user can tell at a glance whether the bottleneck is GPU work or
  // somewhere else on the main thread / compositor.
  s('qp-frametime').textContent =
    renderMs.toFixed(2) + ' ms  (submit '+submitMs.toFixed(2)+' / '+T('perf-budget')+' '+budget.toFixed(1)+'ms @'+_refreshHz+'Hz)';

  // Mirror live FPS into the always-visible top-right quality badge.
  // The badge's quality-level label is updated in setQuality() separately,
  // but the FPS readout follows the same perf-sample tick we're already in.
  const _qiFps = s('qib-fps');
  if(_qiFps){
    _qiFps.textContent = fps + ' fps';
    _qiFps.style.color = fpsCol;
  }

  // GPU 負荷バー（render time / budget）
  s('qp-util-bar').style.width      = Math.min(100, util).toFixed(1)+'%';
  s('qp-util-bar').style.background = utilCol;
  s('qp-util-pct').textContent      = Math.round(util)+'%';
  s('qp-util-pct').style.color      = util < 50 ? '#3a8a3a' : util < 80 ? '#8a8a30' : '#9a4a30';

  // 余剰バー
  s('qp-surplus-bar').style.width      = surplus.toFixed(1)+'%';
  s('qp-surplus-bar').style.background = surplusCol;
  s('qp-surplus-pct').textContent      = Math.round(surplus)+'%';
  s('qp-surplus-pct').style.color      = surplus > 50 ? '#3a7a3a' : surplus > 20 ? '#7a7a30' : '#7a3a3a';

  // renderer.info (captured right after last render)
  const ri = _lastRenderInfo;
  const fmtNum = n => n >= 1000000 ? (n/1000000).toFixed(1)+'M'
                    : n >= 10000   ? (n/1000).toFixed(0)+'k'
                    : n >= 1000    ? (n/1000).toFixed(1)+'k'
                    : String(n||0);
  s('qp-dc').textContent   = fmtNum(ri.calls);
  s('qp-tris').textContent = fmtNum(ri.triangles);
  s('qp-geos').textContent = fmtNum(ri.geometries);
  s('qp-texs').textContent = fmtNum(ri.textures);

  // Effective pixel resolution
  const pr = Math.min(devicePixelRatio, _PR_CAP) * qualScale;
  s('qp-resolution').textContent =
    T('render-res') + Math.round(innerWidth*pr) + '×' + Math.round(innerHeight*pr) +
    '  (×' + pr.toFixed(2) + ')';
}

// ── Quality Panel Toggle ──
let _qualPanelOpen=false;
window.toggleQualityPanel=function(){
  const wasOpen=_qualPanelOpen;
  closeAllPanels();
  if(!wasOpen){
    _qualPanelOpen=true;
    const panel = document.getElementById('quality-panel');
    const badge = document.getElementById('qi-badge');
    // Anchor the panel as a true dropdown hanging off the FPS/画質 badge:
    // measure the badge's live rect and pin the panel flush to its
    // bottom-right corner (2 px gap). Doing this at open-time (rather
    // than a static CSS top:) keeps it correct whether or not the
    // topbar is present, on any device DPI / font scale, and if the
    // badge ever moves. Also give the badge an "open" highlight + drop
    // the panel's top-right radius so the two read as one connected
    // control instead of two floating cards.
    if(badge){
      const br = badge.getBoundingClientRect();
      // Drop DOWN from the bottom of the whole action ROW, not just the chip.
      // The chip can be shorter than the neighbouring buttons, so anchoring on
      // br.bottom let the panel's top edge sit ABOVE the taller buttons and overlap
      // them (user 2026-06 "開かれたUIが上部ボタンの一部と重なっている"). Using the
      // row's bottom keeps the panel clear of every button on every device. The
      // RIGHT edge still lines up with the chip so it reads as its dropdown.
      const row = badge.closest('#view-tl-btns');
      const anchorBottom = Math.max(br.bottom, row ? row.getBoundingClientRect().bottom : br.bottom);
      panel.style.top    = Math.round(anchorBottom + 2) + 'px';
      // Centre the panel directly UNDER the 画質 chip (user 2026-06: "画質ボタンの
      // 真下中央" — its horizontal centre lines up with the chip's centre, hanging
      // straight down). Clamp so a chip near the screen edge can't push the panel
      // off-screen. (Not screen-centred — that read as detached from the chip.)
      const _chipCx = br.left + br.width / 2;
      const _panelW = Math.min(220, window.innerWidth - 28);
      const _cx = Math.max(_panelW / 2 + 8,
                  Math.min(window.innerWidth - _panelW / 2 - 8, _chipCx));
      panel.style.left   = Math.round(_cx) + 'px';
      panel.style.right  = 'auto';
      panel.style.transform = 'translateX(-50%)';
      panel.style.bottom = 'auto';
      panel.style.borderTopRightRadius = '';
      // Cap to the REAL remaining viewport below the live anchor position
      // (the static CSS cap assumes the desktop badge offset; on phones the
      // badge sits higher and the 100dvh-based cap let the panel run past
      // the bottom edge, clipping the 移動速度 slider).
      panel.style.maxHeight = Math.max(160, window.innerHeight - Math.round(anchorBottom + 2) - 12) + 'px';
      badge.classList.add('qib-open');
    }
    panel.style.display='block';
    updatePerfStats(); // show immediately
    _perfInterval = setInterval(updatePerfStats, 500); // refresh every 500ms
  } else {
    clearInterval(_perfInterval); _perfInterval=null;
    const badge = document.getElementById('qi-badge');
    if(badge) badge.classList.remove('qib-open');
  }
};



