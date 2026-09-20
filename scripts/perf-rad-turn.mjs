// RAD の「振り向いてから最高画質になるまで」を測る（2026-09-20）。描画まわりの変更は必ずこの数字で前後比較する。
//   node scripts/perf-rad-turn.mjs [--label baseline] [--html Locahun3D_OfflineViewer.html] [--latency 60] [--query "radopt=0"]
// ・実 Chrome（GPU あり・画面表示）で、ローカルHTTP（Range対応・1リクエストごとに遅延を足して R2 を模擬）から RAD を流す。
// ・収束 = numSplats が変わらず、取得待ち・取得中が 0 の状態が 2.5 秒続いた時点。各操作のあと最長 25 秒見る。
// ・結果は perf-results/rad-turn-<label>.json。ソースもシーンも書き換えない。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d;};
const root=path.resolve(import.meta.dirname,'..');
const label=arg('--label','baseline'),htmlName=arg('--html','Locahun3D_OfflineViewer.html'),latency=+arg('--latency','60'),extraQuery=arg('--query','');
const rad=arg('--rad','C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/2_3DGSData/2FStudio/Rad/2FStudio.rad');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'};
let requests=0;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x');
  const file=url.pathname==='/scene.rad'?rad:path.join(root,decodeURIComponent(url.pathname));
  if(url.pathname!=='/scene.rad'&&!path.resolve(file).startsWith(root)){res.writeHead(403).end();return;}
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404).end();return;}
    const send=()=>{
      const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
      const head={'content-type':types[path.extname(file)]||'application/octet-stream','accept-ranges':'bytes','cache-control':'no-store'};
      if(range){
        const a=+range[1],b=range[2]?Math.min(+range[2],st.size-1):st.size-1;
        res.writeHead(206,{...head,'content-range':`bytes ${a}-${b}/${st.size}`,'content-length':b-a+1});
        fs.createReadStream(file,{start:a,end:b}).pipe(res);
      }else{res.writeHead(200,{...head,'content-length':st.size});fs.createReadStream(file).pipe(res);}
    };
    if(url.pathname==='/scene.rad'){requests++;setTimeout(send,latency);}else send();
  });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--window-size=1600,900','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${port}/${htmlName}?autoload=${encodeURIComponent('/scene.rad')}&autoname=scene.rad${extraQuery?'&'+extraQuery:''}`);
const sample=()=>page.evaluate(()=>{const d=window.__diagState||{};window.__keepAlive&&window.__keepAlive(3000);
  return {n:window.__nSplat?window.__nSplat():-1,q:d.pagerQ,a:d.pagerActive,trav:d.lastTraverseMs,fps:d.fps,tier:d.splatPerfTier,budget:d.lodSplatCount,pre:d.lodPrefetch&&d.lodPrefetch.phase};});
// 収束まで待つ。戻り値: 収束に要した ms（最後に「動き」があった時刻）、その間のリクエスト数、最終スプラット数
async function settle(maxMs=30000,quietMs=5000){
  const t0=Date.now(),r0=requests;let last=t0,prev=null,prevReq=requests,s=null,minFps=Infinity;
  while(Date.now()-t0<maxMs){
    s=await sample();
    // 取得リクエストが出ている間も「まだ精細化中」とみなす（n は予算上限に張り付くと変わらないため）
    if(prev===null||s.n!==prev||s.a>0||requests!==prevReq)last=Date.now();
    prevReq=requests;
    prev=s.n;if(s.fps>0)minFps=Math.min(minFps,s.fps);
    if(Date.now()-last>=quietMs)break;
    await new Promise(r=>setTimeout(r,100));
  }
  return {ms:last-t0,timedOut:Date.now()-last<quietMs,requests:requests-r0,n:s.n,minFps:minFps===Infinity?null:minFps,trav:s.trav,pre:s.pre,budget:s.budget,tier:s.tier};
}
const results={label,htmlName,latency,extraQuery,rad:path.basename(rad),steps:[]};
const step=async(name,fn,maxMs)=>{if(fn)await page.evaluate(fn);const r=await settle(maxMs);results.steps.push({name,...r});console.log(name,JSON.stringify(r));};
await page.waitForFunction(()=>window.__nSplat&&window.__nSplat()>0,null,{timeout:120000});
const tier=arg('--tier','');
if(tier!=='')await page.evaluate(t=>{window._gpuWatchdog=window._gpuWatchdog||{};window._gpuWatchdog.manualOverride=true;window._applyQualityTier(+t,{source:'perf',immediate:true});},tier);
console.log('diag keys',await page.evaluate(()=>window.__diagState?Object.keys(Object.getOwnPropertyDescriptors(window.__diagState)).length:'none'));
await step('load',null,90000);

await step('turn+180',()=>window.__setCam(Math.PI,0));
await step('turn+90',()=>window.__setCam(Math.PI/2,0));
await step('turn-90',()=>window.__setCam(-Math.PI/2,0));
await step('back-to-0 (seen before)',()=>window.__setCam(0,0));
await step('turn+180 again (seen before)',()=>window.__setCam(Math.PI,0));
results.errors=errors;results.totalRequests=requests;
fs.mkdirSync(path.join(root,'perf-results'),{recursive:true});
fs.writeFileSync(path.join(root,'perf-results',`rad-turn-${label}.json`),JSON.stringify(results,null,1));
await browser.close();server.close();
console.log('saved',label,'errors',errors.length);
