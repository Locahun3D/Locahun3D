// 正本HTMLから cuts.json の下書きを生成する。
// ルール:
//  - <style>...</style> の中身 → src/css/NNN_style_block.css（タグ行はtemplate残し）
//  - importmap / MIXAMO_GLB_B64 のscript中身 → assets/ へ
//  - <script type="module"> の中身 → // ══ セクションマーカー境界で src/js/NNN_<slug>.js
//  - その他すべて template
// 使い方: node tools/split/gen-cuts.mjs <original.html> > tools/split/cuts.json
import fs from 'node:fs';

const orig = fs.readFileSync(process.argv[2], 'latin1');
const lines = orig.split('\n'); lines.pop();
const N = lines.length;
const L = (i) => lines[i - 1]; // 1-based

// ── 特徴行を走査 ──
const styleRanges = [];   // {open, close} タグ行番号
let styleOpen = 0;
let moduleOpen = 0, moduleClose = 0, importmapOpen = 0, importmapClose = 0, mixamoLine = 0;
for (let i = 1; i <= N; i++) {
  const t = L(i);
  if (/^<style>/.test(t)) styleOpen = i;
  if (/^<\/style>/.test(t) && styleOpen) { styleRanges.push({ open: styleOpen, close: i }); styleOpen = 0; }
  if (/MIXAMO_GLB_B64/.test(t) && !mixamoLine) mixamoLine = i;
  if (/<script type="importmap">/.test(t)) importmapOpen = i;
  if (importmapOpen && !importmapClose && i > importmapOpen && /^<\/script>/.test(t)) importmapClose = i;
  if (/<script type="module">/.test(t)) moduleOpen = i;
}
for (let i = N; i >= 1; i--) if (/^<\/script>/.test(L(i))) { moduleClose = i; break; }

// ── moduleスクリプト内のセクション境界 ──
// セクション頭は「marker / タイトル / marker」の3行構造。1本目のmarker行 =
// 自分がmarker・前行が非marker・2行後がmarker、で判定する。
// 注: ファイルはlatin1で読むため box-drawing文字 ═(U+2550)は3バイト 0xE2 0x95 0x90 に分解される。
// ソースリテラルの ═ とは一致しないので、先頭バイト 0xE2 で判定する。
const isM = (i) => i >= 1 && i <= N && /^\/\/ \xe2\x95\x90/.test(L(i));
const secStarts = [];
for (let i = moduleOpen + 1; i < moduleClose; i++) {
  if (isM(i) && !isM(i - 1) && isM(i + 2)) secStarts.push(i);
}
const slug = (title) => (title.replace(/^\/\/\s*/, '').replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '').toLowerCase() || 'section').slice(0, 40);

// ── cuts組み立て ──
const cuts = [];
let cursor = 1;
const pushTemplate = (upto) => { if (upto >= cursor) { cuts.push({ out: 'template', start: cursor, end: upto }); cursor = upto + 1; } };
const pushOut = (out, start, end) => { pushTemplate(start - 1); cuts.push({ out, start, end }); cursor = end + 1; };

let cssIdx = 0;
const marks = [];
for (const r of styleRanges) if (r.close > r.open + 1) marks.push({ s: r.open + 1, e: r.close - 1, out: `src/css/${String(++cssIdx * 10).padStart(3, '0')}_style_block.css` });
if (importmapClose > importmapOpen + 1) marks.push({ s: importmapOpen + 1, e: importmapClose - 1, out: 'src/assets/importmap.json' });
if (mixamoLine) marks.push({ s: mixamoLine, e: mixamoLine, out: 'src/assets/mixamo_glb_b64.html' });
let jsIdx = 0;
for (let k = 0; k < secStarts.length; k++) {
  const s = k === 0 ? moduleOpen + 1 : secStarts[k];
  const e = k + 1 < secStarts.length ? secStarts[k + 1] - 1 : moduleClose - 1;
  const title = slug(L(secStarts[k] + 1) || `sec${k}`);
  marks.push({ s, e, out: `src/js/${String(++jsIdx * 10).padStart(3, '0')}_${title}.js` });
}
marks.sort((a, b) => a.s - b.s);
for (const m of marks) pushOut(m.out, m.s, m.e);
pushTemplate(N);

process.stdout.write(JSON.stringify(cuts, null, 1) + '\n');
console.error(`sections=${jsIdx} css=${cssIdx} total_cuts=${cuts.length}`);
