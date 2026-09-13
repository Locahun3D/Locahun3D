// Offline real-proxy route safety check; no viewer/project changes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {selectNavigationRegionBoxes} from './navigation-region-boxes.mjs';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json'),{chromium}=require('playwright');
const out='F:/Codex/locahun-navigation-20260913',suffix=process.argv.includes('--camera-clearance')?'-clearance':'',fine=process.argv.includes('--fine')?'-fine':'',report=JSON.parse(fs.readFileSync(out+'/nav-feasibility-full'+fine+'-nav05'+suffix+'.json'));
if(!report.savedStudio.accepted)throw new Error('Rejecting disconnected candidate before clearance evaluation');
const context=vm.createContext({Uint8Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
vm.runInContext(read('src/js/216b_whole_collision.js'),context);
const meta=JSON.parse(fs.readFileSync(out+'/studio-full'+fine+'.json'));
const index=await context.LocahunWholeCollision.decodeTiles(new Uint8Array(fs.readFileSync(out+'/studio-full'+fine+'.lct')),meta.source);
const regional=process.argv.includes('--regional');
const allBoxes=[...index.tiles.values()].flatMap(tile=>index.boxes(tile));
const entry=regional?JSON.parse(fs.readFileSync(out+'/studio-regional-filtered-entry.json')):null;
let boxes=regional?selectNavigationRegionBoxes(allBoxes,entry.bounds):allBoxes.filter(b=>b.center[0]+b.half[0]>5&&b.center[0]-b.half[0]<10&&b.center[1]>-2&&b.center[1]<5&&b.center[2]+b.half[2]>0&&b.center[2]-b.half[2]<3);
let candidateRoute=null;
let collisionBytes=null;
if(regional){
 assert(fine,'Regional clearance requires the fine source proxy');
 const encoded=await context.LocahunWholeCollision.encode(boxes,entry.key);
 collisionBytes=encoded.length;
 boxes=await context.LocahunWholeCollision.decode(encoded,entry.key);
 await assert.rejects(()=>context.LocahunWholeCollision.decode(encoded,entry.source));
 const THREE=await import('./navigation-assets/node_modules/three/build/three.module.js');
 const {Pathfinding}=await import('./navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs');
 for(const name of ['403_navigation_cache','403b_navigation_query'])vm.runInContext(read('src/js/'+name+'.js'),context);
 const mesh=await context.LocahunNavigationCache.decode(new Uint8Array(fs.readFileSync(out+'/studio-regional-filtered-bound.lnv')),entry.key);
 const query=context.LocahunNavigationQuery.create(THREE,Pathfinding,mesh);
 try{const start={x:6.6,y:-.47,z:2.25};const points=query.find(start,{x:8.6,y:1.1,z:1.2},entry.key);assert(points?.length);candidateRoute=[start,...points];}finally{query.dispose();}
}
// Private experiment only: retain entire boxes touching a padded route corridor.
const corridor=process.argv.includes('--corridor');
if(corridor){
 assert(candidateRoute,'Corridor experiment requires a regional route');
 vm.runInContext(read('src/js/403i_navigation_corridor.js'),context);
 const selected=context.LocahunNavigationCorridor.create(candidateRoute,boxes);assert(selected);
 for(const point of candidateRoute)assert(selected.covers(point));
 boxes=selected.boxes;
}
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const hook=read('src/js/403i_navigation_corridor.js')+read('src/js/403j_navigation_journey.js')+`\nwindow.testNavClearance=async({boxes,route,bounded})=>{
 const build=async selected=>{const core=await LocahunWalkCollision.create();try{core.rebuild({boxes:selected});return core;}catch(error){core.dispose();throw error;}};
 const journey=bounded?LocahunNavigationJourney.create({read:()=>({source:'fixture',epoch:1}),regions:{find:async()=>({key:'fixture',points:route}),cancel(){}},loadCollision:async()=>boxes,build}):null;
 const lease=journey?await journey.acquire(route[0],route.at(-1)):null;
 if(bounded&&!lease)throw new Error('Journey rejected');
 const core=lease?lease.core:await build(boxes);const result={samples:0,sweepFailures:[],bodyFailures:[],stepClearanceFailures:[]};
 try{let previous={...route[0],y:route[0].y+1.8};
 for(let j=1;j<route.length;j++){
  const a=route[j-1],b=route[j],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.025);
  for(let i=1;i<=steps;i++){
   const t=i/steps,feet={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},p={...feet,y:feet.y+1.8};
   const swept=core.moveCamera(previous,{x:p.x-previous.x,y:p.y-previous.y,z:p.z-previous.z},.15);
   if(Math.hypot(swept.x-p.x,swept.y-p.y,swept.z-p.z)>.001)result.sweepFailures.push({p,swept});
   if(!core.isCapsuleClear({...feet,y:feet.y+.02},1.98,.15))result.bodyFailures.push(feet);
   if(!core.isCapsuleClear({...feet,y:feet.y+.3},1.7,.15))result.stepClearanceFailures.push(feet);
   result.samples++;previous=p;
  }
 }
 let position={...route[0],y:route[0].y+1.8};const start={...position};
 const nav=LocahunClickNavigation.create({position:()=>position,setPosition:p=>position={...p},ready:()=>!lease||lease.valid(),blocked:()=>false,epoch:()=>1,
 coverage:(a,b)=>!lease||[a,b].every(p=>lease.covers({x:p.x,y:p.y-1.8,z:p.z})),
 clear:p=>core.isCapsuleClear({x:p.x,y:p.y-1.5,z:p.z},1.7,.15),
 sweep:(a,b)=>core.moveCamera(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},.15)});
 const accepted=nav.start({point:route.at(-1),normal:{x:0,y:1,z:0}},0,route.slice(1).map(p=>({...p,y:p.y+1.8})));
 for(let t=16;t<=10000&&nav.active;t+=16)nav.tick(t);
 result.controller={accepted,reason:nav.stopReason,start,end:position};return result;}finally{if(journey)journey.cancel();else core.dispose();}
};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.route('http://127.0.0.1:18995/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18995/');await page.waitForFunction(()=>window.testNavClearance,null,{timeout:60000});
 const route=candidateRoute||[report.savedStudio.stairProbes[0].result.point,...report.savedStudio.jsPath];
 const result=await page.evaluate(input=>testNavClearance(input),{boxes,route,bounded:corridor});
 const descending=regional?await page.evaluate(input=>testNavClearance(input),{boxes,route:[...route].reverse(),bounded:corridor}):null;
 const obstructed=regional?await page.evaluate(input=>testNavClearance(input),{boxes:[...boxes,{center:[7.5,1.5,1.7],half:[.15,2,2]}],route,bounded:corridor}):null;
 fs.writeFileSync(out+'/stairs-clearance'+fine+suffix+(regional?'-regional':'')+(corridor?'-corridor':'')+'.json',JSON.stringify({route,boxCount:boxes.length,collisionBytes,...result,descending,obstructed},null,2));
 console.log(JSON.stringify({samples:result.samples,sweepFailures:result.sweepFailures.length,bodyFailures:result.bodyFailures.length,stepClearanceFailures:result.stepClearanceFailures.length,firstSweep:result.sweepFailures[0],firstBody:result.bodyFailures[0]}));
 assert(result.controller.accepted&&result.controller.reason==='complete',JSON.stringify(result.controller));
 if(regional){
  assert.equal(result.sweepFailures.length,0);assert.equal(result.stepClearanceFailures.length,0);
  assert(descending.controller.accepted&&descending.controller.reason==='complete',JSON.stringify(descending.controller));
  assert.equal(descending.sweepFailures.length,0);assert.equal(descending.stepClearanceFailures.length,0);
  assert.notEqual(obstructed.controller.reason,'complete','Route must not bypass an added wall');
  assert(obstructed.controller.end.x<7.5,'Camera must stop on the near side of the obstruction');
  console.log(JSON.stringify({regional:true,boxes:boxes.length,collisionBytes,ascending:result.controller,descending:descending.controller}));
 }
}finally{await browser.close();}
