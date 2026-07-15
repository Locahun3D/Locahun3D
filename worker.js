// Cloudflare Worker for viewer.locahun3d.com
//  - POST /api/report  → email the bug report via Resend (no mail app needed on the client)
//  - everything else   → static assets (the viewer HTML, etc.) via the ASSETS binding
//
// Setup (one-time): set the Resend key as a secret on this Worker:
//   npx wrangler secret put RESEND_API_KEY
// REPORT_FROM must be a verified sender domain in your Resend account (locahun3d.com).

const REPORT_TO   = 'contact@locahun3d.com';
// 送信元は Resend で認証済みドメイン(locahun3d.com)。オンライン版と同じ noreply@ に揃える。
const REPORT_FROM = 'ロケハン3D 報告 <noreply@locahun3d.com>';

// デモシーンとして公開配信を許可する R2 キーの固定ホワイトリスト。
// これ以外は 404（このエンドポイントが汎用オープンプロキシに転用されるのを防ぐ）。
const DEMO_ALLOWED_KEYS = new Set(['Kousaten_ForDemo_point_cloud.rad']);

// デモは公開アセットのみ・Cookie を読まないので Origin * で問題ない。
// Range 応答に CORS が付かないと Spark のチャンク Range fetch が別オリジンで落ちる。
const CORS = {
  'Access-Control-Allow-Origin':   '*',
  'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers':  'Range, If-Range, If-None-Match, If-Modified-Since',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified',
  'Access-Control-Max-Age':        '86400',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/report') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
      return handleReport(request, env);
    }
    if (url.pathname.startsWith('/api/demo-asset/')) {
      return handleDemoAsset(request, env, url);
    }
    if (url.pathname.startsWith('/vendor/')) {
      return handleVendorAsset(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

// vendored Spark 等の /vendor/ 配下を、別オリジンから ES モジュールとして
// import できるよう CORS を付けて再配信する。
//
// なぜ必要か: 配布用 Locahun3D_OfflineViewer.html は importmap で Spark を
// この /vendor/ の絶対URLから読む。以前は公開CDN(jsDelivr, ACAO:* を返す)
// から読んでいたため file:// のダウンロード版でも import できたが、パッチ版
// Spark(ワーカー16/差分トラバース)を自社ホストへ移した際、静的配信(ASSETS)が
// ACAO を返さないことを見落とした。結果、viewer.locahun3d.com 以外のオリジン
// (ダブルクリックの file:// 等)で開くと Spark の cross-origin モジュール取得が
// CORS で失敗し、メインモジュールごと起動しない回帰になっていた。
// /vendor/ は公開の静的JSのみ・Cookie を読まないので Origin * で安全。
async function handleVendorAsset(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Content-Length': '0' } });
  }
  const res = await env.ASSETS.fetch(request);
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// bytes=X-Y / bytes=X- / bytes=-N を R2 の range オプションへ変換。
function toR2Range(header) {
  let m = header.match(/^bytes=(\d+)-(\d+)$/);
  if (m) return { offset: +m[1], length: +m[2] - +m[1] + 1 };
  m = header.match(/^bytes=(\d+)-$/);
  if (m) return { offset: +m[1], length: 1024 * 1024 * 16 };
  m = header.match(/^bytes=-(\d+)$/);
  if (m) return { suffix: +m[1] };
  return null;
}

// デモ RAD の公開ストリーミング配信（認証なし・Range/CORS対応）。
// 公開 r2.dev URL は CORS 無し & 公開停止済のため、Worker が R2 バインディング
// (R2_ASSETS) から直接読んで再配信する。ホワイトリスト外は 404。
async function handleDemoAsset(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Content-Length': '0' } });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { ...CORS, Allow: 'GET, HEAD, OPTIONS' } });
  }
  const key = decodeURIComponent(url.pathname.slice('/api/demo-asset/'.length));
  if (!DEMO_ALLOWED_KEYS.has(key)) {
    return new Response('Not found', { status: 404, headers: CORS });
  }
  const bucket = env.R2_ASSETS;
  if (!bucket) return json({ ok: false, error: 'r2_unconfigured' }, 503);

  try {
    const rangeHeader = request.headers.get('range');
    const cache = 'public, max-age=86400'; // 不変アセット

    if (rangeHeader) {
      const r2range = toR2Range(rangeHeader);
      if (!r2range) return new Response('Bad Range', { status: 400, headers: CORS });
      const obj = await bucket.get(key, { range: r2range });
      if (!obj) return new Response('Not found', { status: 404, headers: CORS });
      const total  = obj.size;
      const offset = obj.range?.offset ?? 0;
      const length = obj.range?.length ?? total - offset;
      const end    = offset + length - 1;
      const h = new Headers(CORS);
      h.set('Content-Type', 'application/octet-stream');
      h.set('Content-Length', String(length));
      h.set('Content-Range', `bytes ${offset}-${end}/${total}`);
      h.set('Accept-Ranges', 'bytes');
      h.set('Cache-Control', cache);
      return new Response(request.method === 'HEAD' ? null : obj.body, { status: 206, headers: h });
    }

    const obj = await bucket.get(key);
    if (!obj) return new Response('Not found', { status: 404, headers: CORS });
    const h = new Headers(CORS);
    h.set('Content-Type', 'application/octet-stream');
    if (obj.size) h.set('Content-Length', String(obj.size));
    h.set('Accept-Ranges', 'bytes');
    h.set('Cache-Control', cache);
    return new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers: h });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function handleReport(request, env) {
  try {
    if (!env.RESEND_API_KEY) return json({ ok: false, error: 'no_key' }, 503);
    let data;
    try { data = await request.json(); } catch (_) { return json({ ok: false, error: 'bad_json' }, 400); }
    const subject = String(data.subject || '[ロケハン3D] エラー報告').slice(0, 300);
    const body = String(data.body || '').slice(0, 20000);
    if (!body.trim()) return json({ ok: false, error: 'empty' }, 400);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: REPORT_FROM, to: [REPORT_TO], subject, text: body }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return json({ ok: false, error: 'resend_' + res.status, detail: t.slice(0, 300) }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500);
  }
}
