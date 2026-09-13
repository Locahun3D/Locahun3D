import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(String.raw`C:\Users\askgg\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\package.json`);
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://127.0.0.1:8193/playback');
 await page.locator('video').evaluate(async v=>{v.muted=true;await v.play();});
 await page.waitForFunction(()=>document.querySelector('video').currentTime>1);
 const first=await page.locator('video').evaluate(v=>({time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,width:v.videoWidth,height:v.videoHeight}));
 await page.waitForTimeout(2200);
 const second=await page.locator('video').evaluate(v=>({time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,error:v.error?.message||null}));
 assert(second.time>first.time+1);assert(second.frames>first.frames);assert(!second.error);assert(first.width>0);
 await page.locator('video').evaluate(async v=>{v.currentTime=Math.max(0,v.duration-6);await v.play();});
 await page.waitForTimeout(600);await page.screenshot({path:'F:/Codex/locahun-walk/verification/playback.png'});
 await page.waitForTimeout(1800);await page.screenshot({path:'F:/Codex/locahun-walk/verification/playback-later.png'});
 fs.writeFileSync('F:/Codex/locahun-walk/verification/playback-results.json',JSON.stringify({first,second},null,2));
 console.log({first,second});
}finally{await browser.close();}
