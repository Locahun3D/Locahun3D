import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const dir=process.env.STAIR_INPUT_DIR||'F:/Codex/locahun-walk/verification/real-rad-hybrid-capture-2026-09-10';
const bytes=fs.readFileSync(dir+'/hybrid-boxes.json'),data=JSON.parse(bytes);
const code=fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8');
const ctx=vm.createContext({console,Float32Array,Uint32Array});vm.runInContext(code,ctx);
const core=await ctx.LocahunWalkCollision.create({rapier:RAPIER});
const fallback=process.env.STAIR_FALLBACK==='1';if(!fallback)core._trySupportedStep=()=>null;
const hz=Number(process.env.STAIR_HZ||90),heading=Number(process.env.STAIR_HEADING||2.05);
const results=[];
try{
 core.rebuild({boxes:data.boxes});
 for(const radius of (process.env.STAIR_QUICK?[.22]:[.22,.2,.18]))for(const height of (process.env.STAIR_QUICK?[.3]:[.3,.35,.4]))for(const width of (process.env.STAIR_QUICK?[.08]:[.08,.02])){
  const start={x:6.6,y:-.45,z:2.25};core.setCharacter(start,1.7,radius);core._controller.enableAutostep(height,width,false);
  let vy=0,last,peak=start.y;const samples=[];
  for(let i=0;i<30*hz;i++){
   const speed=Math.min(1.32995,4*(i+1)/hz);vy-=9.8/hz;
   last=core.move({x:Math.sin(heading)*speed/hz,y:vy/hz,z:Math.cos(heading)*speed/hz});
   if(last.grounded&&vy<0)vy=0;peak=Math.max(peak,last.feet.y);if(i%hz===hz-1)samples.push(last.feet);
   if(last.feet.x>8.7||last.feet.y< -1.5)break;
  }
  const row={radius,height,width,end:last.feet,peak,pass:last.feet.x>8.7&&last.feet.y>1,samples};results.push(row);
  console.log(JSON.stringify({...row,samples:undefined}));
 }
}finally{core.dispose();}
fs.writeFileSync(dir+'/sweep-'+hz+'-'+heading+'-'+fallback+'.json',JSON.stringify({
 inputSha256:createHash('sha256').update(bytes).digest('hex'),sourceSha256:createHash('sha256').update(code).digest('hex'),
 hz,heading,seconds:30,speed:1.32995,acceleration:4,fallback,merge:false,boxCount:data.boxes.length,results},null,2));
