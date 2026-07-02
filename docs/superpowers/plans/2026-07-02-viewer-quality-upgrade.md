# ビューアー画質アップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JPEG撮影を実ピクセル≥1920幅の一時PRブーストでFHD化し、画質「高」時のRAD LOD範囲を拡大し、全方位プリウォーム＋回転先読みで回転→精細化ラグを短縮する。

**Architecture:** spec = `docs/superpowers/specs/2026-07-02-viewer-quality-upgrade-design.md`（承認済み）。前提変更2点: ①画質ガバナーv2が導入済みで、**画質状態の適用点は `applyQualityTier(idx,{source,immediate})`**（`src/js/410_ui_controls.js`）— S2のlodSplatCount切替はここに挿す。②293番は `293_diag_instrumentation.js` が使用済みのため**新断片は `294_rad_lod_prefetch.js`**。

**Tech Stack:** 純粋連結断片（ESMでない共有module scope）。ビルド=`node build.mjs`。テストフレームワーク無し — 検証はビルドゲート＋本番実機（Chrome MCP＋?diag=1＋スクショ目視、このrepoの確立手法）。ユニットテストが書けない環境のため、各タスクの「テスト」はビルド成功＋成果物への symbol 出現確認で代替する（TDDの意図＝実装前に検証手段を確定、は維持）。

**確定済みの現行事実（再調査不要）:**
- `114_capture_render.js:78-79` `const fr = _camFrameRect(); const PR = renderer.getPixelRatio();`、`:97-112` `_applyCapFrame`＋2回レンダー＋90ms待ち、`:122-126` crop（`PR`使用）、`:190-199` 復元（`restorePR = min(devicePixelRatio,_PR_CAP)*qualScale` → `setPixelRatio`＋`setSize`）
- `180_...:61-70` `_radLodScaleForQuality(idx)` ティア表（`_splatPerfTier` = 'desktop'|'laptop_ok'|'laptop_weak'|'tablet'|'phone'）。`:75-79` に `[DIAG3]` 一時ヘルパー（`__loadRad/__nSplat/__keepAlive/__setCam`）が存在 — **触らない・消さない**（別作業の実験用）
- `410_ui_controls.js` `applyQualityTier(idx,opts)`: qualIdx/qualScale→PR(即時orキュー)→RAD lodScaleループ→バッジ→(manual時)_qualPreferred→console.info→markDirty(8)
- `420_...` に `_sceneSettledForCalibration()`（paged全メッシュが `_radTargetCount` 到達＋`_splatActiveUntil`経過で true）
- `030_renderer_scene.js:84` `const sparkRenderer = new SparkRenderer({renderer, numLodFetchers:...})` — module scope で全断片から参照可
- Spark: `sparkRenderer.lodSplatCount`（undefined=端末別既定250万〜）・`sparkRenderer.lodQuatOverride`（LOD選択視点の上書き、null=実カメラ）・`mesh.paged.numSplats`。Spark v2.0.0ソースは `C:\Users\askgg\AppData\Local\Temp\claude\F--\69d79e89-5b03-4a7f-baad-1df68edc28ca\scratchpad\spark-src` にclone済み
- rAF/レンダーは dirty駆動 — **アイドル中はrenderが走らずSparkのLODウォーカーも止まる**。プリウォームは `_splatActiveUntil = performance.now()+ms`（`bumpSplatActive`相当）＋`markDirty(n)` でレンダーを起こし続ける必要がある

---

### Task 1: S1 — FHDキャプチャ（一時PRブースト）

**Files:**
- Modify: `src/js/114_capture_render.js`（78-79近傍、122-126、復元部）

- [ ] **Step 1-1: ブースト計算と適用を挿入**

`const PR = renderer.getPixelRatio();`（:79）の直後に挿入:

```js
  // ── FHDブースト (2026-07-02) ──
  // 従来は「ライブ画面の枠部分を切り出して1920幅へ拡大」だったため、枠が画面上で
  // 小さいと実ソースピクセルが不足しぼやけた。撮影の間だけ pixelRatio を引き上げ、
  // 枠の実ピクセルを target 以上にしてから切り出す（拡大コピーの根絶）。
  // renderer.setSize による黒帯バグ経路(下コメント参照)は使わない — PRブーストは
  // 望遠スーパサンプル(030 _camZoomResBoost, 2026-06-27)で実証済みの安全機構。
  // 上限: desktop 4.0 / touch系は既存スーパサンプル上限(dPR×2.2)。さらに
  // WebGL最大バッファ寸法(16384)でクランプ。
  const _needPR = target.w / Math.max(1, fr.w);
  const _tierCap = (typeof _qualTouchLike !== 'undefined' && _qualTouchLike)
    ? (devicePixelRatio || 1) * 2.2 : 4.0;
  const _dimCap = 16384 / Math.max(innerWidth, innerHeight);
  const _boostPR = Math.min(Math.max(_needPR, PR), _tierCap, _dimCap);
  const capPR = (_boostPR > PR + 1e-3) ? _boostPR : PR;
  window._captureBusy = true;          // 294のLODプリフェッチを撮影中サスペンド
  try {
  if(capPR !== PR) renderer.setPixelRatio(capPR);
```

