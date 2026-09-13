// Real Chromium file:// smoke test. Optional first argument is a Playwright module path.
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const fixture = new URL('./walk-collision-browser-fixture.html', import.meta.url);
const asset = await fs.readFile(new URL('../src/assets/rapier_walk_b64.html', import.meta.url), 'utf8');
const core = await fs.readFile(new URL('../src/js/215_walk_collision.js', import.meta.url), 'utf8');
await fs.writeFile(fixture, `<!doctype html><meta charset="utf-8"><title>Walk collision offline test</title>${asset}<script>${core}</script>`);
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const external = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(fileURLToPath(fixture)).href);
  const result = await page.evaluate(async () => {
    let created = 0, revoked = 0;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { created++; return create(blob); };
    URL.revokeObjectURL = url => { revoked++; return revoke(url); };
    const lazy = created === 0;
    const [a, b] = await Promise.all([LocahunWalkCollision.create(), LocahunWalkCollision.create()]);
    a.rebuild({ boxes: [{ center: [0, -0.1, 0], half: [10, 0.1, 10] }] });
    a.setCharacter({ x: 0, y: 0.02, z: 0 });
    const floor = a.move({ x: 0, y: -1, z: 0 });
    const ray = a.raycast({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, 10);
    b.setCharacter({ x: 0, y: 0, z: 0 });
    const falling = b.move({ x: 0, y: -1, z: 0 });
    a.dispose(); b.dispose();
    const c = await LocahunWalkCollision.create();
    c.dispose();
    return { lazy, created, revoked, floor, ray, falling };
  });
  assert.equal(result.lazy, true);
  assert.equal(result.created, 1);
  assert.equal(result.revoked, 1);
  assert.equal(result.floor.grounded, true);
  assert.ok(Math.abs(result.floor.feet.y - 0.01) < 0.025);
  assert.ok(Math.abs(result.ray - 1) < 0.01);
  assert.equal(result.falling.grounded, false);
  assert.ok(result.falling.feet.y < -0.99);

  await page.reload();
  const recovery = await page.evaluate(async () => {
    const original = WALK_RAPIER_B64;
    let created = 0, revoked = 0;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { created++; return create(blob); };
    URL.revokeObjectURL = url => { revoked++; return revoke(url); };
    delete window.WALK_RAPIER_B64;
    let missing, broken;
    try { await LocahunWalkCollision.create(); } catch (e) { missing = e.message; }
    window.WALK_RAPIER_B64 = btoa('throw new Error("intentional invalid payload");');
    try { await LocahunWalkCollision.create(); } catch (e) { broken = e.message; }
    window.WALK_RAPIER_B64 = original;
    const instance = await LocahunWalkCollision.create();
    instance.dispose();
    return { missing, broken, created, revoked };
  });
  assert.match(recovery.missing, /missing WALK_RAPIER_B64/);
  assert.match(recovery.broken, /intentional invalid payload/);
  assert.equal(recovery.created, 2);
  assert.equal(recovery.revoked, 2);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('PASS Chrome file://: lazy embedded WASM, concurrent create, Blob revocation, floor, avatar filtering, falling, failure cleanup/retry; zero HTTP requests.');
} finally {
  await browser?.close();
  await fs.unlink(fixture);
}
