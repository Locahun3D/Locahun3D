import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const showcase=process.argv.includes('--showcase');
if(!process.argv.includes('--gpu-granted'))throw Error('Explicit parent GPU grant required');
const out='F:/Codex/3dgs-renderer-research-20260911/click-browser-'+Date.now();fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(new URL('../src/template.html',import.meta.url),'utf8').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,f)=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const hook=`
if(new URLSearchParams(location.search).get('autoload')==='fixture')loadFromURL=async()=>{};
window.clickTest={
 walk(){return {active:walkMode.active,airborne:walkMode.airborne,y:walkMode.avatar?.position.y,state:walkMode.avatar?.userData.kawaiiAnimation?.state};},
 tools(){return {measure:msr.active,camera:cam.active,sun:sun.active,time:sun.timeMin};},
 measurement(){return {step:msr.step,active:msr.active};},
 tourActive(){return {tour:window.__scTour.cam(),busy:_clickNavigationBusy(),accepted:_clickNavigateAt(640,600)};},
 async setup(){loadEmptyProject();
  const floor=new THREE.Mesh(new THREE.BoxGeometry(80,.2,80),new THREE.MeshBasicMaterial({color:0x909090}));floor.position.y=-.1;scene.add(floor);
  const grid=new THREE.GridHelper(80,80,0xffffff,0x555555);grid.position.y=.002;scene.add(grid);
  walkSetup.core=await LocahunWalkCollision.create();walkSetup.settings.meshOnly=true;walkSetup.wholeIndex=null;walkSetup.importPending=null;
  walkSetup.core.rebuild({boxes:[{center:[0,-.1,0],half:[40,.1,40]}]});walkSetup.settings.signature=_walkSourceSignature();
  document.getElementById('dz').style.display='none';this.reset();
 },
 reset(){_cancelClickNavigation();camPos.set(0,1.6,0);setCamRotImmediate(0,-.15);updateCamera();camera.updateMatrixWorld(true);markDirty(5);},
 point(m){camera.updateMatrixWorld(true);const v=new THREE.Vector3(0,0,m).project(camera),r=canvas.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},
 state(){return {pos:camPos.toArray(),yaw,pitch,active:!!_clickNavigationController?.active,stopReason:_clickNavigationController?.stopReason,ready:getCameraCollisionState(),timer:_clickNavigationTimer!==null,point:_navigationPoint?.visible?_navigationPoint.position.toArray():null};},
 wall(){walkSetup.core.rebuild({boxes:[{center:[0,-.1,0],half:[40,.1,40]},{center:[0,.35,2],half:[4,.35,.005]}]});},
 wallTarget(){
  walkSetup.core.rebuild({boxes:[{center:[0,-.1,0],half:[40,.1,40]},{center:[0,1.5,3],half:[4,1.5,.1]}]});
  camera.updateMatrixWorld(true);const v=new THREE.Vector3(0,1.4,2.9).project(camera);
  return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};
 },
 floor(){walkSetup.core.rebuild({boxes:[{center:[0,-.1,0],half:[40,.1,40]}]});}
};
for(const type of ['mousedown','touchstart'])canvas.addEventListener(type,e=>{
 const p=type==='touchstart'?e.changedTouches[0]:e,r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
 ray.setFromCamera(new THREE.Vector2((p.clientX-r.left)/r.width*2-1,1-(p.clientY-r.top)/r.height*2),camera);
 window.clickTest.lastClick={x:p.clientX,y:p.clientY,hit:walkSetup.core?.raycastSurface(ray.ray.origin,ray.ray.direction,1000)};
},{capture:true,passive:true});`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const results={fixture:'canonical template, synthetic floor/grid and real Rapier; no private scan',events:[],errors:[]};
let browser;const deadline=setTimeout(()=>browser?.close(),showcase?80000:150000);
try{
 browser=await require('playwright').chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,recordVideo:{dir:out,size:{width:1280,height:900}}});
 const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
 await page.route('http://127.0.0.1:18991/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18991/'+(showcase?'?showcase=1&autoload=fixture':''));await page.waitForFunction(()=>window.clickTest,null,{timeout:60000});
 await page.evaluate(()=>clickTest.setup());await page.waitForTimeout(500);
 if(showcase){
  const active=await page.evaluate(()=>clickTest.tourActive());
  results.events.push({kind:'tour-active',...active});assert(active.busy);assert.equal(active.accepted,false);
  for(const kind of ['yield','ended']){
   if(kind==='ended')await page.evaluate(()=>document.getElementById('sc-end').click());
   await page.evaluate(()=>clickTest.reset());await page.waitForTimeout(350);
   const p=await page.evaluate(()=>clickTest.point(3));
   results.events.push({kind:'target',p,element:await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.outerHTML?.slice(0,600),p)});
   await page.screenshot({path:out+'/'+kind+'-before.png'});
   await page.mouse.click(p.x,p.y);await page.waitForTimeout(120);
   const during=await page.evaluate(()=>({camera:clickTest.state(),tour:__scTour.cam()}));
   results.events.push({kind,during});assert(during.camera.active);assert(during.tour.yield);
   if(kind==='ended')assert(during.tour.aborted);
   await page.waitForFunction(()=>!clickTest.state().active,null,{timeout:5000});
   const end=await page.evaluate(()=>clickTest.state());results.events.at(-1).end=end;assert.equal(end.stopReason,'complete');
   await page.screenshot({path:out+'/'+kind+'.png'});
  }
 }
 if(!showcase){
  await page.evaluate(()=>clickTest.reset());await page.waitForTimeout(350);
  const start=await page.evaluate(()=>clickTest.point(3)),target=await page.evaluate(()=>clickTest.point(10));
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.waitForTimeout(450);
  const held=await page.evaluate(()=>clickTest.state());assert(held.point);assert.equal(held.active,false);
  await page.mouse.move(target.x,target.y);await page.waitForTimeout(100);
  const preview=await page.evaluate(()=>clickTest.state());assert(preview.point[2]>9);assert.equal(preview.yaw,0);assert.equal(preview.pitch,-.15);
  await page.screenshot({path:out+'/hold-preview.png'});
  await page.mouse.up();await page.waitForTimeout(100);assert((await page.evaluate(()=>clickTest.state())).active);
  await page.waitForFunction(()=>!clickTest.state().active,null,{timeout:7000});
  const end=await page.evaluate(()=>clickTest.state());assert.equal(end.stopReason,'complete');assert(end.pos[2]>9);assert.equal(end.point,null);
  results.events.push({kind:'hold-preview',held,preview,end});
 }
 if(!showcase){
  await page.evaluate(()=>clickTest.reset());await page.locator('#btnMeasure').tap();
  await page.touchscreen.tap(600,600);assert.equal((await page.evaluate(()=>clickTest.measurement())).step,1);
  await page.touchscreen.tap(750,600);assert.equal((await page.evaluate(()=>clickTest.measurement())).step,2);
  await page.screenshot({path:out+'/measurement-taps.png'});
  results.events.push({kind:'measurement-taps',state:await page.evaluate(()=>clickTest.measurement())});
  await page.locator('#btnMeasure').tap();
  await page.waitForTimeout(1100);
  assert.equal((await page.evaluate(()=>clickTest.measurement())).active,false,'measurement closes via its toolbar button');
 }
 for(const meters of showcase?[]:[3,10,20]){
  await page.evaluate(()=>clickTest.reset());await page.waitForTimeout(350);const p=await page.evaluate(m=>clickTest.point(m),meters);
  await page.mouse.click(p.x,p.y);await page.waitForTimeout(150);const during=await page.evaluate(()=>clickTest.state());assert(during.active,'mouse did not start: '+JSON.stringify({meters,p,during}));
  await page.waitForFunction(()=>!clickTest.state().active,null,{timeout:7000});const end=await page.evaluate(()=>clickTest.state());
  const actualClick=await page.evaluate(()=>clickTest.lastClick);
  results.events.push({kind:'mouse',meters,p,actualClick,during,end});
  assert(Math.abs(end.pos[2]-actualClick.hit.point.z)<.02);assert(Math.abs(end.pos[1]-1.8)<.02);assert(Math.abs(end.yaw)<1e-6);assert(Math.abs(end.pitch+.15)<1e-6);
  await page.screenshot({path:out+'/mouse-'+meters+'.png'});
 }
 for(const kind of showcase?[]:['wheel','drag','touch','wall','range']){
  await page.evaluate(()=>{clickTest.floor();clickTest.reset();});await page.waitForTimeout(350);
  if(kind==='wall')await page.evaluate(()=>clickTest.wall());
  const p=await page.evaluate(m=>clickTest.point(m),kind==='range'?31:10);
  if(kind==='touch')await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
  await page.waitForTimeout(150);
  if(kind==='wheel')await page.mouse.wheel(0,10);
  if(kind==='drag'){await page.mouse.move(700,600);await page.mouse.down({button:'right'});await page.mouse.move(740,610);await page.mouse.up({button:'right'});}
  await page.waitForFunction(()=>!clickTest.state().active,null,{timeout:7000});const end=await page.evaluate(()=>clickTest.state());
  if(kind==='touch')assert(Math.abs(end.pos[2]-(await page.evaluate(()=>clickTest.lastClick.hit.point.z)))<.02);
  if(kind==='wall'){assert(end.pos[2]>9);assert.equal(end.stopReason,'complete');}
  if(kind==='range')assert(Math.abs(end.pos[2])<.01);
  if(kind==='wheel')assert(end.pos[2]<5);
  if(kind==='drag'){assert.equal(end.stopReason,'complete');assert(end.pos[2]>9);assert(Math.abs(end.yaw)>0.01);}
  results.events.push({kind,end});await page.screenshot({path:out+'/'+kind+'.png'});
  if(kind==='touch')await page.waitForTimeout(1100);
 }
 if(!showcase){
  const cdp=await context.newCDPSession(page);
  await page.evaluate(()=>{clickTest.floor();clickTest.reset();});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:650,y:550,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:690,y:560,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const rotated=await page.evaluate(()=>clickTest.state());
  assert(Math.abs(rotated.yaw)>.01,'touch drag must rotate before the next tap');
  const nextPoint=await page.evaluate(()=>clickTest.point(10));
  await page.touchscreen.tap(nextPoint.x,nextPoint.y);
  assert((await page.evaluate(()=>clickTest.state())).active,'tap immediately after rotation must start travel');
  for(let i=0;i<8;i++){
   const p=await page.evaluate(m=>clickTest.point(m),10+i*.5);
   await page.touchscreen.tap(p.x,p.y);
   assert((await page.evaluate(()=>clickTest.state())).active,'rapid tap '+i+' must replace travel');
  }
  const finalHit=await page.evaluate(()=>clickTest.lastClick.hit.point);
  await page.waitForFunction(()=>!clickTest.state().active,null,{timeout:7000});
  const rapidEnd=await page.evaluate(()=>clickTest.state());
  assert.equal(rapidEnd.stopReason,'complete');
  assert(Math.abs(rapidEnd.pos[2]-finalHit.z)<.02);
  results.events.push({kind:'touch-rotation-then-rapid-taps',rotated,end:rapidEnd});
  await page.screenshot({path:out+'/touch-rotation-rapid.png'});
  await cdp.detach();
  await page.waitForTimeout(1100);
  await page.evaluate(()=>clickTest.reset());await page.waitForTimeout(350);
  const wallPoint=await page.evaluate(()=>clickTest.wallTarget());
  await page.mouse.click(wallPoint.x,wallPoint.y);await page.waitForTimeout(100);
  assert((await page.evaluate(()=>clickTest.state())).active,'wall click should resolve to a reachable floor in front');
  await page.waitForFunction(()=>!clickTest.state().active,null,{timeout:5000});
  const wallEnd=await page.evaluate(()=>clickTest.state());assert.equal(wallEnd.stopReason,'complete');
  assert(wallEnd.pos[2]>2.3&&wallEnd.pos[2]<2.6);assert(Math.abs(wallEnd.pos[1]-1.8)<.02);
  results.events.push({kind:'wall-click-floor-target',end:wallEnd});await page.evaluate(()=>clickTest.floor());
  assert.equal((await page.evaluate(()=>clickTest.tools())).time,720,'sun defaults to noon, not the current time');
  for(const [width,height] of [[390,844],[844,390],[375,667],[667,375],[820,1180],[1180,820]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(250);
   await page.locator('#btnCamTool').tap();assert((await page.evaluate(()=>clickTest.tools())).camera);
   await page.locator('#btn-sun').tap();
   const sunState=await page.evaluate(()=>clickTest.tools());assert(sunState.sun);
   assert.equal(sunState.camera,Math.min(width,height)>=700,'phone tools must not overlap in either orientation');
   await page.locator('#btnMeasure').tap();assert((await page.evaluate(()=>clickTest.tools())).measure);
   await page.locator('#btnMeasure').tap();assert.equal((await page.evaluate(()=>clickTest.tools())).measure,false);
   await page.screenshot({path:out+'/tools-'+width+'x'+height+'.png'});
   results.events.push({kind:'responsive-tool-taps',width,height,sunState});
  }
  await page.setViewportSize({width:844,height:390});await page.evaluate(()=>{clickTest.floor();clickTest.reset();});
  await page.locator('#btnAvatarWalk').tap();await page.waitForFunction(()=>clickTest.walk().active,null,{timeout:15000});
  await page.waitForTimeout(500);
  const jump=page.locator('#walk-jump-button'),bounds=await jump.boundingBox();
  assert(bounds&&bounds.x>600&&bounds.y>290,'jump button must stay in the bottom right');
  await jump.tap();await page.waitForFunction(()=>clickTest.walk().airborne,null,{timeout:2000});
  await page.screenshot({path:out+'/phone-jump.png'});
  await page.waitForFunction(()=>!clickTest.walk().airborne,null,{timeout:5000});
  await page.locator('#btnAvatarWalk').tap();assert.equal((await page.evaluate(()=>clickTest.walk())).active,false);
  assert.equal(await jump.isVisible(),false);results.events.push({kind:'phone-jump-and-exit',bounds});
 }
 assert.deepEqual(results.errors,[]);await context.close();
}catch(e){results.failure=String(e);process.exitCode=1;}
finally{clearTimeout(deadline);await browser?.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(out);console.log(JSON.stringify(results));}
