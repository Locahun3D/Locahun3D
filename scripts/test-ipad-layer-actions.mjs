import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json')('playwright');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const at=html.lastIndexOf('</script>');
html=html.slice(0,at)+`window.actionTest={init(){loadEmptyProject();document.getElementById('dz').style.display='none';document.getElementById('layer-panel').classList.remove('collapsed');},state(){return {mode:_placeMode,cubes:layers.filter(l=>l.type==='cube').length,cameras:layers.filter(l=>l.type==='camera').length};}};`+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [width,height] of [[1180,650],[650,1180],[820,1180],[1180,820]]){
  const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width,height},userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:18996/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://127.0.0.1:18996/');await page.waitForFunction(()=>window.actionTest);
  await page.evaluate(()=>actionTest.init());await page.waitForTimeout(300);
  assert(await page.locator('#btnAddCubeTop').isVisible(),'iPad model add button must be visible');
  assert(await page.locator('#btnSaveCamera').isVisible(),'iPad camera save button must be visible');
  await page.locator('#btnAddCubeTop').tap();await page.getByRole('tab',{name:'基本',exact:true}).tap();
  await page.locator('#obj-add-cube').tap();assert.equal((await page.evaluate(()=>actionTest.state())).mode,'cube');
  const cdp=await context.newCDPSession(page),x=Math.round(width*.8),y=Math.round(height*.5);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await page.waitForTimeout(450);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal((await page.evaluate(()=>actionTest.state())).cubes,1,'long press must create a model layer');
  await page.keyboard.press('Escape');
  const before=(await page.evaluate(()=>actionTest.state())).cameras;
  await page.locator('#btnSaveCamera').tap();assert.equal((await page.evaluate(()=>actionTest.state())).cameras,before+1);
  assert.deepEqual(errors,[]);
  fs.mkdirSync('docs/ipad-actions-review',{recursive:true});await page.screenshot({path:`docs/ipad-actions-review/${width}x${height}.png`});
  await context.close();
 }
}finally{await browser.close();}
console.log('iPad portrait/landscape: model selection and actual camera layer creation passed.');
