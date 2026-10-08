// ══════════════════════════════════════════════════
//  ONLINE: 名前の固定 ＋ 共有URL（2026-09-20 本人指示）
//  ・オンライン版（?protected=1）では左上のスタジオ名を編集させない（物件名は運営が決めるもの）。
//  ・その右に「共有」ボタンを出し、ログイン不要・2週間の共有URLを発行する。発行できるのは最上位プラン（Team）。
//    判定と発行はサーバー（POST /api/viewer-share）が行う。ここは結果を見せるだけ。
//  ・共有リンクから入った閲覧者（?shared=1）にはボタンを出さない（再共有させない）。
//  単体配布版（protected でない）では何もしない。
// ══════════════════════════════════════════════════
(function(){
  if(typeof _protected === 'undefined' || !_protected) return;
  const en = () => window._lang === 'en';

  // ── 名前を固定: 編集の入口をふさぎ、入力欄らしい見た目（枠・✎）も外す ──
  const _origEdit = window.startEditProjectName;
  window.startEditProjectName = function(){};
  window.__startEditProjectNameOriginal = _origEdit;   // 診断用。UI からは呼ばれない
  const lockName = () => {
    const el = document.getElementById('tb-project-name');
    if(!el) return;
    el.classList.remove('tb-pn');
    el.onclick = null; el.ondblclick = null; el.removeAttribute('onclick'); el.removeAttribute('ondblclick');
    el.removeAttribute('title');
    el.style.cursor = 'default'; el.style.border = '1px solid transparent'; el.style.background = 'transparent';
    el.style.padding = '2px 4px';
  };
  lockName();

  // 共有URLボタンは 2026-10-08 本人指示で廃止（以前は Team プラン向けに2週間の共有URLを発行していた）。
})();
// タッチ端末ではボタンの押せる範囲を見た目より広げる（2026-10-08 本人指示）。CSS は body.touch-hit button.hit-pad::after。
// 擬似要素をボタンの外へはみ出させるので、position が static のボタンだけ relative にする（見た目は変わらない）。
(function(){
  if(!matchMedia('(pointer:coarse)').matches)return;
  const pad=root=>{
    const list=root.tagName==='BUTTON'?[root]:root.querySelectorAll?root.querySelectorAll('button:not(.hit-pad)'):[];
    for(const b of list){if(b.classList.contains('hit-pad'))continue;if(getComputedStyle(b).position==='static')b.style.position='relative';b.classList.add('hit-pad');}
  };
  const start=()=>{
    document.body.classList.add('touch-hit');pad(document);
    new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)pad(n);}).observe(document.body,{childList:true,subtree:true});
  };
  if(document.body)start();else addEventListener('DOMContentLoaded',start,{once:true});
})();
