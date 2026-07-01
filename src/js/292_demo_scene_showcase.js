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
// Hosted on R2 and served through the `locahun3d-demo` Worker, which adds
// the `Access-Control-Allow-Origin: *` headers that Cloudflare's public
// pub-*.r2.dev subdomain doesn't return on its own. Without that
// passthrough Spark's chunked Range fetches fail with `TypeError: Failed
// to fetch` from cross-origin viewers and the `?demo=1` auto-start
// silently shows a black screen. Worker source + deploy instructions are
// in `demo-proxy/` next to this file.
//
// TODO(2026-05): after `wrangler deploy` in demo-proxy/, replace the
// pub-*.r2.dev URL below with the Worker URL, e.g.
//   https://locahun3d-demo.<account>.workers.dev/Kousaten_ForDemo_point_cloud.rad
// (or a custom domain once one is attached). The proxy whitelist also
// needs the filename — see ALLOWED_PATHS in demo-proxy/src/index.js.
const DEMO_SCENE_URL = 'https://pub-6fe11fc6301a424ba739695a7c4d2dd9.r2.dev/Kousaten_ForDemo_point_cloud.rad';
const DEMO_SCENE_LABEL = 'デモシーン(交差点)';
const DEMO_SCENE_SIZE_MB = 357;

async function loadFromURL(url, displayName){
  try{
    // Show loader UI early so user sees feedback during the ~30s fetch
    if(typeof showLd === 'function') showLd(`読み込み中: ${displayName || url}`);
    if(typeof setBar === 'function') setBar(5);
    // .RAD URLs get a streaming path: Spark fetches via HTTP Range
    // Request internally, so we skip the whole-file ArrayBuffer fetch
    // and hand the URL straight to SplatMesh. This is the entire point
    // of the .RAD format — chunked streaming with O(log N) LoD walk.
    const ext = (url.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
    const ft = _splatFileTypeFor(ext);
    if(ext === 'rad'){
      if(ft === undefined){
        if(typeof hideLd === 'function') hideLd();
        if(typeof showUndoToast === 'function') showUndoToast('このファイル形式は Spark が認識できませんでした。対応形式: PLY / SPLAT / SPZ / KSPLAT / RAD / SOG / PCSOGS');
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
      if(typeof showUndoToast === 'function') showUndoToast('📡 .RAD ストリーミング読込開始: ' + name);
      return;
    }
    // Non-RAD URL: fetch whole file, route by extension.
    const resp = await fetch(url);
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    if(typeof setBar === 'function') setBar(40);
    const buf = await resp.arrayBuffer();
    const name = (displayName || url.split('/').pop().split('?')[0]) || 'autoload.ply';
    const file = new File([buf], name, {type:'application/octet-stream'});
    if(['obj','gltf','glb','fbx'].includes(ext)) await loadObjFile(file);
    else await loadSplatFile(file);
  }catch(e){
    console.warn('loadFromURL failed', e);
    if(typeof hideLd === 'function') hideLd();
    if(typeof showUndoToast === 'function') showUndoToast('読み込み失敗: ' + e.message);
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
    await loadFromURL(decodeURIComponent(m[1]));
  } else if(dm && DEMO_SCENE_URL){
    await loadFromURL(DEMO_SCENE_URL, (typeof T==='function'?T('demo-btn-lbl'):DEMO_SCENE_LABEL));
  }
}, 0);

// ══════════════════════════════════════════════════
//  ?showcase=1 — AUTO-PLAY feature showcase for recording a ~40 s promo clip.
//  OFF by default → zero effect on normal use. Runs on whatever scene is already
//  loaded (the online demo OR a local offline project), driving a smooth, slowly
//  drifting camera while it cycles the v0.0.3 camera-tool features with captions.
//  Intended use: open in a FOREGROUND browser tab (so rAF runs at full 60 fps)
//  and screen-record the playback. Add &demo=1 to auto-load the demo scene, or
//  just load any .ply/.spz/.rad/project first and it starts on its own.
// ══════════════════════════════════════════════════
if(/[?&]showcase=1/.test(location.search)){
  (function(){
    const cap = document.createElement('div');
    cap.id = 'sc-cap';
    cap.style.cssText =
      'position:fixed;left:50%;bottom:8%;transform:translateX(-50%) translateY(8px);z-index:6000;'+
      'text-align:center;color:#fff;opacity:0;transition:opacity .55s ease, transform .55s ease;'+
      'pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.5));'+
      'padding:13px 32px;border-radius:16px;border:1px solid rgba(255,255,255,.14);'+
      'backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);box-shadow:0 10px 34px rgba(0,0,0,.45);max-width:86vw';
    const main = document.createElement('div');
    main.style.cssText = 'font:700 30px/1.3 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em';
    const sub = document.createElement('div');
    sub.style.cssText = 'font:500 17px/1.3 ui-sans-serif,system-ui,sans-serif;opacity:.9;margin-top:5px;color:#ffd9a8';
    cap.appendChild(main); cap.appendChild(sub); document.body.appendChild(cap);
    const say = (m,s)=>{ main.textContent=m||''; sub.textContent=s||''; };
    const fade = (on)=>{ cap.style.opacity = on?'1':'0'; cap.style.transform = 'translateX(-50%) translateY('+(on?'0':'8px')+')'; };

    const wait = (ms)=>new Promise(r=>setTimeout(r,ms));
    const fwd = ()=>new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).normalize();

    // gentle continuous drift (slow pan + bob + forward creep) around a base pose
    let drift = null;
    function startDrift(bYaw,bPitch,base){
      const t0 = performance.now();
      drift = { stop:false };
      const b = base.clone();
      (function loop(now){
        if(!drift || drift.stop) return;
        const t = (now - t0)/1000;
        yaw   = _yawTarget   = bYaw   + Math.sin(t*0.13)*0.10;
        pitch = _pitchTarget = bPitch + Math.sin(t*0.19)*0.018;
        camPos.copy(b).addScaledVector(fwd(), Math.sin(t*0.10)*0.45 + t*0.010);
        if(typeof markDirty === 'function') markDirty(2);
        requestAnimationFrame(loop);
      })(performance.now());
    }
    function stopDrift(){ if(drift) drift.stop = true; drift = null; }

    const camOpen = ()=>{ const p=document.getElementById('cam-panel');
      if(!(p && getComputedStyle(p).display!=='none') && typeof window.toggleCamTool==='function') window.toggleCamTool(); };
    const setGrid = (g)=>{ try{ if(typeof cam!=='undefined'){ cam.grids = new Set(g?[g]:[]); if(typeof drawCamGrid==='function') drawCamGrid(); } }catch(e){} };
    const flash = async ()=>{ const f=document.createElement('div');
      f.style.cssText='position:fixed;inset:0;z-index:5999;background:#fff;opacity:0;transition:opacity .1s;pointer-events:none';
      document.body.appendChild(f); await wait(20); f.style.opacity='0.85'; await wait(110); f.style.opacity='0'; await wait(260); f.remove(); };
    const hasScene = ()=> (typeof layers!=='undefined' && layers.some(L=>L&&L.mesh&&L.type!=='camera'));

    async function run(){
      for(let i=0;i<160 && !hasScene(); i++) await wait(500);
      await wait(1500);
      const base=camPos.clone(), bYaw=yaw, bPitch=pitch;
      startDrift(bYaw,bPitch,base);

      // 1 — intro
      say('ロケハン3D','オフライン 3DGS ロケハン・ビューア   v0.0.4'); fade(true);
      await wait(5200); fade(false); await wait(550);

      // 2 — camera tool + sensor simulation
      camOpen(); if(window.setCamFocal) window.setCamFocal(35); if(window.setCamAspect) window.setCamAspect(16/9); await wait(450);
      say('実機センサー シミュレーション','選んだアスペクトをセンサー領域から切り出す'); fade(true); await wait(950);
      const sensors=[['ff','フルサイズ  36×24'],['apsc','APS-C  23.6×15.7'],['mft','マイクロフォーサーズ  17.3×13'],
                     ['ax35og','ARRI Alexa 35  (シネマ)'],['oneinch','1型  13.2×8.8'],['phone23','1/2.3型 スマホ  6.17×4.55']];
      for(const [k,lbl] of sensors){ if(window.onCamSensorPreset) window.onCamSensorPreset(k); sub.textContent=lbl; await wait(1700); }
      if(window.onCamSensorPreset) window.onCamSensorPreset('ff'); await wait(300); fade(false); await wait(450);

      // 3 — aspect ratios
      say('アスペクト & セーフフレーム','構図に合わせて即切替'); fade(true); await wait(900);
      const asps=[[16/9,'16:9'],[2.39,'2.39:1  シネスコ'],[1,'1:1'],[9/16,'9:16  縦']];
      for(const [a,lbl] of asps){ if(window.setCamAspect) window.setCamAspect(a); sub.textContent=lbl; await wait(1900); }
      if(window.setCamAspect) window.setCamAspect(16/9); await wait(300); fade(false); await wait(450);

      // 4 — composition grids
      say('構図ガイド','三分割・黄金比・対角線'); fade(true);
      setGrid('thirds'); sub.textContent='三分割'; await wait(1500);
      setGrid('golden'); sub.textContent='黄金比';  await wait(1600);
      setGrid('diag');   sub.textContent='対角線';  await wait(1600);
      setGrid('thirds'); fade(false); await wait(450);

      // 5 — JPEG capture (shutter flash; no file download during the show)
      say('JPEG撮影','プレビュー通りに書き出し'); fade(true); await wait(800);
      await flash(); await wait(1100); fade(false); await wait(550);

      // 6 — outro
      say('LOCAHUN 3D','v0.0.4'); fade(true); await wait(3600); fade(false);
      await wait(600); stopDrift();
    }
    setTimeout(run, 200);
  })();
}

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
};

