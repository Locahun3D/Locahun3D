// ══════════════════════════════════════════════════
//  CAMERA TOOL の開閉 ＋ 画面まわりのレイアウト補正
//
//  （元はユーザーマニュアルのモーダルもここにあったが、開く導線だった
//    下部ツールバーの「使い方」ボタンごと削除した — user 2026-08-27。）
// ══════════════════════════════════════════════════
//  スマホ縦のように「レイヤーパネル〜カメラパネルの間」が元々狭い端末では、
//  日照パネルとカメラパネルが同時に開くと画面が埋まって操作できない
//  — user 2026-08-14「日照時にカメラ機能が起動するとスマホだと狭くなりすぎる」。
//  PC / タブレットは従来どおり併用できる（2026-06 の設計: 日照は closeAllPanels
//  の対象外で、カメラと同時に触れるのが利点）。ここで排他にするのは狭い端末だけ。
window._isNarrowPhoneUI = function(){
  try{
    return window.matchMedia('(pointer:coarse) and (any-hover:none)').matches
        && window.innerWidth <= 600;
  }catch(_){ return false; }
};
window.toggleCamTool = function(){
  const wasActive = cam.active;
  // 狭い端末では日照とカメラを併用しない（開く側が相手を閉じる）
  if(!wasActive && window._isNarrowPhoneUI() &&
     typeof sun !== 'undefined' && sun && sun.active &&
     typeof window.toggleSunMode === 'function'){
    try{ window.toggleSunMode(); }catch(_){}
  }
  // Mutual-exclusion: opening カメラ closes 測定 / 環境 / マップ / 画質, but KEEPS
  // the カメラアニメ panel open so the user can add path keys that capture this
  // camera's framing (user request 2026-06). closeAllPanels also closes the
  // camera panel itself, so we read the pre-close state and then flip from there.
  if(!wasActive) closeAllPanels({ keepCamAnim: true });
  cam.active = !wasActive;
  const btn  = document.getElementById('btnCamTool');
  const hud  = document.getElementById('cam-hud');
  const pan  = document.getElementById('cam-panel');
  const tint = document.getElementById('cam-wb-tint');
  // ショット情報 is now embedded inside #cam-panel — its visibility follows
  // the panel automatically, no separate show/hide needed.
  document.body.classList.toggle('cam-active', cam.active);
  if(cam.active){
    cam.prevFOV = fov;
    btn.classList.add('on');
    hud.style.display = 'block';
    pan.style.display = 'block';
    _camPushFields();
    document.getElementById('cm-sensor').value = cam.sensor;
    setCamAspect(cam.aspect);
    // Sync grid button .on classes for the (multi-select) active grids
    document.querySelectorAll('#cam-panel .cm-grid-btn').forEach(b=>{
      const k = b.dataset.g;
      if(k === 'off') b.classList.toggle('on', cam.grids.size === 0);
      else            b.classList.toggle('on', cam.grids.has(k));
    });
    document.getElementById('cm-grid-custom-row').style.display =
      cam.grids.has('custom') ? 'flex' : 'none';
    drawCamGrid();
    applyCamSettings();
    _wireSalvageZone();
  } else {
    btn.classList.remove('on');
    hud.style.display = 'none';
    pan.style.display = 'none';
    if(tint) tint.style.display = 'none';
    if(typeof _camHideLetterbox === 'function') _camHideLetterbox();
    fov = cam.prevFOV;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    _applyRenderPixelRatio();   // revert the camera-zoom supersampling
    markDirty(4);
  }
  // 日照パネルの位置をカメラ状態に追従（起動中=中央下 / それ以外=右下）
  if(typeof _sunUpdatePanelPos === 'function') _sunUpdatePanelPos();
  // If the カメラアニメ panel is open alongside, re-tuck it left of / back from
  // the camera panel as the tool opens/closes.
  if(typeof _camAnimReposition === 'function') _camAnimReposition();
  // Re-centre cbar / top buttons between the left controls and the right cam panel
  // (or clear the vars when closing). setTimeout (not rAF) so it runs reliably AND
  // after the panel's layout has settled — works for both open and close.
  setTimeout(()=>{ if(window._layoutCamMode) window._layoutCamMode(); }, 30);
};