続いて既存の 2回レンダー部（`_applyCapFrame(); renderer.render(...); await ...90ms; _applyCapFrame(); renderer.render(...); renderer.setScissorTest(false);`）はそのまま `try` 内に含め、crop 部（旧:122-126）の `PR` を `capPR` に変更:

```js
  const _sx = Math.max(0, Math.round(fr.x * capPR));
  const _sy = Math.max(0, Math.round(fr.y * capPR));
  const _sw = Math.round(fr.w * capPR);
  const _sh = Math.round(fr.h * capPR);
  ictx.drawImage(canvas, _sx, _sy, _sw, _sh, 0, 0, target.w, target.h);
  } finally {
    // PRは既存の復元部(下)でも戻すが、例外時にも画面解像度が壊れないよう二重化
    if(capPR !== PR){ try{ renderer.setPixelRatio(PR); }catch(_){} }
    window._captureBusy = false;
  }
```

注意: `try{` の開始位置は `if(capPR !== PR) renderer.setPixelRatio(capPR);` の直前（上記コード通り）。`finally` 後の env-tint / WB / grid / 復元処理は変更しない。既存復元部（`restorePR = ...` :190-199）はそのまま生かす（カメラツール中の望遠ブースト復帰は既存 `applyCamSettings()` 呼び出しが担う）。

- [ ] **Step 1-2: ビルド確認はしない（Task 5でまとめて実施）。編集領域を Read で再確認し、`target` が既に定義済みのスコープ（`_camTargetResolution()` の戻り値、同関数上部）であることを確認**

- [ ] **Step 1-3: Commit**

```bash
git add src/js/114_capture_render.js
git commit -m "feat(capture): FHD independent-resolution JPEG via temporary pixelRatio boost"
```

---

### Task 2: S2 — 画質「高」時のLOD範囲拡大

**Files:**
- Modify: `src/js/180_splat_decimation_user_toggled_low_poly_m.js:64-65`
- Modify: `src/js/410_ui_controls.js`（applyQualityTier 内、RAD lodScaleループの直後）

- [ ] **Step 2-1: lodScale 高ティアを引き上げ（180）**

```js
  if(tier === 'desktop')          { lo=0.8;  mid=1.5; hi=3.0; }
  else if(tier === 'laptop_ok')   { lo=0.7;  mid=1.1; hi=2.0; }
```

（laptop_weak/tablet/phone は据え置き。上部コメントの `高2.2`/`高1.6` 記述も 3.0/2.0 に更新し、「高は Task2 の lodSplatCount 拡大とセットで飽和が外れる」旨を1行追記）

- [ ] **Step 2-2: applyQualityTier に lodSplatCount 切替を追加（410）**

RAD lodScale 再適用の `try{...}catch(_){}` ブロックの直後に挿入:

```js
  // ── 高画質時のLOD総予算拡大 (spec S2) ──
  // lodScale を 2.0 超に上げても総予算 lodSplatCount(desktop既定250万)が先に
  // 頭打ちになり広範囲が精細化しない(実測で飽和確認済み)。「高」の時だけ予算も
  // 引き上げ、低/中では undefined に戻して Spark の端末別既定に委ねる。
  // VRAM上限 maxPagedSplats(desktop 1677万) は別枠なので触らない。
  try {
    if(typeof sparkRenderer !== 'undefined' && sparkRenderer){
      const _tier = (typeof _splatPerfTier !== 'undefined') ? _splatPerfTier : 'laptop_ok';
      if(i === 2 && _tier === 'desktop')        sparkRenderer.lodSplatCount = 5000000;
      else if(i === 2 && _tier === 'laptop_ok') sparkRenderer.lodSplatCount = 3000000;
      else sparkRenderer.lodSplatCount = undefined;
    }
  } catch(_){}
```

- [ ] **Step 2-3: Commit**

```bash
git add src/js/180_splat_decimation_user_toggled_low_poly_m.js src/js/410_ui_controls.js
git commit -m "feat(lod): widen high-tier RAD LOD (lodScale 3.0/2.0 + lodSplatCount 5M/3M on 高)"
```

---

### Task 3: S3 — 全方位プリウォーム＋回転先読み（新断片294）

**Files:**
- Create: `src/js/294_rad_lod_prefetch.js`
- Modify: `src/template.html`（`{{include:src/js/293_diag_instrumentation.js}}` 行の直後に `{{include:src/js/294_rad_lod_prefetch.js}}` を追加）

