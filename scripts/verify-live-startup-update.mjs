import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const source='F:/Htlml/3DGS/Locahun3D/viewer-dist/Locahun3D_OfflineViewer.html';
const before=fs.readFileSync(source);
let manifest=await fetch('https://viewer.locahun3d.com/releases/stable.json').then(r=>r.json());
const candidate=process.argv.includes('--candidate')?fs.readFileSync('Locahun3D_OfflineViewer.html'):null;
if(candidate){
 const release=candidate.toString('utf8').match(/window\.__locahunBuildRelease="([a-f0-9]{64})"/)[1];
 manifest={schema:1,release,projectVersions:[1,2,3,4],localProjectApi:1,viewer:{url:'https://viewer.locahun3d.com/releases/'+release+'/viewer.html',bytes:candidate.length,sha256:createHash('sha256').update(candidate).digest('hex')}};
}
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--enable-webgl','--ignore-gpu-blocklist']});
let page;
const diagnostics=[];
try{
 page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
 if(candidate){
  await page.route('https://viewer.locahun3d.com/releases/stable.json',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(manifest)}));
  await page.route(manifest.viewer.url,r=>r.fulfill({contentType:'application/octet-stream',headers:{'access-control-allow-origin':'*'},body:candidate}));
 }
 page.on('console',m=>{if(['error','warning'].includes(m.type()))diagnostics.push(m.text().slice(0,500));});
 page.on('requestfailed',r=>diagnostics.push(r.url().slice(0,200)+' '+r.failure()?.errorText));
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(window===window.top)Object.defineProperty(window,'__locahunBuildRelease',{get:()=> 'simulate-previous-build',set(){},configurable:true});});
 await page.goto(pathToFileURL(source).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(id=>window.__locahunActiveRelease===id,manifest.release,{timeout:45000});
 const frame=page.frames().find(f=>f!==page.mainFrame());assert(frame);
 await frame.waitForFunction(()=>typeof window.setPathLabel==='function');
 assert.equal(await frame.locator('#btnWalkSetup').count(),0);
 assert.equal(await frame.evaluate(()=>window.__locahunBuildRelease),manifest.release);
 if(!candidate){
 const figure=await frame.evaluate(async()=>{
  const url=new URL('figures/jtoastie_walk.glb',document.baseURI).href;
  const response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error'});
  return {url,status:response.status,bytes:(await response.arrayBuffer()).byteLength};
 });
 assert.equal(figure.url,'https://viewer.locahun3d.com/figures/jtoastie_walk.glb');
 assert.equal(figure.status,200);assert(figure.bytes>0,'Public figure is empty');
 }
 await page.screenshot({path:'F:/Codex/locahun-walk/verification/live-startup-update.png'});
 assert(before.equals(fs.readFileSync(source)));assert.deepEqual(errors,[]);
 console.log('PASS real file:// startup -> '+(candidate?'candidate fixture':'live official')+' verified release '+manifest.release+'; original file unchanged.');
}catch(error){
 await page.screenshot({path:'F:/Codex/locahun-walk/verification/live-startup-update-failure.png'});
 const check=await page.evaluate(async()=>{const r=await LocahunViewerUpdate.check({currentRelease:'diagnostic',timeoutMs:20000});return {reason:r.reason,release:r.release,length:r.html?.length,frames:document.querySelectorAll('iframe').length};});
 console.log({diagnostics,check,expectedRelease:manifest.release,activeRelease:await page.evaluate(()=>window.__locahunActiveRelease),
  frames:await page.locator('iframe').evaluateAll(frames=>frames.map(f=>({release:f.dataset.release,visible:f.style.visibility})))});throw error;
}finally{await browser.close();}
