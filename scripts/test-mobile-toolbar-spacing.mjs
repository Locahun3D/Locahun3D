import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../locahun3d_online/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = new URL('../', import.meta.url);
const css = (await Promise.all((await readdir(new URL('src/css/', root))).filter(n => n.endsWith('.css')).sort().map(n => readFile(new URL('src/css/' + n, root), 'utf8')))).join('\n');
const html = await readFile(new URL('src/html/020_view_buttons_ar.html', root), 'utf8');
const out = 'F:/Codex/mobile-toolbar-spacing-20260912';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
let failures = 0;
try {
  for (const [name, width, height, touch] of [['phone',390,844,true],['small-phone',360,740,true],['landscape',844,390,true],['ipad',820,1180,true],['desktop',1440,900,false]]) {
    const context = await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,javaScriptEnabled:false});
    const page = await context.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css.replace(/<\/?style[^>]*>/g, '') + '\n#view-tl-btns,#topbar{display:flex!important}</style>' + html);
    const metrics = await page.evaluate(() => {
      const header = document.getElementById('topbar').getBoundingClientRect();
      const row = document.getElementById('view-tl-btns').getBoundingClientRect();
      return {gap:row.top-header.bottom,left:row.left,right:row.right,top:row.top};
    });
    await page.screenshot({path:out+'/'+name+'.png'});
    console.log(name, metrics);
    try {
      if (name.includes('phone') || name==='landscape') assert.ok(metrics.gap>=0 && metrics.gap<=8, 'phone header gap must be 0-8px');
      assert.ok(metrics.left>=0 && metrics.right<=width, 'toolbar must fit viewport');
    } catch(error) { failures++; console.error(error.message); }
    await context.close();
  }
} finally { await browser.close(); }
assert.equal(failures,0);
