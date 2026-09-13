import fs from 'node:fs';
import vm from 'node:vm';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const out='F:/Codex/locahun-walk/verification/real-rad-stair-detail-2026-09-10';
const data=JSON.parse(fs.readFileSync(out+'/results.json','utf8'));
const ctx=vm.createContext({console,Float32Array,Uint32Array});
vm.runInContext(fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8'),ctx);
const core=await ctx.LocahunWalkCollision.create({rapier:RAPIER});
if(process.env.STAIR_LIMITS)core._trySupportedStep=()=>null;
const results=[];
try{
 for(const e of data.experiments.slice(0,process.env.STAIR_TUNE?1:2)){
  let boxes=e.boxes;
  if(process.env.STAIR_MERGE){
   const columns=new Map();for(const b of boxes){const key=[b.center[0],b.center[2],b.half[0],b.half[2]].map(v=>v.toFixed(8)).join(',');if(!columns.has(key))columns.set(key,[]);columns.get(key).push(b);}
   boxes=[];for(const col of columns.values()){col.sort((a,b)=>(a.center[1]-a.half[1])-(b.center[1]-b.half[1]));let current;for(const b of col){const bottom=b.center[1]-b.half[1],top=b.center[1]+b.half[1];if(current&&bottom<=current.center[1]+current.half[1]+1e-8){const low=current.center[1]-current.half[1],high=Math.max(top,current.center[1]+current.half[1]);current.center[1]=(low+high)/2;current.half[1]=(high-low)/2;}else{current={center:[...b.center],half:[...b.half]};boxes.push(current);}}}
  }
  core.rebuild({boxes});
  if(process.env.STAIR_SWEEP&&!core._trialMove){
   const normal=core.move.bind(core);core._trialMove=true;
   core.move=function(d){
    const p=this._avatar.translation(),result=normal(d),wanted=Math.hypot(d.x,d.z);
    const progress=Math.hypot(result.feet.x-p.x,result.feet.z-p.z);
    if(d.y>0||!result.grounded||wanted<1e-5||progress>wanted*.5)return result;
    const saved=this._avatar.translation(),c=this._controller;
    const sweep=delta=>{c.computeColliderMovement(this._avatar,delta,2,0x00020001);const a=c.computedMovement(),at=this._avatar.translation();this._avatar.setTranslation({x:at.x+a.x,y:at.y+a.y,z:at.z+a.z});return a;};
    this._avatar.setTranslation(p);const up=sweep({x:0,y:.3,z:0});
    if(up.y<.299){this._avatar.setTranslation(saved);return result;}
    const across=sweep({x:d.x,y:0,z:d.z});sweep({x:0,y:-.3,z:0});
    const q=this._avatar.translation(),feet={x:q.x,y:q.y-this._height/2,z:q.z};
    let support=true;
    for(const lead of [.12,.24]){const origin={x:feet.x+d.x/wanted*lead,y:feet.y+.1,z:feet.z+d.z/wanted*lead};const hit=this.raycast(origin,{x:0,y:-1,z:0},.2);if(hit===null||hit<=0)support=false;}
    if(support&&c.computedGrounded()&&Math.hypot(across.x,across.z)>wanted*.8&&q.y>=p.y&&this.isCapsuleClear(feet,this._height,this._radius))return {feet,grounded:true};
    this._avatar.setTranslation(saved);return result;
   };
  }
  for(const x of (process.env.STAIR_TUNE?[6.6]:[6.35,6.6,6.85]))for(const z of (process.env.STAIR_TUNE?[2.25]:[1.45,1.65,1.85,2.05,2.25])){
   const d=core.raycast({x,y:.2,z},{x:0,y:-1,z:0},2);if(d===null)continue;
   const start={x,y:.2-d+.05,z};if(!core.isCapsuleClear(start,1.7,.22))continue;
   for(const height of (process.env.STAIR_LIMITS?[.3,.35,.4]:[.3]))for(const width of (process.env.STAIR_LIMITS?[.02,.08]:process.env.STAIR_TUNE?[.08,.09,.1]:[.12]))for(const heading of (process.env.STAIR_LIMITS?[2.05]:process.env.STAIR_TUNE?[1.99,2.05,2.1]:[1.57,1.8,2,2.2])){
    core._controller.enableAutostep(height,width,false);
    core.setCharacter(start,1.7,.22);let vy=0,peak=start.y,last;const samples=[];
    for(let i=0;i<(process.env.STAIR_TUNE?2700:540);i++){
     const hz=Number(process.env.STAIR_HZ||90),speed=Number(process.env.STAIR_SPEED||1.2);
     vy-=9.8/hz;last=core.move({x:Math.sin(heading)*speed/hz,y:vy/hz,z:Math.cos(heading)*speed/hz});
     if(last.grounded&&vy<0)vy=0;peak=Math.max(peak,last.feet.y);
     if(i%90===89)samples.push(last.feet);
     if(last.feet.y<start.y-1||last.feet.x>8.7)break;
    }
    const collisions=[];for(let i=0;i<core._controller.numComputedCollisions();i++){const hit=core._controller.computedCollision(i);collisions.push({normal1:hit.worldNormal1,normal2:hit.worldNormal2,remaining:hit.translationRemaining,applied:hit.translationApplied});}
    results.push({cellSize:e.effectiveCellSize,start,height,width,heading,peak,end:last.feet,grounded:last.grounded,collisions,samples});
   }
  }
 }
}finally{core.dispose();}
results.sort((a,b)=>b.peak-a.peak);
fs.writeFileSync(out+(process.env.STAIR_LIMITS?'/limits-sweep.json':process.env.STAIR_MERGE?'/merged-sweep.json':process.env.STAIR_TUNE?'/controller-sweep.json':'/heading-sweep.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({count:results.length,best:results.slice(0,6)},null,2));
