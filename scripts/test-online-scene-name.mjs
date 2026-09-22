/**
 * 編集画面で出すシーン名と、段階読み込みで引き継ぐ project.json の検査（2026-09-21）。
 *
 *   node --test scripts/test-online-scene-name.mjs
 *
 * 本体だけで開いていた頃は、名前がファイル名（0_ShinjukuKabukiGate.rad）になり、
 * 方角合わせ（本体の回転 53.6°）も消えて保存されていた。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/311_zip_load_core.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: {}, console });
vm.runInContext(source, context);
const { _onlineSceneDisplayName: name, _onlineStreamBaseProject: base } = context.window;
const LABEL = '歌舞伎町ゲート｜劇場通り一番街';

test('ファイル名のままの名前は、物件側のシーン名に置き換える', () => {
  assert.equal(name('0_ShinjukuKabukiGate.rad', '0_ShinjukuKabukiGate.rad', LABEL), LABEL);
  assert.equal(name('ShinjukuKabukiGate', '0_ShinjukuKabukiGate.rad', LABEL), LABEL);
  assert.equal(name('Untitled Project', 'x.rad', LABEL), LABEL);
  assert.equal(name('', 'x.rad', LABEL), LABEL);
});

test('人が付けた名前はそのまま残す', () => {
  assert.equal(name('劇場通り 夜景版', '0_ShinjukuKabukiGate.rad', LABEL), '劇場通り 夜景版');
});

test('物件側の名前が無ければ、今の名前かファイル名を使う', () => {
  assert.equal(name('0_x.rad', '0_x.rad', ''), '0_x.rad');
});

test('project.json は形が正しいときだけ使う', () => {
  assert.equal(base('{"version":4,"layers":[{"type":"splat","rot":{"x":0,"y":53.6,"z":0}}]}').layers[0].rot.y, 53.6);
  assert.equal(base('{"version":9,"layers":[]}'), null);
  assert.equal(base('こわれた'), null);
  assert.equal(base(''), null);
});
