// ══════════════════════════════════════════════════
//  DEMO SCENE  +  AUTO-LOAD via URL param
//
//  ?autoload=<URL>  — load any URL (used for testing / direct deploy)
//  ?demo=1          — load the canonical demo scene from R2
//
//  A "📥 デモシーンを読み込む" button is also injected into the dropzone so
//  visitors can try the viewer without preparing their own PLY.
// ══════════════════════════════════════════════════

// Demo .rad (Spark 2.x streaming RAD format, ~357 MB, ~19.8 M splats).
// Served by the viewer's own Cloudflare Worker (worker.js) at
// /api/demo-asset/, which reads the object straight from the R2 bucket
// (binding R2_ASSETS → locahun3d-assets) and re-emits it with Range +
// `Access-Control-Allow-Origin: *`. We do NOT use the public pub-*.r2.dev
// URL any more: it returns no CORS headers AND public bucket access has
// been disabled (401), which is why the demo silently showed a black
// screen — Spark's chunked Range fetches failed. Handler + whitelist are
// in worker.js (DEMO_ALLOWED_KEYS / handleDemoAsset). The old demo-proxy/
// Worker (which proxied the now-dead public URL) is obsolete.
//
// Absolute URL (not relative) so offline copies of this single-file
// viewer — opened from file://, Dropbox, or any other origin — can still
// stream the demo cross-origin thanks to the CORS headers above.
//
// _protected (?protected=1, set by src/js/291_render_loop.js which loads
// before this file) means we're embedded in the online SaaS, which proxies
// this same route through its own Next.js API — use a same-origin relative
// URL there instead of the public CDN Worker URL. The standalone/offline
// download (opened via file://, Dropbox, etc.) has no such backend, so it
// always needs the absolute URL.
const DEMO_SCENE_URL = (typeof _protected !== 'undefined' && _protected)
  ? '/api/demo-asset/Kousaten_ForDemo_point_cloud.rad'
  : 'https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad';
const DEMO_SCENE_LABEL = 'デモシーン(交差点)';
const DEMO_SCENE_SIZE_MB = 357;

