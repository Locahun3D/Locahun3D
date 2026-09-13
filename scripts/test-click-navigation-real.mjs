import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
if(!process.argv.includes('--gpu-granted'))throw Error('Parent GPU grant required');
const root='F:/Codex/camera-collision-20260911',meta=JSON.parse(fs.readFileSync(root+'/proxy.json'));
const zip='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioSeeYouTomorrow/260907/3_Locahun3DOnline_ViewerData/4FStudio.zip';
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(sha(zip),meta.originalZipSha256);assert.equal(sha(root+'/'+meta.key+'.lct'),meta.sha256);
const out='F:/Codex/3dgs-renderer-research-20260911/click-real-'+Date.now();fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(new URL('../src/template.html',import.meta.url),'utf8').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,f)=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const hook=`
LocahunCollisionBake.generate=async()=>{throw Error('Real click fixture forbids rebake');};
window.realClick={calls:[],
 async install(meta){
  const live=layers.filter(L=>L.type==='splat'&&L.visible);if(live.length!==meta.sources.length)throw Error('Source count mismatch');
  live.forEach((L,i)=>{L.mesh.updateMatrixWorld(true);if(L.mesh.matrixWorld.elements.some((v,j)=>Math.abs(v-meta.sources[i].matrix[j])>1e-8))throw Error('Source transform mismatch');});
  const bytes=new Uint8Array(await (await fetch('/known.lct')).arrayBuffer()),index=await LocahunWholeCollision.decodeTiles(bytes,meta.key),core=await LocahunWalkCollision.create();
  core.rebuild({meshes:_walkMeshGeometry()});walkSetup.core?.dispose();walkSetup.core=core;walkSetup.wholeIndex=index;
  walkSetup.settings.signature=_walkSourceSignature();walkSetup.settings.region=null;walkSetup.settings.detailRegion=null;walkSetup.importPending=null;
  _walkWholeCoverage(camPos,camPos,{drop:22});
  for(const name of ['raycastSurface','isCapsuleClear']){const original=core[name].bind(core);core[name]=(...args)=>{const result=original(...args);if(this.calls.length<100)this.calls.push({name,args,result});return result;};}
  this.initial=camPos.clone();this.angle={yaw,pitch};return this.state();
 },
 reset(){_cancelClickNavigation();camPos.copy(this.initial);setCamRotImmediate(this.angle.yaw,this.angle.pitch);updateCamera();markDirty(5);this.calls=[];},
 aim(p){const dx=p.x-camPos.x,dy=p.y-camPos.y,dz=p.z-camPos.z;setCamRotImmediate(Math.atan2(dx,dz),Math.atan2(dy,Math.hypot(dx,dz)));updateCamera();camera.updateMatrixWorld(true);markDirty(5);},
 state(){return {pos:camPos.toArray(),yaw,pitch,ready:getCameraCollisionState(),active:!!_clickNavigationController?.active,reason:_clickNavigationController?.stopReason,tiles:walkSetup.wholeIndex?.tiles.size,calls:this.calls};}
};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
let browser;const result={errors:[],attempts:[],originalSha256:meta.originalZipSha256,cacheSha256:meta.sha256};
const timer=setTimeout(()=>browser?.close(),165000);
try{
 browser=await require('playwright').chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>result.errors.push(e.message));
 await page.route('http://127.0.0.1:18992/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route('http://127.0.0.1:18992/known.lct',r=>r.fulfill({body:fs.readFileSync(root+'/'+meta.key+'.lct')}));
 await page.goto('http://127.0.0.1:18992/');await page.waitForFunction(()=>window.realClick,null,{timeout:60000});
 await page.locator('#fi').setInputFiles(zip);
 await page.waitForFunction(()=>window.__dbg.layers.some(L=>L.type==='splat'&&L.mesh)&&!document.getElementById('loader')?.offsetParent,null,{timeout:60000});
 await page.waitForTimeout(2500);result.initial=await page.evaluate(m=>realClick.install(m),meta);assert(result.initial.ready.ready);
 await page.screenshot({path:out+'/initial.png'});
 const plans=process.argv.includes('--probe-targets')?JSON.parse(fs.readFileSync('F:/Codex/3dgs-renderer-research-20260911/click-cache-probe.json')).paths.map(p=>({x:720,y:450,ground:p.ground})):
  [[850,800],[950,800],[850,750],[950,750],[1000,800],[1000,750],[850,700],[950,700],[1050,800]].map(([x,y])=>({x,y}));
 for(const {x,y,ground} of plans){
  await page.evaluate(()=>realClick.reset());if(ground)await page.evaluate(p=>realClick.aim(p),ground);
  await page.waitForTimeout(400);const before=await page.evaluate(()=>realClick.state());
  await page.screenshot({path:out+'/before-'+(result.attempts.length+1)+'.png'});
  await page.mouse.click(x,y);await page.waitForTimeout(150);const during=await page.evaluate(()=>realClick.state());
  await page.waitForFunction(()=>!realClick.state().active,null,{timeout:7000});const end=await page.evaluate(()=>realClick.state());
  result.attempts.push({x,y,ground,before,during,end,travel:Math.hypot(...end.pos.map((v,i)=>v-before.pos[i]))});
  await page.screenshot({path:out+'/attempt-'+result.attempts.length+'.png'});
 }
 assert(result.attempts.some(a=>a.travel>.1),'All tested real-scene clicks refused');
 assert.deepEqual(result.errors,[]);
}catch(e){result.failure=String(e);process.exitCode=1;}
finally{clearTimeout(timer);await browser?.close();result.finalZipSha256=sha(zip);fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(out);console.log(JSON.stringify({errors:result.errors,failure:result.failure,attempts:result.attempts.map(a=>({x:a.x,y:a.y,travel:a.travel,reason:a.end.reason}))}));}
