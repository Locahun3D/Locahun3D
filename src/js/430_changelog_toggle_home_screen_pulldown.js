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

