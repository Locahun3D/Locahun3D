import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const origin=process.argv[2]||'https://viewer.locahun3d.com';
const online=process.argv.includes('--online');
const source=fs.readFileSync(new URL('../Locahun3D_OfflineViewer'+(online?'.online':'')+'.html',import.meta.url),'utf8');
const release=source.match(/window\.__locahunBuildRelease="([a-f0-9]{64})"/)[1];
const out=new URL('../docs/published-ui-review/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const endpoint=online?'/viewer/offline-viewer.html':'/Locahun3D_OfflineViewer';
 await page.goto(origin+endpoint+'?verify='+Date.now()+(online?'':'&demo=1&showcase=1'),{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.setPathLabel==='function',null,{timeout:90000});
 assert.equal(await page.evaluate(()=>window.__locahunBuildRelease),release);
 assert.equal(await page.locator('#btnCamAnim').count(),1);
 if(!online){await page.locator('[id^="lr-"]').first().waitFor({state:'attached',timeout:90000});await page.waitForTimeout(10000);}
 else {await page.locator('#emptyBtn').click();await page.locator('#dz').waitFor({state:'hidden'});}
 await page.waitForFunction(()=>document.getElementById('lbl-walk')?.textContent==='歩行',null,{timeout:60000});
 const file=new URL((online?'online':new URL(origin).hostname)+'-desktop.png',out).pathname.replace(/^\/(\w:)/,'$1');
 await page.screenshot({path:file});
 const sharp=createRequire('F:/Htlml/kawaii-motion/package.json')('sharp');
 const pixels=await sharp(file).extract({left:350,top:150,width:800,height:550}).stats();
 if(!online)assert(pixels.channels.slice(0,3).some(c=>c.stdev>15),'demo scene is not a blank canvas');
 await page.locator('#btnCamAnim').click();assert(await page.locator('#cam-anim-panel').isVisible());
 await page.locator('#btnCamAnim').click();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({origin,release,errors,screenshot:file}));
}finally{await browser.close();}
