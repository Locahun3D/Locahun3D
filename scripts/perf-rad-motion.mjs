// RAD の「カメラを動かしている最中」の LOD 追従を測る（2026-09-21）。
// perf-rad-turn.mjs が「止めてから精細になるまで」を測るのに対し、こちらは
// 本人の体感（＝動かしている間ずっと粗い／LODが追いつかない）を数字にする。
//
//   node scripts/perf-rad-motion.mjs --label baseline-2f-t2 --tier 2 --latency 150 --query diag=1
//   node scripts/perf-rad-motion.mjs --label after-oy-t2 --tier 2 --latency 150 --query diag=1 \
//        --rad "C:/Users/askgg/Dropbox/.../OmoideYokocho.rad"
//
// ・実 Chrome（GPU あり・画面表示）。ローカル HTTP が Range 対応＋1リクエストごとに
//   --latency ms を足して R2 を模擬する（perf-rad-turn と同じ作り）。
// ・計測対象の HTML は既定で Locahun3D_OfflineViewer.online.html
//   （importmap.online.json → vendor の heap319 ビルドを使う版）。
// ・手順: ロード→収束→（基準の静止 numSplats を記録）→4秒の連続移動
//   （yaw を滑らかに回しつつ直線移動）→停止→満額復帰まで収束を待つ。
// ・指標:
//     motion.traversals            移動中に完了したトラバース数
//     motion.traverseMs.mean/max   その所要ms
//     motion.stalenessMs.mean/p95  ポーズを置いてから、そのポーズ以降に始まった
//                                  トラバースが返るまでのms（＝LODの遅れ）
//     motion.fps.mean/min          移動中のフレームレート
//     settle.msToFull              停止から「満額予算で収束」までのms
//     settle.numSplats             最終ビューの静止 numSplats（前後で一致が必須）
// ・結果は perf-results/rad-motion-<label>.json。ソースもシーンも書き換えない。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d;};
const root=path.resolve(import.meta.dirname,'..');
const label=arg('--label','baseline');
const htmlName=arg('--html','Locahun3D_OfflineViewer.online.html');
const latency=+arg('--latency','150');
const extraQuery=arg('--query','diag=1');
const tier=arg('--tier','2');
const moveMs=+arg('--move-ms','4000');
const turnDeg=+arg('--turn-deg','180');   // 4秒で回す角度
const moveM=+arg('--move-m','3');         // 4秒で進む距離(m)。開始位置の正面方向へ直進
const shot=process.argv.includes('--shot');
const rad=arg('--rad','C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/2_3DGSData/2FStudio/Rad/2FStudio.rad');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'};
let requests=0,srvMs=0,srvN=0,inflight=0,maxInflight=0;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x');
  if(req.method==='POST'){res.writeHead(204).end();return;}   // ?diag=1 の /__diag POST を捨てる
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
    if(url.pathname==='/scene.rad'){requests++;const t=Date.now();inflight++;maxInflight=Math.max(maxInflight,inflight);
      res.on('close',()=>{inflight--;srvMs+=Date.now()-t;srvN++;});setTimeout(send,latency);}
    else send();
  });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--window-size=1600,900','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${port}/${htmlName}?autoload=${encodeURIComponent('/scene.rad')}&autoname=scene.rad${extraQuery?'&'+extraQuery:''}`);

const sample=()=>page.evaluate(()=>{const d=window.__diagState||{};window.__keepAlive&&window.__keepAlive(3000);
  return {n:window.__nSplat?window.__nSplat():-1,q:d.pagerQ,a:d.pagerActive,trav:d.lastTraverseMs,fps:d.fps,
          tier:d.splatPerfTier,budget:d.lodSplatCount,pre:d.lodPrefetch&&d.lodPrefetch.phase,
          rm:d.radMotion?{on:d.radMotion.enabled,act:d.radMotion.active,b:d.radMotion.reduced}:null};});

// 収束待ち。perf-rad-turn と同じ定義（numSplats が動かず・取得0・リクエスト増なしが quietMs 続く）に
// 「満額予算に戻っていること」を追加した（wantBudget が渡されたとき）。
async function settle(maxMs=30000,quietMs=5000,wantBudget){
  const t0=Date.now(),r0=requests;let last=t0,prev=null,prevReq=requests,s=null,minFps=Infinity;
  while(Date.now()-t0<maxMs){
    s=await sample();
    const budgetOk=(wantBudget==null)||(s.budget===wantBudget)||(wantBudget==='full'&&!(s.rm&&s.rm.act));
    if(prev===null||s.n!==prev||s.a>0||requests!==prevReq||!budgetOk)last=Date.now();
    prevReq=requests;prev=s.n;if(s.fps>0)minFps=Math.min(minFps,s.fps);
    if(Date.now()-last>=quietMs)break;
    await new Promise(r=>setTimeout(r,100));
  }
  return {ms:last-t0,timedOut:Date.now()-last<quietMs,requests:requests-r0,n:s.n,
          minFps:minFps===Infinity?null:minFps,trav:s.trav,budget:s.budget,tier:s.tier,pre:s.pre,rm:s.rm};
}

await page.waitForFunction(()=>window.__nSplat&&window.__nSplat()>0,null,{timeout:180000});
if(tier!=='')await page.evaluate(t=>{window._gpuWatchdog=window._gpuWatchdog||{};window._gpuWatchdog.manualOverride=true;
  window._applyQualityTier(+t,{source:'perf',immediate:true});},tier);
const load=await settle(180000,5000);
console.log('load',JSON.stringify(load));

// ── 計測フックを差し込む ────────────────────────────────────────────────
// SparkRenderer.updateLodInstances を包み、「いつ・どのポーズで始まり・いつ返ったか」を記録する。
// ここを包むのは、traverseLodTrees の呼び出し元がこのメソッドだけだから（vendor 実装で確認）。
await page.evaluate(()=>{
  const sr=window.__diagState.sparkRenderer;
  const proto=Object.getPrototypeOf(sr);
  if(proto.__radMotionHooked) return;
  proto.__radMotionHooked=true;
  const orig=proto.updateLodInstances;
  window.__travLog=[];
  proto.updateLodInstances=async function(worker,deltaPred,lodMeshes,maxSplats,viewPos,viewQuat,pixelScaleLimit){
    const rec={t0:performance.now(),max:maxSplats,x:viewPos.x,y:viewPos.y,z:viewPos.z};
    const out=await orig.apply(this,arguments);
    rec.t1=performance.now();rec.ms=rec.t1-rec.t0;rec.res=!!this.lastTraverseResumed;
    window.__travLog.push(rec);
    return out;
  };
});

const start=await page.evaluate(()=>window.__diagState.cam);
console.log('start pose',JSON.stringify(start));
const restN=load.n;

// ── 4秒の連続移動 ─────────────────────────────────────────────────────
// yaw を一定速で回しつつ、開始 yaw の正面方向（前方 = (sin yaw, 0, cos yaw)、
// カメラ規約は 220 の rotation.set(pitch, yaw+π, 0,'YXZ') から導出）へ直進する。
const motionP=page.evaluate(async ({ms,turn,dist,sx,sy,sz,syaw})=>{
  window.__travLog.length=0;
  const poses=[],frames=[],ns=[];let lastN=0;
  const fx=Math.sin(syaw),fz=Math.cos(syaw);
  const t0=performance.now();
  await new Promise(done=>{
    const tick=()=>{
      const t=performance.now(),u=Math.min(1,(t-t0)/ms);
      const yaw=syaw+turn*u, d=dist*u;
      window.__setCam(yaw,0);
      window.__setCamPos(sx+fx*d, sy, sz+fz*d);
      poses.push({t,yaw,d});
      frames.push(t);
      if(t-lastN>200){lastN=t;ns.push({t,n:window.__nSplat()});}
      if(u>=1){done();return;}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return {t0,t1:performance.now(),poses,frames,ns,trav:window.__travLog.slice(),
          end:{yaw:syaw+turn,x:sx+fx*dist,y:sy,z:sz+fz*dist}};
},{ms:moveMs,turn:turnDeg*Math.PI/180,dist:moveM,sx:start.x,sy:start.y,sz:start.z,syaw:start.yaw});
// --shot: 移動の真ん中で1枚、停止・収束後に1枚。画が崩れていないかを目で確認するため。
const shotDir=path.join(root,'perf-results','shots');
if(shot){fs.mkdirSync(shotDir,{recursive:true});
  await new Promise(r=>setTimeout(r,Math.round(moveMs/2)));
  await page.screenshot({path:path.join(shotDir,`${label}-mid.png`)});}
const motion=await motionP;

// 停止後: 満額予算に戻って収束するまで
const after=await settle(60000,5000,'full');
if(shot)await page.screenshot({path:path.join(shotDir,`${label}-rest.png`)});
console.log('settle',JSON.stringify(after));
const restAfter=await page.evaluate(()=>({n:window.__nSplat(),budget:window.__diagState.lodSplatCount,
  rm:window.__diagState.radMotion,trav:window.__travLog.slice()}));
// staleness は「移動終了後に着地したトラバース」まで含めて数える。移動中に始まった
// 遅いトラバースを取りこぼすと、遅い側（＝baseline）が不当に良く見えるため。
motion.trav=restAfter.trav;

// ── 集計 ───────────────────────────────────────────────────────────────
const travIn=motion.trav.filter(r=>r.t0>=motion.t0&&r.t0<=motion.t1);   // 移動中に「始まった」もの
const msArr=travIn.map(r=>r.ms);
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const pct=(a,p)=>{if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))];};
// staleness: 各ポーズ t_p に対し、t_p 以降に「開始」した最初のトラバースが返る時刻 - t_p
const sorted=motion.trav.slice().sort((a,b)=>a.t0-b.t0);
const stale=[];
for(const p of motion.poses){
  const tr=sorted.find(r=>r.t0>=p.t);
  if(tr) stale.push(tr.t1-p.t);
}
// fps: 移動中の rAF 間隔から
const fr=motion.frames;const gaps=[];for(let i=1;i<fr.length;i++)gaps.push(fr[i]-fr[i-1]);
const fpsMean=gaps.length?1000/mean(gaps):null;
const fpsMin=gaps.length?1000/Math.max(...gaps):null;
const win=[];for(let i=0;i<fr.length;i++){const j=fr.findIndex(t=>t>fr[i]-250);if(i-j>0)win.push((i-j)/((fr[i]-fr[j])/1000));}

const results={
  label,htmlName,latency,tier,extraQuery,rad:path.basename(rad),
  when:new Date().toISOString(),
  move:{ms:moveMs,turnDeg,moveM,start,end:motion.end},
  load:{ms:load.ms,n:load.n,budget:load.budget,tier:load.tier,requests:load.requests},
  motion:{
    durMs:Math.round(motion.t1-motion.t0),
    traversals:travIn.length,
    traverseMs:{mean:mean(msArr),max:msArr.length?Math.max(...msArr):null,p95:pct(msArr,0.95)},
    resumedShare:travIn.length?travIn.filter(r=>r.res).length/travIn.length:null,
    stalenessMs:{mean:mean(stale),p95:pct(stale,0.95),max:stale.length?Math.max(...stale):null,
                 samples:stale.length,poses:motion.poses.length},
    fps:{mean:fpsMean,min:fpsMin,minWindow:win.length?Math.min(...win):null},
    budgetSeen:[...new Set(motion.trav.map(r=>r.max))],
    // 移動中に実際に描かれていた splat 数（画が崩れていないかの目安）
    numSplats:{min:motion.ns.length?Math.min(...motion.ns.map(r=>r.n)):null,
               mean:mean(motion.ns.map(r=>r.n)),
               last:motion.ns.length?motion.ns[motion.ns.length-1].n:null},
  },
  settle:{msToFull:after.ms,timedOut:after.timedOut,requests:after.requests,
          numSplats:restAfter.n,budget:restAfter.budget,minFps:after.minFps},
  atRestBeforeMotion:{numSplats:restN},
  radMotion:restAfter.rm,
  serverAvgMsPerRequest:srvN?Math.round(srvMs/srvN):null,maxInflight,totalRequests:requests,
  errors,
};
const round=(o)=>{for(const k in o){const v=o[k];if(typeof v==='number'&&!Number.isInteger(v))o[k]=+v.toFixed(1);else if(v&&typeof v==='object')round(v);}return o;};
round(results);
fs.mkdirSync(path.join(root,'perf-results'),{recursive:true});
fs.writeFileSync(path.join(root,'perf-results',`rad-motion-${label}.json`),JSON.stringify(results,null,1));
console.log(JSON.stringify(results.motion,null,1));
console.log('settle msToFull',results.settle.msToFull,'n',results.settle.numSplats,'(at rest before motion',restN,')');
await browser.close();server.close();
console.log('saved',label,'errors',errors.length);
