// ══════════════════════════════════════════════════
//  UI 重なり検査ハーネス（ブラウザに貼って使う / 手動）
//
//  目的:
//    ① ?showcase=1 の案内チップ (#sc-chip) が既存UIと交差していないこと
//    ② 上部ボタン帯 (#view-tl-btns) × シーンレイヤーパネル (#layer-panel) が
//       交差していないこと（2026-08-27 本人報告の恒久チェック）
//    ③ カメラツールパネル上端の空白帯・折りたたみ既定・撤去済みUIの不在
//
//  使い方（実 Chrome / ローカル Range サーバー + デモシーン）:
//    1) http://127.0.0.1:8912/Locahun3D_OfflineViewer.html?showcase=1 を開く
//    2) DevTools コンソールにこのファイルを丸ごと貼る
//    3) await __full()  → 1 構成ぶんの結果が返る
//       jaHits / enHits が全部 0、topRowOverlapsPanel:false、
//       camPanelTopGap <= 8 なら合格。
//    4) 幅を変えて 1) からやり直す。最低マトリクス:
//       1440x900 / 900x1440 / 820x1180 / 1180x820 / 390x844 / 767x390
//       （390px 級はブラウザのデバイスエミュレーションで pointer:coarse に
//         しないと本番のモバイルCSSが発火しない）
// ══════════════════════════════════════════════════

