// ══════════════════════════════════════════════════
//  RAD LOD PREFETCH (2026-07-02, spec S3 / 2026-07-06 カメラ巡回追加)
//  1) 全方位プリウォーム: RADロード安定後に lodQuatOverride を12方位へ順に向け、
//     周囲チャンクをページプール(LRU)へ常駐化 → 一度読んだ方向への回転は即精細。
//     desktopのみ(モバイルは帯域配慮)。ユーザー操作で即中断、アイドル1秒で再開、
//     1シーン1周で終了。
//  2) 回転先読み: 慣性回転中は目標方向を override に先出し → 到達前にフェッチ開始。
//  3) 配置カメラのプリウォーム: スイープ後、type==='camera' レイヤーの savedPose
//     (pos+yaw+pitch)を lodPosOverride+lodQuatOverride で順に巡回し、各カメラ地点の
//     チャンクを事前常駐化 → カメラへ飛ぶ操作が常に即精細(実測: シーン端の未訪問
//     カメラで7.7s→0s)。後から追加されたカメラも検知して随時ウォームする。
//  LODウォーカーは renderer.render() 内でしか回らないため、プリウォーム中は
//  _splatActiveUntil を延長してレンダーを起こし続ける。
//  安全規則: 撮影(window._captureBusy)・録画(camAnim._recCopyFn)・walk中は
//  override(quat/pos両方)を必ず null（実カメラのLODを最優先）。
(function(){
  const DIRS = 12;
  const DWELL_MS = 500;               // 1方位あたりの滞在
  const CAM_DWELL_MS = 1500;          // 1カメラ地点あたりの滞在（位置が遠く新規チャンクが多い）
  const st = { phase:'wait', dir:0, dirAt:0, idleAt:0, mesh:null,
               camQueue:[], camAt:0, warmedCams:{}, curCam:null };
  window.__lodPrefetch = st;          // diag可視化用
  const _sr = () => (typeof sparkRenderer !== 'undefined' && sparkRenderer) ? sparkRenderer : null;
  const _isDesktop = () => (typeof _splatPerfTier !== 'undefined' && _splatPerfTier === 'desktop');
  const _mainPaged = () => {
    if(typeof layers === 'undefined' || !layers) return null;
    const L = layers.find(l => l && l._isMain && l.mesh && l.mesh.paged);
    return L ? L.mesh : null;
  };
  // override(quat+pos)を両方解放する。pos を残すと LOD 選択視点が遠隔地に
  // 固定されたまま実カメラの画が粗くなるため、解放は必ずペアで行う。
  const _releaseOverrides = (sr) => {
    if(sr.lodQuatOverride) sr.lodQuatOverride = null;
    if(sr.lodPosOverride)  sr.lodPosOverride  = null;
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
  // 絶対 yaw/pitch から LOD 選択用クォータニオンを構築。ビューアのカメラ規約は
  // updateCamera の rotation.set(pitch, yaw + π, roll, 'YXZ')（200 のコメント参照）。
  const _quatForYawPitch = (y, p) =>
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p, y + Math.PI, 0, 'YXZ'));
  // まだウォームしていない配置カメラ(type==='camera' & savedPose持ち)を列挙
  const _pendingCams = () => {
    if(typeof layers === 'undefined' || !layers) return [];
    return layers.filter(l => l && l.type === 'camera' && l.savedPose && l.savedPose.pos &&
                              !st.warmedCams[l.id]);
  };

  setInterval(() => {
    const sr = _sr(); if(!sr) return;
    const mesh = _mainPaged();
    // シーン差し替え/破棄 → 状態リセット（ウォーム済みカメラ記録もクリア）
    if(mesh !== st.mesh){
      st.mesh = mesh; st.phase = mesh ? 'wait' : 'off';
      st.dir = 0; st.camQueue = []; st.camAt = 0; st.warmedCams = {}; st.curCam = null;
    }
    if(!mesh){ _releaseOverrides(sr); return; }
    if(_mustReleaseOverride()){ _releaseOverrides(sr); st.idleAt = 0; return; }

    // ── 2) 回転先読み（プリウォームより優先。全ティアで有効・コストほぼゼロ）──
    const dy = (typeof _yawTarget !== 'undefined') ? (_yawTarget - yaw) : 0;
    if(Math.abs(dy) > 0.05){
      if(sr.lodPosOverride) sr.lodPosOverride = null; // 先読みは向きだけ・位置は実カメラ
      sr.lodQuatOverride = _quatYawOffset(dy);
      st.idleAt = 0;
      return;
    }

    // ── 1)+3) プリウォーム（desktopのみ）──
    if(!_isDesktop()){ if(st.phase !== 'done') _releaseOverrides(sr); return; }
    const now = performance.now();
    if(st.phase === 'wait'){
      if(typeof _sceneSettledForCalibration === 'function' && _sceneSettledForCalibration()){
        st.phase = 'sweep'; st.dir = 0; st.dirAt = 0;
        console.info('[Locahun][Prefetch] 全方位プリウォーム開始 (' + DIRS + '方位)');
      }
      return;
    }
    if(_userActive()){
      // 操作中は中断・override解放。アイドル1秒で再開（sweep/cams共通）。
      _releaseOverrides(sr);
      st.idleAt = now + 1000; st.dirAt = 0; st.camAt = 0;
      return;
    }
    if(now < st.idleAt) return;

    if(st.phase === 'sweep'){
      if(st.dirAt === 0){ st.dirAt = now; }
      sr.lodQuatOverride = _quatYawOffset(st.dir * Math.PI * 2 / DIRS);
      // LODウォーカーを回すためレンダーを起こし続ける
      if(typeof _splatActiveUntil !== 'undefined') _splatActiveUntil = now + DWELL_MS + 200;
      if(typeof markDirty === 'function') markDirty(2);
      if(now - st.dirAt >= DWELL_MS){
        st.dir++; st.dirAt = 0;
        if(st.dir >= DIRS){
          st.phase = 'cams';
          _releaseOverrides(sr);
          console.info('[Locahun][Prefetch] 方位スイープ完了 — 配置カメラのウォームへ');
        }
      }
      return;
    }

    // phase 'cams' / 'done': 配置カメラのウォーム（doneでも新規カメラを監視）
    if(st.phase === 'cams' || st.phase === 'done'){
      if(!st.curCam){
        if(st.camQueue.length === 0){
          const pend = _pendingCams();
          if(pend.length > 0){
            st.camQueue = pend.map(l => l.id);
            if(st.phase === 'done') st.phase = 'cams';
            console.info('[Locahun][Prefetch] カメラウォーム対象: ' + pend.length + '台');
          } else if(st.phase === 'cams'){
            st.phase = 'done';
            _releaseOverrides(sr);
            console.info('[Locahun][Prefetch] プリウォーム完了 — 周囲＋全カメラ地点を常駐化');
            return;
          } else {
            return; // done & 新規なし
          }
        }
        const id = st.camQueue.shift();
        const L = (typeof layers !== 'undefined') ? layers.find(l => l && l.id === id) : null;
        if(!L || !L.savedPose || !L.savedPose.pos){ st.warmedCams[id] = true; return; }
        st.curCam = L; st.camAt = now;
      }
      const sp = st.curCam.savedPose;
      sr.lodPosOverride  = new THREE.Vector3(sp.pos.x, sp.pos.y, sp.pos.z);
      sr.lodQuatOverride = _quatForYawPitch(sp.yaw || 0, sp.pitch || 0);
      if(typeof _splatActiveUntil !== 'undefined') _splatActiveUntil = now + 400;
      if(typeof markDirty === 'function') markDirty(2);
      if(now - st.camAt >= CAM_DWELL_MS){
        st.warmedCams[st.curCam.id] = true;
        st.curCam = null; st.camAt = 0;
        _releaseOverrides(sr);
      }
      return;
    }
  }, 100);
})();
