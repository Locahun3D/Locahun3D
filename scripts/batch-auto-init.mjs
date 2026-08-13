#!/usr/bin/env node
// ══════════════════════════════════════════════════
//  カメラ初期位置の自動決定 — バッチドライバ (Node + Playwright)
//
//  設計書: F:\Claude\docs\設計_カメラ初期位置の自動決定パイプライン_2026-08-13.md §3
//
//  入力ディレクトリを走査して .rad を見つけ、1件ずつビューアーを
//    <viewer>?autoload=<radのURL>&autoinit=1&headless=1
//  で開く。ビューアー側(299_auto_init_harness.js)がシーンの収束を待って自動配置し、
//  ZIP を生成して返す。ここではその ZIP を受け取り、案件ごとの出力先へ保存して、
//  最後に「案件名 / 信頼度 / 要確認 / 失敗 / 処理時間」のレポートを出す。
//
//  使い方:
//    node scripts/batch-auto-init.mjs "<入力ディレクトリ>" [オプション]
//
//  オプション:
//    --out <dir>        出力先を固定する。既定は物件フォルダの
//                       「3. ロケハンオンラインビューアー/」(下の resolveOutDir 参照)
//    --viewer <path>    使うビューアーHTML (既定: このリポジトリの Locahun3D_OfflineViewer.html)
//    --port <n>         内蔵HTTPサーバのポート (既定 8973)
//    --limit <n>        先頭 n 件だけ処理する（試運転用）
//    --wait-sec <n>     1件あたりのタイムアウト秒 (既定 900)
//    --report <path>    レポートJSONの出力先 (既定 <out>/autoinit-report.json、
//                       出力先が案件ごとに散る場合は入力ディレクトリ直下)
//    --headed           ブラウザを表示して実行（デバッグ用）
//    --overwrite        既に ZIP がある案件も処理する（既定はスキップ）
//    --ext <csv>        走査する拡張子 (既定 rad)。動作確認で ply を混ぜたい時用
//
//  ⚠ Dropbox のパスはハードコードしない。必ず引数で受け取る。
// ══════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── 引数 ───────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt  = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i+1] ? argv[i+1] : d; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i-1].startsWith('--') && !['--headed','--overwrite'].includes(argv[i-1])));
const INPUT = positional[0];
if(!INPUT){
  console.error('使い方: node scripts/batch-auto-init.mjs "<入力ディレクトリ>" [--out <dir>] [--limit n] [--headed]');
  process.exit(2);
}
if(!fs.existsSync(INPUT)){ console.error('入力ディレクトリが見つかりません: ' + INPUT); process.exit(2); }

const VIEWER   = path.resolve(opt('--viewer', path.join(ROOT, 'Locahun3D_OfflineViewer.html')));
const PORT     = parseInt(opt('--port', '8973'), 10);
const LIMIT    = parseInt(opt('--limit', '0'), 10) || 0;
const WAIT_MS  = (parseInt(opt('--wait-sec', '900'), 10) || 900) * 1000;
const OUT_FIXED= opt('--out', null);
const HEADED   = flag('--headed');
const OVERWRITE= flag('--overwrite');
const EXTS     = opt('--ext', 'rad').split(',').map(e=>'.'+e.trim().toLowerCase().replace(/^\./,''));
if(!fs.existsSync(VIEWER)){ console.error('ビューアーHTMLが見つかりません: ' + VIEWER + '  (node build.mjs を実行してください)'); process.exit(2); }

// ── Playwright の解決 ──────────────────────────────────────────
// このリポジトリは node_modules を持たないので、まず通常の解決を試し、
// 駄目なら隣のオンライン版リポジトリの node_modules を見に行く。
async function loadPlaywright(){
  const tries = [
    'playwright',
    pathToFileURL(path.join(ROOT, 'node_modules/playwright/index.js')).href,
    pathToFileURL(path.resolve(ROOT, '../locahun3d_online/node_modules/playwright/index.js')).href,
  ];
  for(const t of tries){
    try {
      const mod = await import(t);
      // CJS を file URL で import すると名前付きexportが検出されず default に入る
      const pw = mod.chromium ? mod : (mod.default && mod.default.chromium ? mod.default : null);
      if(pw) return pw;
    } catch(_){}
  }
  console.error('Playwright が見つかりません。`npm i -D playwright` するか、');
  console.error('--viewer と同じ要領で playwright を用意してください。');
  process.exit(2);
}

