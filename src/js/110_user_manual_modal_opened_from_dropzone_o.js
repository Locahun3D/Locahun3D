// ══════════════════════════════════════════════════
//  USER MANUAL  (modal opened from dropzone or cbar ❓)
// ══════════════════════════════════════════════════
window.openManual = function(){
  const ov = document.getElementById('manual-overlay');
  if(!ov) return;
  ov.style.display = 'block';
  document.body.style.overflow = 'hidden';
  // Reset scroll to top
  const body = document.getElementById('manual-body');
  if(body) body.scrollTop = 0;
  // Wire side-nav anchors so they reliably scroll inside manual-body
  // (default href="#id" jump is unreliable for a nested scroll container under
  // a fixed overlay, so we attach explicit handlers once on first open).
  if(!ov._navWired){
    document.querySelectorAll('#manual-nav .mn-link').forEach(a=>{
      a.addEventListener('click', e=>{
        const href = a.getAttribute('href') || '';
        if(!href.startsWith('#')) return;
        const target = document.getElementById(href.slice(1));
        if(!target || !body) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top
                  - body.getBoundingClientRect().top
                  + body.scrollTop;
        body.scrollTo({top, behavior:'smooth'});
      });
    });
    ov._navWired = true;
  }
};
window.closeManual = function(){
  const ov = document.getElementById('manual-overlay');
  if(!ov) return;
  ov.style.display = 'none';
  document.body.style.overflow = '';
};
// Close on Esc
window.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    const ov = document.getElementById('manual-overlay');
    if(ov && ov.style.display === 'block') closeManual();
  }
});

window.toggleCamTool = function(){
  const wasActive = cam.active;
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

