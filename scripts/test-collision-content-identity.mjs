/**
 * 当たり判定キャッシュの「中身で決まる識別子」の検査（2026-09-21）。
 *
 *   node --test scripts/test-collision-content-identity.mjs
 *
 * locahun3d.com は同じRADを埋め込み・共有・限定プレビュー・編集画面の別URLで配り、
 * 参照保存のZIPキーも保存のたびに変わる。URL込みの識別子だと毎回作り直しになるため、
 * サイトが ?ref=stream に付ける "l3d-content-…" ETag ならURLを無視して識別する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/217b_whole_collision_bridge.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, URL });
vm.runInContext(source, context);
const identity = context._wholeContentIdentity;
const page = 'https://locahun3d.com/embed/abc?x=1';
const etag = '"l3d-content-d41d8cd98f00b204e9800998ecf8427e-3-4096"';

test('トークンや経路が違っても、同じ中身なら同じ識別子', () => {
  const urls = [
    '/api/viewer-stream/assets/p1/scene-111.zip?ref=stream&embed=AAA',
    '/api/viewer-stream/assets/p1/scene-222.zip?ref=stream&preview=BBB',
    'https://locahun3d.com/api/viewer-stream/assets/p1/scene-333.zip?ref=stream&share=CCC',
    '/api/scene-edit/source?sessionKey=' + 'a'.repeat(64) + '&ref=stream',
  ];
  const ids = urls.map((url) => identity(url, etag, '123456', page));
  assert.equal(ids[0], 'content:d41d8cd98f00b204e9800998ecf8427e-3-4096:123456');
  for (const id of ids) assert.equal(id, ids[0]);
});

test('別オリジンの配信には使わない', () => {
  assert.equal(identity('https://evil.example/x.rad', etag, '123456', page), null);
});

test('形式の違う ETag・弱い ETag・短すぎる値は使わない', () => {
  assert.equal(identity('/a.rad', '"abcdef0123456789"', '1', page), null);
  assert.equal(identity('/a.rad', 'W/"l3d-content-abcdefgh-0"', '1', page), null);
  assert.equal(identity('/a.rad', '"l3d-content-abc"', '1', page), null);
  assert.equal(identity('/a.rad', '"l3d-content-abc/defgh-0"', '1', page), null);
});

test('長さが数字でなければ使わない', () => {
  assert.equal(identity('/a.rad', etag, '', page), null);
  assert.equal(identity('/a.rad', etag, null, page), null);
  assert.equal(identity('/a.rad', etag, '12a', page), null);
});

test('長さが違えば別の識別子', () => {
  assert.notEqual(identity('/a.rad', etag, '1', page), identity('/a.rad', etag, '2', page));
});

test('ページURLが無い・壊れていれば使わない', () => {
  assert.equal(identity('/a.rad', etag, '1', undefined), null);
});
