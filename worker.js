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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/report') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
      return handleReport(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

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