window.addEventListener('resize', ()=>{ if(cam.active){ layoutCamFrame(); if(window._layoutCamMode) window._layoutCamMode(); } });
window.addEventListener('orientationchange', ()=>{ setTimeout(()=>{ if(cam.active){ layoutCamFrame(); if(window._layoutCamMode) window._layoutCamMode(); } }, 220); });

// Re-centre the bottom (cbar) + top (#view-tl-btns) button groups into the free
// space BETWEEN the left controls (joystick if shown, else layer panel) and the
// right カメラツール panel while camera mode is open. Sets px CSS vars consumed by
// the `body.cam-active` rules. user 2026-06-27 (E/F: buttons hid behind / weren't
// centred relative to the right panel on iPad / phone portrait).
function _layoutCamMode(){
  const root = document.documentElement;
  const pan = document.getElementById('cam-panel');
  const open = document.body.classList.contains('cam-active') && pan && getComputedStyle(pan).display!=='none';
  if(!open){
    root.style.removeProperty('--cam-cbar-left');
    root.style.removeProperty('--cam-top-left');
    root.style.removeProperty('--cam-top-maxw');
    document.body.classList.remove('cam-cramped');
    // カメラモード中は _layoutTopRow が手を出さない約束なので、抜けた直後に
    // 上部帯を置き直す（そうしないとカメラを閉じたあと中央寄せのままになり、
    // 狭い画面でシーンレイヤーパネルに食い込む）。
    setTimeout(()=>{ try{ _layoutTopRow(); }catch(_){} }, 0);
    return;
  }
  const panLeft = pan.getBoundingClientRect().left;   // right edge of the free zone
  let leftBound = 0;
  const joy = document.getElementById('joy');
  if(joy && getComputedStyle(joy).display!=='none'){
    const jr = joy.getBoundingClientRect().right;
    const jv = document.getElementById('joy-vert');
    const jvr = (jv && getComputedStyle(jv).display!=='none') ? jv.getBoundingClientRect().right : jr;
    leftBound = Math.max(jr, jvr);
  } else {
    const lp = document.getElementById('layer-panel');
    if(lp && getComputedStyle(lp).display!=='none') leftBound = lp.getBoundingClientRect().right;
  }
  const center = Math.round((leftBound + panLeft) / 2);
  const room = panLeft - leftBound;
  const cramped = room < 150;
  const freeW = Math.max(80, Math.round(room - 12));
  // 余白が狭い（スマホ）とき、下部cbar(=カメラ終了ボタン)はジョイスティックの真上へ寄せる(青枠の位置)。
  let cbarLeft = center;
  if(cramped && joy && getComputedStyle(joy).display!=='none'){
    const jb = joy.getBoundingClientRect();
    cbarLeft = Math.round(jb.left + jb.width / 2);
  }
  root.style.setProperty('--cam-cbar-left', cbarLeft+'px');
  root.style.setProperty('--cam-top-left', center+'px');
  root.style.setProperty('--cam-top-maxw', freeW+'px');
  // 自由ゾーンが狭すぎる（スマホ縦など）と上部ボタンがパネルに重なるので、その時は隠す。
  document.body.classList.toggle('cam-cramped', cramped);
}
window._layoutCamMode = _layoutCamMode;   // exposed for resize hooks / debugging

