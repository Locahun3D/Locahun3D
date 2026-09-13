import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {applyCandidate} from './perf-streaming-candidate.mjs';
import {assetResponse} from './perf-http-fixture.mjs';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const root=path.resolve(import.meta.dirname,'..');
const out='F:/Codex/locahun-performance-20260911';
const project=process.env.PERF_PROJECT||'C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio';
const label=process.env.PERF_LABEL||'baseline';
const heapExperiment=process.env.PERF_EXPERIMENT==='heap';
if(process.env.PERF_GPU_APPROVED!=='1')throw new Error('Exclusive GPU slot must be approved before running.');
fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const stateBefore=hash(fs.readFileSync(path.join(project,'project-state.json')));
const sources={};
const snapshotFile=path.join(out,heapExperiment?'heap-gpu-snapshot.json':'ab-source-snapshot.json');
const frozen=(heapExperiment||process.env.PERF_ARM==='after')&&fs.existsSync(snapshotFile)?JSON.parse(fs.readFileSync(snapshotFile)):null;
if(heapExperiment&&(!frozen||frozen.project!==project||frozen.projectStateHash!==stateBefore))throw new Error('Prepare matching immutable heap fixture first');
const fragments=frozen?.fragments||{};
const template=frozen?.template||fs.readFileSync(path.join(root,'src/template.html'),'utf8');
let html=template.replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,f)=>{const s=fragments[f]??fs.readFileSync(path.join(root,f),'utf8');fragments[f]=s;sources[f]=hash(s);return heapExperiment||process.env.PERF_ARM==='before'?s:applyCandidate(s,f);});
if(!heapExperiment&&process.env.PERF_ARM==='before')fs.writeFileSync(snapshotFile,JSON.stringify({template,fragments}));
if(heapExperiment||process.env.PERF_ARM==='before'){
 html=html.replace('onDirty: () => markDirty(2),','');
 html=html.replace('if(_pager && (_pager.lodTreeUpdates?.length || _pager.readyUploads?.length || _pager.newUploads?.length)) return true;','');
}
const hook=`
${heapExperiment?`
// Fixture-only: resolve import bookkeeping without starting collision work.
setCameraCollision(false);
_walkAutoImport=function(epoch=walkSetup.epoch){if(epoch!==walkSetup.epoch)return Promise.resolve(false);walkSetup.importDone?.(true);walkSetup.importPending=null;walkSetup.importDone=null;walkSetup.autoEnabled=false;return Promise.resolve(true);};
_walkGenerateCollision=function(){throw new Error('Collision unexpectedly requested in renderer-only fixture');};
`:''}
// Diagnostic-only pin through the production quality applier, equal in both arms.
applyQualityTier(2,{source:'perf-comparison',immediate:true});
window._gpuWatchdog=window._gpuWatchdog||{};window._gpuWatchdog.manualOverride=true;
const perfData={frames:[],renders:[],traversals:[],uploads:[],samples:[],poses:[]};
let perfPhase='load';
const perfRender=renderer.render;
renderer.render=function(...args){const t=performance.now();const v=perfRender.apply(this,args);perfData.renders.push({t,ms:performance.now()-t,phase:perfPhase});return v;};
const perfAnimate=animate;
animate=function(now){const t=performance.now(),r=perfData.renders.length;perfAnimate(now);perfData.frames.push({t:now,ms:performance.now()-t,rendered:perfData.renders.length>r,phase:perfPhase});};
const perfLod=sparkRenderer.updateLodInstances;
sparkRenderer.updateLodInstances=async function(...args){const t=performance.now(),phase=perfPhase,quat=args[5]?.toArray();await perfLod.apply(this,args);perfData.traversals.push({t,end:performance.now(),ms:this.lastTraverseTime,resumed:this.lastTraverseResumed,phase,quat});};
let perfPager=null;
const perfTimer=setInterval(()=>{
 const p=sparkRenderer.pager;
 if(p&&p!==perfPager){perfPager=p;const upload=p.uploadPage;p.uploadPage=function(...a){const t=performance.now();const v=upload.apply(this,a);perfData.uploads.push({t,ms:performance.now()-t,phase:perfPhase});return v;};}
 perfData.samples.push({t:performance.now(),phase:perfPhase,n:layers.filter(l=>l.mesh?.paged).reduce((n,l)=>n+l.mesh.paged.numSplats,0),
  queue:p?.fetchPriority.length,fetchers:p?.fetchers.length,updates:p?.lodTreeUpdates.length,ready:p?.readyUploads.length,newUploads:p?.newUploads.length,
  dirty:sparkRenderer.lodDirty,renderDirty:sparkRenderer.dirty,active:performance.now()<_splatActiveUntil,
  prefetch:window.__lodPrefetch?.phase,override:!!sparkRenderer.lodQuatOverride,quality:qualScale,pr:renderer.getPixelRatio(),heap:performance.memory?.usedJSHeapSize,
  collisionBusy:walkSetup.busy,collisionPending:!!walkSetup.pending});
},50);
window.__perf={data:perfData,phase(p){perfPhase=p;},pose(){return {position:camPos.toArray(),yaw,pitch};},
 setPose(p){camPos.fromArray(p.position);setCamRotImmediate(p.yaw,p.pitch);markDirty(3);bumpSplatActive(3000);},
 turn(offset,base){setCamRotImmediate(base.yaw+offset,base.pitch);markDirty(3);bumpSplatActive(3000);const pose={t:performance.now(),phase:perfPhase,offset,position:camPos.toArray(),yaw,pitch};perfData.poses.push(pose);return pose;},
 state(){const materials=[];scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean)){if(!m.uniforms)continue;const uniforms={};for(const [k,{value:v}] of Object.entries(m.uniforms)){if(v==null||['number','boolean','string'].includes(typeof v))uniforms[k]=v;else if(v.toArray)uniforms[k]=v.toArray();else if(Array.isArray(v)&&v.every(x=>typeof x==='number'))uniforms[k]=v;else if(v.isTexture)uniforms[k]={texture:true,width:v.image?.width,height:v.image?.height};}materials.push({type:m.type,uniforms});}});return {ready:!!window.localProject?.ready,pose:this.pose(),quality:qualScale,lodScale:splatMesh?.lodScale,lodBudget:sparkRenderer.lodSplatCount,pr:renderer.getPixelRatio(),fov:camera.fov,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,outputColorSpace:renderer.outputColorSpace,materials,samples:perfData.samples.slice(-1),gl:renderer.getContext().getParameter(renderer.getContext().RENDERER)};},
 stop(){clearInterval(perfTimer);return perfData;}};
`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const transfers=[];
const assetIdentities=frozen?.assets||{};
if(heapExperiment)for(const [name,identity] of Object.entries(assetIdentities)){const stat=fs.statSync(path.join(project,name.slice(1)));if(stat.size!==identity.size||stat.mtimeMs!==identity.mtimeMs)throw new Error('Frozen asset changed: '+name);}
const vendorBytes=heapExperiment?fs.readFileSync(path.join(out,process.env.PERF_ARM==='before'?'heap-original.module.js':'spark-heap-candidate.module.js')):fs.readFileSync(path.join(root,'vendor/spark-2.0.0-workers16-incrtraverse.module.js'));
if(heapExperiment&&hash(vendorBytes)!==frozen.manifest[process.env.PERF_ARM==='before'?'originalBundleSha256':'candidateBundleSha256'])throw new Error('Frozen vendor identity mismatch');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);return;}
 if(pathname==='/api/project'){res.writeHead(200,{'Content-Type':'application/json'}).end(frozen?.projectState||fs.readFileSync(path.join(project,'project-state.json')));return;}
 if(!/^\/assets\/[a-zA-Z0-9._-]+$/.test(pathname)){res.writeHead(404).end();return;}
 const file=path.join(project,pathname.slice(1));
 if(!fs.existsSync(file)){res.writeHead(404).end();return;}
 const identity=assetIdentities[pathname]||{size:fs.statSync(file).size,sha256:hash(fs.readFileSync(file))};
 assetIdentities[pathname]=identity;
 const response=assetResponse(identity,req.method,req.headers.range),{start,end}=response;
 const entry={file:pathname,method:req.method,start,end,bytes:response.bytes,etag:response.headers.ETag,t:performance.now()};transfers.push(entry);
 res.on('finish',()=>entry.endTime=performance.now());
 res.writeHead(response.status,response.headers);
 if(req.method==='HEAD'||response.status===416){res.end();return;}
 fs.createReadStream(file,{start,end}).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/?localProject=1';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const deadline=setTimeout(()=>browser.close(),85000);
