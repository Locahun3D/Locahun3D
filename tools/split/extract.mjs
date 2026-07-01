// 元HTMLを cuts.json の行範囲どおりに src/ へ機械分割する使い捨てツール。
// 使い方: node tools/split/extract.mjs <original.html> <cuts.json> <outdir>
// cuts.json: [{ out, start, end }] 1始まり・両端含む行番号。
//   out が "template" の範囲は src/template.html に原文のまま残り、
//   それ以外は out のパスへ書き出され、template には {{include:out}} 行が入る。
// 検証: 範囲が元ファイル全行を隙間なく・重複なく・昇順に被覆しない限り何も書かない。
import fs from 'node:fs';
import path from 'node:path';

const [, , origPath, cutsPath, outDir] = process.argv;
if (!origPath || !cutsPath || !outDir) {
  console.error('usage: node extract.mjs <original.html> <cuts.json> <outdir>');
  process.exit(1);
}

// latin1 = バイト1:1のまま文字列化（EOL変換なし）
const orig = fs.readFileSync(origPath, 'latin1');
if (!orig.endsWith('\n')) { console.error('FATAL: original must end with \\n'); process.exit(1); }
const lines = orig.split('\n');           // 末尾\nのため最終要素は空文字
lines.pop();                              // 実データ行のみに
const N = lines.length;

const cuts = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));

// ── 被覆検証: 昇順・隙間なし・重複なし・全行 ──
let expect = 1;
for (const c of cuts) {
  if (c.start !== expect) { console.error(`FATAL: gap/overlap at line ${expect} (got start=${c.start} for ${c.out})`); process.exit(1); }
  if (c.end < c.start) { console.error(`FATAL: end<start in ${JSON.stringify(c)}`); process.exit(1); }
  expect = c.end + 1;
}
if (expect !== N + 1) { console.error(`FATAL: coverage ends at ${expect - 1}, file has ${N} lines`); process.exit(1); }

// ── 書き出し ──
const slice = (s, e) => lines.slice(s - 1, e).join('\n') + '\n';
let template = '';
const written = [];
for (const c of cuts) {
  const body = slice(c.start, c.end);
  if (c.out === 'template') { template += body; continue; }
  const p = path.join(outDir, c.out);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, 'latin1');
  written.push(c.out);
  template += `{{include:${c.out}}}\n`;
}
fs.mkdirSync(path.join(outDir, 'src'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'src', 'template.html'), template, 'latin1');
console.log(`OK: template + ${written.length} fragments -> ${outDir}`);
