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

// ══════════════════════════════════════════════════
//  UPDATE CHECK + INTEGRITY VERIFICATION
//  Fetches a version manifest (JSON) from GitHub Pages and compares to CURRENT_VERSION.
//  Manifest format:
//    { "version":"0.0.2", "url":"...", "sha256":"<hex>", "notes":"..." }
// ══════════════════════════════════════════════════
const CURRENT_VERSION    = '0.2.0-beta';
const UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/nakamurakou1108/Locahun3D/main/version.json';

// Hard-coded fallback used when the manifest's redirect URL fails origin
// validation (compromised manifest mitigation). Always points to the project's
// public releases page on github.com.
const RELEASES_FALLBACK_URL =
  'https://github.com/nakamurakou1108/Locahun3D/releases';

// Allowlist of origins we will follow from the manifest's "url" field.
// If the manifest "url" is absent or fails this check we fall back to
// RELEASES_FALLBACK_URL — this prevents a tampered manifest from redirecting
// users to phishing pages.
const TRUSTED_UPDATE_HOST_PATTERNS = [
  /^github\.com$/i,
  /^[A-Za-z0-9_.-]+\.github\.io$/i,
  /^raw\.githubusercontent\.com$/i,
];
function _isTrustedUpdateUrl(u){
  try{
    const parsed = new URL(u);
    if(parsed.protocol !== 'https:') return false;
    return TRUSTED_UPDATE_HOST_PATTERNS.some(rx=>rx.test(parsed.host));
  } catch(_e){ return false; }
}

let _updateState = {
  status:'idle', latest:null, url:null, notes:null,
  expectedHash:null, integrity:null, urlTrusted:null
};

// Compare two semver-ish strings. Returns -1 / 0 / 1 (a < b / == / >).
// Handles pre-release tags ("0.0.2" > "0.0.2-alpha.1" > "0.0.1").
function _compareVersions(a, b){
  const parse = v=>{
    const [core, pre=''] = String(v).replace(/^v\s*/i,'').trim().split('-',2);
    const nums = core.split('.').map(n=>parseInt(n,10)||0);
    while(nums.length<3) nums.push(0);
    return { nums, pre };
  };
  const A=parse(a), B=parse(b);
  for(let i=0;i<3;i++){
    if(A.nums[i] !== B.nums[i]) return A.nums[i] < B.nums[i] ? -1 : 1;
  }
  if(A.pre === B.pre) return 0;
  if(!A.pre) return  1;   // release > prerelease
  if(!B.pre) return -1;
  return A.pre < B.pre ? -1 : 1;
}

function _setUpdateBtn(state){
  const btn = document.getElementById('tb-update-btn');
  const lbl = document.getElementById('tb-update-lbl');
  if(!btn || !lbl) return;
  btn.classList.remove('is-latest','has-update','is-checking','is-offline');
  switch(state){
    case 'checking':
      btn.classList.add('is-checking');
      lbl.textContent = T('tb-update-checking');
      btn.title = T('tb-update-checking');
      break;
    case 'latest':
      btn.classList.add('is-latest');
      lbl.textContent = T('tb-update-latest');
      btn.title = T('tt-update-latest');
      break;
    case 'available':
      btn.classList.add('has-update');
      lbl.textContent = T('tb-update-new');
      btn.title = (T('tt-update-new')||'') +
        (_updateState.latest ? ' → v ' + _updateState.latest : '');
      break;
    case 'offline':
      btn.classList.add('is-offline');
      lbl.textContent = T('tb-update-offline');
      btn.title = T('tt-update-offline');
      break;
    default:
      lbl.textContent = T('tb-update-check');
      btn.title = T('tt-update-check');
  }
}

// SHA-256 of the page bundle vs. the manifest "sha256" field.
// Returns: true = match, false = mismatch, null = could not check.
async function _verifyPageIntegrity(expectedHex){
  try{
    if(!expectedHex) return null;
    if(!/^[A-Fa-f0-9]{64}$/.test(String(expectedHex).trim())) return null;
    if(!location.href || !location.href.startsWith('http')) return null;
    if(typeof crypto === 'undefined' || !crypto.subtle) return null;
    const res = await fetch(location.href, {cache:'no-store'});
    if(!res.ok) return null;
    const buf = await res.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const hex = Array.from(new Uint8Array(hash))
      .map(b=>b.toString(16).padStart(2,'0')).join('');
    return hex.toLowerCase() === String(expectedHex).trim().toLowerCase();
  } catch(_e){ return null; }
}

