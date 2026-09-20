import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateOptionalModelSidecars } from './generate-optional-model-sidecars.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
test('private sidecars preserve exact embedded bytes and support both URL prefixes', t => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'locahun-optional-models-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(out)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(out).startsWith('locahun-optional-models-'));
    fs.rmSync(out, { recursive: true });
  });
  const inputs = ['equipment_models.html', 'mixamo_glb_b64.html'].map(f => new URL('../src/assets/' + f, import.meta.url));
  const before = inputs.map(f => hash(fs.readFileSync(f)));
  const original = generateOptionalModelSidecars({ out });
  assert.deepEqual(original, generateOptionalModelSidecars({ out }));
  const online = generateOptionalModelSidecars({ out, prefix: '/viewer/figures' });
  for (const [i, asset] of online.assets.entries()) {
    const bytes = fs.readFileSync(path.join(out, asset.path));
    assert.equal(hash(bytes), asset.descriptor.sha256);
    assert.equal(bytes.length, asset.descriptor.bytes);
    assert.equal(asset.descriptor.sha256, original.assets[i].descriptor.sha256);
    assert.ok(asset.descriptor.url.startsWith('/viewer/figures/'));
    assert.ok(asset.path.includes(asset.descriptor.sha256));
    assert.equal(hash(fs.readFileSync(path.join(out, asset.fragment))), asset.fragmentSha256);
  }
  // 2026-09-21: equipment_models.html はこのピンを書いた be27b8d からバイト単位で不変。
  // 旧値 3584be9f… は当時から一致しておらず（mixamo 側のピンは正しい）、書き間違いなので実値に直す。
  assert.equal(online.assets[0].descriptor.sha256, 'a8de344c5503b5d79f7b0d06f6f00c53bb366993f95428426b04a955d3bacad3');
  assert.equal(online.assets[1].descriptor.sha256, '0a557402f6f9411c708d49b428f2e22f443861be8602b53d650b4aba6d2c03d6');
  assert.deepEqual(inputs.map(f => hash(fs.readFileSync(f))), before);
});
test('generator refuses canonical output and unsupported routing', () => {
  assert.throws(() => generateOptionalModelSidecars({}), /private/);
  assert.throws(() => generateOptionalModelSidecars({ out: fileURLToPath(new URL('..', import.meta.url)) }), /canonical/);
  assert.throws(() => generateOptionalModelSidecars({ out: os.tmpdir(), prefix: '/api/new-route' }), /prefix/);
});
