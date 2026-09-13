import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const dir='F:/Codex/locahun-walk/verification/path-ui';fs.mkdirSync(dir,{recursive:true});
const hook=`
window.__pathTest={
 get state(){const L=layers.find(l=>l.type==='path');return {probing:_pathProbing,marker:!!_pathProbeMarker,number:_pathProbeMarker?.userData.pathPointNumber,points:_pathPts.length,line:!!_pathPreviewLine,path:L?{id:L.id,width:L.pathWidth,color:L.pathColor}:null}},
 seed(){_cancelPath();const p=pickWorldPos(innerWidth*.55,innerHeight*.6)||camPos.clone();const points=[{x:-1,y:0,z:-1},{x:1,y:0,z:-1},{x:1,y:0,z:1},{x:-1,y:0,z:1}];const m=_buildPathMesh(points,'#00d0ff',.95,'P1',.2);m.position.copy(p);const L=addLayer({name:'Path test',type:'path',mesh:m,size:{x:1,y:1,z:1}});Object.assign(L,{pathPoints:points,pathColor:'#00d0ff',pathOpacity:.95,pathLabel:'P1',pathWidth:.2,pos:{x:p.x,y:p.y,z:p.z}});selectLayer(L.id);return L.id;},
 seedObj(){const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()));const L=addLayer({name:'Opacity fixture',type:'obj',mesh:g,size:{x:1,y:1,z:1}});L.objFormat='glb';setObjOpacity(L.id,.5);},
 get objOpacity(){const L=layers.find(l=>l.name==='Opacity fixture');let value;L?.mesh.traverse(o=>{if(o.isMesh)value=o.material.opacity});return value;},
 zip:async()=>{const blob=await saveProjectZip(false,{returnBlob:true});await _loadProjectZipFromFile(new File([blob],'path-test.zip'));},
 restore:p=>restoreProject(p)
};`;
const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/path-ui-test',route=>{let html=fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');const at=html.lastIndexOf('</script>');return route.fulfill({contentType:'text/html',body:html.slice(0,at)+hook+html.slice(at)});});
try{
 await page.goto('http://127.0.0.1:8193/path-ui-test',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__pathTest,{timeout:60000});
 await page.locator('#fi').setInputFiles('F:/Codex/locahun-walk/fixtures/real-scan.splat');
 await page.waitForFunction(()=>document.getElementById('view')?.style.display!=='none',{timeout:60000});
 await page.waitForTimeout(6000);
 await page.evaluate(()=>addPathLayer());
 await page.mouse.move(850,560);await page.mouse.down();await page.waitForTimeout(350);
 assert((await page.evaluate(()=>__pathTest.state)).marker,'no held placement marker');
 await page.screenshot({path:dir+'/probe-1.png'});await page.mouse.up();
 assert.equal((await page.evaluate(()=>__pathTest.state)).points,1);
 await page.mouse.move(980,610);await page.mouse.down();await page.waitForTimeout(350);
 const state=await page.evaluate(()=>__pathTest.state);assert.equal(state.number,2);assert(state.line);
 await page.screenshot({path:dir+'/probe-2.png'});
 await page.keyboard.press('Escape');await page.mouse.up();assert.equal((await page.evaluate(()=>__pathTest.state)).marker,false);
 const id=await page.evaluate(()=>__pathTest.seed());
 if(await page.locator('#layer-panel').evaluate(el=>el.classList.contains('collapsed')))await page.locator('#lp-title-head').click();
 await page.locator('#path-color-'+id).fill('#ff4488');
 await page.locator('#path-width-number-'+id).fill('0.45');
 assert.equal((await page.evaluate(()=>__pathTest.state)).path.width,.45);
 assert.equal((await page.evaluate(()=>__pathTest.state)).path.color,'#ff4488');
 for(const [width,height] of [[1440,900],[820,900],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  const phone=Math.min(width,height)<700;
  if(phone){
   assert.equal(await page.locator('#layer-panel').isVisible(),false,'phone layer panel is hidden');
   assert.equal(await page.locator('#lp-title-head').isVisible(),false,'phone layer opening entry is hidden');
  }else{
   await page.locator('#path-width-number-'+id).scrollIntoViewIfNeeded();
   const box=await page.locator('#path-width-number-'+id).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width);
  }
  for(const selector of ['#view-tl-btns','#hud .cbar']){
   assert(await page.locator(selector).isVisible(),'controls must not be hidden to avoid the panel');
   const box=await page.locator(selector).boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<1,'controls stay at viewport centre');
  }
  await page.screenshot({path:dir+'/settings-'+width+'x'+height+'.png'});
 }
 await page.evaluate(()=>__pathTest.seedObj());
 const promise=page.waitForEvent('download');await page.evaluate(()=>saveProject());const download=await promise;
 const file=dir+'/project.json';await download.saveAs(file);const project=JSON.parse(fs.readFileSync(file,'utf8'));
 await page.evaluate(p=>__pathTest.restore(p),project);
 assert.equal((await page.evaluate(()=>__pathTest.state)).path.width,.45);
 assert.equal(await page.evaluate(()=>__pathTest.objOpacity),.5,'rawless OBJ opacity was applied twice after JSON restore');
 await page.evaluate(()=>__pathTest.zip());assert.equal((await page.evaluate(()=>__pathTest.state)).path.width,.45);
 assert.equal(await page.evaluate(()=>__pathTest.objOpacity),.5,'OBJ opacity changed after ZIP restore');
 assert.equal((await page.evaluate(()=>__pathTest.state)).path.color,'#ff4488');
 assert.deepEqual(errors,[]);console.log('PASS: real-scan probe, cancel, colour/width, 1440/820/390 controls, JSON/ZIP');
}catch(error){await page.screenshot({path:dir+'/failure.png'});throw error;}finally{await browser.close();}
