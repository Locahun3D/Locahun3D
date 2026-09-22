/**
 * イベントを触ったら写真が最前面に出るか（2026-09-22 本人指示）。実際のブラウザで確かめる。
 *
 *   node scripts/test-event-photo-front.mjs
 *
 * 閲覧時（?protected=1）も編集時も、1回触れば出る（選択も同時に行う）。
 * 出た写真の上に、日照などのパネルがかぶっていないこと（画面中央の最前面が写真であること）も見る。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire("F:/Htlml/3DGS/locahun3d_online/package.json");
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const VIEWER = path.join(here, "..", "Locahun3D_OfflineViewer.online.html");
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/viewer.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(fs.readFileSync(VIEWER)); }
  const file = path.join(here, "..", u.pathname.replace(/^\/+/, ""));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) { res.writeHead(200, { "content-type": /\.(mjs|js)$/.test(file) ? "text/javascript" : "application/octet-stream" }); return res.end(fs.readFileSync(file)); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ channel: "chrome", headless: false });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let failed = 0;
for (const mode of ["protected", "edit"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 160)));
  await page.goto(`http://127.0.0.1:${port}/viewer.html${mode === "protected" ? "?protected=1" : ""}`);
  await page.waitForFunction(() => typeof window.addEventLayer === "function", null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // 画面のまん中にイベントを置き、写真を持たせる（イベントは視点の前に置かれる）。
  // 視点の3m前・目の高さに置く（既定の置き方は足元に落ちて画面の外になることがある）。
  await page.evaluate(() => { const { pos, fwd } = window.__cameraPose(); window.addEventLayer({ x: pos.x + fwd.x * 3, y: pos.y + fwd.y * 3, z: pos.z + fwd.z * 3 }); });
  // イベントの番号は、レイヤー一覧の行（onclick="selectLayer(番号)"）から拾う。
  const ok = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[onclick*='selectLayer(']")].map((e) => +(/selectLayer\((\d+)/.exec(e.getAttribute("onclick")) || [])[1]).filter(Number.isFinite);
    return ids.length ? Math.max(...ids) : null;
  });
  if (ok != null) {
    // 写真は画面と同じ手順（ファイル選択）で付ける。
    const png = path.join(process.env.TEMP || ".", "event-photo-test.png");
    fs.writeFileSync(png, Buffer.from(PNG.split(",")[1], "base64"));
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.evaluate((id) => window.importEventImage(id), ok)]);
    await chooser.setFiles(png);
    await page.waitForTimeout(500);
  }
  if (ok == null) { console.log(mode, "イベントを用意できませんでした"); failed++; await page.close(); continue; }
  // シーンを読み込んでいないのでファイル受付の画面が前にある。本番ではシーンがある状態なので外す。
  await page.evaluate(() => { for (const d of document.querySelectorAll("#dropzone, [id^=dz], [class*=dz-]")) d.style.display = "none"; });
  // 選択を外してから触る（編集時は「1回目は選択」なので2回触る）。
  await page.mouse.click(40, 760);
  const c = await page.evaluate((id) => window.__layerScreenPoint(id), ok);
  if (!c) { console.log(mode, "イベントが画面に映っていません"); failed++; await page.close(); continue; }
  console.log("  触る位置:", JSON.stringify(c), "そこにある要素:", await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e && (e.id || e.className || e.tagName); }, c));
  const shown = async () => page.evaluate(() => !!document.getElementById("event-image-viewer"));
  await page.mouse.click(c.x, c.y); await page.waitForTimeout(400);
  const afterFirst = await shown();
  if (!afterFirst) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(400); }
  const afterSecond = await shown();
  const top = await page.evaluate(() => { const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return el && (el.id || el.tagName) ; });
  const topmost = await page.evaluate(() => { const v = document.getElementById("event-image-viewer"); if (!v) return false; const pts = [[60, 700], [innerWidth - 60, 120], [innerWidth / 2, innerHeight / 2]]; return pts.every(([x, y]) => v.contains(document.elementFromPoint(x, y))); });
  const dbg = await page.evaluate((id) => { window.showEventImage(id); const ok = !!document.getElementById("event-image-viewer"); document.getElementById("event-image-viewer")?.remove(); return { direct: ok, selectedRow: document.querySelector(".layer-item.selected, .li.sel, [class*=selected]")?.textContent?.slice(0, 30) || null }; }, ok);
  console.log("  診断:", JSON.stringify(dbg));
  const expectFirst = true; // 閲覧時も編集時も、1回触れば出る
  const pass = afterFirst === expectFirst && afterSecond && topmost;
  console.log(`${mode === "protected" ? "閲覧時" : "編集時"}: 1回目=${afterFirst ? "写真" : "選択のみ"} / 2回目=${afterSecond ? "写真" : "なし"} / 最前面=${topmost} (${top}) → ${pass ? "OK" : "NG"}`);
  if (pass) { await page.keyboard.press("Escape"); const closed = !(await shown()); console.log("  Esc で閉じる:", closed ? "OK" : "NG"); if (!closed) failed++; }
  else failed++;
  await page.close();
}
await browser.close(); server.close();
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
