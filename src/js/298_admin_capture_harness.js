// ══════════════════════════════════════════════════
//  ?capture=1 — Record the orbit as a video and postMessage the blob back
//  to the parent window. Used by the online SaaS's admin editor to
//  auto-generate lightweight preview videos after 3DGS upload. OFF by
//  default — zero effect unless the URL explicitly requests it, so this is
//  inert in the standalone app.
//
//  Known trade-off: postMessage(...,'*') below is a wildcard-origin send,
//  ported as-is from the online SaaS where both ends are first-party. In
//  the standalone build this means whatever iframes/opens this page with
//  ?capture=1 receives the rendered video blob. Not a live confidentiality
//  hole in practice — the capturer never sees content it didn't itself
//  supply via ?autoload=/local file selection — but flagged here so it
//  isn't mistaken for an oversight if this file is read in isolation.
//
//  Flow: load scene → warmup (5s, GPU settles + splats stream in)
//        → wait for orbit to be running → record for captureSec → post blob
// ══════════════════════════════════════════════════
if(/[?&]capture=1/.test(location.search)){
  (function(){
    const params = new URLSearchParams(location.search);
    const ORBIT_S = parseInt(params.get('orbitSec')||'20', 10);
    // 録画前ウォームアップの追加時間(ms)。重いシーンで既定2秒では画質が乗り切らず
    // ボケた動画になることがあるため、管理側から任意で延長できるようにする
    // （例: warmupExtra=3000 で +3秒）。0〜10秒にクランプ。
    const WARM_EXTRA = Math.min(10000, Math.max(0, parseInt(params.get('warmupExtra')||'0', 10) || 0));
    const canvas = document.getElementById('c');
    if(!canvas) return;

    // 送信先: opener(window.open 由来)優先、無ければ親フレーム。どちらも無い
    // (rel=noopener / COOP でトップレベル化)と parent===window になり、自分自身へ
    // 送って親が永久に応答待ちハングする。target=null として検出しアボートする。
    const target = window.opener || (parent !== window ? parent : null);
    const msg = (type, extra)=>{ try { if(target) target.postMessage(Object.assign({type}, extra||{}), '*'); } catch(_){} };
    if(!target){ console.error('[capture] postMessage 送信先(opener/parent)が無いため中止'); return; }

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
     let encoder = null;
     try {
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

      // Phase 2: readiness — wait for the splat count to STOP GROWING,
      // regardless of format (streaming RAD or baked ZIP/PLY/SPLAT).
      //
      // 旧実装は RAD (__nSplat()>0) だけを収束待ちし、非ストリーミング
      // (ZIP内ベイク済み .ply/.splat) は hasScene() が true になった時点で
      // 「もう安定した」とみなしていた。しかし実機の 1GB超シーン（渋谷スク
      // ランブル交差点、2026-07-11 報告）で検証したところ、hasScene() が
      // true になった直後の packedSplats.numSplats は最終値のごく一部
      // （実測 29,049 — 本来はもっと桁違いに多いはずの都市景観シーン）で、
      // ワーカーでの解凍/パースが裏で継続し数字が後から伸びていた。
      // baked/RAD を問わず同じ「安定するまでポーリング」ロジックで扱う。
      const anySplatCount = ()=>{
        const rad = nSplat();
        if(rad > 0) return rad;
        try {
          if(typeof layers==='undefined' || !layers) return rad; // -1 か 0 のまま
          let n = 0;
          for(const L of layers){
            if(!L || !L.mesh || L.type==='camera') continue;
            const ps = L.mesh.packedSplats;
            if(ps && ps.numSplats) n += ps.numSplats;
            else if(typeof L.mesh.numSplats === 'number') n += L.mesh.numSplats;
          }
          return n > 0 ? n : rad;
        } catch(_){ return rad; }
      };
      msg('capture-progress',{phase:'loading', text:'シーン読み込み中…', pct:18});
      {
        // ⚠ ポーリング名目間隔(POLL_MS)を実経過時間として加算しない。
        // バックグラウンドタブでは setTimeout(500) が実際には1000ms超
        // かかることがあり、名目加算だと「上限60秒」のつもりが実時間で
        // 数分に膨れる。performance.now() の実差分で判定する。
        let last = -1, stableStart = -1;
        const STABLE_MS = 3000, POLL_MS = 500, MAX_MS = 60000;
        const convStart = performance.now();
        while(performance.now() - convStart < MAX_MS){
          await new Promise(r=>setTimeout(r, POLL_MS));
          const elapsed = performance.now() - convStart;
          if(typeof markDirty==='function') markDirty(20); // 収束待ち中もソート/ストリーミングを止めない
          const c = anySplatCount();
          if(c > 0 && c === last){
            if(stableStart < 0) stableStart = elapsed;
            if(elapsed - stableStart >= STABLE_MS) break;
          } else { stableStart = -1; last = c; }
          msg('capture-progress',{phase:'loading',
            text:'読み込み中… '+(c>0 ? c.toLocaleString()+' splats' : (hasScene() ? '安定化中' : '待機中')),
            pct: 18 + Math.min(12, Math.round(elapsed / MAX_MS * 12))});
        }
        if(anySplatCount() <= 0 && !hasScene()){ msg('capture-error',{error:'no-scene'}); return; }
      }

      // Phase 3: Lock resize handler and force 1280×720 (HD) capture resolution.
      // プレビュー動画は物件ページで複数同時に自動再生されるため、画質より
      // ファイルサイズ（ページの重さ）を優先し 1920×1080 から落としてある。
      const CAP_W = 1280, CAP_H = 720;
      const CAP_FOV = 90;   // 固定FOV（90）でキャプチャ
      // 撮影中は LODプリフェッチ(294)とビューポートresize(070)を抑止する。
      // 旧コードは未宣言の _captureLock に代入する no-op だった → 実効フラグへ。
      window._captureBusy = true;
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
      // Warm-up: let the viewer's render loop run a couple real seconds at
      // capture resolution so Spark can re-sort splats and settle the new
      // canvas size/aspect. Data completeness itself is now guaranteed by
      // the Phase 2 convergence wait above (covers RAD *and* baked scenes),
      // so this no longer needs to scale with splat count — it's purely a
      // "let the resize settle visually" pause.
      msg('capture-progress',{phase:'loading', text:'解像度安定化中…', pct:28});
      const warmStart = performance.now();
      // 既定2秒 ＋ 管理側指定の追加ウォームアップ(warmupExtra)。重いシーンで
      // 画質が乗り切る前に録画が始まりボケるのを防ぐ。
      const WARM_MS = 2000 + WARM_EXTRA;
      for(let w=0; performance.now() - warmStart < WARM_MS; w++){
        // dirty 窓(既定120f)を跨いでもレンダー/ソートが止まらないよう補給する
        if((w % 60) === 0 && typeof markDirty==='function') markDirty(90);
        await nextFrame();
      }

      // RAD 専用の再収束: 直前で lodScale を高画質へ引き上げたため、RAD は
      // より高精細な LoD チャンクの再ストリーミングを始める（Phase 2 の
      // 収束はこの品質引き上げより前に行っているのでここは対象外）。
      // 非ストリーミング(baked PLY/SPLAT)は lodScale 変更の影響を受けない
      // ため対象外（nSplat()<=0 で分岐しスキップされる）。
      if(nSplat() > 0){
        // ⚠ ここも名目のポーリング間隔(RESTAB_POLL_MS)を「実経過時間」として
        // 加算しない。バックグラウンドタブでは setTimeout(500) が実際には
        // 1000ms 超かかることがあり、名目加算だと上限45sのつもりが実時間で
        // 倍以上かかる。performance.now() の差分を都度測って判定する。
        let last = -1, stableStart = -1;
        const RESTAB_STABLE_MS = 2500, RESTAB_POLL_MS = 500, RESTAB_MAX_MS = 45000;
        const restabStart = performance.now();
        while(performance.now() - restabStart < RESTAB_MAX_MS){
          await new Promise(r=>setTimeout(r, RESTAB_POLL_MS));
          const elapsed = performance.now() - restabStart;
          // レンダー/ソート/ストリーミングを止めないよう毎ポーリングで dirty 維持
          if(typeof markDirty==='function') markDirty(20);
          const c = nSplat();
          if(c > 0 && c === last){
            if(stableStart < 0) stableStart = elapsed;
            if(elapsed - stableStart >= RESTAB_STABLE_MS) break;
          } else { stableStart = -1; last = c; }
          msg('capture-progress',{phase:'loading',
            text:'高画質LOD読み込み中… '+(c>0 ? c.toLocaleString()+' splats' : ''),
            pct: 28 + Math.min(7, Math.round(elapsed / RESTAB_MAX_MS * 7))});
        }
        // 最終密度でのソートが画面に反映されるまで数フレーム余分に回す
        for(let w=0; w<30; w++) await nextFrame();
      }

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

      // コーデックfallback: High→Main→Baseline の順で isConfigSupported を確認して
      // 最初に使えるものを選ぶ。H.264 未対応環境(一部 Linux Chrome / Android WebView)で
      // configure() が同期throwし無音ハングしていた問題への対処。いずれも mp4-muxer の
      // 'avc' と整合するプロファイル違いなので muxer 側は変更不要。
      const AVC_CODECS = ['avc1.640028','avc1.4d0028','avc1.42001f']; // High / Main / Baseline
      let chosenCodec = null;
      for(const c of AVC_CODECS){
        try {
          const s = await VideoEncoder.isConfigSupported({ codec:c, width:CAP_W, height:CAP_H, bitrate:4_000_000, framerate:FPS });
          if(s && s.supported){ chosenCodec = c; break; }
        } catch(_){}
      }
      if(!chosenCodec){ msg('capture-error',{error:'no-h264-encoder'}); return; }

      encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: e => msg('capture-error',{error:'VideoEncoder: '+e.message}),
      });
      encoder.configure({
        codec: chosenCodec,
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
     } catch(e){
       // configure() の同期throw やその他の例外を必ず親へ通知（無音ハング防止）。
       msg('capture-error',{error:'exception: ' + ((e && e.message) || e)});
     } finally {
       try { if(encoder && encoder.state !== 'closed') encoder.close(); } catch(_){}
       window._captureBusy = false;
     }
    }
    setTimeout(run, 300);
  })();
}
