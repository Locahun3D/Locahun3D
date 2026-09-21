/**
 * 「空の動画を撮らない」判定の検査（2026-09-21）。
 *
 *   node --test scripts/test-capture-empty-guard.mjs
 *
 * 本番で、編集後の参照保存シーンの配信が壊れていた間に、レイヤーだけできて
 * 中身が0粒のまま10秒の周回を撮り、青空だけの動画が掲載スタジオ向けの
 * 埋め込みサムネイルになっていた。撮る前の判定をここで固定する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/298_admin_capture_harness.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: {}, location: { search: '' }, console });
vm.runInContext(source, context);
const verdict = context.window._captureVerdict;

test('0粒なら撮らない（レイヤーがあっても）', () => {
  assert.equal(verdict(0, true), 'no-splats');
  assert.equal(verdict(0, false), 'no-splats');
});

test('シーンも数も無ければ撮らない', () => {
  assert.equal(verdict(-1, false), 'no-scene');
});

test('数えられない形式でも、描画対象があれば撮る（従来どおり）', () => {
  assert.equal(verdict(-1, true), 'ok');
});

test('粒が入っていれば撮る', () => {
  assert.equal(verdict(1, false), 'ok');
  assert.equal(verdict(4_000_000, true), 'ok');
});
