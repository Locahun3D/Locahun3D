// Compare the published viewer and canonical candidate against the same public RAD.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../../locahun3d_online/package.json',import.meta.url));
const {chromium}=require('playwright');
const url='https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1&showcase=1';
const out='F:/Codex/locahun-navigation-20260913/demo-release-'+Date.now();await fs.mkdir(out);
const response=await fetch(url);assert(response.ok);const published=await response.text();
const baselineArg=process.argv.indexOf('--baseline');
const baseline=baselineArg<0?null:await fs.readFile(process.argv[baselineArg+1],'utf8');
const candidate=await fs.readFile(new URL('../Locahun3D_OfflineViewer.online.html',import.meta.url),'utf8');
const hook=`
window.demoReleaseQA={
 state(){return {layers:layers.filter(l=>l.type==='splat').length,ready:getCameraCollisionState(),busy:walkSetup.busy,
 cellSize:walkSetup.wholeIndex?.cellSize,boxes:walkSetup.wholeIndex?.total,
 quality:qualScale,pixelRatio:renderer.getPixelRatio(),budget:sparkRenderer.lodSplatCount,
 regional:!!walkSetup.settings.navigationRegions,position:camPos.toArray(),yaw,pitch};},
 stopTour(){document.getElementById('sc-end')?.click();},
 async frames(){const values=[];let last=performance.now();return new Promise(resolve=>{
 const tick=now=>{values.push(now-last);last=now;markDirty(2);if(values.length<120)requestAnimationFrame(tick);else{values.sort((a,b)=>a-b);resolve({p50:values[60],p95:values[114]});}};
 requestAnimationFrame(tick);});}
};`;
const results=[];let browser;
const timer=setTimeout(()=>browser?.close(),180000);
try{
 for(const [arm,source] of [baseline?['baseline',baseline]:['published',published],['candidate',candidate]]){
  const at=source.lastIndexOf('</script>');assert(at>0);
  const html=source.slice(0,at)+hook+source.slice(at),record={arm,sha256:createHash('sha256').update(source).digest('hex'),errors:[],requests:[]};results.push(record);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',error=>record.errors.push(error.message));
  page.on('response',r=>{if(/demo-asset|\/collision\/|\.(lnv|lcp)/.test(r.url()))record.requests.push({url:r.url(),status:r.status(),bytes:Number(r.headers()['content-length'])||0,range:r.request().headers().range});});
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:html}));
  const started=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.demoReleaseQA?.state().layers&&demoReleaseQA.state().ready.ready,null,{timeout:90000});
  record.readyMs=Date.now()-started;await page.evaluate(()=>demoReleaseQA.stopTour());
  await page.waitForTimeout(5000);record.state=await page.evaluate(()=>demoReleaseQA.state());
  record.frames=await page.evaluate(()=>demoReleaseQA.frames());
  await page.screenshot({path:out+'/'+arm+'.png'});
  assert.deepEqual(record.errors,[]);assert.equal(record.state.cellSize,.25);assert.equal(record.state.regional,false);
  assert(!record.requests.some(r=>/\.(lnv|lcp)/.test(r.url)),'ordinary demo must not request new navigation data');
  await browser.close();browser=null;
 }
 assert.equal(results[1].state.budget,results[0].state.budget);
 assert.equal(results[1].state.pixelRatio,results[0].state.pixelRatio);
 assert.equal(results[1].state.boxes,results[0].state.boxes);
}catch(error){results.push({failure:String(error)});process.exitCode=1;}
finally{clearTimeout(timer);await browser?.close();await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(out);console.log(JSON.stringify(results.map(({requests,...r})=>({...r,requests:requests?.length}))));}
