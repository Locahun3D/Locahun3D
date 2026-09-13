import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startLocalProjectServer} from './local-project-server.mjs';
import {applyLocalNavigation} from './apply-local-navigation.mjs';
import {prepareNavigationRegion} from './prepare-navigation-region.mjs';
import {validateNavigationBundle} from './validate-navigation-bundle.mjs';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json'),{chromium}=require('playwright');
const rootArg=process.argv.indexOf('--root');
if(rootArg>=0)assert(process.argv[rootArg+1],'--root needs a source package');
const source=path.resolve(rootArg>=0?process.argv[rootArg+1]:'C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio');
const preparedFile=process.argv[2];assert(preparedFile,'Pass a verified prepared-project.json fixture');
const applied=process.argv.includes('--applied');
const project=applied?JSON.parse(await fs.readFile(path.join(source,'project-state.json'),'utf8')).project:JSON.parse(await fs.readFile(preparedFile,'utf8'));
const stagedRegional=!!project.walk?.navigationRegions;
assert(stagedRegional||project.walk?.navigation?.key===project.walk?.whole?.key);
const regional=stagedRegional||process.argv.includes('--regional');let bundle;
if(regional&&!stagedRegional){
 const meta=JSON.parse(await fs.readFile('F:/Codex/locahun-navigation-20260913/studio-full-fine.json','utf8'));
 bundle=await prepareNavigationRegion({sources:meta.sources.map(s=>({sha256:meta.source,matrix:s.matrix})),bounds:[[-8,-10,-8],[24,30,24]],collision:Buffer.from(project.walk.whole.data,'base64'),collisionSource:project.walk.whole.key});
 project.walk.navigationRegions=bundle.manifest;delete project.walk.navigation;
}
const root=await fs.mkdtemp(path.join(os.tmpdir(),'nav-package-'));
const out='F:/Codex/locahun-navigation-20260913/package-'+Date.now();await fs.mkdir(out);
const original=await fs.readFile(path.join(source,'project-state.json'));
let service,browser;const report={errors:[],launches:[]};
const timer=setTimeout(()=>browser?.close(),120000);
try{
 await fs.mkdir(path.join(root,'assets'));await fs.mkdir(path.join(root,'history'));
 for(const layer of project.layers)if(layer.file){
  assert(/^assets\/[a-f0-9]+\.rad$/.test(layer.file));
  await fs.copyFile(path.join(source,layer.file),path.join(root,layer.file));
 }
 await fs.copyFile(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),path.join(root,'viewer.html'));
 if(bundle)for(const item of bundle.payloads)await fs.writeFile(path.join(root,'assets',item.name),item.bytes,{flag:'wx'});
 if(applied){
  assert(stagedRegional,'Applied package must contain regional navigation');
  const verified=await validateNavigationBundle(project.walk.navigationRegions,name=>fs.readFile(path.join(source,name)));
  for(const [name,bytes] of verified.files)await fs.writeFile(path.join(root,name),bytes,{flag:'wx'});
  await fs.writeFile(path.join(root,'project-state.json'),original);
 }else if(project._navigationPreparation&&(!regional||stagedRegional)){
  await fs.writeFile(path.join(root,'project-state.json'),original);
  report.applied=await applyLocalNavigation({root,prepared:preparedFile});
 }else await fs.writeFile(path.join(root,'project-state.json'),JSON.stringify({revision:0,status:'draft',project}));
 browser=await chromium.launch({channel:'chrome',headless:true});
 let previousUrl;
 const hook=`window.navPackage={
  async ready(){
   if(!await _walkGenerateCollision({automatic:true}))throw Error(walkSetup.status);
   if(!${regional}&&!await _prepareNavigationQuery())throw Error('Navigation query unavailable');
   return {key:walkSetup.settings.whole.key,nav:walkSetup.settings.navigation?.key||walkSetup.settings.navigationRegions?.source};
  },
  aim(){for(const l of layers)if(l.type==='path'){l.visible=false;l.mesh.visible=false;}
   camPos.set(6.6,1.33,2.25);const d=new THREE.Vector3(8.6,1.1,1.2).sub(camPos);
   setCamRotImmediate(Math.atan2(d.x,d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)));updateCamera();
   _walkWholeCoverage(camPos,{x:8.6,y:2.9,z:1.2},{drop:3,margin:.5});markDirty(120);},
  async invalidate(){
   const l=layers.find(l=>l.type==='splat');l.pos.x+=1;applyLayerTransform(l.id);
   const query=_getNavigationQuery(),prepared=await _walkGenerateCollision({automatic:true});
   return {query:!!query,prepared,ready:getCameraCollisionState().ready};
  },
  state(){return {active:!!_clickNavigationController?.active,reason:_clickNavigationController?.stopReason,pos:camPos.toArray(),provider:!!_clickNavigationJourney,manifest:walkSetup.settings.navigationRegions?.source,identities:layers.filter(l=>l.type==='splat').map(l=>_wholeIdentityCache.get(l.mesh)?.identity)};}
 };LocahunCollisionBake.generate=()=>{throw Error('Cached package must never rebake');};`;
 for(let launch=0;launch<2;launch++){
  service=await startLocalProjectServer({root});assert.notEqual(service.url,previousUrl);previousUrl=service.url;
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(/\.(lnv|lcp|lng)$/.test(r.url()))(report.navigationRequests||=[]).push({url:r.url(),status:r.status()});});
  await page.route('**/?localProject=1',async route=>{
   const response=await route.fetch(),html=await response.text(),at=html.lastIndexOf('</script>');assert(at>0);
   await route.fulfill({response,body:html.slice(0,at)+hook+html.slice(at)});
  });
  await page.goto(service.url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.localProject?.ready||window.localProject?.status==='error',null,{timeout:60000});
  assert(await page.evaluate(()=>localProject.ready));
  const ready=await page.evaluate(()=>navPackage.ready());assert.equal(ready.key,project.walk.whole.key);assert.equal(ready.nav,regional?project.walk.navigationRegions.source:ready.key);
  await page.waitForTimeout(2500);await page.evaluate(()=>navPackage.aim());await page.mouse.click(640,400);
  try{await page.waitForFunction(()=>navPackage.state().reason==='complete',null,{timeout:6000});}catch(error){report.failedState=await page.evaluate(()=>navPackage.state());await page.screenshot({path:out+'/failed.png'});throw error;}
  const end=await page.evaluate(()=>navPackage.state());assert(end.pos[1]>2);await page.screenshot({path:out+'/launch-'+launch+'.png'});
  const revision=await page.evaluate(()=>localProject.revision);await page.locator('#tb-save-btn').click();
  await page.waitForFunction(value=>localProject.revision===value+1,revision,{timeout:10000});
  const saved=JSON.parse(await fs.readFile(path.join(root,'project-state.json'),'utf8'));
  assert.deepEqual(saved.project.walk.navigation||null,project.walk.navigation||null);assert.equal(saved.project.walk.whole.key,ready.key);
  if(regional)assert.deepEqual(saved.project.walk.navigationRegions,project.walk.navigationRegions);
  report.launches.push({ready,end,revision:saved.revision});
  if(launch===1){
   report.sourceEdit=await page.evaluate(()=>navPackage.invalidate());
   assert.equal(report.sourceEdit.query,false);assert.equal(report.sourceEdit.prepared,false);assert.equal(report.sourceEdit.ready,false);
   const before=await page.evaluate(()=>navPackage.state());await page.mouse.click(640,400);await page.waitForTimeout(500);
   const after=await page.evaluate(()=>navPackage.state());assert(!after.active);assert.deepEqual(after.pos,before.pos);
  }
  await context.close();await service.close();service=null;
 }
 assert.deepEqual(report.errors,[]);assert(original.equals(await fs.readFile(path.join(source,'project-state.json'))));
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 clearTimeout(timer);await browser?.close();await service?.close();
 assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('nav-package-'));
 await fs.rm(root,{recursive:true,force:true});await fs.writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log(out);console.log(JSON.stringify(report));
}
