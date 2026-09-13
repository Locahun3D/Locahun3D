import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const sharp=require('sharp'),dir='F:/Codex/locahun-performance-20260911/';
const report=[];
for(let trial=0;trial<2;trial++){
 const labels=['before','after'].map(arm=>`heap-gpu-${trial}-${arm}`),runs=labels.map(l=>JSON.parse(fs.readFileSync(dir+l+'.json')));
 const uniformDiffs=runs[0].turnStates.map((s,i)=>s.materials.flatMap((m,j)=>Object.keys(m.uniforms).filter(k=>JSON.stringify(m.uniforms[k])!==JSON.stringify(runs[1].turnStates[i].materials[j].uniforms[k])).map(k=>({material:j,key:k,before:m.uniforms[k],after:runs[1].turnStates[i].materials[j].uniforms[k]}))));
 const images=[];
 for(const view of ['initial','turn-0','turn-1','turn-2']){
  const buffers=await Promise.all(labels.map(l=>sharp(dir+l+'-'+view+'.png').removeAlpha().raw().toBuffer({resolveWithObject:true})));
  let sum=0,changed=0,count=0;
  for(let y=110;y<840;y++)for(let x=0;x<1440;x++){let d=0;for(let c=0;c<3;c++)d+=Math.abs(buffers[0].data[(y*1440+x)*3+c]-buffers[1].data[(y*1440+x)*3+c]);sum+=d;count++;if(d>30)changed++;}
  images.push({view,maeByte:sum/count/3,changedFractionOver10:changed/count});
  const pair=await Promise.all(labels.map(l=>sharp(dir+l+'-'+view+'.png').resize(720,450).toBuffer()));
  await sharp({create:{width:1440,height:450,channels:3,background:'#000000'}}).composite(pair.map((input,i)=>({input,left:i*720,top:0}))).png().toFile(dir+`heap-pair-${trial}-${view}.png`);
 }
 report.push({trial,uniformDiffs,images});
}
fs.writeFileSync(dir+'heap-visual-analysis.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