// Fetches a URL as an ArrayBuffer with HTTP Range chunking + retry, instead
// of a single whole-file fetch. A single fetch of a large file (e.g. an
// online-SaaS property's zipped scene) through a same-origin Workers proxy
// (/api/r2, /api/viewer-stream) was observed truncating mid-stream (a 116MB
// zip arriving as 56MB, silently cached as if complete) — this function
// exists specifically to make that failure mode impossible.
async function _fetchBinaryChunked(url){
  // blob: URL（親ページが先にダウンロード済み）はローカル読みなので一括で良い
  if(url.startsWith('blob:')){
    const r = await fetch(url);
    if(!r.ok) throw new Error('blob fetch failed');
    return await r.arrayBuffer();
  }
  // 切断バグは「このアプリ自身の Workers 経由プロキシ (/api/r2, /api/viewer-stream
  // 等、同一オリジン)」で実測されたもので、R2 の署名付き直リンク（別オリジン、
  // 例 *.r2.cloudflarestorage.com）は R2 が直接ストリーム配信するため対象外。
  // 別オリジンの絶対URLは 1 本の fetch で取得し、チャンク分割によるリクエスト数
  // の水増しを避ける（content-length で欠損だけは検証する）。
  // オリジン判定のみ try で囲う（URL 解析失敗＝相対URL等は同一オリジン扱いにして
  // 下のチャンク経路へ）。fetch 自体の失敗はここでは握り潰さない。
  let _crossOrigin = false;
  try {
    _crossOrigin = (new URL(url, location.href).origin !== location.origin);
  } catch(_){ _crossOrigin = false; }
  if(_crossOrigin){
    // 別オリジンは 1 本の fetch で取得。ここでの失敗(404/403/CORS/切断)はそのまま
    // 投げる — 別オリジンURLを同一オリジン想定の Range チャンク経路へ落としても無意味で、
    // 数十秒かけて誤ったエラーで失敗したり、200 を返すエラーページを正データと誤認する
    // 恐れがあるため（かつては /切断/ 以外を握り潰して落下していた）。
    const resp = await fetch(url, { cache:'no-store' });
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    return _readBodyWithProgress(resp);
  }
  // 8MB × リトライ5回。16MB 連投だと Workers 経由で「206 なのに body 0 byte」
  // という一過性の切断が実測で出た（5 チャンク目以降）。小さめ＋間隔＋
  // 粘り強いリトライで吸収する。
  const CHUNK = 8 * 1024 * 1024;
  const ATTEMPTS = 5;
  // 1) probe: 先頭 1 byte の Range 応答から総サイズを取得
  let total = 0;
  let probe = null;
  try { probe = await fetch(url, { cache:'no-store', headers:{ range:'bytes=0-0' } }); } catch(_){}
  if(probe && probe.status === 206){
    const cr = probe.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+)\s*$/);
    if(m) total = parseInt(m[1], 10);
    try { await probe.arrayBuffer(); } catch(_){}
  }
  if(!total){
    // Range 非対応サーバ: 一括 fetch にフォールバック（content-length 検証付き）
    const resp = await fetch(url, { cache:'no-store' });
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    return _readBodyWithProgress(resp);
  }
  const out = new Uint8Array(total);
  let got = 0;
  while(got < total){
    const end = Math.min(got + CHUNK, total) - 1;
    let ok = false, lastErr = null;
    for(let attempt = 0; attempt < ATTEMPTS && !ok; attempt++){
      try{
        const r = await fetch(url, { cache:'no-store', headers:{ range:'bytes='+got+'-'+end } });
        if(r.status !== 206 && r.status !== 200) throw new Error('HTTP '+r.status);
        const part = new Uint8Array(await r.arrayBuffer());
        if(r.status === 200){
          // サーバが Range を無視して全量を返してきた場合
          if(part.byteLength !== total) throw new Error('range ignored + truncated ('+part.byteLength+'/'+total+')');
          out.set(part, 0); got = total; ok = true; break;
        }
        if(part.byteLength !== (end - got + 1)) throw new Error('chunk truncated ('+part.byteLength+'/'+(end - got + 1)+')');
        out.set(part, got); got += part.byteLength; ok = true;
      }catch(e){ lastErr = e; await new Promise(res=>setTimeout(res, 1200 * (attempt + 1))); }
    }
    if(!ok) throw new Error((window._lang==='en'?'Chunk download failed @':'チャンク取得失敗 @')+got+': '+(lastErr && lastErr.message ? lastErr.message : lastErr));
    if(typeof setBar === 'function') setBar(5 + Math.round((got / total) * 35));
    // Workers への連投を避ける小休止（一過性の空応答対策）
    if(got < total) await new Promise(res=>setTimeout(res, 120));
  }
  return out.buffer;
}

// 本文を少しずつ読み、受信量でバーを進める（2026-09-20）。以前は arrayBuffer() を一括で待っていたため、
// 別オリジン（R2 の署名URL）では受信が終わるまで 5% のまま止まり、終わった瞬間に跳んでいた。
async function _readBodyWithProgress(resp){
  const cl = parseInt(resp.headers.get('content-length') || '0', 10);
  if(!resp.body || !resp.body.getReader){
    const whole = await resp.arrayBuffer();
    if(cl && whole.byteLength !== cl) throw new Error((window._lang==='en'?'The connection dropped (':'通信が途中で切断されました (')+whole.byteLength+'/'+cl+' bytes)');
    return whole;
  }
  const reader = resp.body.getReader(), parts = [];
  let got = 0;
  for(;;){
    const {done, value} = await reader.read();
    if(done) break;
    parts.push(value); got += value.byteLength;
    // content-length が無い（圧縮転送など）ときは総量不明なので、受信量に応じて 40% へ漸近させる
    const ratio = cl ? got / cl : 1 - Math.exp(-got / (64 * 1024 * 1024));
    if(typeof setBar === 'function') setBar(5 + Math.min(1, ratio) * 35);
  }
  if(cl && got !== cl) throw new Error((window._lang==='en'?'The connection dropped (':'通信が途中で切断されました (')+got+'/'+cl+' bytes)');
  const out = new Uint8Array(got);
  let at = 0; for(const part of parts){ out.set(part, at); at += part.byteLength; }
  return out.buffer;
}

