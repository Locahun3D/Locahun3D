/**
 * 編集画面が「ZIP の中の RAD」をそのまま段階読み込みできるかを、実際のブラウザで確かめる（2026-09-21）。
 *
 *   node scripts/test-scene-edit-zip-stream.mjs [--zip <ビューアー用ZIP>] [--latency 150]
 *
 * サイトの /api/scene-edit/source?ref=stream と同じことをするローカルサーバーを立てる:
 *   ZIP の先頭を読んで、中に無圧縮で入っている .rad の位置を求め、
 *   Range 要求をその位置へずらして返す（＝呼ぶ側からは .rad に見える）。
 * その上で、本物の Chrome に成果物のビューアーを開かせ、
 *   ・全体を落とさずに開き始めるか（取得量が ZIP 全体よりずっと少ないか）
 *   ・スプラットが出て、操作できる状態になるか
 * を見る。サインインが要らないので、手元でも本番と同じ読み込み方を再現できる。
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
const LATENCY = +arg("--latency", 150);
const VIEWER = arg("--viewer", path.join(here, "..", "Locahun3D_OfflineViewer.online.html"));

if (!fs.existsSync(ZIP)) { console.error("ZIP が無い:", ZIP); process.exit(2); }

// ── ZIP の中の、無圧縮 .rad の位置を求める（サイト側 lib/zip-stored-entry.ts と同じ手順） ──
const head = Buffer.alloc(1024);
const fd = fs.openSync(ZIP, "r");
fs.readSync(fd, head, 0, 1024, 0);
if (head.readUInt32LE(0) !== 0x04034b50 || head.readUInt16LE(8) !== 0) { console.error("先頭が無圧縮のエントリではない"); process.exit(2); }
const size = head.readUInt32LE(18);
const nameLen = head.readUInt16LE(26), extraLen = head.readUInt16LE(28);
const innerName = head.subarray(30, 30 + nameLen).toString();
const dataStart = 30 + nameLen + extraLen;
if (!/\.rad$/i.test(innerName)) { console.error("1件目が .rad ではない:", innerName); process.exit(2); }
const zipSize = fs.statSync(ZIP).size;
// 本体の直後の project.json（方角合わせ・初期視点・シーン名）。サイトの /api/scene-edit が渡すのと同じもの。
const ph = Buffer.alloc(512); fs.readSync(fd, ph, 0, 512, dataStart + size);
const pName = ph.readUInt16LE(26), pExtra = ph.readUInt16LE(28), pLen = ph.readUInt32LE(18);
const baseProject = ph.readUInt32LE(0) === 0x04034b50 && ph.readUInt16LE(8) === 0
  ? (() => { const b = Buffer.alloc(pLen); fs.readSync(fd, b, 0, pLen, dataStart + size + 30 + pName + pExtra); return b.toString("utf8"); })() : "";
const LABEL = "歌舞伎町ゲート｜劇場通り一番街";
const expectRotY = baseProject ? (JSON.parse(baseProject).layers.find((l) => l.isMain)?.rot?.y ?? 0) : 0;
console.log(`ZIP ${(zipSize / 1048576).toFixed(0)}MB → 中の ${innerName} ${(size / 1048576).toFixed(0)}MB (offset ${dataStart})`);

let served = 0, requests = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/viewer.html") {
    const html = fs.readFileSync(VIEWER);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": html.length });
    return res.end(html);
  }
  if (url.pathname !== "/source") {
    // オンライン版は vendor/ のモジュールを相対URLで読む。リポジトリから素直に返す。
    const file = path.join(here, "..", url.pathname.replace(/^\/+/, ""));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const body = fs.readFileSync(file);
      res.writeHead(200, { "content-type": /\.(mjs|js|module\.js)$/.test(file) ? "text/javascript" : "application/octet-stream", "content-length": body.length });
      return res.end(body);
    }
    res.writeHead(404); return res.end();
  }
  requests++;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  const headers = { "content-type": "application/octet-stream", "accept-ranges": "bytes", "cache-control": "no-store" };
  const send = () => {
    if (!m) {
      res.writeHead(200, { ...headers, "content-length": size });
      served += size;
      return fs.createReadStream(ZIP, { start: dataStart, end: dataStart + size - 1 }).pipe(res);
    }
    const a = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    const b = m[1] ? (m[2] ? Math.min(+m[2], size - 1) : size - 1) : size - 1;
    served += b - a + 1;
    res.writeHead(206, { ...headers, "content-range": `bytes ${a}-${b}/${size}`, "content-length": b - a + 1 });
    fs.createReadStream(ZIP, { start: dataStart + a, end: dataStart + b }).pipe(res);
  };
  setTimeout(send, LATENCY);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-size=1400,900"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (/restore|rad|type|stream/i.test(m.text())) console.log("  [browser]", m.text().slice(0, 220)); });
// 編集画面と同じ入口（_loadOnlineSceneStream）を、同じ形のURLで呼ぶ。
const source = `http://127.0.0.1:${port}/source?sessionKey=${"a".repeat(64)}&ref=stream`;
await page.goto(`http://127.0.0.1:${port}/viewer.html?onlineSceneEdit=0&diag=1`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window._loadOnlineSceneStream === "function", null, { timeout: 60000 })
  .catch(async () => { console.error("ビューアーが初期化されなかった。ページエラー:", errors.slice(0, 3)); await browser.close(); server.close(); process.exit(1); });
const t0 = Date.now();
await page.evaluate(([u, n, b, l]) => { window.__streamDone = window._loadOnlineSceneStream(u, n, { project: b, label: l }).then(() => "ok", (e) => "ERR:" + String(e && e.stack ? e.stack : e).replace(/\s+/g, " ").slice(0, 300)); }, [source, innerName, baseProject, LABEL]);

const firstPaint = await page.waitForFunction(() => {
  const n = (typeof window.__nSplat === 'function' ? Math.max(0, window.__nSplat()) : 0);
  return n > 0 ? n : false;
}, null, { timeout: 180000 }).then((h) => h.jsonValue()).catch(() => 0);
const tFirst = Date.now() - t0;
const servedAtFirst = served;

// 落ち着くまで（スプラット数が5秒変わらない）待つ。
let last = -1, stable = 0, total = firstPaint;
while (stable < 5) {
  await page.waitForTimeout(1000);
  total = await page.evaluate(() => (typeof window.__nSplat === 'function' ? Math.max(0, window.__nSplat()) : 0));
  stable = total === last ? stable + 1 : 0;
  last = total;
  if (Date.now() - t0 > 300000) break;
}
const tSettle = Date.now() - t0;
const hidden = await page.evaluate(() => document.getElementById("ld")?.classList.contains("hidden") ?? null);
const outcome = await page.evaluate(() => window.__streamDone);
console.log("診断:", await page.evaluate(() => ({ ft: typeof _splatFileTypeFor === "function" ? String(_splatFileTypeFor("rad")) : "no fn", keys: typeof SplatFileType !== "undefined" ? Object.keys(SplatFileType).join(",") : "none" })).catch((e) => String(e)));
console.log("読み込みの結果:", outcome);
const kept = await page.evaluate(() => {
  const m = window.__diagState?.splatMesh; const deg = (r) => Math.round((r * 180 / Math.PI) * 10) / 10;
  return { name: document.getElementById("tb-project-name")?.textContent || "", rotY: m ? deg(m.rotation.y) : null };
});
console.log("引き継ぎ:", JSON.stringify(kept), "期待する回転:", expectRotY);

console.log(`最初のスプラット: ${tFirst / 1000}s（${firstPaint.toLocaleString()} 個 / 取得 ${(servedAtFirst / 1048576).toFixed(0)}MB＝全体の ${(servedAtFirst / size * 100).toFixed(1)}%）`);
console.log(`落ち着くまで: ${tSettle / 1000}s（${total.toLocaleString()} 個 / 取得 ${(served / 1048576).toFixed(0)}MB / 要求 ${requests}回）`);
console.log(`読み込み画面は閉じた: ${hidden} / ページエラー: ${errors.length}`);
await browser.close();
server.close();

const nameOk = kept.name === LABEL, rotOk = kept.rotY !== null && Math.abs(kept.rotY - expectRotY) < 0.2;
console.log(`シーン名=${nameOk ? "OK" : "NG"} / 方角=${rotOk ? "OK" : "NG"}`);
// 「取得」はサーバーが受けた Range の要求量（実際に流れた量ではない）。Spark は視点に応じて大きめの範囲を
// 先に要求して途中で捨てるため、全体より多く見えることがある。合否は「すぐ見え始めるか」で判定する。
const ok = nameOk && rotOk && firstPaint > 0 && tFirst < 30000 && outcome === "ok" && errors.length === 0;
console.log(ok ? "PASS 全体を落とさずに開けた" : "FAIL");
if (errors.length) console.log(errors.slice(0, 3).join("\n"));
process.exit(ok ? 0 : 1);
