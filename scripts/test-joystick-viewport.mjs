import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const source = read('src/js/070_3d.js');
const begin = source.indexOf('// Resize handler.');
const end = source.indexOf('// \u2500\u2500 Browser fullscreen toggle', begin);
assert.ok(begin >= 0 && end > begin);
const resize = source.slice(begin, end);

function fixture(ipad = true, viewport = { height: 880, offsetTop: 0, scale: 1 }) {
  const properties = {}, events = {}, visualEvents = {};
  let rendererResizes = 0;
  const context = vm.createContext({
    _isIPad: ipad, innerWidth: 820, innerHeight: 1000,
    document: { documentElement: { style: { setProperty: (k, v) => { properties[k] = v; } } } },
    window: { visualViewport: viewport && { ...viewport, addEventListener: (k, fn) => { visualEvents[k] = fn; } },
      addEventListener: (k, fn) => { events[k] = fn; } },
    renderer: { setSize() { rendererResizes++; } }, camera: { updateProjectionMatrix() {} },
    _syncOrthoCamera() {}, markDirty() {}, requestAnimationFrame() {}, setTimeout() {},
  });
  vm.runInContext(resize, context);
  return { context, properties, events, visualEvents, rendererResizes: () => rendererResizes };
}

test('iPad initial viewport inset is applied without waiting for resize', () => {
  const h = fixture();
  assert.match(h.properties['--joy-viewport-bottom'] || '', /120px/);
  assert.match(h.properties['--joy-viewport-bottom'], /safe-area-inset-bottom/);
});
test('iPad visible viewport resize and scroll refresh the bottom inset', () => {
  const h = fixture();
  h.context.window.visualViewport.height = 950;
  h.context.window.visualViewport.offsetTop = 20;
  h.visualEvents.resize();
  assert.match(h.properties['--joy-viewport-bottom'] || '', /30px/);
  h.context.window.visualViewport.offsetTop = 50;
  h.visualEvents.scroll();
  assert.match(h.properties['--joy-viewport-bottom'], /0px/);
});
test('pageshow refreshes initial viewport state', () => {
  const h = fixture();
  h.context.window.visualViewport.height = 900;
  h.events.pageshow();
  assert.match(h.properties['--joy-viewport-bottom'] || '', /100px/);
});
test('non-iPad and absent visualViewport keep the existing 24px fallback', () => {
  for (const h of [fixture(false), fixture(true, null)]) {
    assert.equal(h.properties['--joy-viewport-bottom'], undefined);
  }
});
test('initial layout and viewport scroll do not resize the renderer; capture guard remains', () => {
  const h = fixture();
  assert.equal(h.rendererResizes(), 0);
  h.visualEvents.scroll();
  assert.equal(h.rendererResizes(), 0);
  h.context.window._captureBusy = true;
  h.visualEvents.resize();
  assert.equal(h.rendererResizes(), 0);
  h.context.window._captureBusy = false;
  h.visualEvents.resize();
  assert.equal(h.rendererResizes(), 1);
});
test('negative inset clamps to zero and invalid measurements do not poison CSS', () => {
  const h = fixture(true, { height: 1200, offsetTop: 0 });
  assert.match(h.properties['--joy-viewport-bottom'], /calc\(0px/);
  const before = h.properties['--joy-viewport-bottom'];
  h.context.window.visualViewport.height = NaN;
  h.visualEvents.scroll();
  assert.equal(h.properties['--joy-viewport-bottom'], before);
});

test('CSS-only Chrome initial/rotated iPad and phone/desktop bounds', { skip: !process.env.JOYSTICK_VIEWPORT_BROWSER }, async () => {
  const require = createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
  const { chromium } = require('playwright');
  const template = read('src/template.html');
  const css = [...template.matchAll(/\{\{include:(src\/css\/[^}]+)\}\}/g)].map(m => read(m[1])).join('\n');
  assert.ok(css.includes('#joy{'));
  const out = path.resolve('F:/Codex/locahun-performance-20260912/joystick-viewport-' + Date.now());
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  let browser;
  const timeout = setTimeout(() => { void browser?.close(); }, 70000);
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'], timeout: 10000 });
    for (const device of [
      { name: 'ipad-portrait', width: 820, height: 1180, inset: 120, touch: true, ipad: true },
      { name: 'ipad-landscape', width: 1180, height: 820, inset: 120, touch: true, ipad: true },
      { name: 'phone', width: 390, height: 844, inset: 0, touch: true, ipad: false },
      { name: 'desktop', width: 1280, height: 800, inset: 0, touch: false, ipad: false },
    ]) {
      const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        await page.route('**/*', route => route.abort());
        await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="joy"><div class="base"></div><div class="knob" id="jknob"></div></div><div id="joy-vert"><button class="jv-btn" id="jv-up">&#9650;</button><button class="jv-btn" id="jv-down">&#9660;</button></div>`);
        await page.evaluate(({ code, ipad, inset }) => {
          window._isIPad = ipad;
          // Deterministic browser-chrome occlusion, not an emulation of Safari internals.
          window.testViewport = new EventTarget();
          Object.assign(testViewport, { height: innerHeight - inset, offsetTop: 0, scale: 1 });
          Object.defineProperty(window, 'visualViewport', { configurable: true, value: testViewport });
          window.renderer = { setSize() {} }; window.camera = { updateProjectionMatrix() {} };
          window._syncOrthoCamera = () => {}; window.markDirty = () => {};
          (0, eval)(code);
        }, { code: resize, ipad: device.ipad, inset: device.inset });
        for (const phase of ['initial', 'rotated']) {
          if (phase === 'rotated') {
            await page.setViewportSize({ width: device.height, height: device.width });
            await page.evaluate(() => { testViewport.height = innerHeight; testViewport.dispatchEvent(new Event('resize')); });
          }
          const result = await page.evaluate(() => ({ height: visualViewport.height, controls: ['joy', 'joy-vert'].map(id => {
            const el = document.getElementById(id), r = el.getBoundingClientRect();
            return { id, display: getComputedStyle(el).display, top: r.top, bottom: r.bottom, width: r.width };
          }) }));
          const file = `${device.name}-${phase}.png`;
          await page.screenshot({ path: path.join(out, file), clip: { x: 0, y: 0, width: page.viewportSize().width, height: result.height } });
          results.push({ device: device.name, phase, file, ...result });
        }
      } finally { await context.close(); }
    }
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ scope: 'Canonical CSS and resize source; synthetic visualViewport occlusion; no full viewer/WebGL or real iPad Safari.', results }, null, 2));
    console.log('Viewport evidence: ' + out);
    for (const row of results) for (const control of row.controls) {
      if (row.device === 'desktop') assert.equal(control.display, 'none');
      else {
        assert.notEqual(control.display, 'none');
        assert.ok(control.top >= 0 && control.bottom <= row.height - 24 + 1, JSON.stringify({ ...row, control }));
      }
    }
  } finally { clearTimeout(timeout); await browser?.close(); }
});
