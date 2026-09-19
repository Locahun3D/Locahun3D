// Touch layouts must stay inside the area the browser actually shows.
// Emulates an iPad whose toolbars cover the bottom of the layout viewport by
// reporting a shorter visualViewport, then checks every visible fixed control.
// Usage: node scripts/test-visible-viewport.mjs <built viewer html>
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const onlineDir = process.env.LOCAHUN_ONLINE_DIR || new URL('../../locahun3d_online/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const {chromium} = createRequire(path.join(onlineDir, 'package.json'))('playwright');
const file = path.resolve(process.argv[2] || 'Locahun3D_OfflineViewer.html');
const out = path.resolve('docs/visible-viewport-check');
await fs.mkdir(out, {recursive:true});
const html = await fs.readFile(file);
const server = http.createServer((req, res) => {
  if (new URL(req.url, 'http://x').pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/?vvdebug=1';
const browser = await chromium.launch({channel:'chrome', headless:false, args:['--enable-webgl', '--ignore-gpu-blocklist']});
const ipadUA = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
// iOS Safari semantics: script-visible innerHeight / visualViewport already exclude the
// browser toolbars, but the CSS layout viewport (position:fixed, 100vh, inset:0) is taller.
const fakeViewport = hidden => `(() => {
  const target = new EventTarget();
  const layoutHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight') || {get(){return document.documentElement.clientHeight;}};
  const realInner = () => layoutHeight.get ? layoutHeight.get.call(window) : document.documentElement.clientHeight;
  Object.defineProperty(window, 'innerHeight', {configurable:true, get:()=>realInner() - ${hidden}});
  const vv = {get width(){return innerWidth}, get height(){return innerHeight}, offsetTop:0, offsetLeft:0, pageTop:0, pageLeft:0, scale:1,
    addEventListener:(...a)=>target.addEventListener(...a), removeEventListener:(...a)=>target.removeEventListener(...a), dispatchEvent:e=>target.dispatchEvent(e)};
  Object.defineProperty(window, 'visualViewport', {configurable:true, get:()=>vv});
})();`;
const results = [];
async function check(name, contextOptions, hidden) {
  const context = await browser.newContext(contextOptions);
  if (hidden !== null) await context.addInitScript(fakeViewport(hidden));
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, {waitUntil:'load'});
  await page.waitForTimeout(2500);
  const report = await page.evaluate(() => {
    const visibleBottom = (window.visualViewport ? visualViewport.offsetTop + visualViewport.height : innerHeight);
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      if (el.id === 'vv-debug') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // Full-screen layers (inset:0 overlays, canvas) just have to end at the visible edge.
      if (r.bottom > visibleBottom + 1) offenders.push({id: el.id || el.className || el.tagName, bottom: Math.round(r.bottom)});
    }
    const joy = document.getElementById('joy'), rect = joy && joy.getBoundingClientRect();
    const canvas = document.getElementById('c').getBoundingClientRect();
    return {shell: document.documentElement.classList.contains('vv-shell'), innerHeight, visibleBottom: Math.round(visibleBottom),
      joyShown: !!joy && getComputedStyle(joy).display !== 'none', joyBottom: rect ? Math.round(rect.bottom) : null,
      canvasBottom: Math.round(canvas.bottom), offenders};
  });
  await page.screenshot({path: path.join(out, name + '.png')});
  results.push({name, ...report, errors});
  await context.close();
  return report;
}
try {
  const ipad = {viewport:{width:1180, height:820}, hasTouch:true, isMobile:true, deviceScaleFactor:2, userAgent:ipadUA};
  const covered = await check('ipad-landscape-toolbar-covers-115px', ipad, 115);
  if (process.env.BASELINE) console.log('BASELINE', JSON.stringify(covered));
  assert.equal(covered.shell, true, 'touch layout uses the visible-viewport shell');
  assert.equal(covered.joyShown, true, 'joystick is shown on touch devices');
  assert.ok(covered.joyBottom <= covered.visibleBottom - 20, `joystick above visible bottom (${covered.joyBottom} vs ${covered.visibleBottom})`);
  assert.ok(covered.canvasBottom <= covered.visibleBottom + 1, 'canvas ends at visible edge');
  assert.deepEqual(covered.offenders, [], 'no fixed control extends below the visible area');
  const normal = await check('ipad-landscape-normal', ipad, 0);
  assert.ok(normal.joyBottom <= normal.visibleBottom - 20 && normal.joyBottom >= normal.visibleBottom - 60, 'joystick keeps its normal bottom margin');
  assert.deepEqual(normal.offenders, []);
  const portrait = await check('ipad-portrait-toolbar-covers-115px', {...ipad, viewport:{width:820, height:1180}}, 115);
  assert.deepEqual(portrait.offenders, []);
  const desktop = await check('desktop', {viewport:{width:1440, height:900}}, null);
  assert.equal(desktop.shell, false, 'desktop layout is unchanged');
  assert.equal(desktop.canvasBottom, desktop.innerHeight, 'desktop canvas still fills the window');
  for (const r of results) assert.deepEqual(r.errors, [], r.name + ' has no page errors');
  console.log('PASS visible-viewport shell', JSON.stringify(results.map(({errors, ...r}) => r), null, 1));
} finally { await browser.close(); server.close(); }