// ── 走査（既定は .rad のみ）──────────────────────────────────────
function findRads(dir, acc = []){
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes:true }); } catch(_){ return acc; }
  for(const e of ents){
    const p = path.join(dir, e.name);
    if(e.isDirectory()){
      if(e.name.startsWith('.')) continue;
      findRads(p, acc);
    } else if(e.isFile() && EXTS.some(x => e.name.toLowerCase().endsWith(x))){
      acc.push(p);
    }
  }
  return acc;
}

// ── 出力先の決定 ───────────────────────────────────────────────
// 現在の手作業と同じ場所に置く:
//   <物件>/2. 3Dデータ/<案件>/RAD/xxx.rad  →  <物件>/3. ロケハンオンラインビューアー/
// RAD から上へ辿り、「2. 」で始まるフォルダを見つけたらその親が <物件>。
// 見つからなければ RAD と同じフォルダへ出す（構成が違う入力でも落とさない）。
const OUT_FOLDER_NAME = '3. ロケハンオンラインビューアー';
function resolveOutDir(radPath){
  if(OUT_FIXED) return path.resolve(OUT_FIXED);
  let d = path.dirname(radPath);
  for(let i = 0; i < 8; i++){
    const parent = path.dirname(d);
    if(parent === d) break;
    if(/^2\./.test(path.basename(d))) return path.join(parent, OUT_FOLDER_NAME);
    d = parent;
  }
  return path.dirname(radPath);
}
// 案件名 = RAD の1つ上（RAD/ フォルダ直下なら更に1つ上）
function caseNameOf(radPath){
  const dir = path.dirname(radPath);
  if(path.basename(dir).toUpperCase() === 'RAD') return path.basename(path.dirname(dir));
  return path.basename(dir);
}

