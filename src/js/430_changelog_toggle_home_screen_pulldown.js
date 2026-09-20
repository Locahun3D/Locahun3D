// ══════════════════════════════════════════════════
//  CHANGELOG TOGGLE (home screen pulldown)
// ══════════════════════════════════════════════════
window.toggleChangelog = function(){
  const wrap = document.getElementById('dz-changelog');
  const body = document.getElementById('dz-changelog-body');
  const head = wrap && wrap.querySelector('.dz-changelog-head');
  if(!wrap || !body || !head) return;
  const open = wrap.classList.toggle('open');
  body.hidden = !open;
  head.setAttribute('aria-expanded', String(open));
};

if(_protected){
  window.saveProjectZip = ()=>{ showUndoToast((window._lang==='en'?'Saving is not available in online view mode':'オンライン閲覧モードではデータ保存できません')); };
  window.exportSplat    = ()=>{ showUndoToast((window._lang==='en'?'Saving is not available in online view mode':'オンライン閲覧モードではデータ保存できません')); };
  // JSON保存(saveProject)も splat/モデルの生バッファを base64 で丸ごと埋め込むため、
  // ZIP保存・3DGSエクスポートと同様に閲覧専用モードでは塞ぐ(データ流出防止)。
  window.saveProject    = ()=>{ showUndoToast((window._lang==='en'?'Saving is not available in online view mode':'オンライン閲覧モードではデータ保存できません')); };
}

// ── 2026-09-20: デモシーンもオンライン版(?protected=1)と同じ扱い ──
// デモシーン(交差点)がシーンに居る間は ZIP保存・3DGSエクスポート・JSON保存を塞ぐ。
// 判定は URL ではなくレイヤー(_streamUrl===DEMO_SCENE_URL)で行うので、ホーム画面の
// デモボタンから入っても効き、デモを外して別ファイルを読めば通常動作に戻る。
// Ctrl+S・エクスポートモーダル・トップバーは全て window.saveProjectZip 等を
// 経由するため、ここ1箇所のガードで全経路を塞げる。
(function(){
  if(_protected) return; // オンライン版は上で既に塞いである
  const urlDemo = /[?&]demo=1/.test(location.search);
  const isDemo = ()=>{
    if(typeof DEMO_SCENE_URL==='undefined' || !DEMO_SCENE_URL || typeof layers==='undefined') return false;
    if(layers.some(l=>l && l._streamUrl===DEMO_SCENE_URL)) return true;
    // ?demo=1 で起動してまだ何も載っていない間(読込中)も塞いでおく
    return urlDemo && layers.length===0;
  };
  const sync = ()=>{ const on=isDemo(); document.body.classList.toggle('demo-mode', on); return on; };
  window._isDemoSceneActive = isDemo;
  window._syncDemoMode = sync;
  const msg = ()=>showUndoToast(window._lang==='en'?'Saving is not available for the demo scene':'デモシーンではデータ保存できません');
  ['saveProjectZip','exportSplat','saveProject'].forEach(k=>{
    const orig = window[k];
    if(typeof orig!=='function') return;
    window[k] = function(...a){ if(sync()){ msg(); return; } return orig.apply(this,a); };
  });
  // レイヤーの増減は必ず renderLayerList を通るので、そこで body クラスを同期する
  if(typeof renderLayerList==='function'){
    const _rll = renderLayerList;
    renderLayerList = function(...a){ const r=_rll.apply(this,a); try{ sync(); }catch(_){ } return r; };
  }
  sync();
})();
