// 単一HTML組み立てビルド。src/template.html の {{include:path}} 行を
// 各断片ファイルの中身で置換して Locahun3D_OfflineViewer.html を出力する。
// バイト保存のため一貫して latin1 で読み書きする（EOL変換なし）。
// 使い方: node build.mjs [--force] [--src <dir>] [--out <file>]
//   --force: 出力先が前回ビルド後に手編集されていても上書きする
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const FORCE   = args.includes('--force');
const ROOT    = path.dirname(fileURLToPath(import.meta.url));
const SRC     = opt('--src', path.join(ROOT, 'src'));
const BASE    = path.dirname(SRC);   // include相対パス(src/js/...)の基準 = srcの親
const OUT     = opt('--out', path.join(ROOT, 'Locahun3D_OfflineViewer.html'));
const HASHREC = path.join(ROOT, '.build-hash');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ── 手編集ガード: 出力先が前回ビルド結果と違うなら停止 ──
if (!FORCE && fs.existsSync(OUT) && fs.existsSync(HASHREC)) {
  const rec = fs.readFileSync(HASHREC, 'utf8').trim();
  const cur = sha(fs.readFileSync(OUT));
  if (rec && cur !== rec) {
    console.error('FATAL: output file was modified since last build (hotfix?).');
    console.error('       Port the change into src/ first, or rerun with --force to discard it.');
    process.exit(1);
  }
}

const template = fs.readFileSync(path.join(SRC, 'template.html'), 'latin1');
let missing = 0;
const html = template.replace(/^\{\{include:(.+?)\}\}\n/gm, (_m, rel) => {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) { console.error(`FATAL: missing fragment ${rel}`); missing++; return ''; }
  const body = fs.readFileSync(p, 'latin1');
  if (body.length === 0) { console.error(`FATAL: empty fragment ${rel}`); missing++; return ''; }
  return body;
});
if (missing) process.exit(1);
if (html.includes('{{include:')) { console.error('FATAL: unresolved {{include:}} marker remains'); process.exit(1); }

fs.writeFileSync(OUT, html, 'latin1');
fs.writeFileSync(HASHREC, sha(fs.readFileSync(OUT)) + '\n');
console.log(`OK: built ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