async function loadFromURL(url, displayName){
  try{
    // Show loader UI early so user sees feedback during the ~30s fetch.
    // Never show the raw URL — presigned R2 URLs are hundreds of chars of
    // query-string noise (and leak signature params on screen). Fall back
    // to the path's filename, then to a plain label.
    if(typeof showLd === 'function'){
      let label = displayName;
      if(!label){
        try{ label = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || ''; }catch(_){ label = ''; }
      }
      showLd(label ? `読み込み中: ${label}` : (window._lang==='en'?'Loading...':'読み込み中...'));
    }
    if(typeof setBar === 'function') setBar(5);
    // .RAD URLs get a streaming path: Spark fetches via HTTP Range
    // Request internally, so we skip the whole-file ArrayBuffer fetch
    // and hand the URL straight to SplatMesh. This is the entire point
    // of the .RAD format — chunked streaming with O(log N) LoD walk.
    let ext = (url.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
    // blob: URL 等、URL から拡張子が取れない場合は displayName（?autoname= 経由）
    // の拡張子で判定する。既知の拡張子が URL から取れているときは触らない
    // （デモのラベル等、拡張子を持たない displayName で壊さないため）。
    const _KNOWN_EXTS = ['zip','obj','gltf','glb','fbx','ply','splat','ksplat','rad','spz','sog'];
    if(!_KNOWN_EXTS.includes(ext) && displayName){
      const dnExt = (String(displayName).split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
      if(_KNOWN_EXTS.includes(dnExt)) ext = dnExt;
    }
    const ft = _splatFileTypeFor(ext);
    if(ext === 'rad'){
      if(ft === undefined){
        if(typeof hideLd === 'function') hideLd();
        if(typeof showUndoToast === 'function') showUndoToast((window._lang==='en'?'Spark could not read this file format. Supported: PLY / SPLAT / SPZ / KSPLAT / RAD / SOG / PCSOGS':'このファイル形式は Spark が認識できませんでした。対応形式: PLY / SPLAT / SPZ / KSPLAT / RAD / SOG / PCSOGS'));
        return;
      }
      // Stream-load path. Construct a SplatMesh directly with `url:` —
      // Spark will fetch chunks lazily. We skip loadSplatFile's
      // fileBytes pipeline entirely.
      if(typeof setBar === 'function') setBar(15);
      const opts = { url, fileType: ft, ...SPARK_QUALITY_OPTS };
      // LoD ON for RAD scenes (the format's headline feature).
      opts.lod = true;
      opts.enableLod = true;
      // RAD's chunked-streaming load path requires the `paged:true`
      // option. Without it Spark falls back to whole-file fetch which
      // defeats the entire point of the format. The Qiita reference
      // article (matsutomato / 2026-05) showed initial-frame time
      // dropping from ~60 s to ~5 s on a 5 M-splat scene with paged.
      opts.paged = true;
      // Honour the "ポリゴン 1/4" toggle for URL-autoloaded RAD too.
      opts.lodScale = _radEffectiveLodScale();
      // CRITICAL: SPARK_QUALITY_OPTS (spread above) sets coneFoveate:0 +
      // coneFov:π for normal PLY/SPLAT loads (suppresses LoD pop-in).
      // For paged RAD scenes those exact values tell Spark's LoD walker
      // "every direction is uniformly central, never split" — chunk 0
      // (the root super-splat) loads and the walker never asks for any
      // children, so the user sees a couple of gray blobs and nothing
      // resolves. The local-file path (loadSplatFile / loadAdditional /
      // ZIP-restore) already deletes these for RAD; the URL autoload
      // path was missing the same strip and that's why ?demo=1 looked
      // broken.
      delete opts.coneFoveate;
      delete opts.behindFoveate;
      delete opts.coneFov;
      delete opts.coneFov0;
      // Mirror loadSplatFile's existing main-splat-layer swap so user
      // doesn't end up with stacked meshes after multiple autoloads.
      const _prevMain = layers.find(l => l._isMain);
      if(_prevMain){ scene.remove(_prevMain.mesh); const _i = layers.indexOf(_prevMain); if(_i >= 0) layers.splice(_i, 1); }
      if(splatMesh && !layers.find(l => l.mesh === splatMesh)) scene.remove(splatMesh);
      splatMesh = new SplatMesh(opts);
      if(typeof tuneSplatMesh === 'function') tuneSplatMesh(splatMesh);
      const name = (displayName || url.split('/').pop().split('?')[0]) || 'autoload.rad';
      const mainL = addLayer({ name: name.replace(/\.[^.]+$/, ''), type:'splat', mesh: splatMesh, rot:{x:0,y:0,z:0} });
      mainL._isMain = true;
      mainL._rawExt = 'rad';
      mainL._streamUrl = url;
      // プロジェクト名が未設定なら、読み込んだ 3DGS のファイル名で埋める。
      if(typeof setProjectNameFromFile==='function') setProjectNameFromFile(name);
      // Demo scene (交差点) ships slightly below the grid floor and a touch
      // off-axis, so when we autoload it apply the curated transform the
      // gizmo panel shows (Pos Y 1.5, Rot Y -168°). The -168° yaw aligns the
      // scene's real-world bearing with the 日照(Sun) compass north. Gate
      // strictly on the demo URL/label so user-supplied .rad URLs keep their
      // identity transform.
      if(typeof DEMO_SCENE_URL !== 'undefined' && (url === DEMO_SCENE_URL || displayName === DEMO_SCENE_LABEL)){
        mainL.pos   = { x:0, y:1.5,   z:0 };
        mainL.rot   = { x:0, y:-168,  z:0 };
        mainL.scale = { x:1, y:1,     z:1 };
        if(typeof applyLayerTransform === 'function') applyLayerTransform(mainL.id);
        if(typeof renderTransformPanel === 'function') renderTransformPanel();
      }
      _splatActiveUntil = performance.now() + (typeof _SPLAT_ACTIVE_MS === 'number' ? _SPLAT_ACTIVE_MS : 4000);
      if(typeof setBar === 'function') setBar(100);
      if(typeof hideLd === 'function') hideLd();
      if(typeof showHUD === 'function') showHUD();
      if(typeof hideDZ === 'function') hideDZ();
      if(typeof showUndoToast === 'function') showUndoToast((window._lang==='en'?'📡 Streaming .RAD: ':'📡 .RAD ストリーミング読込開始: ') + name);
      // Demo/URL parity (RC2): the local-file load path schedules auto-quality
      // calibration, but this URL/RAD-stream path never did — so ?demo=1 and
      // ?autoload= scenes were stuck at the device-tier default and auto-quality
      // could never climb. Schedule it here too (poller waits for the stream to
      // finish paging before opening the calibration window).
      if(typeof window._scheduleQualityProbe === 'function') window._scheduleQualityProbe();
      return;
    }
    // Non-RAD URL: fetch whole file (Range チャンク + 検証つき), route by extension.
    const buf = await _fetchBinaryChunked(url);
    if(typeof setBar === 'function') setBar(40);
    const name = (displayName || url.split('/').pop().split('?')[0]) || 'autoload.ply';
    const file = new File([buf], name, {type:'application/octet-stream'});
    if(ext === 'zip'){
      // Zipped splat/mesh (e.g. a large .rad zipped for upload-size limits, or
      // an online-SaaS stored property scene). _loadProjectZipFromFile already
      // knows how to unzip + auto-detect a raw splat/mesh when there's no
      // project.json, and fully owns the loading UI (showLd/setBar/hideLd)
      // from here on — don't call hideLd ourselves before/after this, let it
      // drive to completion. Without this branch, zip bytes were fed straight
      // into loadSplatFile() (no zip-extraction logic) and silently failed to
      // parse — every ?autoload=<zip-url> scene landed on a blank dropzone.
      await _loadProjectZipFromFile(file);
    }
    else if(['obj','gltf','glb','fbx'].includes(ext)) await loadObjFile(file);
    else {
      await loadSplatFile(file);
      // Same parity: loadSplatFile already schedules calibration internally,
      // but call it explicitly here too so the URL path is self-evidently
      // covered. The _qualityProbeScheduled flag coalesces the double-call.
      if(typeof window._scheduleQualityProbe === 'function') window._scheduleQualityProbe();
    }
  }catch(e){
    console.warn('loadFromURL failed', e);
    if(typeof hideLd === 'function') hideLd();
    if(typeof showUndoToast === 'function') showUndoToast((window._lang==='en'?'Load failed: ':'読み込み失敗: ') + e.message);
  }
}

// Handle URL params at startup. CRITICAL: defer with setTimeout so this
// runs AFTER the module body finishes executing. The previous IIFE ran
// synchronously during module load, which made `loadFromURL` enter
// `addLayer` before later module-level `let`/`const` declarations had
// run, throwing a TDZ ReferenceError. That blew up the autoload BETWEEN
// the SplatMesh construction and the showHUD/hideDZ calls — the home
// dropzone stayed visible and streaming never started for `?demo=1`
// visitors.
//
// setTimeout(…, 0) queues a macrotask; it fires after the entire module
// body has finished initialising every top-level let/const, so addLayer
// runs safely.
setTimeout(async ()=>{
  const m  = location.search.match(/[?&]autoload=([^&]+)/);
  const dm = /[?&]demo=1/.test(location.search);
  if(m){
    let autoUrl = decodeURIComponent(m[1]);
    // Online SaaS only: stored asset URLs are the public R2-proxy path
    // (e.g. /api/r2/assets/splat/foo.zip). Under ?protected=1 the
    // authenticated same-origin stream lives at /api/viewer-stream/<r2key>,
    // so reduce the value to the bare R2 object key (strip leading slashes
    // and either /api/r2/ or /api/viewer-stream/ proxy prefix, matching toR2Key() in /api/viewer-asset
    // on the online SaaS side) and route it through that endpoint instead.
    // blob: URLs (local-file salvage flows) and already-absolute http(s)
    // URLs are left untouched.
    if(typeof _protected !== 'undefined' && _protected &&
       !(/^https?:\/\//.test(autoUrl)) && !autoUrl.startsWith('blob:')){
      const r2key = autoUrl.replace(/^\/+/, '').replace(/^api\/(r2|viewer-stream)\//, '');
      autoUrl = '/api/viewer-stream/' + r2key;
    }
    // ?autoname=<filename> — online SaaS admin preview-capture only: when a
    // blob: URL is auto-loaded (no extension to sniff), this supplies a
    // filename so format detection still works.
    const an = location.search.match(/[?&]autoname=([^&]+)/);
    await loadFromURL(autoUrl, an ? decodeURIComponent(an[1]) : undefined);
  } else if(dm && DEMO_SCENE_URL){
    await loadFromURL(DEMO_SCENE_URL, (typeof T==='function'?T('demo-btn-lbl'):DEMO_SCENE_LABEL));
  }
}, 0);

// Showcase URL handling is implemented in 296_showcase_tour.js.

// Inject "Load demo scene" button into the dropzone. Inherits the existing
// `.demo-btn` style and accent-colour treatment used by the other dropzone
// buttons (空プロジェクト, ユーザーマニュアル, プロジェクトを開く).
document.addEventListener('DOMContentLoaded', () => {
  if(!DEMO_SCENE_URL) return;
  const anchor = document.getElementById('emptyBtn'); // first existing dz button
  if(!anchor) return;
  const btn = document.createElement('button');
  btn.id = 'dz-demo-btn';
  btn.type = 'button';
  btn.className = 'demo-btn';
  btn.setAttribute('style',
    'background:rgba(120,200,255,.16);border-color:rgba(120,200,255,.55);color:#b9e0ff;');
  btn.innerHTML = `📥 <span id="dz-demo-lbl">${T('demo-btn-lbl')} (${DEMO_SCENE_SIZE_MB}MB)</span>`;
  btn.title = T('demo-btn-title');
  btn.addEventListener('click', () => {
    loadFromURL(DEMO_SCENE_URL, (typeof T==='function'?T('demo-btn-lbl'):DEMO_SCENE_LABEL));
  });
  // Insert as the FIRST option (above 空プロジェクト) so it's the most
  // discoverable entry point for new visitors.
  anchor.parentNode.insertBefore(btn, anchor);
}, { once: true });

// ══════════════════════════════════════════════════
//  DIAG MODE  (?diag=1) — opt-in diagnostic instrumentation
//  Everything below runs ONLY when the page is opened with ?diag=1. In
//  normal use the page has zero overhead from this block: no exports, no
//  setInterval, no fetch POSTs, no patched setPixelRatio. Use it to
//  investigate fps/quality issues — start `python __diag_server.py` then
//  open  http://localhost:8765/Locahun3D_OfflineViewer.html?diag=1 with
//  any of the optional sub-flags below.
//
//  Sub-flags (all require ?diag=1):
//    &rafProbe=1          — measure raw rAF cadence (separate from animate)
//    &gpuTime=1           — force gl.finish() per frame; _ftAvg = true GPU ms
//    &prof=1              — per-section CPU profiler (pre/render/gap split)
//    &renderDiv=N         — submit renderer.render() every Nth frame only
//    &qual=N              — pin qualScale (bypass probe + watchdog)
//    &stress=1|2          — auto-drive camera oscillation for repeatable load
//    &testwalk=1          — auto-enter walk mode + force WASD pressed so the
//                            avatar animation pipeline can be observed
//                            end-to-end without a PLY scene loaded
// ══════════════════════════════════════════════════
// ?testwalk=1 — auto-test avatar animation pipeline.
// Also positions the camera to give us a clean side-view of the avatar so
// PowerShell screenshots can compare pose iterations.
if(/[?&]testwalk=1/.test(location.search)){
  setTimeout(async ()=>{
    console.info('[testwalk] forcing walk mode + W key for animation pipeline check');
    try{
      // Quick pose-debug helper: dump every bone's world position + parent's
      // Euler delta so external screenshots can be cross-referenced with
      // numeric pose data.
      window.__poseDump = () => {
        const wm = walkMode;
        if(!wm || !wm.bones) return null;
        const out = {};
        const tmpV = new THREE.Vector3();
        for(const [k, b] of Object.entries(wm.bones)){
          if(!b) continue;
          b.updateMatrixWorld(true);
          tmpV.setFromMatrixPosition(b.matrixWorld);
          const q = b.quaternion;
          out[k] = {
            pos: [+tmpV.x.toFixed(3), +tmpV.y.toFixed(3), +tmpV.z.toFixed(3)],
            quat: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)],
          };
        }
        return out;
      };
      // Show HUD so walk mode is allowed to enter (it gates on HUD visibility)
      const hud = document.getElementById('hud');
      if(hud){ hud.style.opacity = '1'; hud.style.display = 'block'; }
      const dz = document.getElementById('dz');
      if(dz){ dz.style.display = 'none'; }
      // Trigger walk mode entry
      if(typeof _avatarWalkEnter === 'function'){
        await _avatarWalkEnter();
      } else {
        const btn = document.getElementById('btnAvatarWalk');
        if(btn) btn.click();
      }
      // Wait for avatar build to settle
      await new Promise(r=>setTimeout(r, 1500));
      // Position camera SIDE-ON to the avatar so screenshots show the gait
      // clearly. Avatar is at world ~(0, 0, 0) when first spawned; we move
      // the camera to (3, 1.5, 0) looking down -X.
      try {
        if(typeof camPos !== 'undefined' && typeof setCamRotImmediate === 'function'){
          const av = walkMode.avatar;
          const ax = av ? av.position.x : 0;
          const az = av ? av.position.z : 0;
          camPos.set(ax + 4, 1.4, az);
          // Look toward -X (camera right): yaw=π/2 + π (camera initial yaw 0
          // already faces +Z so we add π/2 to face -X is wrong); use π*0.5
          // to face -X from +X
          setCamRotImmediate(-Math.PI/2, 0);
          if(typeof markDirty === 'function') markDirty(60);
        }
      } catch(_){}
      // Re-dispatch KeyW periodically. The Chrome CDP-driven window has a
      // tendency to fire window.blur (which the keyup handler treats as a
      // global keys-clear), AND the testwalk's setInterval probe runs at
      // 1Hz which can race with focus events. Spamming the keydown at 5Hz
      // keeps `keys.KeyW` true throughout the test window.
      try{
        const fireW = () => {
          try{ window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true})); }catch(_){}
        };
        fireW();
        setInterval(fireW, 200);
      }catch(_){}
      // Log mixer state every 1s
      let tick = 0;
      const iv = setInterval(()=>{
        tick++;
        const wm = walkMode;
        const a  = wm && wm.walkAction;
        const snap = {
          ev: 'walkProbe',
          t: performance.now(),
          tick,
          active: wm && wm.active,
          hasMixer: !!(wm && wm.mixer),
          hasAction: !!a,
          animSource: wm && wm.animSource,
          actionWeight: a ? a.getEffectiveWeight() : null,
          actionTimeScale: a ? a.getEffectiveTimeScale() : null,
          actionTime: a ? a.time : null,
          numBones: wm && wm.bones ? Object.keys(wm.bones).length : 0,
          airborne: wm && wm.airborne,
          velY: wm && wm.velocity ? +wm.velocity.y.toFixed(2) : null,
          avPosY: wm && wm.avatar ? +wm.avatar.position.y.toFixed(2) : null,
          groundY: wm ? +Number(wm.groundY).toFixed(2) : null,
          keyW: typeof keys !== 'undefined' && keys.KeyW,
          clipName: a && a._clip ? a._clip.name : null,
          clipDur: a && a._clip ? a._clip.duration : null,
          numTracks: a && a._clip ? a._clip.tracks.length : null,
          firstTrackName: a && a._clip && a._clip.tracks[0] ? a._clip.tracks[0].name : null,
          numBindings: a && a._propertyBindings ? a._propertyBindings.length : null,
          numBoundOK: a && a._propertyBindings
            ? a._propertyBindings.filter(b => b && b.binding && b.binding.targetObject).length
            : null,
          enabled: a ? a.enabled : null,
          isRunning: a && typeof a.isRunning === 'function' ? a.isRunning() : null,
          animCalls: window.__avatarAnimCallCount || 0,
          lastWalking: window.__avatarAnimLastWalking,
          lastRunMul:  window.__avatarAnimLastRunMul,
          lastDt:      window.__avatarAnimLastDt,
        };
        // Sample one bone's current quaternion so we can see whether the
        // mixer is actually moving anything (vs frozen at rest)
        if(wm && wm.bones && wm.bones.upperLegL){
          const q = wm.bones.upperLegL.quaternion;
          snap.upperLegL_q = [+q.x.toFixed(3),+q.y.toFixed(3),+q.z.toFixed(3),+q.w.toFixed(3)];
        }
        // POST directly to /__diag (works without ?diag=1)
        try{ fetch('/__diag', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(snap)}).catch(()=>{}); }catch(_){}
        if(tick >= 6) clearInterval(iv);  // 6 seconds of samples
      }, 1000);
    }catch(e){ console.warn('[testwalk] failed', e); }
  }, 1500);
}
if(/[?&]diag=1/.test(location.search)) {
// Capture page errors / promise rejections / console.error to /__diag so
// silent failures (Spark throws inside its worker etc.) become visible.
window.addEventListener('error', ev => {
  try { fetch('/__diag', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ev:'pageError', msg:ev.message, src:ev.filename, line:ev.lineno, t:performance.now()})}).catch(()=>{}); } catch(_){}
});
window.addEventListener('unhandledrejection', ev => {
  try { fetch('/__diag', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ev:'unhandled', reason:String(ev.reason).slice(0,500), t:performance.now()})}).catch(()=>{}); } catch(_){}
});
const _origErr = console.error.bind(console);
console.error = function(...args){
  try { fetch('/__diag', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ev:'consoleError', msg:args.map(a=>typeof a==='string'?a:(a&&a.message)||String(a)).join(' ').slice(0,500), t:performance.now()})}).catch(()=>{}); } catch(_){}
  return _origErr(...args);
};
window.__diagState = {
  get qualScale(){ return qualScale; },
  get qualIdx(){ return qualIdx; },
  get qualPreferred(){ return _qualPreferred; },
  get pendingPR(){ return _pendingPixelRatio; },
  get ftAvg(){ return (typeof _ftAvg!=='undefined')?_ftAvg:null; },
  get wallMsAvg(){ return (typeof _wallMsAvg!=='undefined')?_wallMsAvg:null; },
  get fps(){ return _fpsDisplay; },
  get refreshHz(){ return (typeof _refreshHz!=='undefined')?_refreshHz:null; },
  get refreshBudgetMs(){ return (typeof _refreshBudgetMs!=='undefined')?_refreshBudgetMs:null; },
  set rawDeltas(arr){ if(Array.isArray(arr)){ _rawDeltas.length=0; for(const d of arr) _rawDeltas.push(d); } },
  estimateRefresh(){ if(typeof _updateRefreshEstimate==='function') _updateRefreshEstimate(); return (typeof _refreshHz!=='undefined')?_refreshHz:null; },
  get splatActiveUntil(){ return _splatActiveUntil; },
  get splatMesh(){ return splatMesh; },
  get renderer(){ return renderer; },
  // ── Auto-quality governor internals (redesign 2026-07) ──
  // budgetMs: computed identically to the watchdog's vsync-normalized budget.
  get budgetMs(){ return 1000 / Math.min(Math.max(((typeof _refreshHz!=='undefined'&&_refreshHz)||60), 30), 240); },
  // burned: JSON-safe shallow copy of the burn map (scale → expiry ts).
  get burned(){ const w = window._gpuWatchdog; const o = {}; if(w && w.burned){ for(const k in w.burned) o[k] = w.burned[k]; } return o; },
  get lastApply(){ const w = window._gpuWatchdog; return w ? (w.lastApply||0) : null; },
  get slowStreak(){ const w = window._gpuWatchdog; return w ? (w.slowStreak||0) : null; },
  get fastStreak(){ const w = window._gpuWatchdog; return w ? (w.fastStreak||0) : null; },
  get calibrationUntil(){ const w = window._gpuWatchdog; return w ? (w.calibrationUntil||0) : null; },
  get lodPrefetch(){ return window.__lodPrefetch || null; },
  get pagedNumSplats(){
    try{
      const L = (typeof layers!=='undefined') ? layers.find(l=>l&&l._isMain&&l.mesh&&l.mesh.paged) : null;
      return L ? L.mesh.paged.numSplats : null;
    }catch(_){ return null; }
  },
  get lodQuatOverrideSet(){
    try{ return !!(typeof sparkRenderer!=='undefined' && sparkRenderer && sparkRenderer.lodQuatOverride); }catch(_){ return null; }
  },
  // ── RAD LODボトルネック特定用 (2026-07-06) ──
  // lastTraverseTime: 直近の WASM traverseLodTrees 所要ms（SparkRendererが計測）。
  // pagerQ/pagerActive: フェッチ待ち行列長と実行中フェッチ数。
  // 「n の伸びが遅い」とき、pagerActive が張り付き → decode/fetch律速、
  // 両方ゼロで n が伸びる待ち → ツリー更新/トラバース波の直列律速、と読み分ける。
  get lastTraverseMs(){
    try{ return (typeof sparkRenderer!=='undefined' && sparkRenderer) ? (sparkRenderer.lastTraverseTime||null) : null; }catch(_){ return null; }
  },
  get pagerQ(){
    try{ return sparkRenderer.pager ? sparkRenderer.pager.fetchPriority.length : null; }catch(_){ return null; }
  },
  get pagerActive(){
    try{ return sparkRenderer.pager ? sparkRenderer.pager.fetchers.length : null; }catch(_){ return null; }
  },
  get lodSplatCount(){
    try{ return (typeof sparkRenderer!=='undefined' && sparkRenderer) ? sparkRenderer.lodSplatCount : null; }catch(_){ return null; }
  },
  get splatPerfTier(){
    try{ return (typeof _splatPerfTier!=='undefined') ? _splatPerfTier : null; }catch(_){ return null; }
  },
  get lastTraverseResumed(){
    try{ return (typeof sparkRenderer!=='undefined' && sparkRenderer) ? !!sparkRenderer.lastTraverseResumed : null; }catch(_){ return null; }
  },
};
