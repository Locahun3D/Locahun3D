import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const dir='F:/Codex/locahun-performance-20260911';
const labels=process.argv.slice(2);
const names=labels.length===2?labels.map(x=>x+'.webm'):['final-before.webm','final-after.webm'];
const prefix=process.env.PERF_VIDEO_PREFIX||(labels.length===2?labels[0]+'-playback':'video');
const interval=Number(process.env.PERF_VIDEO_INTERVAL_MS)||(labels.length===2?4000:1000);
const samples=Number(process.env.PERF_VIDEO_SAMPLES)||6;
const server=http.createServer((req,res)=>{
 const name=req.url.slice(1);if(!names.includes(name)){res.writeHead(404).end();return;}
 const file=path.join(dir,name),size=fs.statSync(file).size,m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
 const start=m?+m[1]:0,end=m&&m[2]?Math.min(+m[2],size-1):size-1;
 res.writeHead(m?206:200,{'Content-Type':'video/webm','Accept-Ranges':'bytes','Content-Length':end-start+1,...(m?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});fs.createReadStream(file,{start,end}).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu','--disable-accelerated-video-decode']});
const report=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.setContent(`<body style="margin:0;background:black;display:flex"><video id="a" muted style="width:50%" src="http://127.0.0.1:${server.address().port}/${names[0]}"></video><video id="b" muted style="width:50%" src="http://127.0.0.1:${server.address().port}/${names[1]}"></video></body>`);
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2));
 await page.evaluate(start=>{for(const v of document.querySelectorAll('video'))v.currentTime=start;},Number(process.env.PERF_VIDEO_START)||(labels.length===2?23:18));
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>!v.seeking));
 await page.evaluate(async()=>Promise.all([...document.querySelectorAll('video')].map(v=>v.play())));
 for(let i=0;i<samples;i++){
  await page.waitForTimeout(interval);report.push(await page.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,duration:v.duration,paused:v.paused,error:v.error?.message,decoded:v.getVideoPlaybackQuality().totalVideoFrames}))));
  await page.screenshot({path:path.join(dir,prefix+'-pair-'+i+'.png')});
 }
 for(let n=0;n<2;n++){assert(report.at(-1)[n].time-report[0][n].time>(samples-1)*interval/1000*.8);assert(report.at(-1)[n].decoded>report[0][n].decoded);assert(!report.at(-1)[n].error);}
 fs.writeFileSync(path.join(dir,prefix+'-playback.json'),JSON.stringify(report,null,2));console.log('PASS both recorded videos actually play and advance decoded frames');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
