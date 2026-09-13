import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const dir=process.env.AVATAR_VIDEO_DIR||'F:/Codex/locahun-walk/verification/locomotion-2026-09-10';
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1100,height:780}});
 await page.setContent('<body style="margin:0;background:#222"><video muted controls style="width:100%;height:100vh"></video></body>');
 await page.locator('video').evaluate((v,src)=>{v.src=src;},'data:video/webm;base64,'+fs.readFileSync(dir+'/motion.webm').toString('base64'));
 await page.locator('video').evaluate(v=>v.play());
 const times=[];
 for(let i=0;i<3;i++){await page.waitForTimeout(900);times.push(await page.locator('video').evaluate(v=>v.currentTime));await page.screenshot({path:dir+'/review-playback-'+i+'.png'});}
 assert(times[0]>.3&&times[1]>times[0]&&times[2]>times[1]);
 const state=await page.locator('video').evaluate(v=>({error:v.error?.message||null,frames:v.getVideoPlaybackQuality().totalVideoFrames,width:v.videoWidth,height:v.videoHeight}));
 assert.equal(state.error,null);assert(state.frames>20&&state.width>0&&state.height>0);
 fs.writeFileSync(dir+'/review-playback.json',JSON.stringify({times,...state},null,2));console.log({times,...state});
}finally{await browser.close();}
