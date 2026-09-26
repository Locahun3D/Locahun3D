// 画面の「端」の精細さを測る（2026-09-26）。本人「大きいデータでは視点端のLOD読み込みが怪しい」「カメラ端で3DGSが貫通」。
// perf-rad-turn.mjs と同じ配信模擬で RAD を流し、4方向を向いて収束させ、そのたびに画面を保存する。
// 精細さの数値化（端と中央の比較）は scripts/edge-sharpness.py。
//   node scripts/perf-edge-lod.mjs --label after [--query cone=spark] [--rad <file>]
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
let requests=0,srvMs=0,srvN=0,inflight=0,maxInflight=0;const seenRanges=new Map();let repeats=0;
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
    if(url.pathname==='/scene.rad'){requests++;{const t=Date.now();inflight++;maxInflight=Math.max(maxInflight,inflight);res.on('close',()=>{inflight--;srvMs+=Date.now()-t;srvN++;});}{const k=req.headers.range||'';const c=(seenRanges.get(k)||0)+1;seenRanges.set(k,c);if(c>1)repeats++;}setTimeout(send,latency);}else send();
  });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--window-size=1920,860','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1920,height:820}});
// ワーカー呼び出しの所要時間を名前別に集計（どこで詰まっているかの切り分け用）
await page.addInitScript(()=>{
  const W=window.Worker,stats=window.__wstats={};
  window.Worker=class extends W{constructor(...a){super(...a);const pend=new Map();
    const post=this.postMessage.bind(this);
    this.postMessage=(m,t)=>{try{if(m&&m.id!==undefined)pend.set(m.id,{name:m.name||m.method||'?',t:performance.now()});}catch(_){}
      return post(m,t);};
    this.addEventListener('message',e=>{const d=e.data;if(d&&d.id!==undefined&&pend.has(d.id)){const p=pend.get(d.id);pend.delete(d.id);
      const s=stats[p.name]||(stats[p.name]={n:0,ms:0,max:0});const dt=performance.now()-p.t;s.n++;s.ms+=dt;s.max=Math.max(s.max,dt);}});}};
});
const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${port}/${htmlName}?autoload=${encodeURIComponent('/scene.rad')}&autoname=scene.rad${extraQuery?'&'+extraQuery:''}`);
const sample=()=>page.evaluate(()=>{const d=window.__diagState||{};window.__keepAlive&&window.__keepAlive(3000);
  return {n:window.__nSplat?window.__nSplat():-1,q:d.pagerQ,a:d.pagerActive,trav:d.lastTraverseMs,fps:d.fps,tier:d.splatPerfTier,budget:d.lodSplatCount,pre:d.lodPrefetch&&d.lodPrefetch.phase};});
// 収束まで待つ。戻り値: 収束に要した ms（最後に「動き」があった時刻）、その間のリクエスト数、最終スプラット数
async function settle(maxMs=30000,quietMs=5000){
  const t0=Date.now(),r0=requests,p0=repeats;let last=t0,prev=null,prevReq=requests,s=null,minFps=Infinity;
  while(Date.now()-t0<maxMs){
    s=await sample();
    // 取得リクエストが出ている間も「まだ精細化中」とみなす（n は予算上限に張り付くと変わらないため）
    if(prev===null||s.n!==prev||s.a>0||requests!==prevReq)last=Date.now();
    prevReq=requests;
    prev=s.n;if(s.fps>0)minFps=Math.min(minFps,s.fps);
    if(Date.now()-last>=quietMs)break;
    await new Promise(r=>setTimeout(r,100));
  }
  return {ms:last-t0,timedOut:Date.now()-last<quietMs,requests:requests-r0,repeated:repeats-p0,n:s.n,minFps:minFps===Infinity?null:minFps,trav:s.trav,pre:s.pre,budget:s.budget,tier:s.tier};
}
const results={label,extraQuery,rad:path.basename(rad),shots:[]};
await page.waitForFunction(()=>window.__nSplat&&window.__nSplat()>0,null,{timeout:180000});
await settle(120000);
// 切り分け用: --fov <縦の度数> で画角を、--budget <数> で LoD の粒の上限を変えてから測る。
const fovArg=arg('--fov',''),budgetArg=arg('--budget','');
results.camera=await page.evaluate(([f,b])=>{
  if(f)window.__setFov(+f);
  if(b&&window.__probeBudget)window.__probeBudget(+b,0);
  return window.__camInfo();
},[fovArg,budgetArg]);
console.log('camera',JSON.stringify(results.camera));
if(fovArg||budgetArg)await settle(60000);
const out=path.join(root,'perf-results');fs.mkdirSync(out,{recursive:true});
const yaws=[0,Math.PI/2,Math.PI,Math.PI*1.5];
for(let i=0;i<yaws.length;i++){
  await page.evaluate(y=>window.__setCam(y,0),yaws[i]);
  const r=await settle(40000);
  const file=path.join(out,`edge-${label}-${i}.png`);
  await page.screenshot({path:file});
  const cone=await page.evaluate(()=>window.__coneState?window.__coneState():null);
  results.shots.push({i,yaw:yaws[i],file:path.basename(file),n:r.n,ms:r.ms,minFps:r.minFps,requests:r.requests,cone});
  console.log(i,JSON.stringify({n:r.n,ms:r.ms,minFps:r.minFps,cone}));
}
fs.writeFileSync(path.join(out,`edge-${label}.json`),JSON.stringify(results,null,1));
await browser.close();server.close();
