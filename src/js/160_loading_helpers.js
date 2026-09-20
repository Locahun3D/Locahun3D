// ══════════════════════════════════════════════════
//  LOADING HELPERS
// ══════════════════════════════════════════════════
// 通し進捗（2026-09-20 本人指示「5%から一気に進むのを直す」）。
// ダウンロード→ZIP展開→3DGS構築の各段がそれぞれ showLd()/setBar(5) でやり直すため、バーが
// 低い値に戻っては跳ぶ動きになっていた。表示値は戻さず、値が下がったら「次の段が始まった」とみなして
// 残りの幅へ割り付ける。段の途中で止まって見えないよう、少しずつ前へにじませる。
const _ld={shown:0,base:0,rawStart:0,lastRaw:0,realAt:0,timer:null};
function _ldPaint(){
  const v=Math.max(0,Math.min(100,_ld.shown));
  document.getElementById('bar').style.width=v+'%';
  const lp=document.getElementById('lpct');if(lp)lp.textContent=Math.floor(v)+'%';
}
function _ldGuide(){
  // 読み込み中は操作方法を見せる（ファイル名は出さない）。端末ごとに内容を変える。
  const touch=typeof isMobile!=='undefined'&&isMobile,en=typeof _en==='function'&&_en();
  const rows=touch
    ?(en?[['Move','Tap a spot to go there'],['Pick a spot','Press and hold, slide, release'],['Look','Drag with one finger'],['Walk','Bottom-left stick']]
        :[['移動方法','タッチでその場所に移動'],['移動先を選ぶ','長押しして玉を動かし、離す'],['見回す','1本指でドラッグ'],['歩く','左下のスティック']])
    :(en?[['Move','Click a spot to go there'],['Pick a spot','Hold left button, move, release'],['Look','Right-drag'],['Fly','W A S D / Q E, Shift = fast']]
        :[['移動方法','クリックでその場所に移動'],['移動先を選ぶ','左ボタン長押しで玉を動かし、離す'],['見回す','右ドラッグ'],['キー移動','W A S D ／ Q E（Shiftで高速）']]);
  const lt=document.getElementById('lt');lt.replaceChildren();lt.classList.add('ld-guide');
  for(const [k,v] of rows){
    const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('span');
    a.className='k';a.textContent=k;b.className='v';b.textContent=v;row.append(a,b);lt.append(row);
  }
}
function showLd(t) {
  _ldGuide();
  const fresh=document.getElementById('ld').classList.contains('hidden');
  if(fresh){_ld.shown=0;_ld.base=0;_ld.rawStart=0;_ld.lastRaw=0;_ld.realAt=performance.now();_ldPaint();}
  if(!_ld.timer)_ld.timer=setInterval(()=>{
    if(document.getElementById('ld').classList.contains('hidden')){clearInterval(_ld.timer);_ld.timer=null;return;}
    // 実進捗が来ない間も、次の節目の手前まではゆっくり進める（止まって見せない・追い越さない）
    const ceiling=Math.min(97,_ld.shown+(100-_ld.shown)*.25);
    if(performance.now()-_ld.realAt>300&&_ld.shown<ceiling){_ld.shown+=Math.max(.02,(ceiling-_ld.shown)*.01);_ldPaint();}
  },120);
  const lp=document.getElementById('lpct'); if(lp) lp.style.display='block';
  document.getElementById('lm').textContent=(typeof t==='string'&&!/^読み込み中[:：]/.test(t))?t:'';
  const e=document.getElementById('lerr');e.style.display='none';e.textContent='';
  document.getElementById('lm').style.display='block';
  document.getElementById('ld').classList.remove('hidden');
}
function hideLd()  { document.getElementById('ld').classList.add('hidden'); }
function setBar(p) {
  const raw = Math.max(0, Math.min(100, +p || 0));
  if(raw < _ld.lastRaw - .5){ _ld.base = _ld.shown; _ld.rawStart = raw; }   // 次の段が始まった
  _ld.lastRaw = raw;
  const span = Math.max(1, 100 - _ld.rawStart);
  const mapped = _ld.base + (raw - _ld.rawStart) / span * (100 - _ld.base);
  if(mapped > _ld.shown){ _ld.shown = mapped; _ld.realAt = performance.now(); }
  _ldPaint();
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
  // 折りたたみ中（.collapsed）はヘッダーの帯（高さ ~35px）だけになり、キャンバス
  // 下部は全幅使える。ここを見ずに .visible だけで判定していたため、畳んでいても
  // cbar がパネル幅の半分（285/2 ≈ 143px）だけ右へずれていた — user 2026-08-14。
  const visible = panel.classList.contains('visible')
               && !panel.classList.contains('collapsed');
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
  _phoneHide('btnSaveCamera', _isPhoneTier && !(typeof _isIPad!=='undefined' && _isIPad));
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
