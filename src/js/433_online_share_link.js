// ══════════════════════════════════════════════════
//  ONLINE: 名前の固定 ＋ 共有URL（2026-09-20 本人指示）
//  ・オンライン版（?protected=1）では左上のスタジオ名を編集させない（物件名は運営が決めるもの）。
//  ・その右に「共有」ボタンを出し、ログイン不要・7日間の共有URLを発行する。発行できるのは最上位プラン（Team）。
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

  // ── 共有ボタン ──
  const params = new URLSearchParams(location.search);
  if(params.get('shared') === '1') return;
  const src = params.get('autoload');
  if(!src) return;
  const nameEl = document.getElementById('tb-project-name');
  if(!nameEl || !nameEl.parentNode) return;

  const btn = document.createElement('button');
  btn.id = 'tb-share-btn'; btn.type = 'button';
  btn.style.cssText = 'margin-left:8px;background:rgba(255,180,84,.08);border:1px solid rgba(255,180,84,.35);color:rgba(255,200,130,.95);border-radius:5px;padding:2px 10px;font-size:.72em;cursor:pointer;white-space:nowrap;min-height:24px';
  const label = () => { btn.textContent = en() ? 'Share link' : '共有URL'; btn.title = en() ? 'Create a 7-day link anyone can open (Team plan)' : '誰でも開ける7日間のURLを発行（Team プランの機能）'; };
  label();
  nameEl.after(btn);

  let panel = null;
  const close = () => { if(panel){ panel.remove(); panel = null; } };
  const show = (html) => {
    close();
    panel = document.createElement('div');
    panel.id = 'tb-share-panel'; panel.setAttribute('role','dialog');
    const r = btn.getBoundingClientRect();
    panel.style.cssText = 'position:fixed;z-index:100000;top:'+(r.bottom+8)+'px;left:'+Math.max(8,Math.min(r.left,innerWidth-348))+'px;width:min(340px,calc(100vw - 16px));background:rgba(26,26,28,.98);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:14px;color:#D8D8D8;font-size:13px;line-height:1.7;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    panel.innerHTML = html;
    document.body.append(panel);
    setTimeout(() => document.addEventListener('pointerdown', function away(e){
      if(panel && !panel.contains(e.target) && e.target !== btn){ close(); document.removeEventListener('pointerdown', away, true); }
    }, true), 0);
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const linkStyle = 'color:#ffb454;text-decoration:underline';

  btn.addEventListener('click', async () => {
    if(panel){ close(); return; }
    btn.disabled = true; btn.textContent = en() ? 'Creating…' : '発行中…';
    let res = null, data = null;
    try{
      res = await fetch('/api/viewer-share', {method:'POST', headers:{'content-type':'application/json'}, credentials:'same-origin', body: JSON.stringify({src})});
      data = await res.json().catch(() => null);
    }catch(_){ res = null; }
    btn.disabled = false; label();
    if(res && res.ok && data && data.url){
      let copied = false;
      try{ await navigator.clipboard.writeText(data.url); copied = true; }catch(_){}
      const until = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString(en() ? 'en-US' : 'ja-JP') : '';
      show('<div style="font-weight:700;margin-bottom:6px">'+(en()?'Share link':'共有URL')+(copied?(en()?' — copied':' — コピーしました'):'')+'</div>'+
        '<input id="tb-share-url" readonly value="'+esc(data.url)+'" style="width:100%;box-sizing:border-box;background:#242426;border:1px solid rgba(255,255,255,.15);border-radius:5px;color:#fff;padding:7px 8px;font-size:12px">'+
        '<div style="margin-top:8px;color:#9a9a9a;font-size:12px">'+(en()?'Anyone with this link can view this scene without signing in'+(until?' until '+esc(until):'')+'.':'このURLを知っている人は、ログインなしでこのシーンを見られます'+(until?'（'+esc(until)+'まで）':'')+'。')+'</div>');
      const inp = document.getElementById('tb-share-url'); if(inp){ inp.focus(); inp.select(); }
      return;
    }
    const code = data && data.error;
    const msg =
      !res ? (en()?'Could not reach the server.':'サーバーに接続できませんでした。') :
      res.status === 401 ? (en()?'Please sign in to create a share link.':'共有URLの発行にはログインが必要です。') :
      code === 'plan_required' ? (en()?'Share links are a Team plan feature. ':'共有URLは最上位の Team プランの機能です。')+'<br><a href="/pricing" target="_blank" rel="noopener" style="'+linkStyle+'">'+(en()?'See plans':'プランを見る')+'</a>' :
      code === 'not_unlocked' ? (en()?'Unlock this scene first, then share it.':'このシーンを視聴（アンロック）してから共有できます。') :
      code === 'not_shareable' ? (en()?'This scene cannot be shared.':'このシーンは共有できない設定です。') :
      (en()?'Could not create the link. Please try again.':'発行できませんでした。時間をおいてもう一度お試しください。');
    show('<div>'+msg+'</div>');
  });
})();