const report={label,experiment:heapExperiment?'heap':'streaming',collisionDisabled:heapExperiment,vendorHash:hash(vendorBytes),assetIdentities,arm:process.env.PERF_ARM||'after',htmlHash:hash(html),created:new Date().toISOString(),sources,url,project,viewport:{width:1440,height:900},dpr:1,nativeRaf:true,network:[],transfers,errors:[],console:[],failedRequests:[],writesBlocked:0};
let page;
try{
 page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1,recordVideo:{dir:out,size:report.viewport}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',e=>report.console.push(e.text().slice(0,500)));
 page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),failure:r.failure()}));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Performance.enable');
 const requests=new Map();
 cdp.on('Network.requestWillBeSent',e=>{if(e.request.url.startsWith('http'))requests.set(e.requestId,{url:e.request.url,t:e.timestamp,range:e.request.headers.Range});});
 cdp.on('Network.loadingFinished',e=>{const r=requests.get(e.requestId);if(r)report.network.push({...r,end:e.timestamp,bytes:e.encodedDataLength});});
 await page.route('**/*',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){report.writesBlocked++;return r.abort();}return r.continue();});
 await page.route('**/vendor/spark-2.0.0-workers16-incrtraverse.module.js',r=>r.fulfill({contentType:'text/javascript',body:vendorBytes}));
 await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto(url);await page.waitForFunction(()=>window.__perf?.state().ready,null,{timeout:25000});console.log(label+' ready');
 await page.waitForTimeout(8000);report.initial=await page.evaluate(()=>__perf.state());
 if(heapExperiment){
  await page.evaluate(p=>__perf.setPose(p),frozen.camera);
  await page.waitForTimeout(8000);report.initial=await page.evaluate(()=>__perf.state());
  if(report.initial.samples.some(s=>s.collisionBusy||s.collisionPending))throw new Error('Collision contaminated renderer-only trial');
 }
 const base=report.initial.pose;await page.screenshot({path:path.join(out,label+'-initial.png')});
 await page.evaluate(()=>__perf.phase('idle'));const m0=await cdp.send('Performance.getMetrics');await page.waitForTimeout(6000);const m1=await cdp.send('Performance.getMetrics');report.idleMetrics={before:m0,after:m1};
 if(!heapExperiment){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
 report.turnCount=heapExperiment?3:8;report.dwellMs=heapExperiment?8000:2500;
 for(let i=0;i<report.turnCount;i++){
  await page.evaluate(async({i,base})=>{__perf.phase('turn-'+i);const from=__perf.pose().yaw-base.yaw,to=[Math.PI/2,Math.PI,-Math.PI/2,0][i%4];for(let n=1;n<=30;n++){__perf.turn(from+(to-from)*n/30,base);await new Promise(r=>setTimeout(r,16));}},{i,base});
  await page.waitForTimeout(report.dwellMs);await page.screenshot({path:path.join(out,label+'-turn-'+i+'.png')});
  (report.turnStates??=[]).push(await page.evaluate(()=>__perf.state()));
 }
 if(!heapExperiment)report.cpuProfile=(await cdp.send('Profiler.stop')).profile;
 report.final=await page.evaluate(()=>__perf.state());report.data=await page.evaluate(()=>__perf.stop());
 report.projectUnchanged=stateBefore===hash(fs.readFileSync(path.join(project,'project-state.json')));
}catch(e){report.failure=e.stack;report.pageState=await page?.evaluate(()=>({url:location.href,probe:!!window.__perf,local:window.localProject,body:document.body.innerText.slice(-1800)})).catch(()=>null);await page?.screenshot({path:path.join(out,label+'-failure.png')}).catch(()=>{});}finally{
 fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report));
 try{if(page){const video=page.video();await page.context().close();await video.saveAs(path.join(out,label+'.webm'));report.video=label+'.webm';}}catch(e){report.videoError=e.message;}
 clearTimeout(deadline);await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report));
}
console.log(JSON.stringify({label,failure:report.failure,initial:report.initial,final:report.final,errors:report.errors,frames:report.data?.frames.length}));
if(report.failure)process.exitCode=1;
