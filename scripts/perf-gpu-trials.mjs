import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const out='F:/Codex/locahun-performance-20260911';
const seconds=Number(process.env.PERF_GPU_SLOT_SECONDS);
if(process.env.PERF_GPU_APPROVED!=='1'||!Number.isFinite(seconds)||seconds<=0)throw new Error('Explicit exclusive GPU approval and slot duration required');
const deadline=Date.now()+seconds*1000,completed=[];
for(let trial=0;trial<3;trial++)for(const arm of ['before','after']){
 if(deadline-Date.now()<90000){fs.writeFileSync(out+'/heap-gpu-trials.json',JSON.stringify({completed,reason:'Insufficient slot for another bounded run'}));console.log('GPU RELEASED: insufficient slot for another run',completed);process.exit(0);}
 const label=`heap-gpu-${trial}-${arm}`;
 const child=spawnSync(process.execPath,['scripts/perf-rad-baseline.mjs'],{cwd:new URL('..',import.meta.url),stdio:'inherit',env:{...process.env,PERF_EXPERIMENT:'heap',PERF_ARM:arm,PERF_LABEL:label}});
 completed.push({trial,arm,label,status:child.status});
 fs.writeFileSync(out+'/heap-gpu-trials.json',JSON.stringify({completed},null,2));
 if(child.status!==0){console.log('GPU RELEASED: trial failed; do not aggregate as clean timing');process.exitCode=1;process.exit();}
}
console.log('GPU RELEASED: three alternating pairs completed');
