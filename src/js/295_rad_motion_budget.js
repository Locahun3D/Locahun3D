// ══════════════════════════════════════════════════
//  RAD: 移動中だけ LOD 予算を下げる (2026-09-21)
// ══════════════════════════════════════════════════
// 問題: RAD の LOD 更新は Spark のワーカー内 traverseLodTrees が担うが、
//   高画質(lodSplatCount=500万)では 1 回の非再開トラバースに 1.2〜1.9 秒かかる。
//   実行中のトラバースはキャンセルできず次をブロックするので、カメラを動かして
//   いる間に返ってくる結果はすべて「過去のポーズ向け」になり、精細化は止まって
//   からようやく追いつく。＝「移動中は LOD が効いていない」という体感の正体。
// 対策: 動いている間だけ予算を下げてトラバースを高速化し、ポーズに追従させる。
//   止まったら(既定 200ms 後に)ティアの満額予算へ戻す。同一ビューでの予算引き上げは
//   incrtraverse パッチにより前回フロンティアからの「再開」になるため十数〜数十ms で
//   満額に到達する（vendor/README.md の Patch 2 を参照）。静止画は一切変わらない。
//
// 安全規則:
//   ・撮影(window._captureBusy) / 録画(camAnim._recCopyFn) / カメラアニメ再生中は
//     絶対に下げない（画質優先）。
//   ・paged(RAD) のメインメッシュが無いシーン（PLY/SPLAT 等）は一切触らない。
//   ・戻し先は毎回 _radTierLodSplatCount()（410 の唯一の定義元）から読む。
//     移動中にティアが変わっても、新しいティアの予算へ戻る。
//   ・294 の全方位プリウォーム/カメラウォームは「操作していない間」しか走らないので、
//     こちらが下げている時間帯とは重ならない（＝スイープは常に満額予算で走る）。
// キルスイッチ: URL に ?radmotion=0 / localStorage['l3d-radmotion']='0'。
// 状態は window.__radMotion（計測ハーネス scripts/perf-rad-motion.mjs が読む）。
(function(){
  // ── 調整用の定数（ここだけ触れば効き方が変わる）──
  const BUDGET_RATIO   = 0.25;      // 移動中の予算＝ティア満額のこの割合
  const BUDGET_FLOOR   = 600000;    // ただし下げ過ぎない下限(splat数)
  const RESTORE_MS     = 200;       // 停止からこのms後に満額へ戻す（小休止で往復しない）
  const TICK_MS        = 50;        // 判定周期
  const EPS_POS        = 0.005;     // これ以上動いたら「移動」(m)
  const EPS_ROT        = 0.002;     // これ以上回ったら「移動」(rad相当のquat差)

  // ?radmotion=0 / localStorage['l3d-radmotion']='0' で無効。
  // 0 より大きく 1 未満の数を渡すと BUDGET_RATIO を上書きする（計測・調整用）。
  const _override = (function(){
    let v = null;
    try { const m = /[?&]radmotion=([\d.]+)/.exec(location.search); if(m) v = parseFloat(m[1]); } catch(_){}
    if(v === null){ try { const s = localStorage.getItem('l3d-radmotion'); if(s != null) v = parseFloat(s); } catch(_){} }
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  })();
  const _enabled = !(_override === 0);
  const _ratio = (_override !== null && _override > 0 && _override < 1) ? _override : BUDGET_RATIO;

  const st = {
    enabled: _enabled,   // キルスイッチで false
    active: false,       // いま予算を下げているか
    reduced: null,       // 下げている値
    tierBudget: null,    // 直近に読んだティア満額（解決済みの数値）
    lastMotionAt: 0,
    ratio: _ratio,       // 実際に使っている割合
    reductions: 0,       // 下げた回数（計測用）
    restores: 0,         // 戻した回数（計測用）
  };
  window.__radMotion = st;
  if(!_enabled){
    console.info('[Locahun][RadMotion] 無効化されています (?radmotion=0 / localStorage)');
    return;
  }

  const _sr = () => (typeof sparkRenderer !== 'undefined' && sparkRenderer) ? sparkRenderer : null;
  // 表示中の paged(RAD) メッシュが1つでもあるか
  const _hasPaged = () => {
    if(typeof layers === 'undefined' || !layers) return false;
    for(let i=0;i<layers.length;i++){
      const L = layers[i];
      if(L && L.visible !== false && L.mesh && L.mesh.paged && L.mesh.visible !== false) return true;
    }
    return false;
  };
  // 撮影 / 録画 / カメラアニメ再生中は画質優先で絶対に下げない
  const _qualityFirst = () =>
    !!window._captureBusy ||
    (typeof camAnim !== 'undefined' && camAnim && (!!camAnim._recCopyFn || !!camAnim.playing));

  // ティア満額（undefined = Spark 端末既定）。下げ幅の計算には実効値が要るので解決する。
  const _tierRaw = () => (typeof _radTierLodSplatCount === 'function') ? _radTierLodSplatCount() : undefined;
  const _tierResolved = (sr) => {
    const raw = _tierRaw();
    if(typeof raw === 'number' && raw > 0) return raw;
    try { if(typeof sr.defaultSplatTarget === 'function') return sr.defaultSplatTarget(); } catch(_){}
    return 2500000;   // Spark の desktop 既定（フォールバック）
  };

  // ── 移動判定 ──
  // 入力フラグ(291 の motion と同じ材料)に加えて「実カメラのポーズが変わったか」も見る。
  // 後者があるので、クリック移動(404)・カメラへ飛ぶ・walk など
  // プログラムからカメラを動かす経路もすべて拾える。
  // 逆に 294 のプリウォームは lodQuatOverride しか動かさない＝実カメラは静止なので拾わない。
  const _last = { x:0, y:0, z:0, qx:0, qy:0, qz:0, qw:1, init:false };
  const _poseMoved = () => {
    if(typeof camera === 'undefined' || !camera) return false;
    const p = camera.position, q = camera.quaternion;
    if(!_last.init){
      _last.x=p.x; _last.y=p.y; _last.z=p.z;
      _last.qx=q.x; _last.qy=q.y; _last.qz=q.z; _last.qw=q.w; _last.init=true;
      return false;
    }
    const dx=p.x-_last.x, dy=p.y-_last.y, dz=p.z-_last.z;
    const dpos = Math.sqrt(dx*dx+dy*dy+dz*dz);
    // quaternion 同士の内積から回転差（符号は無視）
    const dot = Math.abs(q.x*_last.qx + q.y*_last.qy + q.z*_last.qz + q.w*_last.qw);
    const drot = 2 * Math.acos(Math.min(1, dot));
    _last.x=p.x; _last.y=p.y; _last.z=p.z;
    _last.qx=q.x; _last.qy=q.y; _last.qz=q.z; _last.qw=q.w;
    return (dpos > EPS_POS) || (drot > EPS_ROT);
  };
  const _inputActive = () =>
    (typeof dragOn !== 'undefined' && dragOn) ||
    (typeof joyDX !== 'undefined' && (joyDX !== 0 || joyDY !== 0)) ||
    (typeof keys !== 'undefined' && !!(keys.KeyW||keys.KeyS||keys.KeyA||keys.KeyD||
                                       keys.KeyQ||keys.KeyE||keys.KeyR||keys.KeyF||
                                       keys.ArrowUp||keys.ArrowDown||keys.ArrowLeft||keys.ArrowRight)) ||
    (typeof yaw !== 'undefined' && typeof _yawTarget !== 'undefined' &&
     (Math.abs(_yawTarget - yaw) > 1e-3 || Math.abs(_pitchTarget - pitch) > 1e-3));

  const _restore = (sr) => {
    if(!st.active) return;
    try { sr.lodSplatCount = _tierRaw(); } catch(_){}
    st.active = false; st.reduced = null; st.restores++;
  };

  setInterval(() => {
    const sr = _sr();
    if(!sr) return;
    const moved = _poseMoved();              // 毎ティック呼んで基準ポーズを更新する
    if(!_hasPaged() || _qualityFirst()){ _restore(sr); return; }
    const now = performance.now();
    if(moved || _inputActive()) st.lastMotionAt = now;
    const wantLow = (now - st.lastMotionAt) < RESTORE_MS;

    if(wantLow){
      const full = _tierResolved(sr);
      st.tierBudget = full;
      const low = Math.max(BUDGET_FLOOR, Math.round(full * _ratio));
      if(low >= full){ _restore(sr); return; }   // 下げる意味がないティア
      // 画質切替(applyQualityTier)が移動中に走ると満額へ戻されるので毎ティック念押しする
      if(sr.lodSplatCount !== low){
        try { sr.lodSplatCount = low; } catch(_){ return; }
        if(!st.active) st.reductions++;
        st.active = true; st.reduced = low;
      }
    } else {
      _restore(sr);
    }
  }, TICK_MS);
  console.info('[Locahun][RadMotion] 移動中のLOD予算削減 ON (' +
               Math.round(_ratio*100) + '% / 下限' + BUDGET_FLOOR + ', 復帰' + RESTORE_MS + 'ms)');
})();
