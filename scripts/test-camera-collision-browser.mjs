import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const out=process.env.CAMERA_TEST_OUT||'F:/Codex/camera-collision-20260911';fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');
if(process.argv.includes('--pending'))html=fs.readFileSync(new URL('../src/template.html',import.meta.url),'utf8').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,f)=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const hook=`
if(typeof _walkRunWholeGeneration==='function'){
 const runWhole=_walkRunWholeGeneration;
 _walkRunWholeGeneration=async(...args)=>{try{return await runWhole(...args);}catch(error){console.error('[collision-test]',error.stack);throw error;}};
}
window.cameraTest={
 async failPreparation(){
  walkSetup.core?.dispose();walkSetup.core=null;walkSetup.settings.signature='';
  const create=LocahunWalkCollision.create;
  try{LocahunWalkCollision.create=async()=>{throw Error('Synthetic transient preparation failure');};
   await _walkGenerateCollision({automatic:true});
  }finally{LocahunWalkCollision.create=create;}
  return getCameraCollisionState();
 },
 proxy(){return {whole:walkSetup.settings.whole,cellSize:walkSetup.wholeIndex?.cellSize,tiles:walkSetup.wholeIndex?.tiles.size,boxes:walkSetup.wholeIndex?.total,sources:layers.filter(L=>L.type==='splat'&&L.visible).map(L=>({identity:_wholeIdentityCache.get(L.mesh)?.identity,matrix:[...L.mesh.matrixWorld.elements]}))};},
 state(){return {status:walkSetup.status,busy:walkSetup.busy,signature:walkSetup.settings.signature,whole:!!walkSetup.wholeIndex,importPending:!!walkSetup.importPending,sources:layers.filter(L=>L.type==='splat').map(L=>({url:(L._streamUrl||L.mesh?.paged?.rootUrl||'').split('?')[0],rawBytes:L._rawBuffer?.byteLength}))};},
 async airborne(){
  await _walkPrepareCollision();
  const feet=_walkSpawnPosition(),av={position:new THREE.Vector3(feet.x,feet.y-walkMode.groundOffset,feet.z)};
  walkSetup.core.setCharacter(feet,walkMode.height,walkMode.bodyRadius);
  const old={airborne:walkMode.airborne,velocity:walkMode.velocity.clone(),pending:walkSetup.pending};
  try{
   walkMode.airborne=false;walkMode.velocity.y=0;
   _walkCollisionAdvance(av,1/60,0,0,true);
   const start=av.position.y;
   walkSetup.pending=new Promise(()=>{});
   const samples=[];
   for(let i=0;i<90;i++){_walkCollisionAdvance(av,1/60,0,0,false);samples.push(av.position.y);}
   return {start,samples,feet};
  }finally{walkSetup.pending=old.pending;walkMode.airborne=old.airborne;walkMode.velocity.copy(old.velocity);}
 },
 ready(){return !!walkSetup.core&&!!walkSetup.settings.signature&&!walkSetup.pending&&!walkSetup.importPending;},
 real(){
  const core=walkSetup.core,base=camPos.clone();
  for(const dy of [0,.5,-.5,1,-1])for(const dx of [0,.5,-.5,1,-1])for(const dz of [0,.5,-.5,1,-1]){
   const start={x:base.x+dx,y:base.y+dy,z:base.z+dz};
   if(!core.isCapsuleClear({x:start.x,y:start.y-.15,z:start.z},.3,.15))continue;
   for(const dir of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}]){
    const hit=core.raycast(start,dir,3);if(hit===null||hit<.4)continue;
    const target={x:start.x+dir.x*(hit+.4),y:start.y,z:start.z+dir.z*(hit+.4)};
    if(_walkNeedsRegion(target,.2,false))continue;
    setCameraCollision(true);camPos.set(target.x,target.y,target.z);_applyFreeCameraCollision(start);const on=camPos.clone();
    setCameraCollision(false);camPos.set(target.x,target.y,target.z);_applyFreeCameraCollision(start);const off=camPos.clone();
    setCameraCollision(true);camPos.copy(on);setCamRotImmediate(Math.atan2(-dir.x,-dir.z),0);
    return {start,target,hit,on:on.toArray(),off:off.toArray(),boxes:walkSetup.settings.boxes.length};
   }
  }throw new Error('No clear camera/wall pair in real scan');
 },
 async setup(){
  loadEmptyProject();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.02,6,6),new THREE.MeshBasicMaterial({color:0xaaaaaa}));mesh.position.set(1,1,0);scene.add(mesh);
  layers.push({id:999,type:'obj',name:'Wall',visible:true,mesh});
  walkSetup.settings.meshIds=[999];walkSetup.settings.meshOnly=true;
  walkSetup.core=await LocahunWalkCollision.create();walkSetup.core.rebuild({boxes:[{center:[1,1,0],half:[.01,3,3]}]});
  walkSetup.settings.signature=_walkSourceSignature();
  document.getElementById('dz').style.display='none';
 },
 move(kind){camPos.set(0,1,0);setCamRotImmediate(-Math.PI/2,0);camera.rotation.set(0,-Math.PI/2,0,'YXZ');camera.updateMatrixWorld(true);
  if(kind==='keyboard')keys.KeyW=true;
  else if(kind==='touch')joyDY=-1;
  const read=_readGamepadInput;if(kind==='gamepad')_readGamepadInput=()=>({lx:0,ly:-1,rx:0,ry:0,lt:0,rt:0,sprint:true});
  try{updateFlyCamera(1);}finally{keys.KeyW=false;joyDY=0;_readGamepadInput=read;}
  return {x:camPos.x,y:camPos.y,z:camPos.z};},
 pending(){camPos.set(0,1,0);walkSetup.importPending=Promise.resolve();camPos.x=2;_applyFreeCameraCollision({x:0,y:1,z:0});walkSetup.importPending=null;return camPos.x;}
};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>console.log('REQUEST FAILED',r.method(),r.url().split('?')[0],r.failure()?.errorText));
 page.on('console',m=>{if(m.text().startsWith('[collision-test]'))console.log(m.text());});
 await page.route('http://127.0.0.1:18995/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18995/');
 await page.waitForFunction(()=>window.cameraTest,null,{timeout:60000});
 if(process.argv.includes('--retry-only')){
  await page.evaluate(()=>window.cameraTest.setup());
  const failed=await page.evaluate(()=>window.cameraTest.failPreparation());assert.equal(failed.ready,false);
  await page.locator('#qi-badge').click();
  const toggle=page.locator('#camera-collision-toggle');
  assert.equal(await toggle.textContent(),'未準備');
  await toggle.click();assert.equal(await toggle.textContent(),'OFF');
  await toggle.click();await page.waitForFunction(()=>getCameraCollisionState().ready);
  assert.equal(await toggle.textContent(),'ON');
  const on=await page.evaluate(()=>window.cameraTest.move('keyboard'));
  assert(on.x>.7&&on.x<.86,JSON.stringify(on));
  await page.screenshot({path:out+'/retry-ready.png'});
  assert.deepEqual(errors,[]);console.log('PASS actual Chrome OFF/ON recovers failed preparation and real Rapier blocks wall');
 }else if(process.argv.includes('--real')){
  const zip=process.env.CAMERA_TEST_ZIP||'C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioSeeYouTomorrow/260907/3_Locahun3DOnline_ViewerData/4FStudio.zip';
  const digest=()=>createHash('sha256').update(fs.readFileSync(zip)).digest('hex'),before=digest();
  await page.locator('#fi').setInputFiles(zip);
  try{await page.waitForFunction(()=>{const s=window.cameraTest.state();return window.cameraTest.ready()||(!s.busy&&!s.importPending&&s.status&&!s.signature);},null,{timeout:120000});
   assert(await page.evaluate(()=>window.cameraTest.ready()),JSON.stringify(await page.evaluate(()=>window.cameraTest.state())));}
  catch(error){console.log(await page.evaluate(()=>window.cameraTest.state()));throw error;}
  if(process.argv.includes('--export-proxy')){
   const proxy=await page.evaluate(()=>window.cameraTest.proxy()),bytes=Buffer.from(proxy.whole.data,'base64');
   assert(/^[a-f0-9]{64}$/.test(proxy.whole.key));
   fs.writeFileSync(out+'/'+proxy.whole.key+'.lct',bytes);
   fs.writeFileSync(out+'/proxy.json',JSON.stringify({...proxy,whole:undefined,key:proxy.whole.key,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),originalZipSha256:before},null,2));
  }
  if(process.argv.includes('--pending')){
   const flight=await page.evaluate(()=>window.cameraTest.airborne());
   assert(Math.max(...flight.samples)-Math.min(...flight.samples)>.05,'pending generation froze airborne motion');
   assert(Math.abs(flight.samples.at(-1)-flight.feet.y)<.25,'did not settle back onto real floor');
   console.log('PASS real scan airborne physics while replacement pending', {range:Math.max(...flight.samples)-Math.min(...flight.samples),last:flight.samples.at(-1)});
  }
  const result=await page.evaluate(()=>window.cameraTest.real());
  const distance=p=>Math.hypot(p[0]-result.start.x,p[1]-result.start.y,p[2]-result.start.z);
  assert(distance(result.on)<result.hit);assert(distance(result.off)>result.hit);
  assert.equal(digest(),before);await page.waitForTimeout(1500);
  await page.locator('#qi-badge').click();
  await page.screenshot({path:out+'/real-4fstudio.png'});
  fs.writeFileSync(out+'/real-results.json',JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);console.log('PASS real scan automatic collision; ON stops, OFF passes; ZIP unchanged',zip,result);
 }else{
 await page.evaluate(()=>window.cameraTest.setup());
 await page.locator('#qi-badge').click();
 const toggle=page.locator('#camera-collision-toggle');
 assert.equal(await toggle.getAttribute('aria-checked'),'true');
 for(const kind of ['keyboard','touch','gamepad']){
  const on=await page.evaluate(k=>window.cameraTest.move(k),kind);assert(on.x>.7&&on.x<.86,JSON.stringify(on));
  await toggle.click();assert.equal(await toggle.textContent(),'OFF');
  const off=await page.evaluate(k=>window.cameraTest.move(k),kind);assert(off.x>1,JSON.stringify(off));
  await toggle.click();
 }
 assert.equal(await page.evaluate(()=>window.cameraTest.pending()),0);
 for(const width of [1440,820,390]){
  if(await toggle.isVisible())await page.locator('#qi-badge').click();
  await page.setViewportSize({width,height:900});await page.waitForTimeout(300);
  if(!await toggle.isVisible())await page.locator('#qi-badge').click();
  await page.screenshot({path:out+'/quality-'+width+'.png'});
  const b=await toggle.boundingBox();assert(b&&b.x>=0&&b.x+b.width<=width);
 }
 assert.deepEqual(errors,[]);console.log('PASS default ON; keyboard/touch wall stops; OFF passes; pending blocks; 3 viewports');
 }
}finally{await browser.close();}
