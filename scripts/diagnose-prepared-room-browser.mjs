// Read-only diagnostic; successful synthetic travel is not a visual floor approval.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startLocalProjectServer} from './local-project-server.mjs';
const require=createRequire(new URL('../../locahun3d_online/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||'');
assert(root.startsWith(path.resolve('F:/Codex/locahun-navigation-20260913')+path.sep),'Use a disposable QA package');
const original=await fs.readFile(path.join(root,'project-state.json'));
const out='F:/Codex/locahun-navigation-20260913/room-browser-'+Date.now();await fs.mkdir(out);
const report={errors:[],attempts:[]};let browser,server;
const timer=setTimeout(()=>browser?.close(),120000);
const hook=`window.roomQA={
 async prepare(){
  if(!await _walkGenerateCollision({automatic:true}))throw Error(walkSetup.status);
  const provider=await _prepareRegionalNavigationProvider();if(!provider)throw Error('Provider unavailable');
  const e=walkSetup.settings.navigationRegions.regions[0].navigation;
  const r=await fetch(new URL('assets/'+e.key+'.lnv',location.href));if(!r.ok)throw Error('Navigation asset unavailable');
  const mesh=await LocahunNavigationCache.decode(new Uint8Array(await r.arrayBuffer()),e.key),points=[];
  for(let i=0;i<mesh.triangles.length;i+=3){const p={x:0,y:0,z:0},v=[];for(let j=0;j<3;j++){v.push(new THREE.Vector3().fromArray(mesh.vertices,mesh.triangles[i+j]*3));for(const [k,n] of [['x',0],['y',1],['z',2]])p[k]+=mesh.vertices[mesh.triangles[i+j]*3+n]/3;}p.area=new THREE.Triangle(...v).getArea();points.push(p);}
  points.sort((a,b)=>b.area-a.area);
  const nearby=points.filter(p=>Math.hypot(p.x-camPos.x,p.z-camPos.z)<6&&Math.abs(p.y-(camPos.y-1.8))<1);
  const support=walkSetup.core.raycastSurface({x:camPos.x,y:camPos.y,z:camPos.z},{x:0,y:-1,z:0},10);
  const cr=await fetch(new URL('assets/'+e.key+'.lcp',location.href));if(!cr.ok)throw Error('Fine collision unavailable');
  const fine=await LocahunWalkCollision.create();let fineSupport;
  try{fine.rebuild({boxes:await LocahunWholeCollision.decode(new Uint8Array(await cr.arrayBuffer()),e.key)});fineSupport=fine.raycastSurface({x:camPos.x,y:camPos.y,z:camPos.z},{x:0,y:-1,z:0},10);}finally{fine.dispose();}
  const pairs=[];for(const a of support?.point?[support.point]:[]){for(const b of nearby){const d=Math.hypot(a.x-b.x,a.z-b.z);if(d<.75||d>3||Math.abs(a.y-b.y)>.2)continue;
   const lease=await provider.acquire(a,b);if(!lease)continue;const safe=LocahunRouteClearance(lease.points,lease.core,LocahunClickNavigation);lease.dispose();
   if(safe){pairs.push({a,b});break;}}if(pairs.length===6)break;}
  const visible=[{x:640,y:700},{x:500,y:700},{x:900,y:700}].map(pixel=>{const p=pickWorldPos(pixel.x,pixel.y,{strictVisible:true});return {pixel,point:p?{x:p.x,y:p.y,z:p.z}:null,support:p?walkSetup.core.raycastSurface({x:p.x,y:p.y+.3,z:p.z},{x:0,y:-1,z:0},2):null};});
  return {pairs,support,fineSupport,visible,cellSize:walkSetup.wholeIndex.cellSize,triangles:points.length,position:camPos.toArray(),sample:points.slice(0,20)};
 },
 aim({a,b}){camPos.set(a.x,a.y+1.8,a.z);const d=new THREE.Vector3(b.x,b.y,b.z).sub(camPos);setCamRotImmediate(Math.atan2(d.x,d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)));updateCamera();markDirty(120);},
 state(){return {pos:camPos.toArray(),active:!!_clickNavigationController?.active,reason:_clickNavigationController?.stopReason};}
};LocahunCollisionBake.generate=()=>{throw Error('Prepared project must not rebake');};`;
try{
 server=await startLocalProjectServer({root});browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/?localProject=1',async route=>{const response=await route.fetch(),html=await response.text(),at=html.lastIndexOf('</script>');assert(at>0);await route.fulfill({response,body:html.slice(0,at)+hook+html.slice(at)});});
 await page.goto(server.url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.localProject?.ready,null,{timeout:60000});
 await page.waitForTimeout(5000);
 report.prepared=await page.evaluate(()=>roomQA.prepare());await page.screenshot({path:out+'/initial.png'});assert(report.prepared.pairs.length);assert(report.prepared.cellSize>=.15);
 await page.waitForTimeout(2500);
 for(const pair of report.prepared.pairs){
  await page.evaluate(pair=>roomQA.aim(pair),pair);await page.waitForTimeout(100);await page.mouse.click(640,400);await page.waitForTimeout(2200);
  const end=await page.evaluate(()=>roomQA.state()),distance=Math.hypot(end.pos[0]-pair.a.x,end.pos[2]-pair.a.z);report.attempts.push({pair,end,distance});
  if(end.reason==='complete'&&distance>1){report.passed=true;break;}
 }
 await page.screenshot({path:out+'/scene.png'});assert(report.passed,'No complete actual click journey');assert.deepEqual(report.errors,[]);
 assert(original.equals(await fs.readFile(path.join(root,'project-state.json'))),'QA changed saved project');
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{clearTimeout(timer);await browser?.close();await server?.close();await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(out);console.log(JSON.stringify(report));}
