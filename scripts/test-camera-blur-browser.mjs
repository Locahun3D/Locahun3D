import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const browser=await require('playwright').chromium.launch({channel:'chrome',headless:false});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.route('http://127.0.0.1:18994/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url))}));
 await page.goto('http://127.0.0.1:18994/');
 await page.waitForFunction(()=>window.__dbg?.renderer,null,{timeout:60000});
 const real=process.argv.includes('--real');
 const zip='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioSeeYouTomorrow/260907/3_Locahun3DOnline_ViewerData/4FStudio.zip';
 const digest=()=>createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
 const before=real?digest():null;
 if(real){
  await page.locator('#fi').setInputFiles(zip);
  await page.waitForFunction(()=>window.__dbg.layers.some(l=>l.type==='splat'&&l.mesh),null,{timeout:120000});
  await page.waitForTimeout(8000);
 }
 const result=await page.evaluate(()=>{
  const canvas=window.__dbg.renderer.domElement;
  canvas.requestPointerLock=()=>Promise.reject(new Error('Simulated unsupported pointer lock'));
  const initial=window.__dbg.yawTarget;
  canvas.dispatchEvent(new MouseEvent('mousedown',{button:2,buttons:2,clientX:600,clientY:300,bubbles:true}));
  window.dispatchEvent(new MouseEvent('mousemove',{buttons:2,clientX:650,clientY:300}));
  const during=window.__dbg.yawTarget;
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new MouseEvent('mousemove',{buttons:0,clientX:750,clientY:350}));
  return {initial,during,after:window.__dbg.yawTarget};
 });
 assert(Math.abs(result.during-result.initial)>.01,'drag must rotate before blur');
 assert.equal(result.after,result.during,'blur must cancel fallback right-drag');
 console.log('PASS: fallback right-drag cancelled on blur',result);
 const normal=await page.evaluate(()=>{
  const c=window.__dbg.renderer.domElement;
  c.dispatchEvent(new MouseEvent('mousedown',{button:2,buttons:2,clientX:600,clientY:300,bubbles:true}));
  window.dispatchEvent(new MouseEvent('mousemove',{buttons:2,clientX:630,clientY:300}));
  const moved=window.__dbg.yawTarget;
  window.dispatchEvent(new MouseEvent('mouseup',{button:2,buttons:0}));
  window.dispatchEvent(new MouseEvent('mousemove',{buttons:0,clientX:900,clientY:400}));
  return {moved,after:window.__dbg.yawTarget};
 });
 assert.equal(normal.moved,normal.after,'normal mouseup must still stop rotation');
 await page.evaluate(()=>window.resetCameraToInitial());
 await page.waitForTimeout(3000);
 if(real){
  assert.equal(digest(),before);
  await page.screenshot({path:'F:/Codex/bug-report-20260910/camera-blur-fixed-real.png'});
  console.log('PASS: real 4FStudio, reset and mouseup; ZIP unchanged');
 }
}finally{await browser.close();}
