import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const root=path.resolve(import.meta.dirname,'..');
const project='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio';
const url=JSON.parse(fs.readFileSync(path.join(project,'.local-project.lock'),'utf8')).url;
const before=fs.readFileSync(path.join(project,'project-state.json'));
const out=process.env.AVATAR_RAD_OUT||'F:/Codex/locahun-walk/verification/real-rad-locomotion-2026-09-10';
fs.mkdirSync(out,{recursive:true});
// Assemble current source in memory only; no built HTML or project is written.
let html=fs.readFileSync(path.join(root,'src/template.html'),'utf8').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,f)=>fs.readFileSync(path.join(root,f),'utf8'));
const hook=`const __proxyKinds=new WeakMap(),__refineOriginal=LocahunWalkCollision.refineLocal;let __inRefine=false;
${process.env.AVATAR_FINE_CELL?`const __voxelOriginal=LocahunWalkCollision.voxelize;LocahunWalkCollision.voxelize=function(points,options){if(__inRefine)options={...options,cellSize:${Number(process.env.AVATAR_FINE_CELL)},maxCells:60000,maxCandidates:120000};return __voxelOriginal.call(this,points,options);};`:''}
${process.env.AVATAR_RADIUS?`walkMode.bodyRadius=${Number(process.env.AVATAR_RADIUS)};`:''}
LocahunWalkCollision.refineLocal=function(points,coarse,center){__inRefine=true;try{const r=__refineOriginal.call(this,points,coarse,center),old=new Set(coarse);for(const b of r.boxes)__proxyKinds.set(b,old.has(b)?'coarse':'fine');return r;}finally{__inRefine=false;}};
window.__avatarProbe={
 boxes:()=>walkSetup.settings.boxes,
 state:()=>({camera:camPos.toArray(),yaw,pitch,active:walkMode.active,status:walkSetup.status,busy:walkSetup.busy,detailRegion:walkSetup.settings.detailRegion,spawn:walkSetup.settings.spawn,boxes:walkSetup.settings.boxes.length,layers:layers.map(l=>({id:l.id,name:l.name,type:l.type})),feet:walkMode.avatar?.position.toArray()}),
 view:(p,y,t)=>{camPos.set(...p);setCamRotImmediate(y,t);markDirty(120);bumpSplatActive(10000);},
 steer:()=>{const p=walkMode.avatar.position,targetX=p.x+.5,targetZ=1.797-.445*(targetX-7.167);setCamRotImmediate(Math.atan2(.5,targetZ-p.z),pitch);},
 contacts:()=>{const p=walkMode.avatar?.position;if(!p)return [];const radius=walkMode.bodyRadius;
  return walkSetup.settings.boxes.filter(b=>{const dx=Math.max(0,Math.abs(p.x-b.center[0])-b.half[0]),dz=Math.max(0,Math.abs(p.z-b.center[2])-b.half[2]);const dy=Math.max(0,b.center[1]-b.half[1]-(p.y+walkMode.height-radius),(p.y+radius)-(b.center[1]+b.half[1]));return Math.hypot(dx,dy,dz)<=radius+.015;}).map(b=>({...b,kind:__proxyKinds.get(b)||'saved'}));},
 enter:async()=>{
  walkSetup.settings.spawn=null;walkSetup.spawnCandidate={x:camPos.x,y:camPos.y,z:camPos.z};walkSetup.spawnYawCandidate=yaw;
  walkSetup.settings.spawn=_walkSpawnPosition(false);walkSetup.settings.spawnYaw=yaw;
  await _avatarWalkEnter();
 },input:(v)=>Object.assign(keys,v),exit:()=>toggleAvatarWalk(),
 hideAnnotations:()=>{layers.filter(l=>l.type==='path').forEach(l=>l.mesh.visible=false);markDirty(120);},
 enterStairs:async()=>{
  if(walkSetup.pending)await walkSetup.pending;
  if(!await _walkGenerateCollision({automatic:true,center:{x:7,y:0,z:1.85}}))throw new Error(walkSetup.status);
  walkSetup.settings.spawn={x:6.6,y:-.45,z:2.25};walkSetup.settings.spawnYaw=${Number(process.env.AVATAR_HEADING||2.05)};
  if(!_walkFeetClear(walkSetup.core,walkSetup.settings.spawn)){
   let found=false;for(const z of [2.25,2.05,1.85,1.65]){for(const lift of [.05,.1,.15]){const d=walkSetup.core.raycast({x:6.6,y:.2,z},{x:0,y:-1,z:0},2);if(d===null)continue;const p={x:6.6,y:.2-d+lift,z};if(_walkFeetClear(walkSetup.core,p)){walkSetup.settings.spawn=p;found=true;break;}}if(found)break;}
  }
  await _avatarWalkEnter();
 },
 experiment:async({cellSize,radius})=>{
  walkSetup.settings.radius=radius;walkSetup.settings.cellSize=cellSize;
  if(walkSetup.pending)await walkSetup.pending;
  if(!await _walkGenerateCollision({automatic:true,center:{x:7,y:0,z:1.85}}))throw new Error(walkSetup.status);
  const boxes=walkSetup.settings.boxes,core=walkSetup.core,results=[];
  for(const z of [1.45,1.65,1.85,2.05,2.25]){
   const profile=[];
   for(let x=6.5;x<=9;x+=.125){const spans=boxes.filter(b=>Math.abs(x-b.center[0])<=b.half[0]&&Math.abs(z-b.center[2])<=b.half[2]&&b.center[1]-b.half[1]<2&&b.center[1]+b.half[1]>-.8).map(b=>[b.center[1]-b.half[1],b.center[1]+b.half[1]]).sort((a,b)=>a[0]-b[0]);profile.push({x,spans});}
   const origin={x:6.35,y:.2,z},d=core.raycast(origin,{x:0,y:-1,z:0},3);
   if(d===null){results.push({z,profile,error:'no floor'});continue;}
   const start={x:6.35,y:origin.y-d+.03,z};
   if(!_walkFeetClear(core,start)){results.push({z,start,profile,error:'body blocked at start'});continue;}
   core.setCharacter(start,walkMode.height,walkMode.bodyRadius);
   let vy=0,last,peak=start.y;const samples=[];
   for(let i=0;i<540;i++){vy-=9.8/90;last=core.move({x:1.2/90,y:vy/90,z:0});if(last.grounded&&vy<0)vy=0;peak=Math.max(peak,last.feet.y);if(i%90===89)samples.push({...last.feet});}
   results.push({z,start,peak,end:last.feet,samples,profile});
  }
  return {requestedCellSize:cellSize,effectiveCellSize:walkSetup.settings.effectiveCellSize,boxCount:boxes.length,boxes,radius,method:'actual generated RAD colliders; fixed 90Hz capsule movement +X at 1.2m/s for 6s',results};
 }
};`;
const at=html.lastIndexOf('</script>');assert(at>0);html=html.slice(0,at)+hook+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={writes:0,errors:[],staircaseVerified:false,configuration:{heading:Number(process.env.AVATAR_HEADING||2.05),radius:Number(process.env.AVATAR_RADIUS||.22),fineCell:Number(process.env.AVATAR_FINE_CELL||.1),steering:process.env.AVATAR_RAD_STEER==='1',source:'current in-memory source, no build'}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){report.writes++;return r.abort();}return r.continue();});
 await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto(url);await page.waitForFunction(()=>window.localProject?.ready,{timeout:120000});
 await page.waitForTimeout(12000);
 report.initial=await page.evaluate(()=>__avatarProbe.state());
 await page.screenshot({path:path.join(out,'initial.png')});
 if(process.env.AVATAR_RAD_POSE){const pose=JSON.parse(process.env.AVATAR_RAD_POSE);await page.evaluate(p=>{__avatarProbe.view(p.position,p.yaw,p.pitch);__avatarProbe.hideAnnotations();},pose);report.annotationsHiddenInFixture=true;await page.waitForTimeout(10000);await page.screenshot({path:path.join(out,'target.png')});}
 if(process.env.AVATAR_RAD_WALK==='1'){
  try{await page.evaluate(s=>s?__avatarProbe.enterStairs():__avatarProbe.enter(),process.env.AVATAR_RAD_STAIRS==='1');report.entered=await page.evaluate(()=>__avatarProbe.state());
   fs.writeFileSync(path.join(out,'hybrid-boxes.json'),JSON.stringify({state:report.entered,boxes:await page.evaluate(()=>__avatarProbe.boxes())}));
   await page.evaluate(()=>__avatarProbe.input({KeyW:true}));report.samples=[];
   for(let i=0;i<(process.env.AVATAR_CAPTURE_ONLY?'1':process.env.AVATAR_RAD_STAIRS==='1'?30:8);i++){if(process.env.AVATAR_RAD_STEER==='1')await page.evaluate(()=>__avatarProbe.steer());await page.waitForTimeout(1000);const sample=await page.evaluate(()=>({...__avatarProbe.state(),contacts:__avatarProbe.contacts()}));report.samples.push(sample);await page.screenshot({path:path.join(out,'walk-'+i+'.png')});if(sample.feet?.[0]>8.7&&sample.feet[1]>1){report.staircaseVerified=true;break;}}
   await page.evaluate(()=>{__avatarProbe.input({KeyW:false});__avatarProbe.exit();});
  }catch(e){report.walkError=e.message;report.walkErrorState=await page.evaluate(()=>__avatarProbe.state());}
 }
 if(process.env.AVATAR_RAD_EXPERIMENT==='1'){
  report.experiments=[];
  for(const cellSize of [.1,.125])report.experiments.push(await page.evaluate(s=>__avatarProbe.experiment(s),{cellSize,radius:Number(process.env.AVATAR_RAD_RADIUS||4)}));
 }
 assert.equal(report.writes,0);assert(before.equals(fs.readFileSync(path.join(project,'project-state.json'))));report.projectUnchanged=true;
 if(process.env.AVATAR_RAD_STAIRS==='1'&&!report.staircaseVerified)process.exitCode=1;
}catch(e){report.error=e.message;process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,experiments:report.experiments?.map(({boxes,...e})=>({...e,results:e.results.map(({profile,...r})=>r)}))},null,2));}
