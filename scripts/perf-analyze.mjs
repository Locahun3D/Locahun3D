import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const sharp=require('sharp');
const dir='F:/Codex/locahun-performance-20260911';
const labels=process.argv.slice(2).length?process.argv.slice(2):['ab-before','ab-after'];
function stats(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b),at=q=>v.length?v[Math.max(0,Math.ceil(v.length*q)-1)]:null;return {n:v.length,p50:at(.5),p95:at(.95),p99:at(.99),max:v.at(-1)??null};}
function analyze(r){
 if(!r.data)return {failure:r.failure||'No raw samples'};
 const d=r.data,frames=d.frames.filter(x=>x.phase.startsWith('turn-')),rendered=frames.filter(x=>x.rendered);
 const interval=values=>values.slice(1).map((x,i)=>x.t-values[i].t);
 const latencies=[];
 for(const phase of [...new Set(d.poses.map(x=>x.phase))]){
  const pose=d.poses.filter(x=>x.phase===phase).at(-1);
  const traverse=d.traversals.find(x=>x.t>=pose.t&&x.phase===phase);
  const render=traverse&&d.renders.find(x=>x.t>=traverse.end&&x.phase===phase);
  latencies.push({phase,latency:render?render.t-pose.t:null,censored:!render});
 }
 const idle=d.frames.filter(x=>x.phase==='idle'),idleTime=idle.at(-1)?.t-idle[0]?.t;
 const metric=(which,name)=>r.idleMetrics?.[which].metrics.find(x=>x.name===name)?.value;
 const task=metric('after','TaskDuration')-metric('before','TaskDuration'),elapsed=metric('after','Timestamp')-metric('before','Timestamp');
 const samples=d.samples,positive=samples.find(x=>x.n>0);
 const readyFrame=positive&&d.renders.find(x=>x.t>=positive.t);
 const weights=new Map(),nodes=new Map(r.cpuProfile.nodes.map(n=>[n.id,n]));
 r.cpuProfile.samples.forEach((id,i)=>{const n=nodes.get(id),name=n.callFrame.functionName||'(anonymous)';weights.set(name,(weights.get(name)||0)+(r.cpuProfile.timeDeltas[i]||0));});
 return {frameIntervalMs:stats(interval(frames)),renderIntervalMs:stats(interval(rendered)),mainAnimateCpuMs:stats(frames.map(x=>x.ms)),submitCpuMs:stats(d.renders.filter(x=>x.phase.startsWith('turn-')).map(x=>x.ms)),traversalRoundTripMs:stats(d.traversals.map(x=>x.ms)),uploadCpuMs:stats(d.uploads.map(x=>x.ms)),
  firstLodPresentationProxyMs:stats(latencies.map(x=>x.latency).filter(x=>x!==null)),latencies,
  note:'LOD latency is first traversal started after final camera command plus next render, NOT a proof of full-resolution convergence. Eight turns cannot establish a stable population p95.',
  idle:{durationMs:idleTime,callbacks:idle.length,renders:idle.filter(x=>x.rendered).length,mainThreadTaskPercent:elapsed?task/elapsed*100:null},
  firstPositiveSplatPresentationMs:readyFrame?.t,radPayloadBytes:r.transfers.reduce((s,x)=>s+x.bytes,0),radRanges:r.transfers.map(x=>[x.file,x.start,x.end]),
  quality:[r.initial.quality,r.final.quality],lodScale:[r.initial.lodScale,r.final.lodScale],lodBudget:[r.initial.lodBudget,r.final.lodBudget],heapBytes:stats(samples.map(x=>x.heap)),
  maxUnconsumedUpdates:Math.max(...samples.map(x=>(x.updates||0)+(x.newUploads||0)+(x.ready||0))),
  cpuSelfSamplesTop:[...weights].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([name,us])=>({name,ms:us/1000})),errors:r.errors,projectUnchanged:r.projectUnchanged,video:r.video,videoError:r.videoError};
}
const report={runs:{},imageComparisons:[]},raw={};
for(const label of labels){const file=path.join(dir,label+'.json');if(fs.existsSync(file)){raw[label]=JSON.parse(fs.readFileSync(file));report.runs[label]=analyze(raw[label]);}}
if(labels.length===2){
 const [a,b]=labels;
 if(raw[a]&&raw[b])report.sourceDifferences=Object.keys(raw[a].sources).filter(k=>raw[a].sources[k]!==raw[b].sources[k]);
 for(const view of ['initial',...Array.from({length:8},(_,i)=>'turn-'+i)]){
  const paths=labels.map(x=>path.join(dir,x+'-'+view+'.png'));if(!paths.every(p=>fs.existsSync(p)))continue;
  const aa=await sharp(paths[0]).removeAlpha().raw().toBuffer({resolveWithObject:true}),bb=await sharp(paths[1]).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(aa.data.length!==bb.data.length)throw new Error('Image sizes differ');
  let sum=0,changed=0,count=0;
  // Exclude toolbar/FPS; keep the actual viewport and annotation geometry.
  for(let y=110;y<840;y++)for(let x=0;x<aa.info.width;x++){
   const i=(y*aa.info.width+x)*3;let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(aa.data[i+c]-bb.data[i+c]);sum+=delta;count+=3;if(delta>30)changed++;
  }
  report.imageComparisons.push({view,maeByte:sum/count,pixelsChangedOver10Mean:changed/(count/3)});
 }
}
fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
