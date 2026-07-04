// ══════════════════════════════════════════════════
//  FILE LOADING
// ══════════════════════════════════════════════════
// A local PLY/SPLAT file over ~2 GiB throws "The requested file could not be
// read, typically due to permission problems that have occurred after a
// reference to a file was acquired" partway through `file.arrayBuffer()`
// (2026-07-05: reproduced with a real 2.36GB .ply, failed exactly at that
// call). Root cause confirmed live in this Chrome/V8 build (bisected in
// devtools): a PLAIN `new ArrayBuffer(n)` itself throws "Array buffer
// allocation failed" for any n at/above ~2,145,386,819 bytes — this is V8's
// own single-ArrayBuffer size ceiling (~2^31-1), NOT a Blob-transfer-specific
// bug. That means reading in chunks does NOT fix files past this ceiling —
// the DESTINATION Uint8Array we'd assemble them into hits the exact same
// wall. PLY/SPLAT/OBJ hand Spark one contiguous buffer by design (unlike
// .rad, which streams via HTTP Range and never needs the whole file in one
// buffer) — there is no in-browser workaround for a single PLY/SPLAT file
// this large. We fail fast with a clear, actionable message instead of
// letting the confusing native error surface, and point the user at RAD.
const MAX_SINGLE_BUFFER_BYTES = 2_000_000_000; // safe margin under the ~2.145B wall
function _assertReadableFileSize(file){
  if(file.size >= MAX_SINGLE_BUFFER_BYTES){
    const gb = (file.size / 1024 / 1024 / 1024).toFixed(2);
    throw new Error(
      `このファイルは${gb}GBあり、ブラウザの技術的な上限（単一バッファ約2GB）を超えているため ` +
      `PLY/SPLAT/OBJ形式では読み込めません。.rad（ストリーミング形式）に変換してください — ` +
      `RADは容量に依らず正常に読み込めます。`
    );
  }
}
// Reads the file in <512MB slices — this is NOT a >2GiB workaround (see
// above), just a mitigation for a SEPARATE, smaller-scale Chromium
// blob-transfer flakiness some builds show even under 2GB. Files at/above
// the true ceiling are rejected up front by _assertReadableFileSize.
async function _readFileArrayBufferChunked(file, onProgress){
  _assertReadableFileSize(file);
  const CHUNK = 512 * 1024 * 1024; // 512MB
  const total = file.size;
  if(total < CHUNK) return await file.arrayBuffer();
  const out = new Uint8Array(total);
  let offset = 0;
  while(offset < total){
    const end = Math.min(offset + CHUNK, total);
    const chunkBuf = await file.slice(offset, end).arrayBuffer();
    out.set(new Uint8Array(chunkBuf), offset);
    offset = end;
    if(typeof onProgress === 'function') onProgress(offset / total);
  }
  return out.buffer;
}
async function loadSplatFile(file){
  try{
    showLd(T('loading')); setBar(5); setMsg(T('preparing'));
    const ext=file.name.split('.').pop().toLowerCase();

    // iPhone Safari tab memory ceiling (~1.5 GB) crashes the tab with
    // "問題が繰り返し起きました" when a typical >250 MB PLY is parsed +
    // Spark builds the SplatMesh. Show a warning toast up front so the
    // user knows what's about to happen. Gated on _isIPhoneOrIPod (UA,
    // not the viewport-driven _splatPerfTier) so iPads aren't false-
    // positive'd in Split View / narrow windows.
    if(typeof _isIPhoneOrIPod !== 'undefined' && _isIPhoneOrIPod &&
       (ext === 'ply' || ext === 'splat') && file && file.size > 250*1024*1024){
      const mb = Math.round(file.size / 1024 / 1024);
      console.warn('[Locahun] Large file on iPhone (' + mb + ' MB) — risk of tab crash');
      if(typeof showUndoToast === 'function'){
        showUndoToast('⚠ ファイル ' + mb + ' MB は iPhone のメモリ上限に近いです。SPZ 変換を推奨');
      }
    }
    // Big-file auto-decimation has been REMOVED across all device classes.
    // Per user direction (2026-05): every device — including iPhone — now
    // loads at full quality by default. iPhones with insufficient tab
    // memory will still crash on huge files; users can manually toggle
    // "ポリゴン 1/4" from the quality panel after observing slow FPS or
    // memory pressure.

    // ── .RAD: never read the whole file into one buffer ──
    // .RAD is Spark's OWN format for scans too large to hold as one buffer
    // (that's the entire point of paged/streaming). Reading it upfront via
    // _readFileArrayBufferChunked — like every other format below — would
    // hit the exact >2GiB ceiling RAD exists to avoid, on a file that is
    // BY DESIGN often the largest thing a user drops on this viewer. So:
    // peek only the JSON header (first 1MB, plenty for `_parseRadHeaderCount`)
    // and hand Spark a `blob:` URL instead of bytes — Chrome's blob: URLs
    // DO honour Range requests against a local File (confirmed live: 206 +
    // correct Content-Range past the 2GiB file-size mark), so Spark's normal
    // url+paged Range-fetch path (identical to the online-demo/URL loader)
    // streams it exactly like a real HTTP .rad, no matter how large the file.
    let rawBuf = null, _splatBytes = null, blobUrl = null;
    let stats={center:new THREE.Vector3(),size:5,cache:null,cacheCount:0};
    if(ext === 'rad'){
      setMsg(T('loading-file')); setBar(15);
      const headBuf = await file.slice(0, 1024*1024).arrayBuffer();
      var _radTargetCountLocal = _parseRadHeaderCount(new Uint8Array(headBuf));
      msr.cachedPts = null; msr.cachedCount = 0;
      blobUrl = URL.createObjectURL(file);
      setMsg(T('building-3dgs')); setBar(50);
    } else {
      // ── 常にバッファを読み込む（ZIP保存キャッシュ兼用）──
      setMsg(T('loading-file')); setBar(15);
      rawBuf=await _readFileArrayBufferChunked(file, p => setBar(15 + Math.round(p*7)));

      // Stats for camera placement + position cache for picking
      if(ext==='splat'||ext==='ply'){
        setMsg(T('parsing')); setBar(22);
        const flipYZ=(ext==='ply');
        stats=(ext==='ply')?estimatePLYStats(rawBuf,flipYZ):estimateSplatStats(rawBuf);
        msr.cachedPts   = stats.cache;
        msr.cachedCount = stats.cacheCount;
      } else {
        msr.cachedPts = null; msr.cachedCount = 0;
      }

      setMsg(T('building-3dgs')); setBar(50);
    }

    // Load-time decimation has been REMOVED across all device classes.
    // Every device — including iPhone — loads at full quality. The
    // "ポリゴン 1/4" toggle is now strictly OPT-IN: it only takes effect
    // when the user explicitly flips it (reloadAllSplatLayers continues
    // to honour _splatStride() so the manual toggle path still works).
    if(ext !== 'rad') _splatBytes = rawBuf;
    // Force-sync the persisted preference + every visible toggle to OFF
    // so a stale `locahun_splat_stride=4` entry from a previous session
    // (e.g. earlier iPhone build that seeded it on big files) doesn't
    // misrepresent the actual full-quality load.
    {
      try { localStorage.setItem('locahun_splat_stride', '1'); } catch(_){}
      const _qpCb = document.getElementById('lowpoly-toggle');
      if(_qpCb) _qpCb.checked = false;
      const _hCb = document.getElementById('lph-cb');
      if(_hCb) _hCb.checked = false;
    }

    // Spark 2.x: feed the loader the ArrayBuffer directly via `fileBytes`
    // (PLY/SPLAT/SPZ/KSPLAT/OBJ — all read whole above) — EXCEPT .RAD,
    // which gets `url:` + `paged:true` instead (see the ext==='rad' branch
    // above: never materializes the whole file, streams via blob: Range
    // fetches exactly like the online-demo/URL loader). Going through a
    // blob: URL for the non-RAD *bytes* path was observed to hang
    // indefinitely ("pending" forever on large 3DGS PLY scans) — that
    // observation doesn't apply to RAD, whose Spark-internal paged reader
    // already Range-fetches in bounded chunks rather than awaiting one
    // whole-blob read.
    const opts = (ext === 'rad')
      ? { url: blobUrl, fileName: file.name, ...SPARK_QUALITY_OPTS }
      : { fileBytes: _splatBytes, fileName: file.name, ...SPARK_QUALITY_OPTS };
    // ?lod=1 — allow Spark to build the SplatMesh with its runtime LOD
    // machinery ON (overrides SPARK_QUALITY_OPTS for this load only).
    if(/[?&]lod=1/.test(location.search)){
      opts.lod = true;
      opts.enableLod = true;
      // also let foveation engage so the LOD/foveation pair is fairly evaluated
      delete opts.coneFoveate;
      delete opts.behindFoveate;
      delete opts.coneFov;
      delete opts.coneFov0;
      console.info('[Locahun-diag] lod=1 — Spark runtime LOD + foveation ENABLED for this load');
    }
    {
      const _ft = _splatFileTypeFor(ext);
      if(_ft !== undefined) opts.fileType = _ft;
      else if(ext === 'rad'){
        // .RAD is the streaming format from World Labs (Spark 2.x). If
        // this Spark build hasn't shipped SplatFileType.RAD yet, fail
        // loud rather than silently treating it as PLY.
        if(blobUrl) try{ URL.revokeObjectURL(blobUrl); }catch(_){}
        throw new Error('このファイル形式は Spark が認識できませんでした。対応形式: PLY / SPLAT / SPZ / KSPLAT / RAD / SOG / PCSOGS');
      }
    }
    // .RAD via url+paged:true (Spark builds its own url-backed PagedSplats
    // internally — the SAME mechanism the online-demo/URL loader uses, just
    // pointed at a blob: URL instead of an http(s) one). This is what makes
    // local .rad loading actually stream instead of requiring one buffer.
    let _radTargetCount = 0;
    if(ext === 'rad'){
      _radTargetCount = _radTargetCountLocal;
      // NOTE: `opts.paged = true` (the shortcut the demo/URL loader uses)
      // does NOT work for a blob: URL — confirmed live ("エラー: Unable to
      // determine file type"). SplatMesh's `paged:true` branch builds
      // `new PagedSplats({ rootUrl })` internally and does NOT forward the
      // outer opts.fileType to it; PagedSplats then falls back to sniffing
      // the type from the rootUrl STRING's extension (SplatPager.ts:89-93
      // `getSplatFileTypeFromPath`), which only works for real .rad URLs —
      // a blob: URL has no extension to sniff. Building PagedSplats
      // ourselves with an explicit fileType (same pattern the old fileBytes
      // path used) sidesteps the sniffing entirely.
      opts.paged = new PagedSplats({ rootUrl: blobUrl, fileType: _splatFileTypeFor('rad') });
      delete opts.url;
      delete opts.fileType;
      opts.lod = true;
      opts.enableLod = true;
      // Honour the "ポリゴン 1/4" toggle for RAD too — see _radLodScaleForStride.
      opts.lodScale = _radEffectiveLodScale();
      // .RAD streaming uses Spark's LoD walker, which relies on the cone
      // foveation parameters to decide which chunks to fetch. The defaults
      // in SPARK_QUALITY_OPTS (`coneFoveate:0`, `coneFov:π`) were tuned for
      // non-streamed splats to suppress visible LoD pop-in artefacts —
      // those settings effectively tell the walker "everything is uniformly
      // central, never split". For RAD that means only the root chunk ever
      // loads and the scene stays at 1 splat forever. Remove the overrides
      // so Spark's defaults (which DO trigger splits) take over.
      delete opts.coneFoveate;
      delete opts.behindFoveate;
      delete opts.coneFov;
      delete opts.coneFov0;
    }
    // Remove previous main splat layer
    const _prevMain=layers.find(l=>l._isMain);
    if(_prevMain){
      scene.remove(_prevMain.mesh); const _i=layers.indexOf(_prevMain); if(_i>=0)layers.splice(_i,1);
      // Local .rad layers own a blob: URL for their streamed lifetime —
      // release it now that this layer is being replaced (real http(s)
      // URLs on _prevMain._streamUrl are harmless no-ops here since
      // revokeObjectURL only affects blob: URLs it created).
      if(_prevMain._blobUrl){ try{ URL.revokeObjectURL(_prevMain._blobUrl); }catch(_){} }
    }
    if(splatMesh && !layers.find(l=>l.mesh===splatMesh)) scene.remove(splatMesh);
    splatMesh=new SplatMesh(opts);
    // Stash target count for the render-loop streaming guard.
    if(_radTargetCount > 0) splatMesh._radTargetCount = _radTargetCount;
    splatFlipped=(ext==='ply'||ext==='spz');
    // Tame oversized splats so a single near splat can't smear across the whole screen
    // during fast pans (the "rainbow streak" failure mode in big PortalCam scans).
    tuneSplatMesh(splatMesh);
    // addLayer adds to scene internally. Pass rot:{0,0,0} so the user-rotation
    // starts neutral; the load-flip will be applied via applyLayerFlipQuat.
    const mainL=addLayer({name:file.name.replace(/\.[^.]+$/,''),type:'splat',mesh:splatMesh,rot:{x:0,y:0,z:0}});
    mainL._isMain=true;
    mainL._loadFlipped=splatFlipped;
    applyLayerFlipQuat(mainL);
    // ZIP-save cache. Use the DECIMATED buffer (`_splatBytes`) rather than
    // the original — on phone tier with a 410 MB scan that's the difference
    // between keeping 410 MB alive forever and dropping it to 100 MB after
    // GC reclaims `rawBuf`. The user's ZIP will then contain the decimated
    // version, which matches what they're actually viewing anyway. On
    // desktop / iPad (stride=1) `_splatBytes === rawBuf` so this is a no-op.
    mainL._rawBuffer=_splatBytes;
    mainL._rawExt=ext;
    if(ext === 'rad'){
      // No _rawBuffer for a streamed local .rad (that's the whole point —
      // never materialize the file). _streamUrl matches the existing
      // ZIP-save contract for streamed splats (310_zip_project_save_load_
      // fflate.js already knows how to handle a layer with _streamUrl and
      // no _rawBuffer); _blobUrl additionally marks it for revocation when
      // this layer is replaced (see the _prevMain._blobUrl cleanup above).
      mainL._streamUrl = blobUrl;
      mainL._blobUrl = blobUrl;
    }
    // Explicitly release the reference to the (possibly huge) original so
    // GC can reclaim it now that Spark + cache no longer need it.
    if(_splatBytes !== rawBuf) { /* hint to GC — original Float buffer goes here */ }
    // Per-layer pick cache so the picker works on this exact mesh (matrixWorld) regardless
    // of how many additional splats are loaded later.
    mainL._splatCache = stats.cache;
    mainL._splatCacheCount = stats.cacheCount;
    selectLayer(mainL.id);

    setBar(78); setMsg(T('placing-cam'));

    // Place camera so it LOOKS AT the scene centroid from a sensible distance,
    // not INSIDE it. At yaw=0 / pitch=0 the camera faces world +Z (see
    // updateCamera: `rotation.set(pitch, yaw + π, roll, 'YXZ')` rotates the
    // default -Z forward by 180° around Y → +Z). So to view the centroid
    // (c.x, c.y, c.z), the camera must sit at c.z − dist on the Z axis,
    // looking +Z toward the scene.
    //
    // Previously camPos.z was set to c.z (centroid itself), which dropped
    // the camera into the middle of the scene — for most PLY scans
    // (rooms, buildings) that puts the user "inside the geometry" and the
    // 初期位置 felt wrong. dist is already sized to the scene extents.
    //
    // Y is independently clamped to at least 1.5 m above the floor grid
    // (which sits at world y = -0.01) so the user never starts underneath
    // the grid, regardless of how negative the centroid's Y component is.
    const c=stats.center, s=stats.size;
    const dist = Math.min(Math.max(s * 0.4, 2), 8);
    const EYE_HEIGHT = 1.5; // metres above the grid
    camPos.set(c.x, Math.max(c.y, EYE_HEIGHT), c.z - dist);
    msr.placeDepth = Math.max(0.5, dist * 0.5);

    // Face +Z so the scene's centroid sits straight ahead at `dist` metres.
    // From here the user can immediately turn to explore.
    setCamRotImmediate(0, 0);

    // Save as initial camera state for reset button
    _initCamPos.copy(camPos);
    _initYaw=yaw; _initPitch=0;

    await sleep(400); setBar(100); await sleep(300);
    hideLd(); showHUD(); hideDZ();
    // Force continuous rendering while Spark streams/sorts the 3DGS (async).
    // 4 s covers the worst observed sort-stabilise time on 12M-splat scenes;
    // the previous 12 s value kept the page rendering every frame for 8 s
    // longer than necessary, which on hardware where Chrome's compositor
    // throttles rAF under continuous renderer.render() submission drops fps
    // to ~45 even while the user is idle. After 4 s the on-demand render path
    // takes over and rAF returns to full vsync rate until next interaction.
    _splatActiveUntil = performance.now() + _SPLAT_ACTIVE_MS;
    // (orientation "シーンが逆さまですか？" toast removed — no longer pops up after load.)
    // Schedule the one-shot quality auto-probe. The probe itself waits
    // an additional ~3.5 s inside _scheduleQualityProbe so Spark's
    // progressive sort stabilises before we read _ftAvg.
    if(typeof window._scheduleQualityProbe === 'function'){
      window._scheduleQualityProbe();
    }
    // Universal "ポリゴン半減" hint card. Trigger logic:
    //   • For SMALL files (< 300 MB): show once per session — discovery
    //     nudge for users who haven't seen the toggle yet.
    //   • For LARGE files (≥ 300 MB): show on EVERY load — the user is
    //     more likely to need the toggle for a heavy scene, and one-per-
    //     session was hiding the card precisely when it was useful.
    // The card itself dedupes (removes any prior #lowpoly-hint before
    // building a fresh one) so back-to-back large loads don't stack.
    try {
      const _isHeavy = (file && file.size > 300*1024*1024);
      if(_isHeavy || !sessionStorage.getItem('locahun_lowpoly_hint_shown')){
        sessionStorage.setItem('locahun_lowpoly_hint_shown', '1');
        if(typeof showLowPolyHint === 'function') showLowPolyHint();
      }
    } catch(_){}
  }catch(err){
    console.error(err);
    setErr(T('error-prefix')+err.message);
    // Keep the error visible for 8 s (was 4 s) — slow mobile devices fail
    // most often from memory pressure on large .splat files, and the user
    // needs time to read what went wrong before the loading overlay
    // dissolves and reveals the home screen again. The home screen is the
    // correct fallback (it lets the user re-pick a smaller file), but the
    // sudden transition without an error read is what made the user think
    // "slow loads kick me back to home" — they were actually failing.
    setTimeout(hideLd, 8000);
  }
}

// Open an empty project — no scene file loaded. Used by the home-screen
// "📄 空プロジェクトを開く" button so users can drop into the 3D viewer
// with just the grid / camera, then add layers manually.
function loadEmptyProject(){
  // Drop any existing main splat layer (in case user is reopening).
  if(splatMesh){ scene.remove(splatMesh); splatMesh = null; }
  const _prevMain = layers.find(l=>l._isMain);
  if(_prevMain){
    scene.remove(_prevMain.mesh);
    const _i = layers.indexOf(_prevMain);
    if(_i >= 0) layers.splice(_i, 1);
  }
  // Default camera pose
  camPos.set(0, 1.6, 3.5);
  setCamRotImmediate(Math.PI, 0);
  _initCamPos.copy(camPos); _initYaw = Math.PI; _initPitch = 0;
  msr.placeDepth = 2.5;
  // Reveal viewer
  showHUD();
  hideDZ();
  history.pushState({view:'app'}, '', location.href);
  renderLayerList();
}

