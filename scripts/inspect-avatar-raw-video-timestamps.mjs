import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const dir=option('dir'),ffmpeg=option('ffmpeg');
if(!dir||!ffmpeg)throw new Error('Require --dir=EXISTING_CAPTURE_DIRECTORY --ffmpeg=LOCAL_EXECUTABLE');
const videos=[];
for(const name of fs.readdirSync(dir).filter(n=>/^raw-(front|side)(-run-native|-run616)?\.webm$/.test(n))){
  const file=path.join(dir,name),bytes=fs.readFileSync(file);
  const result=spawnSync(ffmpeg,['-hide_banner','-nostdin','-threads','2','-i',file,'-vf','showinfo','-fps_mode','passthrough','-f','null','NUL'],{encoding:'utf8',maxBuffer:16*1024*1024});
  const times=[...result.stderr.matchAll(/\bn:\s*\d+\s+pts:\s*[-\d]+\s+pts_time:([-+\d.eE]+)/g)].map(m=>Number(m[1]));
  const gaps=times.slice(1).map((time,i)=>time-times[i]),sorted=gaps.toSorted((a,b)=>a-b);
  videos.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
    decodeExitCode:result.status,frames:times.length,firstPTS:times[0],lastPTS:times.at(-1),
    nonIncreasingPTS:gaps.filter(g=>g<=0).length,maxGapSeconds:sorted.at(-1),medianGapSeconds:sorted[Math.floor(sorted.length/2)],
    averageObservedFPS:times.length>1?(times.length-1)/(times.at(-1)-times[0]):null,
    error:result.error?.message|| (result.status?result.stderr.slice(-2000):undefined)});
}
const report={videos,limitation:'CPU timestamp/decode inspection only, not browser replay or visual acceptance. Original browser frame-progress assertion failed; its failing video ID and first/last counters were not persisted, so the browser failure cause is unresolved.'};
fs.writeFileSync(path.join(dir,'cpu-video-timestamps.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(videos.length!==6||videos.some(v=>v.decodeExitCode!==0||v.frames<2||v.nonIncreasingPTS))process.exitCode=1;