// ── Range 対応の内蔵HTTPサーバ ──────────────────────────────────
// ・/viewer/...  → リポジトリのファイル（ビューアーHTML と vendor/）
// ・/scan/<i>/<name>.rad → 走査で見つけた RAD（拡張子を保つ: Spark は URL の
//   拡張子でフォーマットを判定する）
function startServer(rads){
  const serveFile = (res, file, req) => {
    let st;
    try { st = fs.statSync(file); } catch(_){ res.writeHead(404); res.end('not found'); return; }
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8'
      : file.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : 'application/octet-stream';
    const range = req.headers.range;
    if(range){
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': st.size,
      'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);
    let m;
    if((m = /^\/scan\/(\d+)\//.exec(p))){
      const i = parseInt(m[1], 10);
      if(!rads[i]){ res.writeHead(404); res.end('no such scan'); return; }
      return serveFile(res, rads[i], req);
    }
    if(p.startsWith('/viewer/')){
      const rel = p.slice('/viewer/'.length);
      const file = path.join(ROOT, rel);
      // ディレクトリトラバーサル防止（ローカル専用だが念のため）
      if(!file.startsWith(ROOT)){ res.writeHead(403); res.end('forbidden'); return; }
      return serveFile(res, file, req);
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// ── 1件処理 ────────────────────────────────────────────────────
async function processOne(browser, base, rad, index, outDir){
  const t0 = Date.now();
  const name = path.basename(rad).replace(/\.[^.]+$/, '');
  const zipPath = path.join(outDir, name + '.zip');
  const radUrl = `${base}/scan/${index}/${encodeURIComponent(path.basename(rad))}`;
  const url = `${base}/viewer/${encodeURIComponent(path.basename(VIEWER))}`
            + `?autoload=${encodeURIComponent(radUrl)}&autoinit=1&headless=1`;

  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if(/autocam|autoinit|error/i.test(m.text())) logs.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));

  let result = null, saved = null, error = null;
  try {
    // window.opener / parent が無いので、299 の入口は「自動ダウンロード」へ
    // フォールバックする。その download を受け取るのがここ。
    const dlPromise = page.waitForEvent('download', { timeout: WAIT_MS }).catch(() => null);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const dl = await dlPromise;
    result = await page.evaluate(() => window.__autoInitResult || null).catch(() => null);
    if(dl){
      fs.mkdirSync(outDir, { recursive: true });
      await dl.saveAs(zipPath);
      saved = zipPath;
    } else {
      error = 'timeout / ZIP を受け取れませんでした';
    }
  } catch(e){
    error = e.message;
  } finally {
    await ctx.close().catch(()=>{});
  }

  return {
    case: caseNameOf(rad),
    file: path.basename(rad),
    radPath: rad,
    zip: saved,
    confidence: result ? result.confidence : null,
    needsReview: result ? !!result.needsReview : true,
    failed: result ? !!result.failed : true,
    reason: result ? (result.reason || null) : (error || 'no-result'),
    position: result ? result.position : null,
    yawDeg: result ? result.yawDeg : null,
    pitchDeg: result ? result.pitchDeg : null,
    splats: result ? result.splats : null,
    error,
    logs: logs.slice(-8),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  };
}

// ── main ───────────────────────────────────────────────────────
(async () => {
  const { chromium } = await loadPlaywright();
  let rads = findRads(path.resolve(INPUT));
  if(!rads.length){ console.error(EXTS.join('/') + ' が見つかりませんでした: ' + INPUT); process.exit(1); }
  rads.sort();
  if(LIMIT) rads = rads.slice(0, LIMIT);
  console.log(`対象 ${rads.length} 件 / ビューアー: ${VIEWER}`);

  const server = await startServer(rads);
  const base = `http://127.0.0.1:${PORT}`;
  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      // 3DGS の描画には WebGL2 が要る。ヘッドレスでは SwiftShader で動かす。
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
    ],
  });

  const rows = [];
  for(let i = 0; i < rads.length; i++){
    const rad = rads[i];
    const outDir = resolveOutDir(rad);
    const zipPath = path.join(outDir, path.basename(rad).replace(/\.[^.]+$/, '') + '.zip');
    process.stdout.write(`[${i+1}/${rads.length}] ${caseNameOf(rad)} / ${path.basename(rad)} … `);
    if(!OVERWRITE && fs.existsSync(zipPath)){
      console.log('スキップ（出力済み）');
      rows.push({ case: caseNameOf(rad), file: path.basename(rad), skipped: true, zip: zipPath });
      continue;
    }
    const r = await processOne(browser, base, rad, i, outDir);
    rows.push(r);
    console.log(r.failed
      ? `失敗 (${r.reason}) ${r.elapsedSec}s`
      : `信頼度 ${r.confidence}${r.needsReview ? ' ⚠要確認' : ''} → ${r.zip ? path.basename(r.zip) : '(ZIP無し)'} ${r.elapsedSec}s`);
  }

  await browser.close();
  server.close();

  // ── レポート ────────────────────────────────────────────────
  const done = rows.filter(r => !r.skipped);
  const ok = done.filter(r => !r.failed && !r.needsReview);
  const review = done.filter(r => !r.failed && r.needsReview);
  const failed = done.filter(r => r.failed);
  console.log('\n══ レポート ══');
  const pad = (s, n) => String(s === null || s === undefined ? '-' : s).padEnd(n);
  console.log(pad('案件', 28) + pad('ファイル', 30) + pad('信頼度', 8) + pad('要確認', 8) + pad('失敗', 6) + '時間');
  for(const r of rows){
    if(r.skipped){ console.log(pad(r.case, 28) + pad(r.file, 30) + '（スキップ）'); continue; }
    console.log(pad(r.case, 28) + pad(r.file, 30) + pad(r.confidence, 8) +
                pad(r.needsReview ? 'はい' : '', 8) + pad(r.failed ? 'はい' : '', 6) + r.elapsedSec + 's');
  }
  console.log(`\n合計 ${done.length} 件: 自動確定 ${ok.length} / 要確認 ${review.length} / 失敗 ${failed.length}`);

  const reportPath = path.resolve(opt('--report',
    path.join(OUT_FIXED ? path.resolve(OUT_FIXED) : path.resolve(INPUT), 'autoinit-report.json')));
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    viewer: VIEWER, input: path.resolve(INPUT),
    summary: { total: done.length, ok: ok.length, needsReview: review.length, failed: failed.length },
    rows,
  }, null, 2), 'utf8');
  console.log('レポート: ' + reportPath);
  process.exit(failed.length ? 1 : 0);
})();
