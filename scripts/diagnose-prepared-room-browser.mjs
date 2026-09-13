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
const hook=`window.roomTrace=[];
const originalCreate=LocahunClickNavigation.create;
LocahunClickNavigation.create=io=>originalCreate({...io,coverage:(a,b)=>{const result=io.coverage(a,b);if(!result)window.roomTrace.push({stage:'coverage',a,b,result});return result;},clear:(p,t)=>{const result=io.clear(p,t);if(!result)window.roomTrace.push({stage:'clear',p,t,result});return result;}});
window.roomQA={
 async prepare(){
  if(!await _walkGenerateCollision({automatic:true}))throw Error(walkSetup.status);
  const provider=await _prepareRegionalNavigationProvider();if(!provider)throw Error('Provider unavailable');
  const originalAcquire=provider.acquire.bind(provider);provider.acquire=async(from,to)=>{const result=await originalAcquire(from,to);window.roomTrace.push({stage:'acquire',from,to,accepted:!!result,points:result?.points});return result;};
  const e=walkSetup.settings.navigationRegions.regions[0].navigation;
  const r=await fetch(new URL('assets/'+e.key+'.lnv',location.href));if(!r.ok)throw Error('Navigation asset unavailable');
  const mesh=await LocahunNavigationCache.decode(new Uint8Array(await r.arrayBuffer()),e.key),points=[];
  for(let i=0;i<mesh.triangles.length;i+=3){const p={x:0,y:0,z:0},v=[];for(let j=0;j<3;j++){v.push(new THREE.Vector3().fromArray(mesh.vertices,mesh.triangles[i+j]*3));for(const [k,n] of [['x',0],['y',1],['z',2]])p[k]+=mesh.vertices[mesh.triangles[i+j]*3+n]/3;}p.area=new THREE.Triangle(...v).getArea();points.push(p);}
  points.sort((a,b)=>b.area-a.area);
  const nearby=points.filter(p=>Math.hypot(p.x-camPos.x,p.z-camPos.z)<6&&Math.abs(p.y-(camPos.y-1.8))<1);
  const support=walkSetup.core.raycastSurface({x:camPos.x,y:camPos.y,z:camPos.z},{x:0,y:-1,z:0},10);
  const cr=await fetch(new URL('assets/'+e.key+'.lcp',location.href));if(!cr.ok)throw Error('Fine collision unavailable');
  const fine=await LocahunWalkCollision.create();let fineSupport,autoSupport,autoClear=false;
  const automatic=window.computeAutoInitialView({targetCount:200000});
  try{
   fine.rebuild({boxes:await LocahunWholeCollision.decode(new Uint8Array(await cr.arrayBuffer()),e.key)});
   fineSupport=fine.raycastSurface({x:camPos.x,y:camPos.y,z:camPos.z},{x:0,y:-1,z:0},10);
   if(!automatic.failed&&automatic.position){autoSupport=fine.raycastSurface(automatic.position,{x:0,y:-1,z:0},3);if(autoSupport?.normal.y>=.7)autoClear=fine.isCapsuleClear({...autoSupport.point,y:autoSupport.point.y+.3},1.7,.15);}
  }finally{fine.dispose();}
  const pairs=[];for(const a of support?.point?[support.point]:[]){for(const b of nearby){const d=Math.hypot(a.x-b.x,a.z-b.z);if(d<.75||d>3||Math.abs(a.y-b.y)>.2)continue;
   const lease=await provider.acquire(a,b);if(!lease)continue;const safe=LocahunRouteClearance(lease.points,lease.core,LocahunClickNavigation);lease.dispose();
   if(safe){pairs.push({a,b});break;}}if(pairs.length===6)break;}
  const visible=[{x:640,y:700},{x:500,y:700},{x:900,y:700}].map(pixel=>{const p=pickWorldPos(pixel.x,pixel.y,{strictVisible:true});return {pixel,point:p?{x:p.x,y:p.y,z:p.z}:null,support:p?walkSetup.core.raycastSurface({x:p.x,y:p.y+.3,z:p.z},{x:0,y:-1,z:0},2):null};});
  let centers;
  if(${process.argv.includes('--centers')||process.argv.includes('--export-neighborhood')}){
   const neighborhood={source:walkSetup.settings.navigationRegions.source,bounds:[[-2,-5,-4],[2,-3,0]],points:[],gaussians:[]};
   const {unpackSplat}=await import('@sparkjsdev/spark');
   const half=h=>{const e=(h>>10)&31,m=h&1023,s=h&32768?-1:1;return s*(e===0?m*2**-24:e===31?Infinity:(1+m/1024)*2**(e-15));};
   centers=[{name:'initial',point:{x:camPos.x,y:camPos.y,z:camPos.z}},{name:'automatic',point:automatic.position}].filter(p=>p.point).map(p=>({...p,fine:new Map(),coarse:new Map(),nearest:null}));
   for(const layer of layers.filter(l=>l.type==='splat'&&l.visible!==false)){
    const original=layer.mesh.paged,raw=layer._rawBuffer||original.fileBytes;
    const fileBytes=raw?(ArrayBuffer.isView(raw)?new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength):new Uint8Array(raw)):undefined;
    const decoder=new PagedSplats({rootUrl:original.rootUrl,fileBytes,fileType:original.fileType,pager:{extSplats:false,maxSh:0}});
    try{const {meta}=await decoder.getRadMeta();layer.mesh.updateWorldMatrix(true,false);const matrix=layer.mesh.matrixWorld;
     for(let i=0;i<meta.chunks.length;i++){const chunk=await decoder.fetchDecodeChunk(i),a=chunk.packedArray,t=chunk.extra.lodTree;
      for(let j=0;j<chunk.numSplats;j++){if(t[j*4+2]!==0)continue;const w1=a[j*4+1],w2=a[j*4+2],p=new THREE.Vector3(half(w1&65535),half(w1>>>16),half(w2&65535)).applyMatrix4(matrix);
       if(${process.argv.includes('--export-neighborhood')}&&p.x>=-2&&p.x<=2&&p.y>=-5&&p.y<=-3&&p.z>=-4&&p.z<=0){
        if(neighborhood.points.length>=100000)throw Error('Diagnostic neighborhood limit');
        const fields=unpackSplat(a,j,chunk.splatEncoding||decoder.splatEncoding);
        const center=fields.center.clone().applyMatrix4(matrix);
        if(center.distanceTo(p)>1e-6)throw Error('Diagnostic center decode mismatch');
        const linear=new THREE.Matrix3().setFromMatrix4(matrix);
        const axes=[new THREE.Vector3(fields.scales.x,0,0),new THREE.Vector3(0,fields.scales.y,0),new THREE.Vector3(0,0,fields.scales.z)].map(v=>v.applyQuaternion(fields.quaternion).applyMatrix3(linear).toArray());
        if(!axes.flat().every(Number.isFinite)||!Number.isFinite(fields.opacity))throw Error('Invalid Gaussian footprint');
        neighborhood.points.push([p.x,p.y,p.z]);
        neighborhood.gaussians.push({axes,opacity:fields.opacity});
       }
       for(const row of centers){if(p.y>row.point.y||p.y<row.point.y-10)continue;const d=Math.hypot(p.x-row.point.x,p.z-row.point.z);if(!row.nearest||d<row.nearest.distance)row.nearest={point:{x:p.x,y:p.y,z:p.z},distance:d};
        for(const [size,key] of [[.1,'fine'],[.25,'coarse']])if(Math.floor(p.x/size)===Math.floor(row.point.x/size)&&Math.floor(p.z/size)===Math.floor(row.point.z/size)){const y=Math.floor(p.y/size);row[key].set(y,(row[key].get(y)||0)+1);}
       }
      }await new Promise(r=>setTimeout(r,0));
     }
    }finally{decoder.dispose();}
   }
   centers={columns:centers.map(row=>({...row,fine:[...row.fine],coarse:[...row.coarse]})),neighborhood};
  }
  return {pairs,support,fineSupport,automatic,autoSupport,autoClear,centers,visible,cellSize:walkSetup.wholeIndex.cellSize,triangles:points.length,position:camPos.toArray(),sample:points.slice(0,20)};
 },
 aim({position,b}){camPos.fromArray(position);const d=new THREE.Vector3(b.x,b.y,b.z).sub(camPos);setCamRotImmediate(Math.atan2(d.x,d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)));updateCamera();markDirty(120);},
 state(){return {pos:camPos.toArray(),active:!!_clickNavigationController?.active,reason:_clickNavigationController?.stopReason,trace:window.roomTrace};}
};LocahunCollisionBake.generate=()=>{throw Error('Prepared project must not rebake');};`;
try{
 server=await startLocalProjectServer({root});browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/?localProject=1',async route=>{const response=await route.fetch(),html=await response.text(),at=html.lastIndexOf('</script>');assert(at>0);await route.fulfill({response,body:html.slice(0,at)+hook+html.slice(at)});});
 await page.goto(server.url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.localProject?.ready,null,{timeout:60000});
 await page.waitForTimeout(5000);
 report.prepared=await page.evaluate(()=>roomQA.prepare());
 if(process.argv.includes('--export-neighborhood')){const data=report.prepared.centers.neighborhood;await fs.writeFile(out+'/neighborhood.json',JSON.stringify(data),{flag:'wx'});report.prepared.centers.neighborhood={source:data.source,bounds:data.bounds,count:data.points.length};}
 await page.screenshot({path:out+'/initial.png'});assert(report.prepared.pairs.length);assert(report.prepared.cellSize>=.15);
 await page.waitForTimeout(2500);
 for(const pair of report.prepared.pairs){
  await page.evaluate(args=>roomQA.aim(args),{position:report.prepared.position,b:pair.b});
  const start=await page.evaluate(()=>roomQA.state());assert.deepEqual(start.pos,report.prepared.position,'Do not repair saved camera height in diagnostic');
  await page.waitForTimeout(100);await page.mouse.click(640,400);await page.waitForTimeout(2200);
  const end=await page.evaluate(()=>roomQA.state()),distance=Math.hypot(end.pos[0]-pair.a.x,end.pos[2]-pair.a.z);report.attempts.push({pair,end,distance});
  if(end.reason==='complete'&&distance>1){report.passed=true;break;}
 }
 await page.screenshot({path:out+'/scene.png'});assert(report.passed,'No complete actual click journey');assert.deepEqual(report.errors,[]);
 assert(original.equals(await fs.readFile(path.join(root,'project-state.json'))),'QA changed saved project');
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{clearTimeout(timer);await browser?.close();await server?.close();await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(out);console.log(JSON.stringify(report));}
