import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json')('playwright');
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const out=new URL('docs/touch-nested-review/',root);fs.mkdirSync(out,{recursive:true});
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+`window.nestedTest={setup(){loadEmptyProject();document.getElementById('dz').style.display='none';},close(){closeAllPanels();if(sun.active)toggleSunMode();},state(){return {focal:cam.focalMm,keys:camAnim.keys.length};}};`+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],results=[];
try{
 for(const tablet of [false,true]){
  const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:tablet?820:390,height:tablet?1180:844},userAgent:tablet?'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(4000);
  await page.route('http://127.0.0.1:18994/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://127.0.0.1:18994/');await page.waitForFunction(()=>window.nestedTest,null,{timeout:60000});await page.evaluate(()=>nestedTest.setup());
  for(const lang of ['ja','en'])for(const [width,height] of tablet?[[820,1180],[1180,820],[744,1133],[1133,744]]:[[390,844],[844,390],[320,568],[568,320]]){
   await page.setViewportSize({width,height});await page.evaluate(l=>{if(window._lang!==l)toggleLang();},lang);await page.waitForTimeout(300);
   const label=`${tablet?'ipad':'phone'}-${width}-${height}-${lang}`;
   const wrapped=await page.locator('#view-tl-btns button:visible span, #hud .cbar>button:visible span').evaluateAll(es=>es.filter(e=>{const range=document.createRange();range.selectNodeContents(e);return range.getClientRects().length>1;}).map(e=>e.textContent));
   assert.deepEqual(wrapped,[],label+' labels must not wrap mid-word');
   const check=async id=>{
    const wraps=await page.locator('#view-tl-btns button:visible span, #hud .cbar>button:visible span').evaluateAll(es=>es.filter(e=>{const range=document.createRange();range.selectNodeContents(e);return range.getClientRects().length>1;}).map(e=>e.textContent));
    assert.deepEqual(wraps,[],label+' '+id+' labels must remain on one line');
    const state=await page.locator('#'+id).evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}}));
    assert(state.scroll<=state.client+1,label+' '+id+' horizontal overflow '+JSON.stringify(state));
    assert(state.rect.x>=0&&state.rect.x+state.rect.w<=width+1&&state.rect.y+state.rect.h<=height+1,label+' bounds');
   };
   await page.evaluate(()=>nestedTest.close());await page.locator('#btnCamTool').tap();
   for(const focal of [14,35,200]){await page.locator(`.cm-focal-btn[data-f="${focal}"]`).tap();assert.equal(Number(await page.locator('#cm-focal').inputValue()),focal);}
   await page.locator('#cm-sensor').selectOption('custom');await check('cam-panel');
   await page.locator('#ct-grid-custom').tap();await check('cam-panel');
   await page.locator('#cm-shot').fill('SC01_C01');await page.locator('#cm-shot').blur();
   await check('cam-panel');await page.screenshot({path:new URL(label+'-camera.png',out).pathname.replace(/^\/(\w:)/,'$1')});
   await page.locator('#btn-sun').tap();
   for(const weather of ['clear','cloudy','rain','snow'])await page.locator('#sun-wx-'+weather).tap();
   await page.locator('#sun-date-btn').tap();await check('sun-panel');await page.screenshot({path:new URL(label+'-sun.png',out).pathname.replace(/^\/(\w:)/,'$1')});
   await page.locator('#btnMeasure').tap();await page.locator('#msr-add-c').tap();await check('gizmo');await page.locator('#msr-clear').tap();await page.locator('#btnMeasureEnd').tap();
   await page.locator('#btnCamAnim').tap();await page.locator('[onclick="window.camAnimAddKey()"]:visible').tap();await check('cam-anim-panel');
   // Rotate with an inspector open, rather than resetting tools between orientations.
   await page.setViewportSize({width:height,height:width});await page.waitForTimeout(300);await page.setViewportSize({width,height});await page.waitForTimeout(300);await check('cam-anim-panel');
   await page.screenshot({path:new URL(label+'-animation.png',out).pathname.replace(/^\/(\w:)/,'$1')});
   results.push(label);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS nested controls and active rotation: '+results.length+' device/language combinations');
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
