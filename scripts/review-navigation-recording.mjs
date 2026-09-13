import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json'),{chromium}=require('playwright');
const folder=path.resolve(process.argv[2]||'');
assert(folder.startsWith('F:\\Codex\\locahun-navigation-20260913\\browser-'));
const files=fs.readdirSync(folder).filter(f=>f.endsWith('.webm'));assert.equal(files.length,1);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.route('http://playback.test/',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:black}video{width:100vw;height:100vh;object-fit:contain}</style><video muted playsinline src="/recording.webm"></video>'}));
 const bytes=fs.readFileSync(path.join(folder,files[0]));
 await page.route('http://playback.test/recording.webm',r=>{
  const range=r.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range?.[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
  const headers={'content-type':'video/webm','accept-ranges':'bytes','content-length':String(end-start+1)};
  if(range)headers['content-range']='bytes '+start+'-'+end+'/'+bytes.length;
  return r.fulfill({status:range?206:200,headers,body:bytes.subarray(start,end+1)});
 });
 await page.goto('http://playback.test/');await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 await page.waitForFunction(()=>{const v=document.querySelector('video');return Number.isFinite(v.duration)&&v.duration>5&&v.seekable.length>0;});
 const result=await page.evaluate(async()=>{const v=document.querySelector('video'),target=v.duration-5;const seeked=new Promise(r=>v.addEventListener('seeked',r,{once:true}));v.currentTime=target;await seeked;if(Math.abs(v.currentTime-target)>.2)throw Error('Video did not seek to movement');await v.play();return {duration:v.duration,start:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames};});
 await page.waitForFunction(({start,frames})=>{const v=document.querySelector('video');return v.currentTime>start+.6&&v.getVideoPlaybackQuality().totalVideoFrames>frames+2;},result,{timeout:10000});
 await page.screenshot({path:path.join(folder,'playback.png')});await page.evaluate(()=>document.querySelector('video').pause());
 fs.writeFileSync(path.join(folder,'playback.json'),JSON.stringify(result));console.log('Actual recorded video playback advanced and screenshot captured.');
}finally{await browser.close();}
