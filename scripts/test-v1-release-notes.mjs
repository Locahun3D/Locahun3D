import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const source = read('src/template.html');
const notes = source.slice(source.indexOf('<div class="dz-changelog"'), source.indexOf('<a class="dz-back-site"'));
assert.equal(JSON.parse(read('version.json')).version, '1.0.0');
assert.equal((notes.match(/class="cl-entry"/g) || []).length, 1);
assert.doesNotMatch(notes, /alpha|beta|2026-06/);
assert.match(source, /id="tb-version">v1\.0</);
const require = createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium} = require('playwright');
const browser = await chromium.launch({channel:'chrome', headless:true});
try {
  const html = read('Locahun3D_OfflineViewer.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const [name,width,height] of [['desktop',1280,900],['phone',390,844],['ipad',820,1180]]) {
    const page = await browser.newPage({viewport:{width,height}});
    await page.setContent(html);
    await page.addScriptTag({content:read('src/js/430_changelog_toggle_home_screen_pulldown.js')});
    await page.locator('.dz-changelog-head').click();
    await assert.doesNotReject(() => page.locator('#dz-changelog-body').waitFor({state:'visible'}));
    assert.equal(await page.locator('.dz-changelog-head').getAttribute('aria-expanded'), 'true');
    for (const lang of ['ja','en']) {
      await page.evaluate(lang => document.documentElement.lang = lang, lang);
      const box = await page.locator('#dz-changelog').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      assert.equal(await page.locator('#dz-changelog-body .cl-entry').count(), 1);
      await page.screenshot({path:new URL(`docs/v1-${name}-${lang}.png`,root).pathname.replace(/^\/(\w:)/,'$1')});
    }
    await page.locator('.dz-changelog-head').click();
    assert.equal(await page.locator('.dz-changelog-head').getAttribute('aria-expanded'), 'false');
    await page.close();
  }
  console.log('v1.0 notes: version, single entry, toggle and JA/EN desktop/phone/tablet passed');
} finally { await browser.close(); }
