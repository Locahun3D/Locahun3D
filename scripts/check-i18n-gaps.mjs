// Static i18n check: every key in I18N.ja must exist in I18N.en and vice-versa,
// and every key referenced from markup (data-i18n*) must exist in both.
// Run: node scripts/check-i18n-gaps.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = path.join(root, 'src/js');
const read = f => fs.readFileSync(f, 'utf8');

// 1. Collect dictionaries. The base `const I18N = {...};` literal plus every
//    `Object.assign(I18N.xx,{...});` block is cut out by regex and evaluated
//    in an empty sandbox (the blocks are plain object literals).
const I18N = {ja: {}, en: {}};
const base = read(path.join(jsDir, '250_i18n.js')).match(/const I18N\s*=\s*(\{[\s\S]*?\n\});/);
if (!base) { console.error('FAIL: base I18N literal not found in 250_i18n.js'); process.exit(1); }
const baseObj = vm.runInNewContext('(' + base[1] + ')');
Object.assign(I18N.ja, baseObj.ja); Object.assign(I18N.en, baseObj.en);
for (const file of fs.readdirSync(jsDir).filter(f => /i18n/.test(f)).sort()) {
  const src = read(path.join(jsDir, file));
  for (const m of src.matchAll(/Object\.assign\(I18N\.(ja|en)\s*,\s*(\{[\s\S]*?\n\})\);/g)) {
    Object.assign(I18N[m[1]], vm.runInNewContext('(' + m[2] + ')'));
  }
}

// 2. Keys referenced from markup.
const markup = [path.join(root, 'src/template.html'),
  ...fs.readdirSync(path.join(root, 'src/html')).map(f => path.join(root, 'src/html', f))];
const used = new Map();
for (const file of markup) {
  for (const m of read(file).matchAll(/data-i18n(?:-title|-aria|-ph)?="([^"]+)"/g)) {
    if (!used.has(m[1])) used.set(m[1], path.relative(root, file));
  }
}

const ja = Object.keys(I18N.ja), en = Object.keys(I18N.en);
const missingEn = ja.filter(k => !(k in I18N.en));
const missingJa = en.filter(k => !(k in I18N.ja));
const missingUsed = [...used].filter(([k]) => !(k in I18N.ja) || !(k in I18N.en));
const JP = /[぀-ヿ一-鿿]/;
// English values that still contain Japanese (the brand name is a proper noun).
const jpInEn = en.filter(k => typeof I18N.en[k] === 'string' && JP.test(I18N.en[k].replace(/ロケハン3D/g, '')));

console.log(`ja keys: ${ja.length}  en keys: ${en.length}  markup keys: ${used.size}`);
const report = (label, list) => { console.log(`${label}: ${list.length}`); for (const x of list) console.log('  - ' + (Array.isArray(x) ? `${x[0]}  (${x[1]})` : x)); };
report('in ja, missing in en', missingEn);
report('in en, missing in ja', missingJa);
report('markup keys missing from a dictionary', missingUsed);
report('en values containing Japanese', jpInEn);
const bad = missingEn.length + missingJa.length + missingUsed.length + jpInEn.length;
console.log(bad ? 'FAIL' : 'OK');
process.exit(bad ? 1 : 0);
