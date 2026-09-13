import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json')('playwright');
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const out=new URL('docs/touch-feature-review/',root);fs.mkdirSync(out,{recursive:true});
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const hook=`
window.mobileTest={async setup(){loadEmptyProject();document.getElementById('dz').style.display='none';
const floor=new THREE.Mesh(new THREE.BoxGeometry(80,.2,80),new THREE.MeshBasicMaterial({color:0x879397}));floor.position.y=-.1;scene.add(floor);
walkSetup.core=await LocahunWalkCollision.create();walkSetup.settings.meshOnly=true;walkSetup.wholeIndex=null;walkSetup.importPending=null;
walkSetup.core.rebuild({boxes:[{center:[0,-.1,0],half:[40,.1,40]}]});walkSetup.settings.signature=_walkSourceSignature();camPos.set(0,1.8,0);setCamRotImmediate(0,-.15);updateCamera();markDirty(5);},
close(){closeAllPanels();if(sun.active)toggleSunMode();if(walkMode.active)_avatarWalkExit();},
state(){return {walk:walkMode.active,jump:walkMode.jumpRequested,airborne:walkMode.airborne,position:walkMode.avatar?.position.toArray(),joy:[joyDX,joyDY],measure:msr.step};}};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[],combinations=[];
try{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:18992/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18992/');await page.waitForFunction(()=>window.mobileTest,null,{timeout:60000});
 await page.evaluate(()=>mobileTest.setup());
 for(const [name,width,height] of [['phone',390,844],['phone-landscape',844,390],['small',375,667],['small-landscape',667,375],['mini',360,740],['mini-landscape',740,360],['ipad',820,1180],['ipad-landscape',1180,820],['ipad-mini',744,1133],['ipad-mini-landscape',1133,744],['ipad-pro',1024,1366],['ipad-pro-landscape',1366,1024]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  for(const [button,panel] of [['btnCamTool','cam-panel'],['btn-sun','sun-panel'],['btnMeasure','gizmo'],['btnCamAnim','cam-anim-panel'],...(name.startsWith('ipad')?[['qi-badge','quality-panel']]:[])]){
   await page.evaluate(()=>mobileTest.close());
   await page.locator('#'+button).tap({timeout:3000});await page.waitForTimeout(120);
   const metrics=await page.evaluate(id=>{
    const el=document.getElementById(id),r=el.getBoundingClientRect();
    const visible=e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
    const overlaps=[];for(const id of ['view-tl-btns','joy','joy-vert']){const e=document.getElementById(id);if(!e||!visible(e))continue;const b=e.getBoundingClientRect();if(r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top)overlaps.push(id);}
    const buttons=[...document.querySelectorAll('.cbar>button')].filter(visible).map(e=>{const b=e.getBoundingClientRect();return {id:e.id,x:b.x,y:b.y,w:b.width,h:b.height,hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});
    return {x:r.x,y:r.y,w:r.width,h:r.height,scroll:el.scrollWidth,client:el.clientWidth,overlaps,buttons};
   },panel);
   const ok=metrics.x>=0&&metrics.y>=0&&metrics.x+metrics.w<=width+1&&metrics.y+metrics.h<=height+1&&metrics.scroll<=metrics.client+1&&metrics.overlaps.length===0&&metrics.buttons.length===4&&metrics.buttons.every(b=>b.hit&&b.h>=40);
   results.push({name,panel,ok,...metrics});
   await page.screenshot({path:new URL(name+'-'+panel+'.png',out).pathname.replace(/^\/(\w:)/,'$1')});
  }
  const toolIds=['btnCamTool','btnCamAnim','btn-sun','btnMeasure',...(name.startsWith('ipad')?['qi-badge']:[])];
  for(const layersOpen of name.startsWith('ipad')?[false,true]:[false]){
   await page.evaluate(()=>mobileTest.close());
   if(name.startsWith('ipad')&&(await page.locator('#layer-panel').getAttribute('class')).includes('collapsed')===layersOpen)await page.locator('#lp-title-head').tap();
   for(const reverse of [false,true])for(let mask=0;mask<1<<toolIds.length;mask++){
    await page.evaluate(()=>mobileTest.close());
    const sequence=toolIds.filter((_,i)=>mask&(1<<i));if(reverse)sequence.reverse();
    for(const id of sequence){await page.locator('#'+id).tap({timeout:3000});}
    await page.waitForTimeout(20);
    const state=await page.evaluate(()=>{
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
     const buttons=[...document.querySelectorAll('#hud .cbar>button')].map(e=>{const r=rect(e);return {...r,hit:e.contains(document.elementFromPoint(r.x+r.w/2,r.y+r.h/2))};});
     const panels=['cam-panel','cam-anim-panel','sun-panel','gizmo','quality-panel'].map(id=>document.getElementById(id)).filter(e=>e&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');
     return {buttons,panels:panels.map(e=>({id:e.id,...rect(e),scroll:e.scrollWidth,client:e.clientWidth}))};
    });
    const ok=state.buttons.length===4&&state.buttons.every(b=>b.hit&&b.h>=40&&b.x>=0&&b.x+b.w<=width+1&&b.y+b.h<=height+1)&&state.panels.length<=1&&state.panels.every(p=>p.x>=0&&p.y>=0&&p.x+p.w<=width+1&&p.y+p.h<=height+1&&p.scroll<=p.client+1);
    combinations.push({name,layersOpen,reverse,mask,ok,...(!ok?{state}: {})});
    if(!ok)await page.screenshot({path:new URL(`failure-${name}-${layersOpen}-${reverse}-${mask}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
   }
  }
 }
 fs.writeFileSync(new URL('results.json',out),JSON.stringify({results,combinations,errors},null,2));
 console.log(JSON.stringify({checks:results.length,combinations:combinations.length,failures:results.filter(r=>!r.ok),combinationFailures:combinations.filter(r=>!r.ok),errors},null,2));
 if(!process.argv.includes('--audit')){assert.equal(results.filter(r=>!r.ok).length,0);assert.equal(combinations.filter(r=>!r.ok).length,0);assert.equal(errors.length,0);}
}finally{await browser.close();}
