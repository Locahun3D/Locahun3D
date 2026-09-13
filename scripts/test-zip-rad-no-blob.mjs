import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/312_project_load_helpers.js', import.meta.url), 'utf8');
const start = source.indexOf("} else if(entry.type==='splat'){");
const end = source.indexOf("} else if(entry.type==='light'){", start);
assert.ok(start > 0 && end > start);
const branch = source.slice(start, end).replace('} else if', 'if') + '}';

async function restore(ext) {
  const bytes = new Uint8Array([82, 65, 68, 0, 10]);
  const entry = { type: 'splat', name: 'fixture', file: 'fixture.' + ext, _ext: ext, _buf: bytes.buffer };
  let blobs = 0, urls = 0;
  const mesh = await vm.runInNewContext(`(async () => { let mesh; ${branch}; return mesh; })()`, {
    entry, opts: { strict: true }, ArrayBuffer, Uint8Array,
    Blob: class { constructor() { blobs++; } },
    URL: { createObjectURL() { urls++; return 'blob:fixture'; } },
    SPARK_QUALITY_OPTS: {},
    PagedSplats: class { constructor(options) { this.options = options; } },
    SplatMesh: class { constructor(options) { this.options = options; } },
    _splatFileTypeFor: value => value.toUpperCase(),
    _radEffectiveLodScale: () => .5, _parseRadHeaderCount: () => 42,
    tuneSplatMesh() {}, console: { log() {} },
  });
  return { mesh, blobs, urls, bytes };
}

test('ZIP RAD uses owned fileBytes without retaining an unused Blob URL', async () => {
  const r = await restore('rad');
  assert.equal(r.blobs, 0);
  assert.equal(r.urls, 0);
  const options = r.mesh.options;
  assert.equal(options.url, undefined);
  assert.equal(options.paged.options.fileType, 'RAD');
  assert.notEqual(options.paged.options.fileBytes.buffer, r.bytes.buffer);
  assert.deepEqual(options.paged.options.fileBytes, r.bytes);
  assert.equal(r.bytes.byteLength, 5);
  assert.equal(options.lod, true);
  assert.equal(options.enableLod, true);
  assert.equal(options.lodScale, .5);
  assert.equal(r.mesh._radTargetCount, 42);
});
for (const ext of ['splat', 'ply', 'spz']) {
  test('ZIP ' + ext + ' keeps existing Blob decoding and explicit fileType', async () => {
    const r = await restore(ext);
    assert.equal(r.blobs, 1);
    assert.equal(r.urls, 1);
    assert.equal(r.mesh.options.url, 'blob:fixture');
    assert.equal(r.mesh.options.fileType, ext.toUpperCase());
    assert.equal(r.mesh.options.paged, undefined);
  });
}