function _setIntegrityIndicator(){
  const el = document.getElementById('tb-integrity');
  if(!el) return;
  const v = _updateState.integrity;
  el.classList.remove('ok','bad','unknown');
  if(v === true){
    el.hidden = false;
    el.textContent = '✓';
    el.classList.add('ok');
    el.title = T('tt-integrity-ok');
  } else if(v === false){
    el.hidden = false;
    el.textContent = '⚠';
    el.classList.add('bad');
    el.title = T('tt-integrity-bad');
  } else {
    el.hidden = true;
    el.classList.add('unknown');
    el.textContent = '';
    el.title = '';
  }
}

// ── Error report (bug reporter) ───────────────────────────────────────────
// Opens the user's default mail composer with diagnostic info pre-filled.
// To change the recipient address, edit REPORT_EMAIL below.
const REPORT_EMAIL = 'contact@locahun3d.com';   // Bug reports — opens user's local mail client via mailto:

// ── Report-fallback modal ─────────────────────────────────────────────────
// Some users have no `mailto:` handler registered with their browser (no
// Outlook installed, no default web-mailto, Chrome blocked the protocol).
// In that case opening `mailto:` is silently a no-op and looks broken.
// _showReportFallback() puts the same prefilled body in a modal that lets
// the user (a) copy the address, (b) copy the body, or (c) open Gmail Web
// in a new tab with everything pre-filled.
function _showReportFallback(to, subject, body){
  const old = document.getElementById('report-fallback-modal');
  if(old) old.remove();
  const m = document.createElement('div');
  m.id = 'report-fallback-modal';
  m.setAttribute('style', 'position:fixed;inset:0;z-index:99999;display:flex;' +
    'align-items:center;justify-content:center;background:rgba(0,0,0,.78);' +
    'font-family:system-ui,"Segoe UI",sans-serif;color:#e8e8e8;');
  const _en = (window._lang === 'en');
  const _t = {
    title:  _en ? '❗ Bug Report' : '❗ エラー報告',
    intro:  _en ? 'Describe the symptom & steps below, then press Send. It is emailed directly — no mail app needed.'
                : '下に症状・再現手順を書いて「送信」してください。メールアプリ不要で直接送られます。',
    send:   _en ? '📧 Send' : '📧 送信',
    mail:   _en ? 'Open in mail app' : 'メールアプリで開く',
    gmail:  _en ? 'Gmail' : 'Gmail で開く',
    copyBody:_en ? 'Copy text' : '本文をコピー',
  };
  m.innerHTML = `
    <div style="background:#1a1a1c;border:1px solid #444;border-radius:10px;max-width:640px;
                width:90%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;
                box-shadow:0 8px 40px rgba(0,0,0,.7)">
      <div style="padding:14px 18px;border-bottom:1px solid #2c2c2e;display:flex;
                  justify-content:space-between;align-items:center;">
        <strong>${_t.title}</strong>
        <button id="rfb-close" style="background:none;border:0;color:#aaa;font-size:1.4em;
                cursor:pointer;line-height:1">×</button>
      </div>
      <div style="padding:14px 18px 6px;font-size:.9em;line-height:1.55;color:#bbb">${_t.intro}</div>
      <textarea id="rfb-body" style="margin:8px 18px 6px;flex:1;min-height:200px;
                background:#0e0e10;color:#dadada;border:1px solid #333;border-radius:6px;
                padding:10px 12px;font:.82em/1.5 ui-monospace,Menlo,Consolas,monospace;
                resize:vertical;"></textarea>
      <div id="rfb-status" style="padding:0 18px;font-size:.82em;color:#9ad59a;min-height:1.2em"></div>
      <div style="padding:6px 18px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <button id="rfb-send" style="background:#3a5b3a;border:1px solid #6abf6a;color:#dfffdf;
                  padding:9px 18px;border-radius:6px;cursor:pointer;font-size:.95em;font-weight:600">${_t.send}</button>
        <span style="flex:1"></span>
        <a id="rfb-mail" href="#" style="color:#9ab;text-decoration:none;font-size:.82em">${_t.mail}</a>
        <a id="rfb-gmail" href="#" target="_blank" rel="noopener" style="color:#9ab;text-decoration:none;font-size:.82em">${_t.gmail}</a>
        <button id="rfb-copy-body" style="background:none;border:0;color:#9ab;cursor:pointer;font-size:.82em">${_t.copyBody}</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const ta = m.querySelector('#rfb-body');
  ta.value = body;
  const status = m.querySelector('#rfb-status');
  const mailto = ()=> 'mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(ta.value);
  const gmailUrl = ()=> 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to)+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(ta.value);
  m.querySelector('#rfb-mail').onclick  = (e)=>{ e.preventDefault(); try{ location.href = mailto(); }catch(_){} };
  m.querySelector('#rfb-gmail').onclick = (e)=>{ e.preventDefault(); window.open(gmailUrl(),'_blank','noopener'); };
  const close = () => m.remove();
  m.querySelector('#rfb-close').onclick = close;
  m.addEventListener('click', e => { if(e.target === m) close(); });
  m.querySelector('#rfb-copy-body').onclick = async () => {
    try{ await navigator.clipboard.writeText('To: '+to+'\nSubject: '+subject+'\n\n'+ta.value);
      status.style.color='#9ad59a'; status.textContent = _en?'Copied':'コピーしました'; }
    catch(_){ ta.select(); }
  };
  // ── 直接サーバー送信（/api/report → Worker → Resend）。メーラ不要。 ──
  const sendBtn = m.querySelector('#rfb-send');
  sendBtn.onclick = async () => {
    sendBtn.disabled = true;
    status.style.color = '#cdd'; status.textContent = _en ? 'Sending…' : '送信中…';
    try {
      const r = await fetch('/api/report', { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ subject, body: ta.value }) });
      const j = await r.json().catch(()=>({}));
      if(r.ok && j && j.ok){
        status.style.color='#9ad59a'; status.textContent = _en ? 'Sent ✓ — thank you!' : '送信しました ✓ ありがとうございます';
        setTimeout(close, 1400);
        return;
      }
      throw new Error((j && j.error) || ('HTTP '+r.status));
    } catch(e){
      sendBtn.disabled = false;
      status.style.color = '#e6a';
      status.textContent = (_en ? 'Send failed — use mail / Gmail / copy below. ' : '送信に失敗しました。下のメール/Gmail/コピーをご利用ください。 ') + (e && e.message ? '('+e.message+')' : '');
    }
  };
}

window.reportBug = function(){
  try {
    const ver  = (document.getElementById('tb-version')?.textContent || '').trim();
    const ua   = navigator.userAgent || '';
    const plat = navigator.platform  || '';
    const dpr  = window.devicePixelRatio || 1;
    const vp   = innerWidth + ' × ' + innerHeight;
    const lc   = (typeof layers !== 'undefined' && Array.isArray(layers))
                 ? layers.length + ' layers (' + layers.map(L=>L.type).join(',') + ')'
                 : '(no scene loaded)';
    let glRenderer = '';
    try {
      const gl = renderer && renderer.getContext && renderer.getContext();
      if(gl){
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if(ext) glRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
      }
    } catch(_){}
    const _en = (window._lang === 'en');
    const subject = (_en ? '[Locahun3D] Bug Report ' : '[ロケハン3D] エラー報告 ') + ver;
    const bodyLines = [
      _en ? '[What happened]' : '【発生内容】',
      _en ? '(Describe the symptom, steps to reproduce, and what you were doing)'
          : '（こちらに具体的な症状、再現手順、操作の流れを記入してください）',
      '',
      '',
      _en ? '―――― auto-collected info ――――' : '―――― 自動収集情報 ――――',
      'Version : ' + ver,
      'Time    : ' + new Date().toISOString(),
      'Viewport: ' + vp + '  DPR=' + dpr,
      'Scene   : ' + lc,
      'Platform: ' + plat,
      'GPU     : ' + (glRenderer || '(unknown)'),
      'UA      : ' + ua,
    ].join('\n');
    const body = bodyLines;
    // メーラ依存をやめ、報告ダイアログを直接開く。ダイアログの「送信」ボタンが
    // /api/report (Cloudflare Worker→Resend) で直接メール送信する（メーラ不要）。
    // 送信できない環境向けに メールアプリ/Gmail/コピー の手段も残す。
    _showReportFallback(REPORT_EMAIL, subject, body);
  } catch(e){
    console.warn('[reportBug] failed:', e);
    if(typeof showUndoToast === 'function') showUndoToast('メール起動に失敗しました');
  }
};

// Download the freshest viewer HTML as Locahun3D_OfflineViewer.html.
// Fetches the same origin the page was served from (or the manifest's
// trusted URL when running offline-bundled). Used by checkForUpdate()
// when the user clicks the "🔔 新版あり" button — they get the new
// HTML in their Downloads folder so they can replace their local copy
// without manually navigating to GitHub.
async function _downloadLatestViewerHtml(){
  // The latest HTML lives in the SAME GitHub repo as the version manifest, and
  // raw.githubusercontent.com is CORS-enabled — so this fetch succeeds even
  // from a file:// offline copy. (The previous code fell back to location.href
  // when the manifest's url failed the origin allowlist, which on a file://
  // copy just re-downloaded the user's OWN stale HTML — the "押しても更新され
  // ない" bug.) Derive the HTML URL from the manifest URL so they stay in sync.
  const htmlUrl = UPDATE_MANIFEST_URL.replace(/version\.json(?=$|[?#])/i, 'Locahun3D_OfflineViewer.html');
  try {
    const res = await fetch(htmlUrl, { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(blob);
    dl.download = 'Locahun3D_OfflineViewer.html';
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    setTimeout(()=>URL.revokeObjectURL(dl.href), 5000);
    if(typeof showUndoToast === 'function'){
      showUndoToast(window._lang === 'en'
        ? '⬇ Downloaded the latest viewer — overwrite your local HTML file with it'
        : '⬇ 最新版をダウンロードしました — お手元の HTML ファイルに上書き保存してください');
    }
    return true;
  } catch(e){
    console.warn('[update] HTML download failed:', e);
    // Last resort: open the public releases page so the user can grab it manually.
    try{ window.open(RELEASES_FALLBACK_URL, '_blank', 'noopener'); }catch(_){}
    if(typeof showUndoToast === 'function'){
      showUndoToast(window._lang === 'en'
        ? '⚠ Download failed — opened the releases page instead'
        : '⚠ ダウンロード失敗 — リリースページを開きました');
    }
    return false;
  }
}

window.checkForUpdate = async function(userInitiated){
  // If new version already detected, second click downloads the freshest
  // viewer HTML AND opens the release URL (so the user can see release
  // notes / sha hash). Download is best-effort; release page open is the
  // reliable fallback.
  if(_updateState.status === 'available'){
    if(userInitiated){
      // Get the new version IN PLACE — never bounce the user out to GitHub
      // (user feedback 2026-06: clicking "新版あり" should not open the repo).
      if(location.protocol === 'https:' || location.protocol === 'http:'){
        // Online viewer (e.g. viewer.locahun3d.com): the freshest HTML is one
        // reload away — Cloudflare serves the latest — so just reload in place.
        // Use a cache-buster so a stale browser cache can't re-serve the old
        // build (otherwise the click would appear to do nothing).
        try{
          const u = new URL(location.href);
          u.searchParams.set('_v', String(Date.now()));
          location.replace(u.toString());
        }catch(_){ location.reload(); }
      } else {
        // Saved offline copy (file://): can't reload to a newer one (the browser
        // can't overwrite a local file), so download the fresh viewer HTML from
        // GitHub so the user can replace their local copy.
        _downloadLatestViewerHtml();
      }
    }
    return;
  }
  if(_updateState.status === 'checking') return;
  _updateState.status = 'checking';
  _setUpdateBtn('checking');
  try{
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 8000);
    const res = await fetch(UPDATE_MANIFEST_URL, {cache:'no-store', signal:ctrl.signal});
    clearTimeout(t);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const latest = String(data.version || '').trim();
    if(!latest) throw new Error('no version in manifest');
    _updateState.latest       = latest;
    _updateState.notes        = data.notes  || null;
    _updateState.expectedHash = data.sha256 || null;
    // Validate the redirect URL's origin before storing it
    const rawUrl = data.url || null;
    _updateState.urlTrusted = rawUrl ? _isTrustedUpdateUrl(rawUrl) : false;
    _updateState.url        = _updateState.urlTrusted ? rawUrl : null;
    if(rawUrl && !_updateState.urlTrusted){
      console.warn('[update] manifest url failed origin allowlist; falling back', rawUrl);
    }
    if(_compareVersions(CURRENT_VERSION, latest) < 0){
      _updateState.status = 'available';
      _setUpdateBtn('available');
    } else {
      _updateState.status = 'latest';
      _setUpdateBtn('latest');
    }
    // Run integrity check in the background; doesn't block update state
    _verifyPageIntegrity(_updateState.expectedHash).then(ok=>{
      _updateState.integrity = ok;
      _setIntegrityIndicator();
    });
  } catch(err){
    _updateState.status = 'offline';
    _setUpdateBtn('offline');
  }
};

// Auto-check on startup if online; refresh button label after i18n applies.
window.addEventListener('load', ()=>{
  _setUpdateBtn('idle');
  if(navigator.onLine){
    setTimeout(()=>window.checkForUpdate(false), 1200);
  } else {
    _setUpdateBtn('offline');
  }
});
window.addEventListener('online', ()=>{
  if(_updateState.status === 'offline' || _updateState.status === 'idle'){
    window.checkForUpdate(false);
  }
});

if(_protected){
  window.saveProjectZip = ()=>{ showUndoToast('オンライン閲覧モードではデータ保存できません'); };
  window.exportSplat    = ()=>{ showUndoToast('オンライン閲覧モードではデータ保存できません'); };
}

