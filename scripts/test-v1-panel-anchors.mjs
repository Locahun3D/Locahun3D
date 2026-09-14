import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json')('playwright');
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const at=html.lastIndexOf('</script>');
html=html.slice(0,at)+`window.anchorSetup=()=>{loadEmptyProject();document.getElementById('dz').style.display='none';};window.anchorClose=()=>{closeAllPanels();if(sun.active)toggleSunMode();};`+html.slice(at);
const out=new URL('docs/v1-panel-review/',root);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
try{
 for(const touch of [true,false]){
  const context=await browser.newContext({hasTouch:touch,isMobile:touch,viewport:{width:820,height:1180}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:18995/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://127.0.0.1:18995/');await page.waitForFunction(()=>window.anchorSetup,null,{timeout:60000});await page.evaluate(()=>anchorSetup());
  for(const [width,height] of touch?[[390,844],[844,390],[375,667],[667,375],[360,740],[740,360],[820,1180],[1180,820],[744,1133],[1133,744],[1024,1366],[1366,1024]]:[[1440,900]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(350);
   for(const expanded of [false,true])for(const [button,panel] of [['btnCamTool','cam-panel'],['btn-sun','sun-panel']]){
    await page.evaluate(expanded=>{anchorClose();document.getElementById('layer-panel').classList.toggle('collapsed',!expanded);},expanded);
    await page.locator('#'+button)[touch?'tap':'click']();await page.waitForTimeout(300);
    if(touch){await page.setViewportSize({width:height,height:width});await page.waitForTimeout(300);await page.setViewportSize({width,height});await page.waitForTimeout(350);}
    const state=await page.evaluate(panel=>{
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
     const p=document.getElementById(panel),r=rect(p);
     const buttons=[...document.querySelectorAll('#hud .cbar>button')].filter(e=>e.getBoundingClientRect().width).map(e=>{const b=rect(e);return {id:e.id,...b,hit:e.contains(document.elementFromPoint(b.x+b.w/2,b.y+b.h/2))};});
     const tools=[...document.querySelectorAll('#view-tl-btns>button,#view-tl-btns>#qi-badge')].filter(e=>e.getBoundingClientRect().width).map(rect);
     return {panel:r,header:rect(document.getElementById('topbar')),layer:rect(document.getElementById('layer-panel')),buttons,tools,scroll:p.scrollWidth,client:p.clientWidth};
    },panel);
    const phone=touch&&Math.min(width,height)<700;
    const layerOk=!touch||phone||(Math.abs(state.layer.y-state.header.bottom)<1&&state.tools.every(b=>b.x>=state.layer.right&&b.right<=width));
    const blockers=state.buttons.filter(b=>state.panel.x<b.right&&state.panel.right>b.x);
    const panelOk=!phone||(state.panel.x>=0&&state.panel.right<=width+1&&state.panel.bottom<=height+1&&state.scroll<=state.client+1&&state.buttons.every(b=>b.hit)&&(!blockers.length||state.panel.bottom<=Math.min(...blockers.map(b=>b.y))-4));
    const desktopOk=touch||(state.layer.y===45&&state.header.bottom===45&&(panel!=='cam-panel'||(state.panel.y===46&&state.panel.right===width)));
    results.push({touch,width,height,expanded,panelId:panel,ok:layerOk&&panelOk&&desktopOk,...state});
    await page.screenshot({path:new URL(`${touch?'touch':'pc'}-${width}-${height}-${expanded}-${panel}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
   }
  }
  await context.close();
 }
 fs.writeFileSync(new URL('results.json',out),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({checks:results.length,failures:results.filter(r=>!r.ok),errors},null,2));
 assert.equal(results.filter(r=>!r.ok).length,0);assert.deepEqual(errors,[]);
}finally{await browser.close();}
