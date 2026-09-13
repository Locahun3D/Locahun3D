import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto, createHash } from 'node:crypto';

const require = createRequire('F:/Htlml/kawaii-motion/package.json');
const { parseHTML } = require('linkedom');
const read = name => fs.readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
const figure = read('270_figure_humanoid_wooden_mannequin_with_ri.js');
const loader = figure.slice(figure.indexOf('let _mixamoCache ='), figure.indexOf('function _findBoneByName'));
const data = { hiace: { glb: 'AA==', thumbnail: 'data:image/png;base64,AA==' } };
const bytes = Buffer.from(JSON.stringify(data));
const descriptor = { version: 1, url: '/vendor/models/equipment-test.json', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex') };

function fixture(embedded = false) {
  const { document, HTMLElement } = parseHTML('<html><body><script id="equipment-assets" type="application/json"></script><button id="open"></button><div id="obj-type-menu-top" style="display:none"><button id="cube">Cube</button></div></body></html>');
  HTMLElement.prototype.focus = function() { document.focusedElement = this; };
  document.getElementById('equipment-assets').textContent = JSON.stringify(embedded ? data : descriptor);
  const button = document.getElementById('open');
  button.getBoundingClientRect = () => ({ left: 20, bottom: 40 });
  let calls = 0, parses = 0;
  const c = vm.createContext({ document, console, Uint8Array, TextDecoder, URL, crypto: webcrypto, atob,
    AbortController, setTimeout, clearTimeout,
    innerWidth: 1000, innerHeight: 800, walkSetup: { epoch: 1 },
    LocahunEquipment: { catalog: [{ id: 'hiace', category: 'vehicles', name: 'Hiace', en: 'Hiace' }] },
    fetch: async () => { calls++; return new Response(bytes); },
    _addonLoader: async () => class { parse(buffer, path, done) { parses++; done({ scene: {}, buffer }); } },
    showUndoToast: message => { c.error = message; },
  });
  c.window = c;
  c.closeObjTypeMenuTop = () => { document.getElementById('obj-type-menu-top').style.display = 'none'; };
  vm.runInContext(loader + '\n' + read('275_equipment_menu.js'), c);
  return { c, button, document, calls: () => calls, parses: () => parses,
    open: () => c.toggleEquipmentModelMenu(button), run: code => vm.runInContext(code, c) };
}

test('unused HTTP equipment and figure loaders make zero requests', () => {
  const f = fixture(); assert.equal(f.calls(), 0); assert.equal(f.parses(), 0);
});
test('equipment first menu use fetches once, later reopen is cached', async () => {
  const f = fixture(); await f.open();
  assert.equal(f.calls(), 1);
  assert.equal(f.document.querySelectorAll('[data-equipment-id]').length, 1);
  f.c.closeObjTypeMenuTop(); await f.open(); assert.equal(f.calls(), 1);
});
test('embedded offline equipment menu remains synchronous with zero requests', () => {
  const f = fixture(true); f.open();
  assert.equal(f.calls(), 0); assert.equal(f.document.querySelectorAll('[data-equipment-id]').length, 1);
});
test('close/reopen during load shares one request and never reopens after close', async () => {
  const f = fixture(); let release, calls = 0;
  f.c.fetch = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = f.open(); f.c.closeObjTypeMenuTop(); const second = f.open();
  f.c.closeObjTypeMenuTop(); release(new Response(bytes)); await Promise.all([first, second]);
  assert.equal(calls, 1); assert.equal(f.document.getElementById('obj-type-menu-top').style.display, 'none');
  assert.equal(f.document.getElementById('obj-type-menu-top').getAttribute('aria-busy'), null);
});
test('scene change while optional assets load does not open or place anything', async () => {
  const f = fixture(); let release;
  f.c.fetch = () => new Promise(resolve => { release = resolve; });
  const pending = f.open(); f.c.walkSetup.epoch++; release(new Response(bytes)); await pending;
  assert.equal(f.document.getElementById('obj-type-menu-top').style.display, 'none');
  assert.equal(f.document.querySelectorAll('[data-equipment-id]').length, 0);
});
test('Escape during the first pending menu load dismisses it and returns focus', async () => {
  const f = fixture(); let release;
  f.c.fetch = () => new Promise(resolve => { release = resolve; });
  const pending = f.open();
  const event = new f.document.defaultView.Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: 'Escape' });
  f.document.dispatchEvent(event);
  assert.equal(f.document.getElementById('obj-type-menu-top').style.display, 'none');
  assert.equal(f.document.focusedElement, f.button);
  assert.equal(event.defaultPrevented, true);
  release(new Response(bytes)); await pending;
  assert.equal(f.document.getElementById('obj-type-menu-top').style.display, 'none');
  assert.equal(f.document.focusedElement, f.button);
});
test('failed/corrupt equipment load is handled and can be retried', async () => {
  const f = fixture(); f.c.fetch = async () => new Response(Buffer.alloc(bytes.length));
  await f.open(); assert.ok(f.c.error);
  assert.equal(f.document.querySelectorAll('[data-equipment-id]').length, 0);
  f.c.fetch = async () => new Response(bytes); await f.open();
  assert.equal(f.document.querySelectorAll('[data-equipment-id]').length, 1);
});
test('optional figure exact bytes are lazy, concurrent requests and parses coalesce', async () => {
  const f = fixture(); f.c.MIXAMO_GLB_ASSET = descriptor;
  const [a, b] = await Promise.all([f.run('_fetchMixamoGLB()'), f.run('_fetchMixamoGLB()')]);
  assert.equal(a, b); assert.equal(f.calls(), 1); assert.equal(f.parses(), 1);
});
test('embedded figure wins over descriptor and makes no request', async () => {
  const f = fixture(); f.c.MIXAMO_GLB_ASSET = descriptor; f.c.MIXAMO_GLB_B64 = 'AA==';
  await f.run('_fetchMixamoGLB()'); assert.equal(f.calls(), 0); assert.equal(f.parses(), 1);
});
test('failed figure downloads can retry without retaining a rejected promise', async () => {
  const f = fixture(); f.c.MIXAMO_GLB_ASSET = descriptor;
  f.c.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(f.run('_fetchMixamoGLB()'), /503/);
  f.c.fetch = async () => new Response(bytes);
  await f.run('_fetchMixamoGLB()'); assert.equal(f.parses(), 1);
});
test('stalled model download aborts and clears the single-flight request for retry', async () => {
  const f = fixture(); f.c.MIXAMO_GLB_ASSET = descriptor; let signal;
  f.c.setTimeout = (fn, ms) => setTimeout(fn, ms === 15000 ? 5 : ms);
  f.c.fetch = (url, options) => new Promise((resolve, reject) => {
    signal = options.signal; signal.addEventListener('abort', () => reject(Error('aborted')));
  });
  await assert.rejects(f.run('_fetchMixamoGLB()'), /aborted/); assert(signal.aborted);
  f.c.fetch = async () => new Response(bytes); await f.run('_fetchMixamoGLB()');
  assert.equal(f.parses(), 1);
});
test('oversized uncompressed content length is rejected before reading the body', async () => {
  const f = fixture(); f.c.MIXAMO_GLB_ASSET = descriptor;
  let read = false, cancelled = false;
  f.c.fetch = async () => ({ ok: true, headers: new Headers({ 'content-length': String(3 * 1024 * 1024) }),
    body: { cancel: async () => { cancelled = true; } },
    arrayBuffer: async () => { read = true; return new ArrayBuffer(3 * 1024 * 1024); } });
  await assert.rejects(f.run('_fetchMixamoGLB()'), /size/);
  assert.equal(read, false); assert.equal(cancelled, true);
});
test('chunked oversized decoded body cancels before accumulation and permits retry', async () => {
  const f = fixture(); f.c.MIXAMO_GLB_ASSET = descriptor; let cancelled = false;
  f.c.fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(bytes.length)); controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(f.run('_fetchMixamoGLB()'), /size/); assert.equal(cancelled, true);
  f.c.fetch = async () => new Response(bytes); await f.run('_fetchMixamoGLB()');
  assert.equal(f.parses(), 1);
});
test('compressed content length does not override exact decoded byte validation', async () => {
  const f = fixture(); f.c.MIXAMO_GLB_ASSET = descriptor;
  // Fetch exposes decoded bytes but retains the wire-encoding headers.
  f.c.fetch = async () => new Response(bytes, { headers: { 'content-encoding': 'gzip', 'content-length': String(bytes.length + 20) } });
  await f.run('_fetchMixamoGLB()'); assert.equal(f.parses(), 1);
});
