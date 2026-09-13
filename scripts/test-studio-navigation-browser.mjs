// Read-only studio fixture: real RAD, real cached colliders and real mouse input.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json'),{chromium}=require('playwright');
const root='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio';
const cache='F:/Codex/locahun-navigation-20260913',out=cache+'/browser-'+Date.now();fs.mkdirSync(out);
const navFile=process.argv.includes('--regional')?'studio-regional-candidate.lnv':'studio-navigation.lnv';
const original=fs.readFileSync(path.join(root,'project-state.json')),project=JSON.parse(original).project;
const entry=project.layers.find(l=>l.type==='splat');assert(/^assets\/[a-f0-9]+\.rad$/.test(entry.file));
const file=path.join(root,entry.file),stat=fs.statSync(file),hash=createHash('sha256');for await(const part of fs.createReadStream(file))hash.update(part);
const meta=JSON.parse(fs.readFileSync(cache+'/studio-full-fine.json'));assert.equal(hash.digest('hex'),meta.source);
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const hook=`\nwindow.studioNav={
 buildQuery(mesh){return LocahunNavigationQuery.create(THREE,_loadNavigationPathfinding(),mesh);},
 aimRoute(from,to){
  _cancelClickNavigation();camPos.set(from.x,from.y+1.8,from.z);const d=new THREE.Vector3(to.x,to.y,to.z).sub(camPos);
  setCamRotImmediate(Math.atan2(d.x,d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)));updateCamera();
  _walkWholeCoverage(camPos,{...to,y:to.y+1.8},{drop:3,margin:.5});markDirty(120);
 },
 async installGraph(fixture,embedded){
  _clearRegionalNavigationProvider();walkSetup.settings.navigationRegions=fixture.manifest;
  _regionalNavigationFiles=embedded?await LocahunNavigationFiles.read(fixture.manifest,name=>new Uint8Array(fixture.files.find(p=>p[0]===name)?.[1]||[])):null;
 },
 async zipRoundtrip(){
  const expected=JSON.stringify(_walkSaveSettings().navigationRegions);
  const blob=await saveProjectZip(true,{returnBlob:true});
  if(!(blob instanceof Blob))throw Error('ZIP save failed');
  const fflate=await getFflate(),entries=fflate.unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const count=_walkSaveSettings().navigationRegions.regions.length*2+(_walkSaveSettings().navigationRegions.graph?1:0);
  const names=Object.keys(entries).filter(name=>/\.(lnv|lcp|lng)$/.test(name));
  if(names.length!==count)throw Error('Missing ZIP sidecars');
  _regionalNavigationFiles=null;
  await _loadProjectZipFromFile(new File([blob],'regional-roundtrip.zip'));
  if(JSON.stringify(_walkSaveSettings().navigationRegions)!==expected||_regionalNavigationFiles?.files.size!==count)throw Error('ZIP navigation restore failed');
  const bake=LocahunCollisionBake.generate;LocahunCollisionBake.generate=()=>{throw Error('ZIP must not rebake');};
  try{if(!await _walkGenerateCollision({automatic:true}))throw Error(walkSetup.status);}finally{LocahunCollisionBake.generate=bake;}
  for(const l of layers)if(l.type==='path'){l.visible=false;l.mesh.visible=false;}
  this.reset();return {bytes:blob.size,names,manifestPreserved:true};
 },
 async embedNavigation(manifest){
  _regionalNavigationFiles=await LocahunNavigationFiles.read(walkSetup.settings.navigationRegions,(_name,_entry,ext)=>_wholeUnbase64(manifest.payloads[ext]));
 },
 async rejectChangedSource(manifest){
  const layer=layers.find(l=>l.type==='splat');layer.mesh.position.x+=.5;layer.mesh.updateMatrixWorld(true);
  try{await this.enableHttpProvider(manifest);return false;}catch(error){return error.message==='Regional source mismatch';}
 },
 async liveSource(){
  const sources=layers.filter(l=>l.type==='splat'&&l.visible!==false).map(l=>{
   const cached=_wholeIdentityCache.get(l.mesh),match=cached?.identity?.match(/^sha256:([a-f0-9]{64})$/);
   if(!match)throw Error('No verified cached source digest');l.mesh.updateMatrixWorld(true);
   return {sha256:match[1],matrix:[...l.mesh.matrixWorld.elements]};
  });return LocahunNavigationSource.key(sources);
 },
 async coarse(lct,source){
  const savedManifest=JSON.stringify(_walkSaveSettings().navigationRegions);
  _cancelClickNavigation();const index=await LocahunWholeCollision.decodeTiles(_wholeUnbase64(lct),source),live=layers.filter(l=>l.type==='splat');
  const key=await _wholeHash(new TextEncoder().encode(JSON.stringify(['whole-tiles-v1',index.cellSize,live.map(l=>({identity:'sha256:'+source,matrix:[...l.mesh.matrixWorld.elements]}))])));
  const data=await LocahunWholeCollision.encodeTiles([...index.tiles.values()].map(t=>({coord:t.coord,boxes:index.boxes(t)})),key,index.cellSize);
  _walkRestoreSettings({...walkSetup.settings,cellSize:index.cellSize,whole:{key,data:_wholeBase64(data)},navigation:null,boxes:[]});
  const bake=LocahunCollisionBake.generate;LocahunCollisionBake.generate=()=>{throw Error('Coarse fixture must not rebake');};
  try{if(!await _walkGenerateCollision({automatic:true}))throw Error(walkSetup.status);}finally{LocahunCollisionBake.generate=bake;}
  this.reset();return {cellSize:walkSetup.wholeIndex.cellSize,boxes:walkSetup.wholeIndex.total,manifestPreserved:JSON.stringify(_walkSaveSettings().navigationRegions)===savedManifest};
 },
 async prepareHttp(){
  const source=await this.liveSource(),bounds=[[-8,-10,-8],[24,30,24]];
  const key=await _wholeHash(new TextEncoder().encode(JSON.stringify(['navigation-region-v1',source,bounds,[2,.15,.3,.05,.025]])));
  const mesh=await LocahunNavigationCache.decode(_wholeUnbase64(walkSetup.settings.navigation.data),walkSetup.settings.navigation.key);
  const nav=await LocahunNavigationCache.encode(mesh,key);
  const boxes=[...walkSetup.wholeIndex.tiles.values()].flatMap(t=>walkSetup.wholeIndex.boxes(t)).filter(b=>b.center.every((n,i)=>n+b.half[i]>=bounds[0][i]-.4&&n-b.half[i]<=bounds[1][i]+.4));
  const collision=await LocahunWholeCollision.encode(boxes,key);
  const entry=async bytes=>({source,key,bounds,bytes:bytes.length,sha256:await _wholeHash(bytes)});
  const navigation=await entry(nav),proxy=await entry(collision);
  walkSetup.settings.navigationRegions={schema:1,source,regions:[{navigation,collision:proxy}]};
  return {navigation,collision:proxy,payloads:{lnv:_wholeBase64(nav),lcp:_wholeBase64(collision)}};
 },
 async enableHttpProvider(manifest){
  if(await this.liveSource()!==manifest.navigation.source)throw Error('Regional source mismatch');
  this.httpDiagnostic=[];
  const signature=_walkSourceSignature();
  const read=()=>({source:_walkSourceSignature()===signature?manifest.navigation.source:'',epoch:walkSetup.epoch});
  const baseUrl=new URL('/navigation/',location.href).href;
  _clickNavigationJourney?.dispose?.();
  _clickNavigationJourney=LocahunNavigationProvider.create({read,baseUrl,manifest:{schema:1,source:manifest.navigation.source,regions:[manifest]},
   decodeNavigation:(bytes,key)=>LocahunNavigationCache.decode(bytes,key),buildQuery:mesh=>LocahunNavigationQuery.create(THREE,_loadNavigationPathfinding(),mesh),
   decodeCollision:(bytes,key)=>LocahunWholeCollision.decode(bytes,key),
   buildCore:async boxes=>{const core=await LocahunWalkCollision.create();try{core.rebuild({boxes});return core;}catch(error){core.dispose();throw error;}}});
  const acquire=_clickNavigationJourney.acquire.bind(_clickNavigationJourney);
  _clickNavigationJourney.acquire=async(a,b)=>{const row={a,b};this.httpDiagnostic.push(row);const lease=await acquire(a,b);row.accepted=!!lease;return lease;};
  const cast=walkSetup.core.raycastSurface.bind(walkSetup.core);
  walkSetup.core.raycastSurface=(...args)=>{const hit=cast(...args);this.httpDiagnostic.push({cast:hit});return hit;};
 },
 enableProvider(){
  _clickNavigationJourney=LocahunNavigationJourney.create({read:()=>({source:walkSetup.settings.whole.key,epoch:walkSetup.epoch}),
   regions:{find:async(a,b)=>{const query=await _prepareNavigationQuery(),key=walkSetup.settings.navigation.key,points=query?.find(a,b,key);return points?{key,points}:null;},cancel(){}},
   loadCollision:async()=>[...walkSetup.wholeIndex.tiles.values()].flatMap(t=>walkSetup.wholeIndex.boxes(t)),
   build:async boxes=>{const core=await LocahunWalkCollision.create();try{core.rebuild({boxes});return core;}catch(error){core.dispose();throw error;}}});
 },
 async leasedTravel(){
  this.reset();const original=walkSetup.core,query=await _prepareNavigationQuery(),key=walkSetup.settings.navigation.key;
  const boxes=[...walkSetup.wholeIndex.tiles.values()].flatMap(t=>walkSetup.wholeIndex.boxes(t));
  const journey=LocahunNavigationJourney.create({read:()=>({source:key,epoch:walkSetup.epoch}),
   regions:{find:async(a,b)=>{const points=query.find(a,b,key);return points?{key,points}:null;},cancel(){}},
   loadCollision:async()=>boxes,build:async boxes=>{const core=await LocahunWalkCollision.create();try{core.rebuild({boxes});return core;}catch(error){core.dispose();throw error;}}});
  const lease=await journey.acquire({x:camPos.x,y:camPos.y-1.8,z:camPos.z},{x:8.6,y:1.1,z:1.2});if(!lease)throw Error('No lease');
  const accepted=_clickNavigateAt(640,400,false,{point:lease.points.at(-1),normal:{x:0,y:1,z:0}},lease);
  if(!accepted){journey.cancel();throw Error('Lease adapter rejected');}
  this.leaseState=()=>({released:!lease.valid(),sceneCoreUnchanged:walkSetup.core===original});return accepted;
 },
 async setup(project,meta,lct,nav){
  globalThis.localProject={ready:true};setCameraCollision(false);for(const l of project.layers)if(l.type==='splat')l.streamUrl=new URL(l.file,location.href).href;
  await restoreProject(project,{strict:true});
  const live=layers.filter(l=>l.type==='splat');if(live.length!==meta.sources.length)throw Error('Source count mismatch');
  live.forEach((l,i)=>{l.mesh.updateMatrixWorld(true);if(l.mesh.matrixWorld.elements.some((v,j)=>Math.abs(v-meta.sources[i].matrix[j])>1e-8))throw Error('Source transform mismatch');});
  const index=await LocahunWholeCollision.decodeTiles(_wholeUnbase64(lct),meta.source);
  const key=await _wholeHash(new TextEncoder().encode(JSON.stringify(['whole-tiles-v1',.1,live.map(l=>({identity:'sha256:'+meta.source,matrix:[...l.mesh.matrixWorld.elements]}))])));
  const tiles=[...index.tiles.values()].map(tile=>({coord:tile.coord,boxes:index.boxes(tile)}));
  const rebound=await LocahunWholeCollision.encodeTiles(tiles,key,.1);
  const decodedNav=await LocahunNavigationCache.decode(_wholeUnbase64(nav),meta.source);
  const reboundNav=await LocahunNavigationCache.encode(decodedNav,key);
  globalThis.localProject={ready:true};
  _walkRestoreSettings({...walkSetup.settings,cellSize:.1,whole:{key,data:_wholeBase64(rebound)},navigation:{key,data:_wholeBase64(reboundNav)},boxes:[]});
  const bake=LocahunCollisionBake.generate;LocahunCollisionBake.generate=()=>{throw Error('Cached fixture must not rebake');};
  const hashFn=_wholeHash;let hashed;_wholeHash=async bytes=>{const text=new TextDecoder().decode(bytes);if(text.startsWith('["whole-tiles-v1"'))hashed=text;return hashFn(bytes);};
  try{if(!await _walkGenerateCollision({automatic:true}))throw Error(walkSetup.status+' '+JSON.stringify({key,hashed,identities:live.map(l=>_wholeIdentityCache.get(l.mesh)),settings:walkSetup.settings.cellSize}));}finally{LocahunCollisionBake.generate=bake;_wholeHash=hashFn;}
  if(walkSetup.settings.whole.key!==key||!walkSetup.wholeIndex)throw Error('Normal collision cache installation failed');
  this.reset();setCameraCollision(true);
  for(const l of layers)if(l.type==='path'){l.visible=false;l.mesh.visible=false;}
  return getCameraCollisionState();
 },
 async roundtrip(){
  const saved=JSON.parse(JSON.stringify(_walkSaveSettings()));
  await _prepareNavigationQuery();const previous=_getNavigationQuery();
  _walkRestoreSettings(saved);
  if(_getNavigationQuery()||walkSetup.core||walkSetup.wholeIndex)throw Error('Restore retained stale navigation state');
  if(JSON.stringify(_walkSaveSettings())!==JSON.stringify(saved))throw Error('Saved navigation changed on restore');
  const bake=LocahunCollisionBake.generate;LocahunCollisionBake.generate=()=>{throw Error('Restore must not rebake');};
  try{if(!await _walkGenerateCollision({automatic:true}))throw Error(walkSetup.status);}finally{LocahunCollisionBake.generate=bake;}
  const current=await _prepareNavigationQuery();if(!current||current===previous)throw Error('Navigation was not rebuilt after restore');
  this.reset();return {preserved:true,recreated:true};
 },
 reset(){_cancelClickNavigation();camPos.set(6.6,1.33,2.25);const target=new THREE.Vector3(8.6,1.1,1.2),d=target.sub(camPos);setCamRotImmediate(Math.atan2(d.x,d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)));updateCamera();_walkWholeCoverage(camPos,{x:8.6,y:2.9,z:1.2},{drop:3,margin:.5});markDirty(120);},
 cold(){_clearNavigationQuery();},
 saved(){return _walkSaveSettings();},
 state(){return {pos:camPos.toArray(),active:!!_clickNavigationController?.active,reason:_clickNavigationController?.stopReason,hold:!!_navigationHold?.active,pointVisible:!!_navigationPoint?.visible,queryReady:!!_getNavigationQuery(),ready:getCameraCollisionState()};}
};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
let browser,httpManifest;const payloads=new Map();const result={errors:[],writes:0,navigationRequests:[]},timeout=setTimeout(()=>browser?.close(),120000);
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:800},hasTouch:true,recordVideo:{dir:out}}),page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 await page.route('http://127.0.0.1:18994/**',async r=>{
  const request=r.request(),url=new URL(request.url());if(!['GET','HEAD'].includes(request.method())){result.writes++;return r.abort();}
  if(url.pathname==='/')return r.fulfill({contentType:'text/html',body:html});
  if(payloads.has(url.pathname)){result.navigationRequests.push(url.pathname);const body=payloads.get(url.pathname);return r.fulfill({headers:{'content-length':String(body.length),'content-type':'application/octet-stream'},body});}
  if(url.pathname!=='/'+entry.file)return r.fulfill({status:404,body:''});
  const range=request.headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range?.[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
  const headers={'accept-ranges':'bytes','content-length':String(end-start+1),'etag':'"sha256-'+meta.source+'"','content-type':'application/octet-stream'};
  if(range)headers['content-range']='bytes '+start+'-'+end+'/'+stat.size;
  if(request.method()==='HEAD')return r.fulfill({status:200,headers,body:''});
  const handle=await fsp.open(file,'r');let body;try{body=Buffer.alloc(end-start+1);await handle.read(body,0,body.length,start);}finally{await handle.close();}
  return r.fulfill({status:range?206:200,headers,body});
 });
 await page.goto('http://127.0.0.1:18994/');await page.waitForFunction(()=>window.studioNav,null,{timeout:60000});
 result.navigationFixture=navFile;
 result.ready=await page.evaluate(({project,meta,lct,nav})=>studioNav.setup(project,meta,lct,nav),{project,meta,lct:fs.readFileSync(cache+'/studio-full-fine.lct').toString('base64'),nav:fs.readFileSync(cache+'/'+navFile).toString('base64')});
 assert(result.ready.ready);await page.waitForTimeout(6000);result.roundtrip=await page.evaluate(()=>studioNav.roundtrip());await page.evaluate(()=>studioNav.reset());
 if(process.argv.includes('--provider'))await page.evaluate(()=>studioNav.enableProvider());
 if(process.argv.includes('--http-provider')){
  assert(process.argv.includes('--regional'),'HTTP fixture must contain regional navigation geometry');
  const manifest=await page.evaluate(()=>studioNav.prepareHttp());
  httpManifest=manifest;
  for(const extension of ['lnv','lcp'])for(const folder of ['navigation','assets'])payloads.set('/'+folder+'/'+manifest.navigation.key+'.'+extension,Buffer.from(manifest.payloads[extension],'base64'));
  if(process.argv.includes('--coarse'))result.coarse=await page.evaluate(({lct,source})=>studioNav.coarse(lct,source),{lct:fs.readFileSync(cache+'/studio-full.lct').toString('base64'),source:meta.source});
  if(result.coarse)assert(result.coarse.manifestPreserved,'regional settings must survive real restore/save with coarse collision');
  if(process.argv.includes('--embedded'))await page.evaluate(manifest=>studioNav.embedNavigation(manifest),manifest);
  if(!process.argv.includes('--automatic'))await page.evaluate(manifest=>studioNav.enableHttpProvider(manifest),manifest);
  assert.equal(result.navigationRequests.length,0,'provider must not load at startup');
 }
 const graphArg=process.argv.indexOf('--graph-fixture');
 if(graphArg>=0){
  const fixture=JSON.parse(fs.readFileSync(process.argv[graphArg+1],'utf8'));
  for(const [name,bytes] of fixture.files)payloads.set('/'+name,Buffer.from(bytes));
  await page.evaluate(({fixture,embedded})=>studioNav.installGraph(fixture,embedded),{fixture,embedded:process.argv.includes('--embedded')});
  if(process.argv.includes('--multihop-probe')){
   result.multihop=await page.evaluate(async fixture=>{
    const entries=fixture.manifest.regions.map(p=>p.navigation),last=entries.at(-1);
    const raw=fixture.files.find(([name])=>name==='assets/'+last.key+'.lnv')[1];
    const mesh=await LocahunNavigationCache.decode(new Uint8Array(raw),last.key),targets=[];
    for(let i=0;i<mesh.triangles.length;i+=3){
     const p={x:0,y:0,z:0};for(let j=0;j<3;j++){const index=mesh.triangles[i+j]*3;p.x+=mesh.vertices[index]/3;p.y+=mesh.vertices[index+1]/3;p.z+=mesh.vertices[index+2]/3;}
     if(p.x>10.15&&p.x<15&&p.y>-4.5&&p.y<-3&&p.z>-2&&p.z<8)targets.push(p);
    }
    targets.sort((a,b)=>Math.hypot(a.x-10.175,a.y+3.87,a.z+.98)-Math.hypot(b.x-10.175,b.y+3.87,b.z+.98));
    const files=new Map(fixture.files.map(([name,bytes])=>[name,new Uint8Array(bytes)]));let checked=0,wall=false;const trace=[];
    const provider=LocahunNavigationProvider.create({manifest:fixture.manifest,baseUrl:'http://127.0.0.1:18994/assets/',read:()=>({source:fixture.manifest.source,epoch:1}),
     fetchFn:async url=>{trace.push({url});const bytes=files.get('assets/'+url.split('/').at(-1));if(!bytes)throw Error('Missing fixture asset');return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});},
     decodeNavigation:async(bytes,key)=>{try{return await LocahunNavigationCache.decode(bytes,key);}catch(e){trace.push({decodeError:String(e)});throw e;}},buildQuery:mesh=>{
      try{const q=studioNav.buildQuery(mesh),find=q.find.bind(q);
      q.find=(a,b,key)=>{const p=find(a,b,key);trace.push({key,a,b,points:p?.length||0});return p;};return q;
      }catch(e){trace.push({buildError:String(e)});throw e;}},
     decodeCollision:(bytes,key)=>LocahunWholeCollision.decode(bytes,key),
     verifyCore:(points,core)=>{checked++;return LocahunRouteClearance(points,core,LocahunClickNavigation);},
     buildCore:async boxes=>{const core=await LocahunWalkCollision.create();core.rebuild({boxes:wall?[...boxes,{center:[8,-2.8,-.7],half:[.05,2,3]}]:boxes});return core;}});
    const attempts=[];
    try{for(const to of targets.slice(0,24)){
     const from={x:5.800000508626303,y:-3.6333333651224775,z:-.7166665395100911},lease=await provider.acquire(from,to);attempts.push({to,accepted:!!lease});
     if(lease){const points=lease.points;lease.dispose();const acceptedChecks=checked;wall=true;
      const blocked=await provider.acquire(from,to);if(blocked)blocked.dispose();
      return {accepted:true,from,to,points,checked:acceptedChecks,wallRejected:!blocked,wallChecks:checked-acceptedChecks,attempts};}
    }return {accepted:false,checked,attempts,trace:trace.slice(0,25)};}finally{provider.dispose();}
   },fixture);
   console.log(JSON.stringify({multihop:result.multihop}));
   assert(result.multihop.accepted,'Real three-region full physical route must pass');
   assert(result.multihop.wallRejected&&result.multihop.wallChecks>0,'Three-region full physical gate must reject an intermediate wall');
   await page.evaluate(({from,to})=>studioNav.aimRoute(from,to),result.multihop);
   await page.waitForTimeout(350);await page.screenshot({path:out+'/three-region-before.png'});
   await page.mouse.click(640,400);
   await page.waitForFunction(()=>studioNav.state().active,null,{timeout:5000});
   await page.waitForFunction(()=>studioNav.state().reason==='complete',null,{timeout:10000});
   result.multihop.clickEnd=await page.evaluate(()=>studioNav.state());
   assert(result.multihop.clickEnd.pos[0]>10.15,'Actual click must reach exclusive third region');
   await page.screenshot({path:out+'/three-region-after.png'});
   await page.evaluate(()=>studioNav.reset());
  }
 }
 await page.screenshot({path:out+'/before.png'});result.before=await page.evaluate(()=>studioNav.state());
 await page.mouse.click(640,400);result.samples=[];
 for(let i=0;i<35;i++){
  await page.waitForTimeout(100);result.samples.push(await page.evaluate(()=>studioNav.state()));
  if(i===1){await page.mouse.move(640,400);await page.mouse.down();await page.mouse.move(700,390,{steps:3});await page.mouse.up();}
 }
 await page.screenshot({path:out+'/after.png'});result.after=await page.evaluate(()=>studioNav.state());
 result.providerDiagnostic=await page.evaluate(()=>studioNav.httpDiagnostic);
 assert(result.samples.some(s=>s.active),'mouse must start cached route');assert.equal(result.after.reason,'complete');assert(result.after.pos[1]>result.before.pos[1]+.5,'camera must climb stairs');
 await page.evaluate(()=>{studioNav.reset();studioNav.cold();});await page.mouse.move(640,400);await page.mouse.down();await page.waitForTimeout(550);
 result.held=await page.evaluate(()=>studioNav.state());assert.equal(result.held.pos[1],1.33);assert(!result.held.active);assert(result.held.hold&&result.held.pointVisible,'hold must show destination point');
 const heldImage=await page.screenshot({path:out+'/held.png'});
 result.heldPixels=await page.evaluate(async data=>{
  const image=new Image();image.src=data;await image.decode();
  const surface=document.createElement('canvas');surface.width=image.width;surface.height=image.height;
  const ctx=surface.getContext('2d');ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(600,350,80,80).data;let count=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]>60&&pixels[i]<170&&pixels[i+1]>210&&pixels[i+2]>150&&pixels[i+2]<230)count++;
  return count;
 },'data:image/png;base64,'+heldImage.toString('base64'));
 assert(result.heldPixels>=30,'destination dot must be painted above the real splats');await page.mouse.up();
 await page.waitForFunction(()=>studioNav.state().reason==='complete',null,{timeout:6000});result.heldEnd=await page.evaluate(()=>studioNav.state());assert(result.heldEnd.pos[1]>2);
 await page.evaluate(()=>studioNav.reset());await page.touchscreen.tap(640,400);
 await page.waitForFunction(()=>studioNav.state().active,null,{timeout:3000});await page.waitForFunction(()=>studioNav.state().reason==='complete',null,{timeout:6000});
 result.touchEnd=await page.evaluate(()=>studioNav.state());assert(result.touchEnd.pos[1]>2);await page.screenshot({path:out+'/touch-after.png'});
 if(process.argv.includes('--zip-roundtrip')){
  assert(process.argv.includes('--embedded')&&process.argv.includes('--automatic'));
  result.zipRoundtrip=await page.evaluate(()=>studioNav.zipRoundtrip());
  await page.mouse.click(640,400);
  await page.waitForFunction(()=>studioNav.state().reason==='complete',null,{timeout:10000});
  result.zipEnd=await page.evaluate(()=>studioNav.state());assert(result.zipEnd.pos[1]>2);
  await page.screenshot({path:out+'/zip-after.png'});
 }
 if(!process.argv.includes('--coarse')){
 await page.evaluate(()=>studioNav.leasedTravel());
 await page.waitForFunction(()=>studioNav.state().reason==='complete',null,{timeout:6000});
 result.lease=await page.evaluate(()=>({...studioNav.leaseState(),...studioNav.state()}));
 assert(result.lease.released&&result.lease.sceneCoreUnchanged);assert(result.lease.pos[1]>2);
 await page.screenshot({path:out+'/lease-after.png'});
 }
 assert.deepEqual(result.errors,[]);
 if(process.argv.includes('--http-provider')){
  if(process.argv.includes('--embedded'))assert.equal(result.navigationRequests.length,0,'embedded routes must not fetch sidecars');
  else{assert(result.navigationRequests.some(p=>p.endsWith('.lnv')));assert(result.navigationRequests.some(p=>p.endsWith('.lcp')));}
  if(graphArg>=0&&!process.argv.includes('--embedded'))assert(result.navigationRequests.some(p=>p.endsWith('.lng')),'Cross-region graph must be used by actual click input');
  await page.evaluate(async manifest=>{studioNav.reset();await studioNav.enableHttpProvider(manifest);},{...httpManifest,collision:{...httpManifest.collision,sha256:'ff'.repeat(32)}});
  await page.mouse.click(640,400);await page.waitForTimeout(1500);
  result.corruptCollision=await page.evaluate(()=>studioNav.state());assert.deepEqual(result.corruptCollision.pos,[6.6,1.33,2.25]);assert(!result.corruptCollision.active);
  result.changedSourceRejected=await page.evaluate(manifest=>studioNav.rejectChangedSource(manifest),httpManifest);assert(result.changedSourceRejected);
  assert.deepEqual(result.errors,[]);
 }
 const prepared=structuredClone(project);prepared.walk=await page.evaluate(()=>studioNav.saved());
 fs.writeFileSync(out+'/prepared-project.json',JSON.stringify(prepared));await context.close();
}catch(error){result.failure=String(error);process.exitCode=1;}
finally{clearTimeout(timeout);await browser?.close();assert(original.equals(fs.readFileSync(path.join(root,'project-state.json'))));assert.equal(result.writes,0);fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(out);console.log(JSON.stringify({failure:result.failure,before:result.before,after:result.after,errors:result.errors}));}
