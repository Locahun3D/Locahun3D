import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const source=fs.readFileSync(new URL('../src/js/260_folder_system.js',import.meta.url),'utf8');
const browser=await require('playwright').chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage();
 for(const axis of ['x','y','z']) {
  const tag=source.match(new RegExp('<input[^>]*id="lt-sc'+axis+'"[^>]*>'))?.[0];
  assert(tag);
  await page.setContent(tag.replace(/value="[^"]*"/,'value="1"').replace(/oninput="[^"]*"/,''));
  const input=page.locator('input');
  await input.focus();await page.keyboard.press('ArrowDown');assert.equal(await input.inputValue(),'0.99',axis+' decrement');
  await input.fill('1');await page.keyboard.press('ArrowUp');assert.equal(await input.inputValue(),'1.01',axis+' increment');
  await input.fill('0.01');await page.keyboard.press('ArrowDown');assert.equal(await input.inputValue(),'0.01',axis+' minimum');
 }
 console.log('PASS: all scale axes step by 0.01; minimum preserved');
}finally{await browser.close();}
