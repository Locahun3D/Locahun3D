import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='F:/Codex/locahun-performance-20260911';
const trials=JSON.parse(fs.readFileSync(out+'/heap-gpu-trials.json')).completed;
const quantile=(xs,q)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.ceil(q*xs.length)-1]:null;
const distribution=xs=>({n:xs.length,p50:quantile(xs,.5),p95:quantile(xs,.95),p99:quantile(xs,.99)});
const reports=trials.filter(t=>t.status===0).map(t=>JSON.parse(fs.readFileSync(out+'/'+t.label+'.json')));
const first=reports[0];assert(first,'no successful trials');
const results=reports.map(r=>{
 assert(!r.failure&&r.projectUnchanged,'successful read-only trial');
 for(const key of ['htmlHash','sources','viewport','dpr','assetIdentities','turnCount','dwellMs'])assert.deepEqual(r[key],first[key],key);
 for(const key of ['quality','lodScale','lodBudget','pr','fov','toneMapping','exposure','outputColorSpace','pose'])assert.deepEqual(r.initial[key],first.initial[key],'initial '+key);
 assert(r.data.samples.every(s=>s.quality===r.initial.quality&&s.pr===r.initial.pr),'quality and render ratio remain fixed');
 assert.deepEqual(r.data.poses.map(p=>({offset:p.offset,position:p.position,yaw:p.yaw,pitch:p.pitch})),first.data.poses.map(p=>({offset:p.offset,position:p.position,yaw:p.yaw,pitch:p.pitch})),'identical camera commands');
 assert(r.data.samples.every(s=>!s.collisionBusy&&!s.collisionPending),'collision-free entire timeline');
 const moving=r.data.renders.filter(x=>x.phase.startsWith('turn-'));
 const intervals=moving.slice(1).flatMap((x,i)=>x.phase===moving[i].phase?[x.t-moving[i].t]:[]);
 const detail=[];
 for(let i=0;i<r.turnCount;i++){
  const phase='turn-'+i,poses=r.data.poses.filter(x=>x.phase===phase),last=poses.at(-1);
  const traversal=r.data.traversals.find(t=>t.t>=last.t&&t.phase===phase);
  const presented=traversal&&r.data.renders.find(t=>t.t>=traversal.end&&t.phase===phase);
  detail.push({phase,lastInput:last.t,traversalEnd:traversal?.end,presentedAt:presented?.t,latencyMs:presented?presented.t-last.t:null,censored:!presented});
 }
 const payloadBytes=r.transfers.reduce((n,x)=>n+x.bytes,0);
 assert.equal(payloadBytes,first.transfers.reduce((n,x)=>n+x.bytes,0),'identical response payload bytes');
 const uniformDifferences=(r.turnStates||[]).flatMap((s,i)=>JSON.stringify(s.materials)===JSON.stringify(first.turnStates[i].materials)?[]:[i]);
 return {label:r.label,arm:r.arm,renderIntervals:distribution(intervals),traversal:distribution(r.data.traversals.filter(x=>x.phase.startsWith('turn-')).map(x=>x.end-x.t)),detail,detailProxy:distribution(detail.filter(x=>!x.censored).map(x=>x.latencyMs)),payloadBytes,uniformDifferencesRequiringReview:uniformDifferences,visualReview:'REQUIRED: inspect synchronized movement video and same-view screenshots; uniforms captured in raw turnStates'};
});
fs.writeFileSync(out+'/heap-gpu-summary.json',JSON.stringify({results,warning:'Detail metric is completed-traversal-to-next-render proxy, not proof all chunks finished; censored samples excluded and explicitly counted. Never accept p95 alone without quality review.'},null,2));
console.log(JSON.stringify(results,null,2));
