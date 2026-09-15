import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url),out=new URL('docs/jump-ui-review/',root);
fs.mkdirSync(out,{recursive:true});
const button=fs.readFileSync(new URL('src/template.html',root),'utf8').match(/<button id="walk-jump-button"[\s\S]*?<\/button>/)[0];
const code=fs.readFileSync(new URL('src/js/406_walk_jump_button.js',root),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
try{
 for(const [width,height]of [[390,844],[844,390],[820,1180],[1180,820]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true});const page=await context.newPage();
  await page.setContent('<body style="background:#8399a6">'+button+'</body>');
  await page.addScriptTag({content:'window.walkMode={active:false};window.markDirty=()=>{};'+code});
  assert.equal(await page.locator('#walk-jump-button').isVisible(),false);
  await page.evaluate(()=>{walkMode.active=true;_syncWalkJumpButton();});
  const rect=await page.locator('#walk-jump-button').boundingBox();
  assert(rect.x>width/2&&rect.y>height/2&&rect.x+rect.width<=width&&rect.y+rect.height<=height);
  await page.evaluate(()=>{walkMode.jumpRequested=false;window.joyDX=1;window.joyDY=0;});
  await page.locator('#walk-jump-button').dispatchEvent('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:false,button:0});
  assert.equal(await page.evaluate(()=>walkMode.jumpRequested),true,'second finger must jump without a synthetic click');
  assert.equal(await page.evaluate(()=>joyDX),1,'jump must preserve running input');
  await page.evaluate(()=>{walkMode.jumpRequested=false;});
  await page.locator('#walk-jump-button').dispatchEvent('pointerup',{pointerId:2,pointerType:'touch',isPrimary:false,button:0});
  await page.locator('#walk-jump-button').dispatchEvent('click',{detail:1});
  assert.equal(await page.evaluate(()=>walkMode.jumpRequested),false,'release click must not queue another jump');
  await page.locator('#walk-jump-button').tap();assert.equal(await page.evaluate(()=>walkMode.jumpRequested),true);
  await page.screenshot({path:new URL(width+'x'+height+'.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
  await page.evaluate(()=>{walkMode.active=false;_syncWalkJumpButton();});
  assert.equal(await page.locator('#walk-jump-button').isVisible(),false);
  assert.equal(await page.evaluate(()=>walkMode.jumpRequested),false);await context.close();
 }
}finally{await browser.close();}
console.log('Jump tap, bottom-right bounds and exit verified in four touch viewports; physics animation not exercised.');
