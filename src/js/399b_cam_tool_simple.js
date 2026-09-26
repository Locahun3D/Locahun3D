// ── カメラツールのシンプル表示（2026-09-26 本人FB） ─────────────────────
// 初回から全項目が出ると初心者に重い。既定はレンズmm・アスペクト比・書き出しの3つだけ。
// 「詳細設定」で従来の全項目（センサー・グリッド・余白・ロール・メタ情報・サルベージ等）を出す。
// 選んだ表示は localStorage に覚える。
(function(){
  Object.assign(I18N.ja,{'cm-simple-capture':'書き出し（JPEG）','cm-mode-pro':'⚙ 詳細設定（プロツール）を開く','cm-mode-simple':'▴ シンプル表示に戻す'});
  Object.assign(I18N.en,{'cm-simple-capture':'Export (JPEG)','cm-mode-pro':'⚙ Open advanced (pro tools)','cm-mode-simple':'▴ Back to simple view'});
  const st=document.createElement('style');
  st.textContent='#cam-panel.cm-simple .cm-pro{display:none!important}#cam-panel:not(.cm-simple) .cm-simple-only{display:none!important}';
  document.head.appendChild(st);
  const panel=document.getElementById('cam-panel');
  if(!panel)return;
  let pro=false;
  try{ pro=localStorage.getItem('l3d.camToolMode')==='pro'; }catch(_){}
  panel.classList.toggle('cm-simple',!pro);
  window.toggleCamToolMode=function(){
    const nowPro=!panel.classList.toggle('cm-simple');
    try{ localStorage.setItem('l3d.camToolMode',nowPro?'pro':'simple'); }catch(_){}
  };
})();
