import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const out=new URL('docs/model-drag-review/',root);fs.mkdirSync(out,{recursive:true});
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const hook=`window.dragTest={
 lighting(){return {lights:scene.children.filter(o=>o.isLight).length,shadows:renderer.shadowMap.enabled};},
 setup(){loadEmptyProject();const floor=new THREE.Mesh(new THREE.BoxGeometry(60,.2,60),new THREE.MeshBasicMaterial({color:0x888888}));floor.position.y=-.1;addLayer({name:'floor',type:'obj',mesh:floor});camPos.set(0,2,-5);setCamRotImmediate(0,-.35);updateCamera();markDirty(6);},
 layers(){return layers.map(l=>({id:l.id,name:l.name,pos:l.pos}));},
 open(){document.getElementById('layer-panel').classList.remove('collapsed');document.getElementById('layer-panel').style.display='flex';return toggleEquipmentModelMenu(document.getElementById('btnAddCubeTop'));},
 target(){camera.updateMatrixWorld(true);const v=new THREE.Vector3(-3,0,3).project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};}
};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:18998/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18998/');await page.waitForFunction(()=>window.dragTest,null,{timeout:60000});
 await page.evaluate(()=>dragTest.setup());await page.evaluate(()=>dragTest.open());
 await page.getByRole('tab',{name:'車両',exact:true}).click();
 const card=page.locator('[data-equipment-id="hiace"]'),box=await card.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(500);
 const target=await page.evaluate(()=>dragTest.target());await page.mouse.move(target.x,target.y,{steps:5});await page.waitForTimeout(200);
 await page.screenshot({path:new URL('preview.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
 await page.mouse.up();await page.waitForTimeout(250);
 const placed=await page.evaluate(()=>dragTest.layers());assert.equal(placed.length,2,JSON.stringify(placed));
 assert(Math.abs(placed[1].pos.x+3)<.15&&Math.abs(placed[1].pos.y)<.15&&Math.abs(placed[1].pos.z-3)<.15,JSON.stringify({placed,target}));
 await page.screenshot({path:new URL('placed.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
 await page.evaluate(()=>dragTest.open());
 const again=await card.boundingBox();await page.mouse.move(again.x+again.width/2,again.y+again.height/2);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
 await page.waitForTimeout(150);assert.equal((await page.evaluate(()=>dragTest.layers())).length,2);
 const cdp=await page.context().newCDPSession(page);
 for(const id of ['hiace','truck2t','truck4t','jib','scorpio','lightstand']){
  await page.reload();await page.waitForFunction(()=>window.dragTest,null,{timeout:60000});
  await page.evaluate(()=>dragTest.setup());await page.evaluate(()=>dragTest.open());
  await page.getByRole('tab',{name:['hiace','truck2t','truck4t'].includes(id)?'車両':'機材',exact:true}).click();
  const b=await page.locator('[data-equipment-id="'+id+'"]').boundingBox(),p=await page.evaluate(()=>dragTest.target());
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});
  await page.waitForTimeout(500);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y,id:1}]});await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
  const all=await page.evaluate(()=>dragTest.layers());assert.equal(all.length,2,id+': '+JSON.stringify(all));
  assert(Math.abs(all[1].pos.x+3)<.15&&Math.abs(all[1].pos.y)<.15&&Math.abs(all[1].pos.z-3)<.15,id+': '+JSON.stringify(all));
  await page.screenshot({path:new URL('touch-'+id+'.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
 }
 for(const [id,category] of [['obj-add-cube','基本'],['obj-add-event','基本'],['lbl-addfig-top','人物']]){
  await page.reload();await page.waitForFunction(()=>window.dragTest,null,{timeout:60000});
  await page.evaluate(()=>dragTest.setup());await page.evaluate(()=>dragTest.open());
  await page.getByRole('tab',{name:category,exact:true}).click();
  const b=await page.locator('#'+id).boundingBox(),p=await page.evaluate(()=>dragTest.target());
  const before=await page.evaluate(()=>dragTest.lighting());
  if(id==='lbl-addfig-top'){
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(1500);
   await page.mouse.move(p.x,p.y);await page.waitForTimeout(150);
   assert.deepEqual(await page.evaluate(()=>dragTest.lighting()),before,'figure preview must not enable shadows or add lights');
   await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(100);
   assert.equal((await page.evaluate(()=>dragTest.layers())).length,1,'Escape must not insert figure');
   await page.evaluate(()=>dragTest.open());
  }
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(1500);
  await page.mouse.move(p.x,p.y);await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(()=>dragTest.lighting()),before,'preview must not change scene lighting');
  await page.mouse.up();await page.waitForTimeout(500);
  const all=await page.evaluate(()=>dragTest.layers());assert.equal(all.length,2,id+': '+JSON.stringify(all));
  assert(Math.abs(all[1].pos.x+3)<.15&&Math.abs(all[1].pos.z-3)<.15,id+': '+JSON.stringify(all));
  await page.screenshot({path:new URL('drop-'+id+'.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
 }
 await cdp.detach();
 assert.deepEqual(errors,[]);console.log('Six touch equipment drops and cube/event/figure mouse drops passed; menu/Escape cancellation passed; preview lighting unchanged.');
}finally{await browser.close();}
