// 単一HTML組み立てビルド。src/template.html の {{include:path}} 行を
// 各断片ファイルの中身で置換して Locahun3D_OfflineViewer.html を出力する。
// バイト保存のため一貫して latin1 で読み書きする（EOL変換なし）。
// 使い方: node build.mjs [--online] [--web] [--force] [--src <dir>] [--out <file>]
//   --force: 出力先が前回ビルド後に手編集されていても上書きする
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stampViewer } from './scripts/prepare-viewer-release.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const FORCE   = args.includes('--force');
const ONLINE  = args.includes('--online');
const WEB     = args.includes('--web');
const ROOT    = path.dirname(fileURLToPath(import.meta.url));
const SRC     = opt('--src', path.join(ROOT, 'src'));
const BASE    = path.dirname(SRC);   // include相対パス(src/js/...)の基準 = srcの親
const SUFFIX  = (ONLINE ? '.online' : '') + (WEB ? '.web' : '');
const OUT     = opt('--out', path.join(ROOT, `Locahun3D_OfflineViewer${SUFFIX}.html`));
const HASHREC = path.join(ROOT, `.build-hash${SUFFIX}`);

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// A slim viewer must not replace an embedded distribution via an accidental --out.
const outputKey = (p) => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
if (WEB && ['Locahun3D_OfflineViewer.html', 'Locahun3D_OfflineViewer.online.html']
  .some(name => outputKey(OUT) === outputKey(path.join(ROOT, name)))) {
  console.error('FATAL: web output must be separate from embedded viewer artifacts.');
  process.exit(1);
}

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

const resolveInclude = (rel) => {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) { console.error(`FATAL: missing fragment ${rel}`); missing++; return ''; }
  const body = fs.readFileSync(p, 'latin1');
  if (body.length === 0) { console.error(`FATAL: empty fragment ${rel}`); missing++; return ''; }
  return body;
};

// {{include-variant:path/to/base.json}} resolves to base.json normally, or to
// base.online.json (inserting ".online" before the extension) when --online
// is passed. Currently only used for the importmap (Spark import path differs:
// the standalone single-file download has no folder of its own so it needs an
// absolute CDN URL, while the online SaaS serves its own vendor/ copy alongside
// this file and can use a same-origin relative path — see sync-online-viewer.sh).
let html = template.replace(/^\{\{include-variant:(.+?)\}\}\n/gm, (_m, rel) => {
  if (!ONLINE) return resolveInclude(rel);
  const dot = rel.lastIndexOf('.');
  const variantRel = dot === -1 ? `${rel}.online` : `${rel.slice(0, dot)}.online${rel.slice(dot)}`;
  return resolveInclude(variantRel);
});
// Explicit paths allow asset owners to choose descriptor names independently.
// {{include-web:embedded/path.html|web/descriptor.html}} is orthogonal to --online.
html = html.replace(/^\{\{include-web:([^|\r\n]+)\|([^|\r\n]+)\}\}\n/gm,
  (_m, embedded, web) => resolveInclude(WEB ? web : embedded));
html = html.replace(/^\{\{include:(.+?)\}\}\n/gm, (_m, rel) => resolveInclude(rel));

if (missing) process.exit(1);
if (/\{\{include(?:-[\w-]+)?:/.test(html)) {
  console.error('FATAL: unresolved include marker remains');
  process.exit(1);
}

html = stampViewer(html);

fs.writeFileSync(OUT, html, 'latin1');
fs.writeFileSync(HASHREC, sha(fs.readFileSync(OUT)) + '\n');
console.log(`OK: built ${OUT} (${(html.length / 1024).toFixed(0)} KB)${ONLINE ? ' [online variant]' : ''}${WEB ? ' [web delivery]' : ''}`);
