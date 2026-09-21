/**
 * ZIP の中の無圧縮 .rad を、Range 付きでそのまま配るだけの小さなサーバー（検証用・2026-09-21）。
 * サイトの /api/scene-edit/source?ref=stream と同じ振る舞いを手元で再現する。
 *
 *   node scripts/zip-window-server.mjs --zip <ZIP> [--port 8car] [--latency 150]
 */
import http from "node:http";
import fs from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const ZIP = arg("--zip");
const PORT = +arg("--port", 8123);
const LATENCY = +arg("--latency", 150);

const head = Buffer.alloc(1024);
const fd = fs.openSync(ZIP, "r");
fs.readSync(fd, head, 0, 1024, 0);
const size = head.readUInt32LE(18);
const nameLen = head.readUInt16LE(26), extraLen = head.readUInt16LE(28);
const innerName = head.subarray(30, 30 + nameLen).toString();
const dataStart = 30 + nameLen + extraLen;
let served = 0, requests = 0;

http.createServer((req, res) => {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "range",
    "access-control-expose-headers": "content-range,content-length,accept-ranges",
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (new URL(req.url, "http://x").pathname === "/stats") {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    return res.end(JSON.stringify({ requests, servedMb: +(served / 1048576).toFixed(1), totalMb: +(size / 1048576).toFixed(1), innerName }));
  }
  requests++;
  if (process.env.LOG_RANGES) console.log(requests, req.method, req.headers.range || "(no range)");
  if (req.method === "HEAD") {
    // 本文は返さない（読み込み量にも数えない）。照合のための問い合わせ。
    res.writeHead(200, { ...cors, "accept-ranges": "bytes", "content-length": size, "content-type": "application/octet-stream", etag: '"zipwindow"' });
    return res.end();
  }
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  const headers = { ...cors, "content-type": "application/octet-stream", "accept-ranges": "bytes", "cache-control": "no-store" };
  setTimeout(() => {
    if (!m) {
      served += size;
      res.writeHead(200, { ...headers, "content-length": size });
      return fs.createReadStream(ZIP, { start: dataStart, end: dataStart + size - 1 }).pipe(res);
    }
    const a = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    const b = m[1] ? (m[2] ? Math.min(+m[2], size - 1) : size - 1) : size - 1;
    served += b - a + 1;
    res.writeHead(206, { ...headers, "content-range": `bytes ${a}-${b}/${size}`, "content-length": b - a + 1 });
    fs.createReadStream(ZIP, { start: dataStart + a, end: dataStart + b }).pipe(res);
  }, LATENCY);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${innerName} (${(size / 1048576).toFixed(0)}MB, offset ${dataStart}) on http://127.0.0.1:${PORT}/source`);
});
