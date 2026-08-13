// ══════════════════════════════════════════════════
//  ?autoinit=1 — カメラ初期位置を自動決定して ZIP を親へ返すバッチ入口
//
//  設計書 §3。298 の ?capture=1 と同じ設計（URLで明示されない限り完全に無効・
//  postMessage で親へ返す・親が居なければ自動ダウンロードへフォールバック）。
//
//  フロー:
//    ?autoload=<url>&autoinit=1
//      → シーン読込を待つ → splat のストリームが収束するまで待つ
//      → 自動配置（175）→ cameraInit を確定 → ZIP 生成
//      → postMessage('autoinit-done', {blob, confidence, needsReview, …})
//
//  返すペイロードには必ず confidence / needsReview / failed / position / yaw /
//  pitch を含める（信頼度の低い案件だけを人が開く運用のため）。
// ══════════════════════════════════════════════════
if(/[?&]autoinit=1/.test(location.search)){
  (function(){
    const params = new URLSearchParams(location.search);
    // 収束待ちの上限（秒）。巨大な RAD ほどストリームに時間がかかる。
    const MAX_WAIT_S = Math.min(900, Math.max(30, parseInt(params.get('autoinitWaitSec')||'180', 10) || 180));
    const target = window.opener || (parent !== window ? parent : null);
    const msg = (type, extra)=>{ try { if(target) target.postMessage(Object.assign({type}, extra||{}), '*'); } catch(_){} };

    const hasScene = ()=> (typeof layers!=='undefined' && layers.some(L=>L&&L.mesh&&L.type!=='camera'));
    const nSplat = ()=> typeof window.__nSplat==='function' ? window.__nSplat() : -1;
    // 298 と同じ「RAD でも baked でも同じ数え方」。RAD は __nSplat()、baked は
    // layers[].mesh.packedSplats.numSplats を合算する。
    const anySplatCount = ()=>{
      const rad = nSplat();
      if(rad > 0) return rad;
      try {
        if(typeof layers==='undefined' || !layers) return rad;
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

    async function run(){
      const t0 = performance.now();
      try {
        // Phase 1: レンダー可能なシーンになるまで（ZIP/大きい RAD は数分かかる）
        msg('autoinit-progress',{phase:'loading', text:'3DGS 読み込み中…'});
        const sceneReady = ()=> hasScene() || anySplatCount() > 0;
        for(let i=0; i<MAX_WAIT_S*2 && !sceneReady(); i++) await new Promise(r=>setTimeout(r,500));
        if(!sceneReady()){
          msg('autoinit-error',{error:'no-scene'});
          return;
        }

        // Phase 2: splat 数が増えなくなるまで待つ。幾何を測るので、まばらな
        // 途中経過で判定すると床も壁も見つからない。
        {
          let last = -1, stableStart = -1;
          const STABLE_MS = 3000, POLL_MS = 500, MAX_MS = MAX_WAIT_S*1000;
          const start = performance.now();
          while(performance.now() - start < MAX_MS){
            await new Promise(r=>setTimeout(r, POLL_MS));
            if(typeof markDirty==='function') markDirty(20); // ストリーミングを止めない
            const elapsed = performance.now() - start;
            const c = anySplatCount();
            if(c > 0 && c === last){
              if(stableStart < 0) stableStart = elapsed;
              if(elapsed - stableStart >= STABLE_MS) break;
            } else { stableStart = -1; last = c; }
            msg('autoinit-progress',{phase:'loading',
              text:'読み込み中… ' + (c>0 ? c.toLocaleString()+' splats' : '待機中'), splats:c});
          }
        }

        // Phase 3: 自動配置
        msg('autoinit-progress',{phase:'placing', text:'初期位置を計算中…'});
        const r = await window.autoPlaceInitialView();
        const result = r || { failed:true, needsReview:true, confidence:0, reason:'no-result' };

        // Phase 4: ZIP 生成（失敗しても既定の初期位置のまま ZIP は作る＝設計書
        // §2-6「failed は従来の既定位置のまま出力し、必ず人が見る」）
        msg('autoinit-progress',{phase:'zip', text:'ZIP を作成中…'});
        const blob = await window.saveProjectZip(false, { returnBlob:true });
        if(!blob){ msg('autoinit-error',{error:'zip-failed', confidence:result.confidence}); return; }

        const payload = {
          blob, mimeType:'application/zip', ext:'zip',
          projectName: (typeof _projectName!=='undefined' && _projectName) || '',
          failed: !!result.failed,
          reason: result.reason || null,
          confidence: result.confidence,
          needsReview: !!result.needsReview,
          flags: result.flags || [],
          position: result.position || null,
          yaw: result.yaw, pitch: result.pitch,
          yawDeg: result.yaw != null ? (result.yaw*180/Math.PI) : null,
          pitchDeg: result.pitch != null ? (result.pitch*180/Math.PI) : null,
          splats: anySplatCount(),
          diagnostics: result.diagnostics || null,
          elapsedMs: Math.round(performance.now() - t0),
        };
        if(target){
          msg('autoinit-done', payload);
        } else {
          // 親が居ない（単体で開いた）ときはダウンロードへフォールバック。
          console.info('[autoinit] postMessage 送信先が無いためダウンロードします', payload);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = ((payload.projectName||'scene_project')
            .replace(/[^a-zA-Z0-9_\-぀-ゟ゠-ヿ一-鿿]/g,'_')) + '.zip';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(()=>URL.revokeObjectURL(a.href), 10000);
        }
        // Playwright 等が DOM から結果を読めるようにも置いておく（blob は除く）。
        window.__autoInitResult = Object.assign({}, payload, { blob:undefined });
      } catch(e){
        console.error('[autoinit]', e);
        msg('autoinit-error',{error:'exception: ' + ((e && e.message) || e)});
        window.__autoInitResult = { failed:true, needsReview:true, confidence:0, reason:'exception: '+((e&&e.message)||e) };
      }
    }
    setTimeout(run, 300);
  })();
}