- [ ] **Step 3-1: 断片を新規作成**

```js
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
```

- [ ] **Step 3-2: template.html に include 追加**（293の行の直後、同形式の1行）

- [ ] **Step 3-3: 実装後の規約検証（コンソール1回）** — 本番orローカルでRADを開き `sparkRenderer.lodQuatOverride = camera.quaternion.clone()` を設定しても表示LODが劣化しない（=現在ビューと同一の選択になる）ことを確認。`_quatYawOffset(0)` が `camera.quaternion` と dot≈±1 であることを console で確認（`_quatYawOffset(0).dot(camera.quaternion)`）。ズレる場合は乗算順を `camera.quaternion.clone().premultiply(_qY.setFromAxisAngle(...))` に修正。

- [ ] **Step 3-4: Commit**

```bash
git add src/js/294_rad_lod_prefetch.js src/template.html
git commit -m "feat(lod): omnidirectional prewarm + rotation-target prefetch via lodQuatOverride"
```

---

### Task 4: S4 — diag計測（rotate-to-sharp 用の観測点）

**Files:**
- Modify: `src/js/292_demo_scene_showcase.js`（`?diag=1` の `__diagState` 定義ブロック末尾）

- [ ] **Step 4-1: getter追加**

`__diagState` オブジェクトに追加（既存getterと同スタイル）:

```js
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
```

rotate-to-sharp の実測は「90°ヨージャンプ後、`pagedNumSplats` の増加が止まる(±1%で500ms安定)までの時間」で代替する（pager内部プロパティへの依存を避ける）。計測スクリプト自体はコントローラ(Chrome MCP)側で注入するためコード追加不要。

- [ ] **Step 4-2: Commit**

```bash
git add src/js/292_demo_scene_showcase.js
git commit -m "feat(diag): expose prefetch state + paged splat count for rotate-to-sharp measurement"
```

---

### Task 5: ビルド・デプロイ・実機検証（コントローラ実施）

- [ ] **Step 5-1:** `cd F:/Htlml/3DGS/Locahun3D && node build.mjs` → `OK: built`。成果物に `_quatYawOffset` / `lodPrefetch` / `_captureBusy` が各≥1回出現することを grep 確認
- [ ] **Step 5-2:** `bash deploy-viewer.sh` → 本番反映
- [ ] **Step 5-3: S1検証** — 本番でデモRAD＋カメラツール16:9、枠が小さくなるようパネルを開いた状態でJPEG撮影。出力が1920×1080であること、**修正前スクショ比で明瞭にシャープ**なこと、黒帯・構図ズレがないことを目視（黒帯が出た場合の契約: settle 90ms→150ms＋3回レンダーへ変更して再検証）。シネスコ2.39:1でも1枚確認（1920×803）
- [ ] **Step 5-4: S2検証** — `?demo=1&diag=1` で「高」時に `pagedNumSplats` が旧飽和値(~250万)を有意に超えて増えること（期待: 400万前後）、「中」へ戻すと減ること。低/中のsplat数が修正前と同等（非回帰）
- [ ] **Step 5-5: S3検証** — ロード後アイドルで `[Locahun][Prefetch] 開始/完了` ログ→ 完了後に180°回転して**即座に精細**（体感＋`pagedNumSplats`が回転後ほぼ増えない=常駐済みの証拠）。回転先読み: ドラッグ回転中 `lodQuatOverrideSet=true`、静止で false。録画開始で false 固定
- [ ] **Step 5-6: rotate-to-sharp計測** — プリウォーム無効化条件（ロード直後にすぐ回転）で90°ジャンプ→安定までの時間をp50で記録。**≤0.5s なら合格**、未達なら2B（Sparkワーカープール4→8のvendoringパッチ）を別タスクとして起票・提案
- [ ] **Step 5-7: 非回帰** — 低/中ティアの挙動・録画(枠クロップFHD)・手動画質クリック・PLYシーン(lodScale系がno-op)のスモーク＋スクショ
- [ ] **Step 5-8: push＋メモリ更新**（`project_viewer_quality_governor.md` に S2の値、新メモリ不要なら既存に追記）

---

## Self-Review 済み

- spec S1→Task1 / S2→Task2 / S3→Task3 / S4→Task4+5 / S5(不変条件)→各タスクの「触らないもの」注記でカバー
- プレースホルダなし（全ステップ実コード・実コマンド）。Step 3-3 と 5-3 の分岐は検証結果に応じた確定済み契約
- 型/シンボル整合: `applyQualityTier`の`i`（Task2はガバナーv2の実装内の変数名`i`を前提 — 実装者は挿入位置のスコープで添字変数名を確認し合わせること）、`_splatPerfTier`/`_qualTouchLike`/`_sceneSettledForCalibration` は実在確認済み
