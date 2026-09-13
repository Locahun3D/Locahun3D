import fs from 'node:fs';
import {createHash} from 'node:crypto';
const dir='F:/Codex/locahun-performance-20260911/';
const digest=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const report=[];
for(let trial=0;trial<2;trial++){
 const labels=['before','after'].map(a=>`heap-gpu-${trial}-${a}`),runs=labels.map(l=>JSON.parse(fs.readFileSync(dir+l+'.json')));
 const phases=[];
 for(let i=0;i<3;i++){
  const phase='turn-'+i;
  const lists=runs.map(r=>r.data.traversals.filter(t=>t.phase===phase&&t.end-t.t>200));
  const matched=[];
  for(const b of lists[0]){const a=lists[1].find(x=>JSON.stringify(x.quat)===JSON.stringify(b.quat));if(!a)continue;matched.push({viewDigest:digest({position:runs[0].initial.pose.position,quat:b.quat,fov:runs[0].initial.fov}),quat:b.quat,beforeMs:b.end-b.t,afterMs:a.end-a.t,reductionPercent:100*(1-(a.end-a.t)/(b.end-b.t))});}
  const states=runs.map(r=>r.turnStates[i]);
  const uniforms=states.map(s=>s.materials.map(m=>({...m,uniforms:Object.fromEntries(Object.entries(m.uniforms).filter(([k])=>!['time','deltaTime','debugFlag'].includes(k)))})));
  phases.push({phase,matchedTraversals:matched,unmatchedBefore:lists[0].length-matched.length,qualityUniformDigests:uniforms.map(digest),qualityUniformsEqual:JSON.stringify(uniforms[0])===JSON.stringify(uniforms[1]),excludedUniforms:['time','deltaTime','debugFlag (existing wall-clock toggle, not quality control)'],viewDigests:states.map(s=>digest(s.pose)),screenshotSha256:labels.map(l=>createHash('sha256').update(fs.readFileSync(dir+l+'-'+phase+'.png')).digest('hex'))});
 }
 const playback=JSON.parse(fs.readFileSync(dir+labels[0]+'-playback-playback.json'));
 report.push({trial,phases,playbackFirst:playback[0],playbackLast:playback.at(-1),limits:'Browser index-buffer hashes were not instrumented. CPU real-view output hashes are separate evidence. Video wall-clock positions are approximate, not frame-perfect synchronized input timestamps.'});
}
fs.writeFileSync(dir+'heap-matched-evidence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
