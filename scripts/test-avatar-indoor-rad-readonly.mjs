import fs from 'node:fs';
import {fitIndoorCeiling} from './fixtures/indoor-ceiling-fit-diagnostic.mjs';
import {replaceSurfaceCells} from './fixtures/indoor-surface-cells.mjs';
process.env.AVATAR_RAD_OUT ||= 'F:/Codex/locahun-walk/verification/indoor-stair-diagnostic-2026-09-10';
process.env.AVATAR_RAD_POSE=JSON.stringify({position:[-5,-1.8,3.5],yaw:1.99,pitch:.15});
process.env.AVATAR_RAD_WALK='1';process.env.AVATAR_RAD_STAIRS='1';process.env.AVATAR_HEADING='1.99';
let s=fs.readFileSync(new URL('./test-avatar-real-rad-readonly.mjs',import.meta.url),'utf8')
 .replace("path.resolve(import.meta.dirname,'..')",JSON.stringify(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')));
s=s.replaceAll('center:{x:7,y:0,z:1.85}','center:{x:-4,y:-2,z:3.05}').replaceAll('spawn={x:6.6,y:-.45,z:2.25}','spawn=null');
s=s.replace(/if\(!_walkFeetClear\(walkSetup.core,walkSetup.settings.spawn\)\)\{[\s\S]*?\n  \}/,`{
 let found=false;
 for(const x of [-4.8,-4.5,-4.2,-3.9]){for(const side of [0,-.15,.15,-.3,.3]){
  const z=3.5-.445*(x+5)+side,d=walkSetup.core.raycast({x,y:-2,z},{x:0,y:-1,z:0},3);if(d===null)continue;
  for(const lift of [.03,.1,.2]){const p={x,y:-2-d+lift,z};if(_walkFeetClear(walkSetup.core,p)){walkSetup.settings.spawn=p;found=true;break;}}
  if(found)break;}if(found)break;}
 if(!found)throw new Error('No clear supported indoor spawn');
 }`);
s=s.replace('window.__avatarProbe={',`window.__indoorUpdates=[];
const __create=LocahunWalkCollision.create;
LocahunWalkCollision.create=async function(...args){const c=await __create.apply(this,args),rebuild=c.rebuild;c.rebuild=function(o){this.__boxes=o.boxes;return rebuild.call(this,o);};return c;};
const __feetClear=_walkFeetClear;
_walkFeetClear=function(c,p,s=true){const valid=__feetClear(c,p,s);
 if(walkMode.active && c!==walkSetup.core && window.__indoorUpdates.length<12){
  const probes=[];for(const dy of [0,-.15,-.1,-.05,.025,.05,.1,.15,.2]){
   const f={...p,y:p.y+dy},hits=[];let supports=0;
   for(const [dx,dz] of [[0,0],[.154,0],[-.154,0],[0,.154],[0,-.154]]){const o={x:f.x+dx,y:f.y+.25,z:f.z+dz},d=c.raycast(o,{x:0,y:-1,z:0},.6);const ok=d!==null&&d>0&&Math.abs(o.y-d-(f.y-.05))<.16;if(ok)supports++;hits.push({d,ok});}
   probes.push({dy,supports,clear:c.isCapsuleClear(f,walkMode.height,walkMode.bodyRadius),hits});
  }
  window.__indoorUpdates.push({feet:{...p},airborne:walkMode.airborne,requireSupport:s,valid,probes,boxes:c.__boxes});
 }
 return valid;
};
window.__avatarProbe={`);
s=s.replace('LocahunWalkCollision.refineLocal=function(points,coarse,center){__inRefine=true;',
 `LocahunWalkCollision.refineLocal=function(points,coarse,center){const ceiling=[];
 for(let i=0;i<points.length;i+=3){const x=points[i],y=points[i+1],z=points[i+2];if(x>-2&&x<-.6&&z>1&&z<2.6&&y>-1.3&&y<-.5)ceiling.push(x,y,z);}
 window.__indoorCeiling={center,points:ceiling};__inRefine=true;`);
if(process.env.INDOOR_DETAIL_RADIUS)s=s.replace("const at=html.lastIndexOf('</script>');",
 `html=html.replace("const p=vector(center,'detail center'),radius=2", "const p=vector(center,'detail center'),radius=${Number(process.env.INDOOR_DETAIL_RADIUS)}");const at=html.lastIndexOf('</script>');`);
s=s.replace('sample.feet?.[0]>8.7&&sample.feet[1]>1','sample.feet?.[0]>1&&sample.feet[1]>-.5');
s=s.replace('const before=fs.readFileSync',`const inventory=()=>JSON.stringify(['assets','history'].flatMap(d=>fs.readdirSync(path.join(project,d)).map(n=>{const st=fs.statSync(path.join(project,d,n));return [d,n,st.size,st.mtimeMs];})));const inventoryBefore=inventory();const before=fs.readFileSync`);
s=s.replace('report.projectUnchanged=true;',`report.projectUnchanged=true;assert.equal(inventory(),inventoryBefore);report.assetHistoryMetadataUnchanged=true;
fs.writeFileSync(path.join(out,'updates.json'),JSON.stringify(await page.evaluate(()=>window.__indoorUpdates)));
fs.writeFileSync(path.join(out,'ceiling-points.json'),JSON.stringify(await page.evaluate(()=>window.__indoorCeiling)));`);
s=s.replace('console.log(JSON.stringify({...report,','console.log(JSON.stringify({...report,samples:report.samples?.map(({contacts,...r})=>r),');
s=s.replace('await page.waitForFunction(()=>window.localProject?.ready,{timeout:120000});',`try{await page.waitForFunction(()=>window.localProject?.ready,null,{timeout:120000});}catch(error){
 report.startup=await page.evaluate(()=>({url:location.href,local:window.localProject,body:document.body.innerText.slice(-4000)}));
 await page.screenshot({path:path.join(out,'startup-failure.png')});throw error;
 }`);
if(process.env.INDOOR_DISK_READONLY==='1')s=s.replace("await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));",`
 report.readonlyTransport='Playwright disk GET fixtures; no local server requests or restart';
 report.savedRevision=JSON.parse(before).revision;
 const base=new URL('./',url);
 await page.route(u=>u.origin===base.origin,async r=>{
  const req=r.request(),u=new URL(req.url());
  if(!['GET','HEAD'].includes(req.method())){report.writes++;return r.abort();}
  if(u.href===url)return r.fulfill({contentType:'text/html',body:html});
  const relative=u.pathname.startsWith(base.pathname)?u.pathname.slice(base.pathname.length):'';
  if(relative==='api/project')return r.fulfill({contentType:'application/json',body:before});
  if(!/^assets\\/[a-zA-Z0-9_-]+\\.(rad|ply|splat|spz|ksplat|sog|glb|gltf|obj|fbx)$/.test(relative))return r.fulfill({status:404,body:''});
  const file=path.join(project,relative),size=fs.statSync(file).size,range=req.headers().range;
  const match=range?.match(/^bytes=(\\d+)-(\\d*)$/);
  if(range&&!match)return r.fulfill({status:416,body:''});
  const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(size-1,Number(match[2])):size-1;
  if(start>end)return r.fulfill({status:416,body:''});
  const body=Buffer.alloc(req.method()==='HEAD'?0:end-start+1);
  if(body.length){const fd=fs.openSync(file,'r');try{let n=0;while(n<body.length){const got=fs.readSync(fd,body,n,body.length-n,start+n);if(!got)throw new Error('Unexpected asset EOF');n+=got;}}finally{fs.closeSync(fd);}}
  return r.fulfill({status:match?206:200,headers:{'Content-Type':'application/octet-stream','Accept-Ranges':'bytes',...(match?{'Content-Range':'bytes '+start+'-'+end+'/'+size}:{})},body});
 });`);
if(process.env.INDOOR_CEILING_FIT==='1'){
 if(process.env.AVATAR_FINE_CELL || process.env.AVATAR_RADIUS || process.env.INDOOR_DETAIL_RADIUS)throw new Error('Ceiling experiment requires baseline dimensions and resolution');
 const fixtureHook=`
 const __fitIndoorCeiling=${fitIndoorCeiling.toString()};
 const __fitVoxel=LocahunWalkCollision.voxelize;
 window.__ceilingFitRuns=[];
 LocahunWalkCollision.voxelize=function(points,options){
  const boxes=__fitVoxel.call(this,points,options);
  if(!__inRefine)return boxes;
  const fitted=__fitIndoorCeiling(points,boxes,options.cellSize);
  window.__ceilingFitRuns.push({cellSize:options.cellSize,changes:fitted.changes});
  return fitted.boxes;
 };
 window.__headroomDiagnostic=()=>{
  const feet=walkMode.avatar.position.toArray(),height=walkMode.height,radius=walkMode.bodyRadius;
  const points=window.__indoorCeiling?.points||[],boxes=walkSetup.settings.boxes;
  const rows=[];
  for(let lead=0;lead<=1.001;lead+=.05){
   const x=feet[0]+Math.sin(1.99)*lead,z=feet[2]+Math.cos(1.99)*lead;
   const d=walkSetup.core.raycast({x,y:feet[1]+.6,z},{x:0,y:-1,z:0},1.5);
   const floor=d===null?null:feet[1]+.6-d;
   const ys=[];for(let i=0;i<points.length;i+=3)if(Math.hypot(points[i]-x,points[i+2]-z)<=radius)ys.push(points[i+1]);
   const observedMinY=ys.length?Math.min(...ys):null;
   const overhead=boxes.filter(b=>Math.hypot(Math.max(0,Math.abs(b.center[0]-x)-b.half[0]),Math.max(0,Math.abs(b.center[2]-z)-b.half[2]))<=radius && b.center[1]-b.half[1]>feet[1]+.7);
   const bottom=overhead.length?Math.min(...overhead.map(b=>b.center[1]-b.half[1])):null;
   rows.push({lead,x,z,floor,observedCount:ys.length,observedMinY,ceilingBottom:bottom,
    observedHeadroom:floor===null||observedMinY===null?null:observedMinY-floor,
    colliderHeadroom:floor===null||bottom===null?null:bottom-floor,
    supportedPoseClear:floor===null?null:walkSetup.core.isCapsuleClear({x,y:floor+.01,z},height,radius)});
  }
  return {feet,height,radius,headY:feet[1]+height,rows,limitation:'Observed sampled RAD centers, not surveyed physical headroom; disk minimum is conservative for rounded capsule; no route search.'};
 };
 `;
 s=s.replace('window.__avatarProbe={',fixtureHook+'\nwindow.__avatarProbe={');
 s=s.replace('await page.evaluate(()=>{__avatarProbe.input({KeyW:false});__avatarProbe.exit();});',`await page.evaluate(()=>__avatarProbe.input({KeyW:false}));
 report.ceilingFit={enabled:true,padding:.005,headroom:await page.evaluate(()=>__headroomDiagnostic())};
 fs.writeFileSync(path.join(out,'ceiling-fit-runs.json'),JSON.stringify(await page.evaluate(()=>window.__ceilingFitRuns)));
 await page.evaluate(()=>__avatarProbe.exit());`);
}
if(process.env.INDOOR_SURFACE_FIXTURE){
 if(process.env.INDOOR_CEILING_FIT==='1'||process.env.AVATAR_FINE_CELL||process.env.AVATAR_RADIUS||process.env.INDOOR_DETAIL_RADIUS)
  throw new Error('Surface experiment requires baseline dimensions and no other geometry experiments');
 const fixture=JSON.parse(fs.readFileSync(process.env.INDOOR_SURFACE_FIXTURE,'utf8'));
 replaceSurfaceCells([],fixture);
 if(!fixture.replacements.length)throw new Error('Surface experiment has no justified replacement cells');
 const hook=`
 const __surfaceFixture=${JSON.stringify(fixture)};
 const __replaceSurfaceCells=${replaceSurfaceCells.toString()};
 const __surfaceCreate=LocahunWalkCollision.create;
 window.__surfaceRuns=[];
 LocahunWalkCollision.create=async function(...args){
  const core=await __surfaceCreate.apply(this,args),rebuild=core.rebuild;
  core.rebuild=function(o){
   const result=__replaceSurfaceCells(o.boxes||[],__surfaceFixture);
   window.__surfaceRuns.push({originalBoxes:(o.boxes||[]).length,remainingBoxes:result.boxes.length,applied:result.applied});
   return rebuild.call(this,{...o,boxes:result.boxes,meshes:[...(o.meshes||[]),...result.meshes]});
  };return core;
 };
 `;
 s=s.replace('window.__avatarProbe={',hook+'\nwindow.__avatarProbe={');
 s=s.replace('report.projectUnchanged=true;',`report.surfaceRuns=await page.evaluate(()=>window.__surfaceRuns);
 report.surfaceFixture=${JSON.stringify(process.env.INDOOR_SURFACE_FIXTURE)};report.projectUnchanged=true;`);
}
if(process.env.INDOOR_SPLAT_ATTRIBUTES==='1'){
 const hook=`
 import {unpackSplat as __decodeSplat} from '@sparkjsdev/spark';
 const __attributeRefine=LocahunWalkCollision.refineLocal;
 window.__attributeEvidence=null;
 LocahunWalkCollision.refineLocal=function(points,coarse,center){
  const result=__attributeRefine.call(this,points,coarse,center);
  if(center.x < -2.5 || center.z > 4)return result;
  const sources=[],records=[],localPoints=[];
  for(let i=0;i<points.length;i+=3){
   const x=points[i],y=points[i+1],z=points[i+2];
   if(x>-3&&x<1&&y>-4.5&&y<.5&&z>0&&z<4)localPoints.push(x,y,z);
  }
  for(const L of layers){
   if(L.type!=='splat'||!L.mesh||!L.visible)continue;
   const mesh=L.mesh,paged=mesh.paged,ext=!!(paged?.pager?.extSplats||mesh.extSplats);
   if(ext)throw new Error('Attribute diagnostic requires packed splats, not extended encoding');
   const packed=paged?.pager?.packedTexture?.value?.image?.data||mesh.packedSplats?.packedArray;
   const indices=paged?.dynoIndices?.value?.image?.data;
   const n=paged?.numSplats||mesh.packedSplats?.numSplats||0;
   if(!packed||!n)continue;
   mesh.updateMatrixWorld(true);const m=mesh.matrixWorld.elements,encoding=paged?.splatEncoding||mesh.packedSplats?.splatEncoding;
   sources.push({layerId:L.id,matrixWorld:[...m],encoding:encoding||null,ext,resident:n});
   for(let i=0;i<n;i++){
    const index=indices?indices[i]:i,b=index*4;if(b+3>=packed.length)continue;
    const w1=packed[b+1],w2=packed[b+2],lx=_acFromHalf(w1&65535),ly=_acFromHalf(w1>>>16),lz=_acFromHalf(w2&65535);
    const x=m[0]*lx+m[4]*ly+m[8]*lz+m[12],y=m[1]*lx+m[5]*ly+m[9]*lz+m[13],z=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
    if(!(x>-2.1&&x<-.5&&y>-1.4&&y<-.4&&z>.9&&z<2.7))continue;
    if(records.length>=250000)throw new Error('Attribute diagnostic observation limit');
    const v=__decodeSplat(packed,index,encoding);
    records.push({layerId:L.id,index,center:[x,y,z],localCenter:v.center.toArray(),scales:v.scales.toArray(),quaternion:v.quaternion.toArray(),opacity:v.opacity,packed:Array.from(packed.subarray(b,b+4))});
   }
  }
  window.__attributeEvidence={schema:1,center,sources,records,localPoints,units:'world centers in metres; scales and quaternion in local coordinates',geometryChanged:false};
  return result;
 };
 `;
 s=s.replace('window.__avatarProbe={',hook+'\nwindow.__avatarProbe={');
 s=s.replace('report.projectUnchanged=true;',`fs.writeFileSync(path.join(out,'splat-attributes.json'),JSON.stringify(await page.evaluate(()=>window.__attributeEvidence)));
 report.attributeCapture=true;report.projectUnchanged=true;`);
}
await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
