// ══════════════════════════════════════════════════
//  RAD LOD PREFETCH (2026-07-02, spec S3)
//  1) 全方位プリウォーム: RADロード安定後に lodQuatOverride を12方位へ順に向け、
//     周囲チャンクをページプール(LRU)へ常駐化 → 一度読んだ方向への回転は即精細。
//     desktopのみ(モバイルは帯域配慮)。ユーザー操作で即中断、アイドル1秒で再開、
//     1シーン1周で終了。
//  2) 回転先読み: 慣性回転中は目標方向を override に先出し → 到達前にフェッチ開始。
//  LODウォーカーは renderer.render() 内でしか回らないため、プリウォーム中は
//  _splatActiveUntil を延長してレンダーを起こし続ける。
//  安全規則: 撮影(window._captureBusy)・録画(camAnim._recCopyFn)・walk中は
//  override を必ず null（実カメラのLODを最優先）。
(function(){
  const DIRS = 12;
  const DWELL_MS = 500;               // 1方位あたりの滞在
  const st = { phase:'wait', dir:0, dirAt:0, idleAt:0, mesh:null };
  window.__lodPrefetch = st;          // diag可視化用
  const _sr = () => (typeof sparkRenderer !== 'undefined' && sparkRenderer) ? sparkRenderer : null;
  const _isDesktop = () => (typeof _splatPerfTier !== 'undefined' && _splatPerfTier === 'desktop');
  const _mainPaged = () => {
    if(typeof layers === 'undefined' || !layers) return null;
    const L = layers.find(l => l && l._isMain && l.mesh && l.mesh.paged);
    return L ? L.mesh : null;
  };
  // 撮影/録画/walk = override禁止（実カメラ優先）
  const _mustReleaseOverride = () =>
    !!window._captureBusy ||
    (typeof camAnim !== 'undefined' && camAnim && !!camAnim._recCopyFn) ||
    (typeof walkMode !== 'undefined' && walkMode && walkMode.active);
  // ユーザーが今シーンを操作しているか（プリウォームは邪魔しない）
  const _userActive = () =>
    (typeof dragOn !== 'undefined' && dragOn) ||
    (typeof joyDX !== 'undefined' && (joyDX !== 0 || joyDY !== 0)) ||
    (typeof keys !== 'undefined' && !!(keys.KeyW||keys.KeyS||keys.KeyA||keys.KeyD||keys.KeyQ||keys.KeyE)) ||
    (typeof yaw !== 'undefined' && (Math.abs(_yawTarget - yaw) > 1e-3 || Math.abs(_pitchTarget - pitch) > 1e-3));
  // 現在ビューを world-Y 軸で dy 回した LOD 選択用クォータニオン（カメラ規約非依存）
  const _qY = new THREE.Quaternion();
  const _UP = new THREE.Vector3(0, 1, 0);
  const _quatYawOffset = (dy) => _qY.setFromAxisAngle(_UP, dy).clone().multiply(camera.quaternion);

  setInterval(() => {
    const sr = _sr(); if(!sr) return;
    const mesh = _mainPaged();
    // シーン差し替え/破棄 → 状態リセット
    if(mesh !== st.mesh){ st.mesh = mesh; st.phase = mesh ? 'wait' : 'off'; st.dir = 0; }
    if(!mesh){ if(sr.lodQuatOverride) sr.lodQuatOverride = null; return; }
    if(_mustReleaseOverride()){ if(sr.lodQuatOverride) sr.lodQuatOverride = null; st.idleAt = 0; return; }

    // ── 2) 回転先読み（プリウォームより優先。全ティアで有効・コストほぼゼロ）──
    const dy = (typeof _yawTarget !== 'undefined') ? (_yawTarget - yaw) : 0;
    if(Math.abs(dy) > 0.05){
      sr.lodQuatOverride = _quatYawOffset(dy);
      st.idleAt = 0;
      return;
    }

    // ── 1) 全方位プリウォーム（desktopのみ・1シーン1周）──
    if(!_isDesktop()){ if(st.phase !== 'done' && sr.lodQuatOverride) sr.lodQuatOverride = null; return; }
    const now = performance.now();
    if(st.phase === 'wait'){
      if(typeof _sceneSettledForCalibration === 'function' && _sceneSettledForCalibration()){
        st.phase = 'sweep'; st.dir = 0; st.dirAt = 0;
        console.info('[Locahun][Prefetch] 全方位プリウォーム開始 (' + DIRS + '方位)');
      }
      return;
    }
    if(st.phase !== 'sweep'){ if(sr.lodQuatOverride) sr.lodQuatOverride = null; return; }
    if(_userActive()){
      // 操作中は中断・override解放。アイドル1秒で再開。
      if(sr.lodQuatOverride) sr.lodQuatOverride = null;
      st.idleAt = now + 1000; st.dirAt = 0;
      return;
    }
    if(now < st.idleAt) return;
    if(st.dirAt === 0){ st.dirAt = now; }
    sr.lodQuatOverride = _quatYawOffset(st.dir * Math.PI * 2 / DIRS);
    // LODウォーカーを回すためレンダーを起こし続ける
    if(typeof _splatActiveUntil !== 'undefined') _splatActiveUntil = now + DWELL_MS + 200;
    if(typeof markDirty === 'function') markDirty(2);
    if(now - st.dirAt >= DWELL_MS){
      st.dir++; st.dirAt = 0;
      if(st.dir >= DIRS){
        st.phase = 'done';
        sr.lodQuatOverride = null;
        console.info('[Locahun][Prefetch] プリウォーム完了 — 周囲チャンク常駐化');
      }
    }
  }, 100);
})();
