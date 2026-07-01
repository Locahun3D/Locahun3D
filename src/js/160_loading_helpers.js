// ══════════════════════════════════════════════════
//  LOADING HELPERS
// ══════════════════════════════════════════════════
function showLd(t) {
  document.getElementById('lt').textContent = t||'読み込み中...';
  document.getElementById('bar').style.width='0%';
  const lp=document.getElementById('lpct'); if(lp){ lp.textContent='0%'; lp.style.display='block'; }
  document.getElementById('lm').textContent='';
  const e=document.getElementById('lerr');e.style.display='none';e.textContent='';
  document.getElementById('lm').style.display='block';
  document.getElementById('ld').classList.remove('hidden');
}
function hideLd()  { document.getElementById('ld').classList.add('hidden'); }
function setBar(p) {
  const v = Math.max(0, Math.min(100, +p || 0));
  document.getElementById('bar').style.width = v + '%';
  const lp = document.getElementById('lpct');
  if(lp) lp.textContent = v.toFixed(0) + '%';
}
function setMsg(m) { document.getElementById('lm').textContent=m; }
function setErr(m) {
  const e=document.getElementById('lerr');e.textContent=m;e.style.display='block';
  document.getElementById('lm').style.display='none';
}
// Read the live layer-panel width and publish it to a CSS variable so
// the cbar (and any other "centre within canvas" UI) can centre against
// the visible canvas area instead of the full viewport. Called whenever
// the panel becomes visible, is resized, or the window resizes.
function _updateLpWidthVar(){
  const panel = document.getElementById('layer-panel');
  if(!panel){
    document.documentElement.style.setProperty('--lp-width', '0px');
    return;
  }
  const visible = panel.classList.contains('visible');
  const w = visible ? (parseInt(window.getComputedStyle(panel).width) || 285) : 0;
  document.documentElement.style.setProperty('--lp-width', w + 'px');
}
window.addEventListener('resize', _updateLpWidthVar);

function showHUD() {
  document.getElementById('hud').style.opacity='1';
  const _hb=document.getElementById('helpbox'); if(_hb) _hb.style.opacity='1';
  document.getElementById('layer-panel').classList.add('visible');
  _updateLpWidthVar();
  const _bac=document.getElementById('btnAddCube'); if(_bac) _bac.style.display='';
  const bsph=document.getElementById('btnAddSphere');
  if(bsph) bsph.style.display='';
  const vtlb=document.getElementById('view-tl-btns');
  if(vtlb) vtlb.style.display='flex';
  // Phone-tier (mobile short-edge < 700 px) gates: multi-camera (Save Pose)
  // and camera-animation are NOT exposed on phones — they need the wider
  // viewport / camera tool to be usable. On phones we still expose the
  // phone-style record button placed left of the AR button.
  const _isPhoneTier = (typeof _splatPerfTier !== 'undefined' && _splatPerfTier === 'phone');
  const _phoneHide = (id, hide) => {
    const el = document.getElementById(id);
    if(el) el.style.display = hide ? 'none' : '';
  };
  _phoneHide('btnSaveCamera', _isPhoneTier);
  // Update-check button is removed on phones (user request 2026-06): file://
  // self-update is a desktop workflow and the button just crowds the narrow
  // top bar. Desktop/tablet keep it.
  _phoneHide('tb-update-btn', _isPhoneTier);
  // Camera animation (🎞) IS now exposed on phones too (user request 2026-06).
  _phoneHide('btnCamAnim',    false);
  // #btnViewRec lives in the cbar now and the cbar's smartphone media query
  // KEEPS it (📷カメラ / ☀日照 / 📐測定 / ⏺録画) on phones, so phones already have
  // a 録画 button down there. The old top-row #btnViewRecPhone mirror therefore
  // became a SECOND identical 録画 button on phones (user noticed "録画ボタンが
  // ふたつある"). De-duplicated 2026-06: keep the top mirror hidden everywhere —
  // the cbar 録画 is the single source. (#btnViewRecPhone stays in the DOM so the
  // recording-state label loop / tooltip refs don't need touching.)
  const _btnViewRecPhone = document.getElementById('btnViewRecPhone');
  if(_btnViewRecPhone) _btnViewRecPhone.style.display = 'none';
}
let _hideDzTimer=null;
function hideDZ()  {
  const d=document.getElementById('dz');
  d.classList.add('fade');
  clearTimeout(_hideDzTimer);
  _hideDzTimer=setTimeout(()=>{ d.style.display='none'; _hideDzTimer=null; },500);
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