window.__scAudit = function(){
  const chip = document.getElementById('sc-chip');
  if(!chip) return {error:'no chip'};
  const cr = chip.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  const vis = (el)=>{
    if(typeof el.checkVisibility === 'function'){
      if(!el.checkVisibility({opacityProperty:true, visibilityProperty:true, contentVisibilityAuto:true})) return false;
    }
    const cs = getComputedStyle(el);
    if(cs.display === 'none' || cs.visibility === 'hidden') return false;
    if(parseFloat(cs.opacity || '1') < 0.05) return false;
    return true;
  };
  const hit = (a,b)=> !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  const desc = (el)=> (el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') +
                       (el.className && typeof el.className === 'string' && el.className.trim()
                         ? '.'+el.className.trim().split(/\s+/).slice(0,2).join('.') : ''));
  const out = [];
  const seenSelf = new Set();
  for(const el of document.body.querySelectorAll('*')){
    if(el === chip || chip.contains(el)) continue;
    const cs = getComputedStyle(el);
    if(cs.pointerEvents === 'none') continue;
    const pos = cs.position;
    if(pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') continue;
    if(!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if(r.width < 2 || r.height < 2) continue;
    if(r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    if(r.width * r.height > vw * vh * 0.7) continue;   // backdrop, not a widget
    if(!hit(cr, r)) continue;
    // report the outermost offender only
    let covered = false;
    for(const p of out){ if(p.el.contains(el)) { covered = true; break; } }
    if(covered) continue;
    out.push({el, sel:desc(el), rect:{l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)}});
  }
  return {
    vw, vh,
    chip:{l:Math.round(cr.left), t:Math.round(cr.top), r:Math.round(cr.right), b:Math.round(cr.bottom),
          w:Math.round(cr.width), h:Math.round(cr.height)},
    text: chip.innerText.replace(/\n/g, ' | '),
    onscreen: cr.left >= -0.5 && cr.top >= -0.5 && cr.right <= vw + 0.5 && cr.bottom <= vh + 0.5,
    hits: out.map(o=>({sel:o.sel, rect:o.rect})),
  };
};
'audit installed';

window.__scStates = async function(){
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  const res = [];
  const snap = async (name)=>{ await sleep(900); const a = window.__scAudit(); a.state = name; res.push(a); };
  const lp = ()=> document.getElementById('layer-panel');
  const closeAll = ()=>{ try{ if(typeof closeAllPanels==='function') closeAllPanels(); }catch(_){}};

  closeAll(); await snap('baseline');
  try{ if(lp() && lp().classList.contains('collapsed')) window.toggleLayerPanelCollapse(); }catch(_){}
  await snap('layer-panel-open');
  try{ window.toggleSunMode(); }catch(_){}
  await snap('sun-panel');
  try{ window.toggleSunMode(); }catch(_){}
  try{ window.toggleCamTool(); }catch(_){}
  await snap('cam-tool');
  try{ window.toggleCamTool(); }catch(_){}
  try{ window.toggleMeasure(); }catch(_){}
  await snap('measure');
  try{ window.toggleMeasure(); }catch(_){}
  closeAll();
  try{ if(lp() && lp().classList.contains('collapsed')) window.toggleLayerPanelCollapse(); }catch(_){}
  try{ window.toggleCamTool(); }catch(_){}
  await snap('layer+cam-both');
  try{ window.toggleCamTool(); }catch(_){}
  return res;
};

// ── UI 構造チェック（ツアーとは無関係の常時表示バグ用） ──
window.__uiCheck = async function(){
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  const R = (el)=>{ if(!el) return null; const r = el.getBoundingClientRect();
    return {l:Math.round(r.left), t:Math.round(r.top), r:Math.round(r.right), b:Math.round(r.bottom),
            w:Math.round(r.width), h:Math.round(r.height)}; };
  const vis = (el)=> !!el && getComputedStyle(el).display !== 'none' &&
                     (typeof el.checkVisibility !== 'function' || el.checkVisibility({opacityProperty:true, visibilityProperty:true}));
  const hit = (a,b)=> !!a && !!b && !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
  const out = {vw:innerWidth, vh:innerHeight};

  // 0) 直前の検査で開きっぱなしのモードを畳んでから測る（cam-active のままだと
  //    cbar の left が --cam-cbar-left に上書きされ、素の中央位置を測れない）。
  try{ if(document.body.classList.contains('cam-active')) window.toggleCamTool(); }catch(_){}
  try{ if(document.body.classList.contains('sun-active')) window.toggleSunMode(); }catch(_){}
  try{ if(document.body.classList.contains('msr-active')) window.toggleMeasure(); }catch(_){}
  await sleep(600);

  // 1) 上部帯 × シーンレイヤーパネル
  const row = document.getElementById('view-tl-btns');
  const pan = document.getElementById('layer-panel');
  out.topRow = R(row); out.layerPanel = R(pan);
  out.topRowVisible = vis(row); out.layerPanelVisible = vis(pan);
  out.topRowOverlapsPanel = (out.topRowVisible && out.layerPanelVisible) ? hit(out.topRow, out.layerPanel) : false;
  out.topRowInViewport = !out.topRow || (out.topRow.l >= -0.5 && out.topRow.r <= innerWidth + 0.5);

  // 2) 「使い方」ボタンとマニュアルモーダルが消えていること
  out.helpBtn = !!document.getElementById('btnHelp');
  out.manualOverlay = !!document.getElementById('manual-overlay');
  out.openManual = typeof window.openManual;

  // 3) 画質パネル: 折りたたみ既定＋開閉
  try{ if(typeof closeAllPanels==='function') closeAllPanels(); }catch(_){}
  try{ window.toggleQualityPanel(); }catch(_){}
  await sleep(400);
  const fold = (k)=>{ const e = document.getElementById(k+'-fold'); return e ? getComputedStyle(e).display : 'missing'; };
  out.perfFoldDefault = fold('qp-perf');
  out.initFoldDefault = fold('qp-init');
  try{ window.toggleQpFold('qp-perf'); window.toggleQpFold('qp-init'); }catch(_){}
  await sleep(250);
  out.perfFoldOpen = fold('qp-perf');
  out.initFoldOpen = fold('qp-init');
  out.qualityPanelRect = R(document.getElementById('quality-panel'));
  out.qualityPanelInViewport = !out.qualityPanelRect ||
    (out.qualityPanelRect.l >= -0.5 && out.qualityPanelRect.r <= innerWidth + 0.5 && out.qualityPanelRect.t >= -0.5);
  try{ window.toggleQpFold('qp-perf'); window.toggleQpFold('qp-init'); }catch(_){}
  try{ window.toggleQualityPanel(); }catch(_){}

  // 4) カメラツールパネル: 上端の隙間 / 黄金グリッド撤去
  try{ window.toggleCamTool(); }catch(_){}
  await sleep(500);
  const cp = document.getElementById('cam-panel');
  const tb = document.getElementById('topbar');
  out.camPanel = R(cp);
  out.topbar = R(tb);
  out.camPanelPadTop = cp ? getComputedStyle(cp).paddingTop : null;
  out.camPanelFirstChild = cp ? R(cp.firstElementChild) : null;
  out.camPanelHeadText = cp && cp.firstElementChild ? cp.firstElementChild.innerText.trim().slice(0,20) : null;
  out.camPanelTopGap = (out.camPanel && out.topbar) ? out.camPanel.t - out.topbar.b : null;
  out.camPanelHeadGap = (out.camPanel && out.camPanelFirstChild) ? out.camPanelFirstChild.t - out.camPanel.t : null;
  out.goldenGridBtn = !!document.getElementById('ct-grid-golden');
  out.gridBtns = [...document.querySelectorAll('#cam-panel .cm-grid-btn')].map(b=>b.dataset.g);
  try{ window.toggleCamTool(); }catch(_){}

  // 5) カメラワークパネル: 焼き込み / 4K のチェックが消えていること
  try{ if(typeof window.toggleCamAnimPanel==='function') window.toggleCamAnimPanel(); }catch(_){}
  await sleep(400);
  out.caBurnin = !!document.getElementById('ca-burnin-grid');
  out.ca4k = !!document.getElementById('ca-export-4k');
  out.caHideOverlays = !!document.getElementById('ca-hide-overlays');
  try{ if(typeof window.toggleCamAnimPanel==='function') window.toggleCamAnimPanel(); }catch(_){}

  // 6) オブジェクト追加がレイヤーパネル見出しにあり、開いたメニューが画面内
  const ob = document.getElementById('btnAddCubeTop');
  out.objBtnInLayerHead = !!(ob && ob.closest('.lp-head'));
  out.objBtnInTopRow = !!(ob && ob.closest('#view-tl-btns'));
  out.objBtnVisible = vis(ob);
  if(ob && vis(ob)){
    try{ window.toggleObjTypeMenuTop(ob); }catch(_){}
    await sleep(200);
    const menu = document.getElementById('obj-type-menu-top');
    out.objMenu = R(menu);
    out.objMenuInViewport = !!out.objMenu && out.objMenu.l >= -0.5 && out.objMenu.r <= innerWidth + 0.5 &&
                            out.objMenu.t >= -0.5 && out.objMenu.b <= innerHeight + 0.5;
    out.objMenuItems = menu ? menu.querySelectorAll('button').length : 0;
    try{ window.closeObjTypeMenuTop(); }catch(_){}
  }
  // 7) 下部ツールバーの並び
  out.cbarButtons = [...document.querySelectorAll('#hud .cbar > button')]
    .filter(b=>getComputedStyle(b).display !== 'none')
    .map(b=>({id:b.id, txt:b.innerText.replace(/\s+/g,' ').trim()}));
  return out;
};
'states installed';

window.__full = async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={vw:innerWidth, vh:innerHeight};
  const a0=window.__scAudit();
  out.dock=a0.chip; out.mode=window.__scTour?window.__scTour.mode():null;
  out.pick=window.__scTour?window.__scTour.pick():null;
  out.jaHits=(await window.__scStates()).map(x=>x.hits.length);
  window.toggleLang(); await sleep(700);
  out.enDock=window.__scAudit().chip;
  out.enHits=(await window.__scStates()).map(x=>x.hits.length);
  window.toggleLang(); await sleep(500);
  const u=await window.__uiCheck();
  out.topRowOverlapsPanel=u.topRowOverlapsPanel;
  out.topRowInViewport=u.topRowInViewport;
  out.camPanelTopGap=u.camPanelTopGap;
  out.perfFold=[u.perfFoldDefault,u.perfFoldOpen];
  out.initFold=[u.initFoldDefault,u.initFoldOpen];
  out.golden=u.goldenGridBtn; out.help=u.helpBtn; out.manual=u.manualOverlay;
  out.caBurnin=u.caBurnin; out.ca4k=u.ca4k; out.caHide=u.caHideOverlays;
  out.objInHead=u.objBtnInLayerHead; out.objMenuInViewport=u.objMenuInViewport;
  out.cbar=u.cbarButtons.map(b=>b.id);
  out.lpHeadH=(()=>{const h=document.querySelector('.lp-head');return h?Math.round(h.getBoundingClientRect().height):null;})();
  return out;
};

window.__run = function(){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  window.__res='pending';
  (async()=>{ for(let i=0;i<300;i++){ if(window.__scTour && window.__scTour.pick()) break; await sleep(200);} await sleep(800);
    try{ window.__res = await window.__full(); }catch(e){ window.__res={err:String(e)}; } })();
  return 'started';
};
