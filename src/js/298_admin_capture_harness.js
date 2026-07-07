// ══════════════════════════════════════════════════
//  ?capture=1 — Record the orbit as a video and postMessage the blob back
//  to the parent window. Used by the online SaaS's admin editor to
//  auto-generate lightweight preview videos after 3DGS upload. OFF by
//  default — zero effect unless the URL explicitly requests it, so this is
//  inert in the standalone app.
//
//  Flow: load scene → warmup (5s, GPU settles + splats stream in)
//        → wait for orbit to be running → record for captureSec → post blob
// ══════════════════════════════════════════════════
if(/[?&]capture=1/.test(location.search)){
  (function(){
    const params = new URLSearchParams(location.search);
    const ORBIT_S = parseInt(params.get('orbitSec')||'20', 10);
    const canvas = document.getElementById('c');
    if(!canvas) return;

    const target = window.opener || parent;
    const msg = (type, extra)=> target.postMessage(Object.assign({type}, extra||{}), '*');

    const hasScene = ()=> (typeof layers!=='undefined' && layers.some(L=>L&&L.mesh&&L.type!=='camera'));
    const nSplat = ()=> typeof window.__nSplat==='function' ? window.__nSplat() : -1;

    // ── フレーム待ち（hidden タブ対応）─────────────────────────────
    // requestAnimationFrame はブラウザが「非表示/背面のタブ」で完全停止させる。
    // キャプチャは右下に縮小表示された iframe 内で走るが、親タブが背面に回る
    // （別ウィンドウに隠れる/別タブに切替）と rAF が止まり、解像度安定化ループが
    // 永久にハングする（実測: visibilityState=hidden で rAF が 0 回/4秒）。
    // headless モード（?headless=1、capture 時は必ず付与）では setTimeout で
    // 待つ — こちらは hidden タブでも発火し続けるため確実に前進する。
    // レンダーループ自体も headless では setTimeout 駆動なので、この待ちの間に
    // Spark の sort/LoD/RAD ストリーミングは進む。
    const _capHeadless = /[?&]headless=1/.test(location.search);
    const nextFrame = ()=> _capHeadless
      ? new Promise(r=>setTimeout(r, 16))
      : new Promise(r=>requestAnimationFrame(r));

    async function run(){
      // Phase 1: wait for a renderable scene (up to 90s).
      // hasScene() inspects layers[].mesh, but a streaming RAD keeps its data
      // on the global splatMesh (not the layer ref) — so __nSplat()>0 ("splats
      // are present & rendering") is an equally valid readiness signal. Accept
      // either, else ZIP-restored streaming scenes hang here and time out.
      const sceneReady = ()=> hasScene() || nSplat() > 0;
      msg('capture-progress',{phase:'loading', text:'3DGS 読み込み中…'});
      // 240s: 大きい ZIP はダウンロード＋解凍で 90s を超えることがある
      for(let i=0; i<480 && !sceneReady(); i++) await new Promise(r=>setTimeout(r,500));
      if(!sceneReady()){ msg('capture-error',{error:'no-scene'}); return; }

      // Phase 2: readiness.
      //  - Streaming RAD (__nSplat()>0): wait for splats to stream in & stabilise.
      //  - Non-streaming ZIP/PLY/SPLAT: __nSplat (a RAD-only counter) stays 0/-1
      //    even though geometry is fully baked & present once the scene layer
      //    exists, so gate on hasScene() instead of forcing a 'no-splats' abort.
      // ZIP から展開された RAD はストリーミング開始が遅れ、nSplat が「後から」
      // >0 になる。即時判定すると非ストリーミング扱いになり、直後の重さ判定
      // （_heavy）も 0 のまま誤判定する → 少し待ってから分岐し直す。
      if(nSplat() <= 0){
        msg('capture-progress',{phase:'loading', text:'シーン安定化中…', pct:20});
        await new Promise(r=>setTimeout(r, 2500));
      }
      if(nSplat() > 0){
        msg('capture-progress',{phase:'loading', text:'RAD データ読み込み中…'});
        let lastCount = 0, stableMs = 0;
        const STABLE_MS = 3000, POLL_MS = 500, MAX_MS = 60000;
        let elapsed = 0;
        while(elapsed < MAX_MS){
          await new Promise(r=>setTimeout(r, POLL_MS));
          elapsed += POLL_MS;
          const c = nSplat();
          if(c > 0 && c === lastCount){ stableMs += POLL_MS; if(stableMs >= STABLE_MS) break; }
          else { stableMs = 0; lastCount = c; }
          msg('capture-progress',{phase:'loading', text:'RAD 読み込み中… '+(c>0?c.toLocaleString()+' splats':'待機中'), pct:Math.min(30, Math.round(elapsed/MAX_MS*30))});
        }
        if(nSplat() <= 0){ msg('capture-error',{error:'no-splats'}); return; }
      } else {
        // Non-streaming scene (PLY / SPLAT): already settled above.
        if(!hasScene()){ msg('capture-error',{error:'no-scene'}); return; }
      }

      // Phase 3: Lock resize handler and force 1280×720 (HD) capture resolution.
      // プレビュー動画は物件ページで複数同時に自動再生されるため、画質より
      // ファイルサイズ（ページの重さ）を優先し 1920×1080 から落としてある。
      const CAP_W = 1280, CAP_H = 720;
      const CAP_FOV = 90;   // 固定FOV（90）でキャプチャ
      if(typeof _captureLock!=='undefined') _captureLock = true;
      // 画質=高: RAD の LoD 密度を最大化。setQuality は pixelRatio を 1.5 に
      // 上げてしまい VideoEncoder の 1280×720 と不整合になるため、ここでは
      // 品質変数と RAD lodScale だけ高に寄せ、pixelRatio は下で 1 に固定する。
      try {
        if(typeof qualScale!=='undefined') qualScale = 1.5;
        if(typeof qualIdx!=='undefined') qualIdx = 2;
        if(typeof _qualPreferred!=='undefined') _qualPreferred = 1.5;
        if(typeof _radEffectiveLodScale==='function' && typeof layers!=='undefined' && layers){
          const hi = _radEffectiveLodScale();
          for(const L of layers){
            if(L && L.mesh && L.mesh.paged && typeof L.mesh.lodScale === 'number') L.mesh.lodScale = hi;
          }
        }
      } catch(_){}
      if(typeof renderer!=='undefined'){
        renderer.setPixelRatio(1);          // キャプチャ backing を厳密に CAP_W×CAP_H に
        renderer.setSize(CAP_W, CAP_H);
      } else {
        canvas.width = CAP_W; canvas.height = CAP_H;
      }
      if(typeof camera!=='undefined'){
        camera.aspect = CAP_W / CAP_H;
        if('fov' in camera) camera.fov = CAP_FOV;
        camera.updateProjectionMatrix();
      }
      // Warm-up: let the viewer's render loop run for ~2s at capture resolution
      // so Spark can re-sort splats and stabilise LOD at 1280×720.
      if(typeof markDirty==='function') markDirty(120);
      msg('capture-progress',{phase:'loading', text:'解像度安定化中…', pct:28});
      for(let w=0; w<120; w++) await nextFrame();

      // Phase 4: rAF-driven frame-by-frame capture.
      // No setTimeout loop — tight for-loop with encoder backpressure yield.
      const FPS = 24;
      const TOTAL_FRAMES = FPS * ORBIT_S;
      // 回転速度は ORBIT_S に連動させない — 常に「360° を FULL_ROTATION_SEC 秒で
      // 一周する」一定ペースを保つ。ORBIT_S を短くしても等速のまま途中で止まる
      // だけにして、短尺化のために早回しになるのを防ぐ（一周する必要はない）。
      const FULL_ROTATION_SEC = 20;
      const ANGLE_PER_FRAME = (2 * Math.PI) / (FPS * FULL_ROTATION_SEC);

      // Reuse the module-wide Mp4Muxer/Mp4ArrayBufferTarget imported in
      // 010_state.js (added for the camera-animation WebCodecs rewrite)
      // instead of dynamically importing a second, different mp4-muxer
      // version — same library, one fewer network fetch, one fewer version
      // to keep in sync. (Original online-only code did
      // `await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/+esm')`
      // here — this is the one intentional deviation from the source.)
      const muxTarget = new Mp4ArrayBufferTarget();
      const muxer = new Mp4Muxer({
        target: muxTarget,
        video: { codec: 'avc', width: CAP_W, height: CAP_H },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: e => msg('capture-error',{error:'VideoEncoder: '+e.message}),
      });
      encoder.configure({
        codec: 'avc1.640028',
        width: CAP_W, height: CAP_H,
        bitrate: 4_000_000, // 720p 相当に下げたビットレート（旧 1080p 時は 8Mbps）
        framerate: FPS,
      });

      msg('capture-started',{durationSec: ORBIT_S});

      // Capture: set yaw → force render → GPU flush → capture.
      // Direct renderer.render() guarantees the canvas is painted before
      // VideoFrame reads it (rAF alone races with the viewer's own loop).
      for(let f = 0; f < TOTAL_FRAMES; f++){
        while(encoder.encodeQueueSize > 5){
          await new Promise(r => setTimeout(r, 1));
        }

        if(typeof _yawTarget!=='undefined') _yawTarget += ANGLE_PER_FRAME;
        if(typeof yaw!=='undefined') yaw = _yawTarget;
        // FOV を毎フレーム固定（カメラモード等が触っても 90 を維持）。
        if(typeof camera!=='undefined' && 'fov' in camera && camera.fov !== CAP_FOV){
          camera.fov = CAP_FOV; camera.updateProjectionMatrix();
        }
        if(typeof markDirty==='function') markDirty(30);

        // Spark needs multiple frames to process sort/LOD after yaw change.
        // hidden タブでも進むよう nextFrame()（headless では setTimeout）を使う。
        for(let w=0; w<3; w++) await nextFrame();
        if(typeof renderer!=='undefined' && typeof scene!=='undefined' && typeof camera!=='undefined'){
          renderer.render(scene, camera);
          const gl = renderer.getContext();
          if(gl) gl.finish();
        }

        const vf = new VideoFrame(canvas, { timestamp: f * (1_000_000 / FPS) });
        encoder.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
        vf.close();

        if(f % 24 === 0){
          const pct = Math.round(f / TOTAL_FRAMES * 100);
          msg('capture-progress',{phase:'recording', text:'録画中… '+pct+'%  ('+f+'/'+TOTAL_FRAMES+')', pct:30+Math.round(pct*0.7)});
        }
      }

      // Finalize
      await encoder.flush();
      encoder.close();
      muxer.finalize();
      const blob = new Blob([muxTarget.buffer], {type:'video/mp4'});
      msg('capture-done',{blob, mimeType:'video/mp4', ext:'mp4'});
    }
    setTimeout(run, 300);
  })();
}
