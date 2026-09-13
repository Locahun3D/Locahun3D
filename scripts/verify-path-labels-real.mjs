import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const url='http://127.0.0.1:62674/a1b4ce20d8f21aa593420244c1644fb9330226c7a029b429/?localProject=1';
const state='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio/project-state.json';
const before=fs.readFileSync(state),dir='F:/Codex/locahun-walk/verification/path-label-readability';
fs.mkdirSync(dir,{recursive:true});
const hook=`window.__realLabels={list:()=>layers.filter(l=>l.type==='path').map(l=>({id:l.id,name:l.name})),focus:id=>{
 const L=findLayer(id),sp=L.mesh.userData.pathLabelSprite,p=sp.getWorldPosition(new THREE.Vector3());
 const direction=camPos.clone().sub(p).normalize();if(direction.lengthSq()<.5)direction.set(0,0,1);
 camPos.copy(p).addScaledVector(direction,4);camera.position.copy(camPos);camera.lookAt(p);camera.rotation.reorder('YXZ');
 yaw=_yawTarget=camera.rotation.y-Math.PI;pitch=_pitchTarget=camera.rotation.x;roll=0;
 selectLayer(id);markDirty(120);bumpSplatActive(5000);return {name:L.name,text:L.pathLabel};
}};`;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];let writes=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){writes++;return route.abort();}return route.continue();});
 await page.route(url,route=>{let html=fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');const at=html.lastIndexOf('</script>');assert(at>0);return route.fulfill({contentType:'text/html',body:html.slice(0,at)+hook+html.slice(at)});});
 await page.goto(url);await page.waitForFunction(()=>window.localProject?.ready,{timeout:120000});
 const paths=await page.evaluate(()=>__realLabels.list());
 for(const L of paths.slice(0,2)){await page.evaluate(id=>__realLabels.focus(id),L.id);await page.waitForTimeout(5500);await page.screenshot({path:dir+'/real-'+L.id+'.png'});}
 assert.equal(writes,0);assert.deepEqual(errors,[]);assert(before.equals(fs.readFileSync(state)),'project data changed');
 console.log(JSON.stringify({paths,writes,errors,projectUnchanged:true}));
}finally{await browser.close();}
