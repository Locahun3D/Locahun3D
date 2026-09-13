import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
if(!process.argv.includes('--gpu-approved'))throw new Error('Explicit GPU queue grant required');
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const hook=`window.__equipmentTest={layers:()=>layers.map(L=>({name:L.name,pos:L.pos,scale:L.scale})),save:async()=>{const bytes={};const p=await saveProjectZip(false,{localProject:{resolveAsset:async L=>{const k=L.id+'.glb';bytes[k]=Array.from(new Uint8Array(L._rawBuffer));return k;}}});localStorage.setItem('equipment-test',JSON.stringify({p,bytes}));return p;},restore:async()=>{const {p,bytes}=JSON.parse(localStorage.getItem('equipment-test'));for(const L of p.layers){L._buf=new Uint8Array(bytes[L.file]).buffer;L._ext='glb';}await restoreProject(p,{strict:true});},place:()=>_commitPlace(innerWidth/2,innerHeight/2)};`;
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const visualHook=`window.__equipmentTest.view=index=>{document.getElementById('layer-panel').style.display='none';for(const [i,L] of layers.entries())L.mesh.visible=i===index;const box=new THREE.Box3().setFromObject(layers[index].mesh),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const offset=new THREE.Vector3(1,.7,1).normalize().multiplyScalar(size.length()*1.3*Math.max(1,innerHeight/innerWidth));camPos.copy(center).add(offset);const look=new THREE.PerspectiveCamera();look.position.copy(camPos);look.lookAt(center);const e=new THREE.Euler().setFromQuaternion(look.quaternion,'YXZ');setCamRotImmediate(e.y-Math.PI,e.x);markDirty(6);};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+visualHook+html.slice(at);
html=html.replace('</head>','<style>'+read('src/css/062_equipment_menu.css')+'</style></head>');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(5000);page.on('pageerror',e=>console.log('PAGE',e.message));
 await page.route('http://127.0.0.1:18996/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18996/');await page.waitForFunction(()=>window.__equipmentTest,{timeout:20000});
 await page.locator('#emptyBtn').click();
 for(const [i,id] of ['hiace','truck2t','truck4t','jib','scorpio','lightstand'].entries()){
  await page.evaluate(()=>{const p=document.getElementById('layer-panel');p.style.display='flex';p.classList.remove('collapsed');p.classList.add('visible');closeObjTypeMenuTop();toggleEquipmentModelMenu(document.getElementById('btnAddCubeTop'));});
  await page.locator('#equipment-tab-'+(i<3?'vehicles':'equipment')).click();
  await page.locator('[data-equipment-id="'+id+'"]').click();
  await page.mouse.click(470+i*100,620);
 }
 const before=await page.evaluate(()=>__equipmentTest.layers());assert.equal(before.length,6);
 assert(before.every(L=>L.pos.y===0&&L.scale.x===1&&L.scale.y===1&&L.scale.z===1));
 assert.equal(new Set(before.map(L=>JSON.stringify(L.pos))).size,6,'distinct pointer placements');
 await page.evaluate(()=>{const p=document.getElementById('layer-panel');p.style.display='flex';p.classList.add('visible');closeObjTypeMenuTop();toggleEquipmentModelMenu(document.getElementById('btnAddCubeTop'));});
 await page.locator('#equipment-tab-vehicles').click();await page.locator('[data-equipment-id="hiace"]').click();
 await page.mouse.click(640,250);assert.equal((await page.evaluate(()=>__equipmentTest.layers())).length,6,'sky click must not place');
 await page.evaluate(()=>__equipmentTest.save());await page.reload();await page.waitForFunction(()=>window.__equipmentTest);
 await page.locator('#emptyBtn').click();await page.evaluate(()=>__equipmentTest.restore());const after=await page.evaluate(()=>__equipmentTest.layers());assert.deepEqual(after,before);
 await page.waitForFunction(()=>getComputedStyle(document.getElementById('dz')).display==='none',null,{timeout:3000});
 await page.screenshot({path:new URL('docs/equipment-verification/integrated-reopened.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(let i=0;i<6;i++){
   await page.evaluate(i=>__equipmentTest.view(i),i);await page.waitForTimeout(100);
   await page.screenshot({path:new URL('docs/equipment-verification/integrated-model-'+i+'-'+viewport.width+'.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});
  }
  for(const category of ['vehicles','equipment']){
   await page.evaluate(()=>{const p=document.getElementById('layer-panel');p.style.display='flex';p.classList.remove('collapsed');p.classList.add('visible');closeObjTypeMenuTop();toggleEquipmentModelMenu(document.getElementById('btnAddCubeTop'));});
   await page.locator('#equipment-tab-'+category).click();
   assert.equal(await page.locator('#equipment-tab-'+category).getAttribute('aria-selected'),'true');
   await page.screenshot({path:new URL('docs/equipment-verification/integrated-menu-'+category+'-'+viewport.width+'.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});
  }
  await page.evaluate(()=>closeObjTypeMenuTop());
 }
 console.log('INTEGRATED PASS',JSON.stringify(after));
}finally{await browser.close();}