// ── 上部ボタン行 × シーンレイヤーパネルの重なり回避 ──────────────
//  #view-tl-btns は「ビューポートの中央」に置くのが本人の指示（レイヤーパネルの
//  幅に追従させない）。ただし画面が狭いと、中央寄せのままでは行の左端が左端
//  固定のレイヤーパネル(0〜285px, 全高)へ食い込む（user 2026-08-27 報告。
//  例: 幅820px で行 151〜669 とパネル 0〜285 が 134px 重なる）。
//  そこで「重なる時だけ」パネルの右の空きへ寄せる。広い画面では従来どおり
//  ビューポート中央のまま＝挙動は変わらない。
function _layoutTopRow(){
  const row = document.getElementById('view-tl-btns');
  if(!row) return;
  // カメラモード中は _layoutCamMode() が --cam-top-left で位置を持つので触らない。
  if(document.body.classList.contains('cam-active')) return;
  if(getComputedStyle(row).display === 'none') return;
  // 素の（折返し無しの）幅を測る
  row.style.maxWidth = '';
  row.style.flexWrap = '';
  const GAP = 10;
  const vw = innerWidth;
  const rr = row.getBoundingClientRect();
  const w = rr.width;
  let wall = 0;                       // 行の高さ帯を塞ぐ左側の壁の右端
  const lp = document.getElementById('layer-panel');
  if(lp && getComputedStyle(lp).display !== 'none'){
    const lr = lp.getBoundingClientRect();
    if(lr.bottom > rr.top && lr.top < rr.bottom) wall = lr.right;
  }
  const free = vw - wall - GAP * 2;   // パネル右〜画面右端の空き
  if(wall <= 0 || vw / 2 - w / 2 >= wall + GAP){
    // 重ならない → 従来どおりビューポート中央
    row.style.left = '50%';
    return;
  }
  if(w <= free){
    // 1行のまま、空きの中央へ寄せる
    row.style.left = Math.round(wall + GAP + free / 2) + 'px';
    return;
  }
  // 1行では入らない → 空きいっぱいに折り返す
  row.style.maxWidth = Math.max(140, free) + 'px';
  row.style.flexWrap = 'wrap';
  row.style.left = Math.round(wall + GAP + Math.max(140, free) / 2) + 'px';
}
window._layoutTopRow = _layoutTopRow;
addEventListener('resize', _layoutTopRow);
addEventListener('orientationchange', ()=> setTimeout(_layoutTopRow, 250));
// パネルの開閉・リサイズ・言語切替でも行幅／壁が変わるので、クリック後に追従。
document.addEventListener('click', ()=> setTimeout(_layoutTopRow, 40), true);
setTimeout(_layoutTopRow, 500);
setTimeout(_layoutTopRow, 1500);

// スマホ: 日照/測定/カメラワーク パネルの top を「上UI(上部ボタン行)の下端」から決めて
// かぶらないようにする。上ボタンが隠れている(cam-cramped等)ときはトップバー直下に置く。
// 上ボタン行は折返しで1〜2行になるので、実測した bottom を使う（user 2026-06-28）。
function _mPanelTop(){
  const root = document.documentElement;
  if(!matchMedia('(pointer:coarse) and (any-hover:none)').matches){ root.style.removeProperty('--m-panel-top'); return; }
  let topPx = 53;   // 上ボタンが無いとき＝トップバー(45px)直下
  const tl = document.getElementById('view-tl-btns');
  if(tl && getComputedStyle(tl).display!=='none'){
    const r = tl.getBoundingClientRect();
    if(r.height > 0) topPx = Math.round(r.bottom + 8);
  }
  root.style.setProperty('--m-panel-top', topPx + 'px');
}
window._mPanelTop = _mPanelTop;
window.addEventListener('resize', _mPanelTop);
window.addEventListener('orientationchange', ()=>setTimeout(_mPanelTop, 250));
// パネルを開くタップの直後に再計算（どのツールボタンでも拾えるよう全クリックで・軽量）。
document.addEventListener('click', ()=>setTimeout(_mPanelTop, 30), true);
setTimeout(_mPanelTop, 400);   // 初期化

