/**
 * 編集画面（物件編集の「編集」から開く経路）を手元で再現して、開くまでの重さを測る（2026-09-22）。
 *
 *   node scripts/repro-editor-open.mjs --project <保存済みの project.zip> [--zip <ビューアー用ZIP>] [--latency 60]
 *
 * 本番と同じく、同一オリジンの親ページが iframe で編集用ビューアーを開き、
 * locahun:scene-load を送る。/api/scene-edit/source は保存済みアーカイブ、
 * &ref=stream は ZIP の中の .rad を Range で返す。サインイン不要。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire("F:/Htlml/3DGS/locahun3d_online/package.json");
const { chromium } = require("playwright");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const ZIP = arg("--zip", "C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/ShinjukuKabukiGate/260914/3_Locahun3DOnline_ViewerData/ShinjukuKabukiGate.zip");
const PROJECT = arg("--project", "");
const LATENCY = +arg("--latency", 60);
const VIEWER = arg("--viewer", path.join(here, "..", "Locahun3D_OfflineViewer.online.html"));
const project = fs.readFileSync(PROJECT);
const head = Buffer.alloc(1024), fd = fs.openSync(ZIP, "r"); fs.readSync(fd, head, 0, 1024, 0);
const size = head.readUInt32LE(18), dataStart = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
const etag = `"l3d-content-localtest0123456789-${dataStart}"`;
let streamBytes = 0, sourceBytes = 0;
// --mbps N: 回線の太さを本番の Worker 経由程度に絞る（全体で N MB/s を分け合う）。
const MBPS = +arg("--mbps", 0); let lineFreeAt = 0;
const throttle = (bytes, go) => { if (!MBPS) return go(); const now = Date.now(); const start = Math.max(now, lineFreeAt); lineFreeAt = start + bytes / (MBPS * 1048576) * 1000; setTimeout(go, lineFreeAt - now); };
const sendRange = (req, res, total, open, count) => {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  const h = { "content-type": "application/octet-stream", "accept-ranges": "bytes", "cache-control": process.argv.includes("--cacheable") ? "private, max-age=3600" : "no-store", etag };
  if (req.method === "HEAD") { res.writeHead(200, { ...h, "content-length": total }); return res.end(); }
  if (!m) { count(total); res.writeHead(200, { ...h, "content-length": total }); return open(0, total - 1).pipe(res); }
  const a = m[1] ? +m[1] : Math.max(0, total - +m[2]), b = m[1] ? (m[2] ? Math.min(+m[2], total - 1) : total - 1) : total - 1;
  count(b - a + 1);
  throttle(b - a + 1, () => { res.writeHead(206, { ...h, "content-range": `bytes ${a}-${b}/${total}`, "content-length": b - a + 1 }); open(a, b).pipe(res); });
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/parent.html") { res.writeHead(200, { "content-type": "text/html" }); return res.end('<!doctype html><body style="margin:0"><iframe id="f" src="/viewer.html?onlineSceneEdit=1" style="width:1280px;height:720px;border:0"></iframe></body>'); }
  if (url.pathname === "/viewer.html") { const b = fs.readFileSync(VIEWER); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(b); }
  if (url.pathname === "/api/scene-edit/source") {
    return setTimeout(() => {
      if (url.searchParams.get("ref") === "stream") sendRange(req, res, size, (a, b) => fs.createReadStream(ZIP, { start: dataStart + a, end: dataStart + b }), (n) => { streamBytes += n; });
      else sendRange(req, res, project.length, (a, b) => { const { Readable } = require("node:stream"); return Readable.from([project.subarray(a, b + 1)]); }, (n) => { sourceBytes += n; });
    }, LATENCY);
  }
  const file = path.join(here, "..", url.pathname.replace(/^\/+/, ""));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) { const b = fs.readFileSync(file); res.writeHead(200, { "content-type": /\.(mjs|js)$/.test(file) ? "text/javascript" : "application/octet-stream" }); return res.end(b); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-size=1300,800"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
// ready は iframe の読み込み直後に来る。取りこぼさないよう、ページが動き出す前に受け口を置く。
await page.addInitScript(() => {
  window.__events = [];
  window.addEventListener("message", (e) => { window.__events.push({ t: performance.now(), type: e.data && e.data.type }); });
});
await page.goto(`http://127.0.0.1:${port}/parent.html`);
await page.waitForFunction(() => window.__events.some((e) => e.type === "locahun:scene-editor-ready"), null, { timeout: 60000 });
const t0 = Date.now();
await page.evaluate(() => { window.__t0 = performance.now(); document.getElementById("f").contentWindow.postMessage({ type: "locahun:scene-load", requestId: "r1", sourceUrl: "/api/scene-edit/source?sessionKey=" + "a".repeat(64), fileName: "scene-project.zip", streamFileName: "", sceneLabel: "歌舞伎町ゲート｜劇場通り一番街" }, location.origin); });
let readyAt = 0, hiddenAt = 0, window2M = 0, bakeDoneAt = 0, sawBake = false;
const MAXS = +arg("--seconds", 40);
if (process.argv.includes("--no-prewarm")) await page.evaluate(() => { const w = document.getElementById("f").contentWindow; setInterval(() => { if (w.__lodPrefetch && w.__lodPrefetch.phase !== "done") { w.__lodPrefetch.phase = "done"; w.__lodPrefetch.camQueue = []; } }, 50); });
for (let i = 0; i < MAXS; i++) {
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => {
    const w = document.getElementById("f").contentWindow, ld = w.document.getElementById("ld");
    const m = w.__lodPrefetch && w.__lodPrefetch.mesh;
    const txt = w.document.body.innerText.replace(/\s+/g, " ");
    return { ready: window.__events.some((e) => e.type === "locahun:scene-ready"), err: window.__events.find((e) => e.type === "locahun:scene-load-error")?.type || "", hidden: ld ? ld.classList.contains("hidden") : null, num: m && m.paged ? m.paged.numSplats : 0, phase: w.__lodPrefetch?.phase, col: (txt.match(/判定[^ ]{0,8}/) || [""])[0], walk: w.__walkState ? w.__walkState() : null, name: w.document.getElementById("tb-project-name")?.textContent || "" };
  });
  const s = (Date.now() - t0) / 1000;
  if (st.ready && !readyAt) readyAt = s;
  if (st.hidden && !hiddenAt) hiddenAt = s;
  if (st.num > 2000000 && !window2M) window2M = s;
  if (/生成中|準備中/.test(st.col)) sawBake = true; else if (sawBake && !bakeDoneAt) bakeDoneAt = s;
  console.log(s.toFixed(0) + "s", JSON.stringify(st), "stream", (streamBytes / 1048576).toFixed(0) + "MB");
  if (st.err) break;
  if (st.ready && !/生成中|準備中/.test(st.col) && i > 5 && !process.argv.includes("--full")) break;
}
console.log(`当たり判定: ${sawBake ? (bakeDoneAt ? bakeDoneAt + "s で完成" : "未完成") : "生成なし"} / 200万粒: ${window2M}s / 準備完了(編集できます): ${readyAt}s / 読み込み画面が閉じた: ${hiddenAt}s / 本体の要求量 ${(streamBytes / 1048576).toFixed(0)}MB / アーカイブ ${(sourceBytes / 1024).toFixed(0)}KB`);
const SAVE = arg("--save-to", "");
if (SAVE) {
  // 保存（編集画面の「このシーンに保存」と同じ要求）。当たり判定の仕上がりを待ってから書き出す。
  const t1 = Date.now();
  const b64 = await page.evaluate(() => new Promise((resolve, reject) => {
    const w = document.getElementById("f").contentWindow;
    window.addEventListener("message", async (e) => {
      if (e.data?.type === "locahun:scene-exported") { const buf = new Uint8Array(await e.data.archive.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768)); resolve(btoa(s)); }
      if (e.data?.type === "locahun:scene-export-error") reject(new Error(e.data.code));
    });
    w.postMessage({ type: "locahun:scene-export", requestId: "save1" }, location.origin);
  }));
  fs.writeFileSync(SAVE, Buffer.from(b64, "base64"));
  console.log(`保存: ${((Date.now() - t1) / 1000).toFixed(1)}s で書き出し → ${SAVE} (${(fs.statSync(SAVE).size / 1024).toFixed(0)}KB)`);
}
await page.screenshot({ path: arg("--shot", "editor-open.png") });
await browser.close(); server.close();
