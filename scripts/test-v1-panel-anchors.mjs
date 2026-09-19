import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium,webkit}=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json')('playwright');
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const live=process.argv[2];
const expected=live?read(live.includes('/viewer/')?'Locahun3D_OfflineViewer.online.html':'Locahun3D_OfflineViewer.html').match(/window\.__locahunBuildRelease="([a-f0-9]{64})"/)[1]:null;
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const at=html.lastIndexOf('</script>');
html=html.slice(0,at)+`window.anchorSetup=()=>{loadEmptyProject();document.getElementById('dz').style.display='none';};window.anchorClose=()=>{closeAllPanels();if(sun.active)toggleSunMode();};`+html.slice(at);
const out=new URL('docs/v1-panel-review/',root);fs.mkdirSync(out,{recursive:true});
const browser=await (process.env.WEBKIT?webkit:chromium).launch({...(process.env.WEBKIT?{}:{channel:'chrome'}),headless:true});
const results=[],errors=[];
try{
 for(const mode of process.env.ANCHOR_PC_ONLY?['pc']:['touch','ipad','pc']){
  const touch=mode!=='pc',ipad=mode==='ipad';
  const context=await browser.newContext({hasTouch:touch,isMobile:touch,viewport:{width:820,height:1180},...(ipad?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(live){await page.goto(live+'?verify='+Date.now());await page.locator('#emptyBtn').click();await page.locator('#dz').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__locahunBuildRelease),expected);}
  else{await page.route('http://127.0.0.1:18995/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://127.0.0.1:18995/');await page.waitForFunction(()=>window.anchorSetup,null,{timeout:60000});await page.evaluate(()=>anchorSetup());}
  for(const [width,height] of ipad?[[1024,650],[1180,650],[744,1024]]:touch?[[390,844],[844,390],[375,667],[667,375],[360,740],[740,360],[820,1180],[1180,820],[744,1133],[1133,744],[1024,1366],[1366,1024]]:[[722,414],[900,650],[1100,700],[1101,700],[1440,900]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(350);
   const anchor=await page.evaluate(()=>{const l=document.getElementById('layer-panel').getBoundingClientRect(),h=document.getElementById('topbar').getBoundingClientRect();return {visible:l.width>0,top:l.top,bottom:h.bottom};});
   if(anchor.visible)assert(Math.abs(anchor.top-anchor.bottom)<1,`${mode} ${width}x${height}: layer top ${anchor.top}, header bottom ${anchor.bottom}`);
   if(!touch&&width===722){
    await page.evaluate(()=>{if(document.body.classList.contains('cam-active'))window.toggleCamTool();if(document.body.classList.contains('sun-active'))window.toggleSunMode();document.getElementById('layer-panel').classList.add('collapsed');});
    await page.waitForTimeout(100);
    await page.screenshot({path:new URL('pc-722-414-header-connected.png',out).pathname.replace(/^\/(\w:)/,'$1')});
    const tools=await page.evaluate(()=>{
     const right=document.getElementById('layer-panel').getBoundingClientRect().right;
     return [...document.querySelectorAll('#view-tl-btns>button')].filter(e=>e.getBoundingClientRect().width).every(e=>e.getBoundingClientRect().left>=right);
    });
    assert(tools,'compact desktop top controls must not overlap the layer header');
   }
   for(const expanded of [false,true])for(const [button,panel] of [['btnCamTool','cam-panel'],['btn-sun','sun-panel']]){
    if(live)await page.evaluate(()=>{if(document.body.classList.contains('cam-active'))window.toggleCamTool();if(document.body.classList.contains('sun-active'))window.toggleSunMode();});
    else await page.evaluate(()=>anchorClose());
    await page.evaluate(expanded=>document.getElementById('layer-panel').classList.toggle('collapsed',!expanded),expanded);
    await page.locator('#'+button)[touch?'tap':'click']();await page.waitForTimeout(300);
    if(touch){await page.setViewportSize({width:height,height:width});await page.waitForTimeout(300);await page.setViewportSize({width,height});await page.waitForTimeout(350);}
    const state=await page.evaluate(panel=>{
     window.scrollTo(100,100);
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
     const p=document.getElementById(panel),r=rect(p);
     const buttons=[...document.querySelectorAll('#hud .cbar>button')].filter(e=>e.getBoundingClientRect().width).map(e=>{const b=rect(e);return {id:e.id,...b,hit:e.contains(document.elementFromPoint(b.x+b.w/2,b.y+b.h/2))};});
     const tools=[...document.querySelectorAll('#view-tl-btns>button,#view-tl-btns>#qi-badge')].filter(e=>e.getBoundingClientRect().width).map(rect);
     return {panel:r,header:rect(document.getElementById('topbar')),layer:rect(document.getElementById('layer-panel')),buttons,tools,scroll:p.scrollWidth,client:p.clientWidth,pageX:scrollX,pageY:scrollY};
    },panel);
    const phone=touch&&!ipad&&Math.min(width,height)<700;
    const layerOk=phone||(state.layer.w>0&&Math.abs(state.layer.y-state.header.bottom)<1&&(!touch||state.tools.every(b=>b.x>=state.layer.right&&b.right<=width)));
    const blockers=state.buttons.filter(b=>state.panel.x<b.right&&state.panel.right>b.x);
    const panelOk=!phone||(state.panel.x>=0&&state.panel.right<=width+1&&state.panel.bottom<=height+1&&state.scroll<=state.client+1&&state.buttons.every(b=>b.hit)&&(!blockers.length||state.panel.bottom<=Math.min(...blockers.map(b=>b.y))-4));
    const desktopOk=touch||(Math.abs(state.layer.y-state.header.bottom)<1&&state.header.bottom===45&&(panel!=='cam-panel'||(state.panel.y===46&&state.panel.right===width)));
    const scrollOk=state.pageX===0&&state.pageY===0;
    const sunOk=!ipad||panel!=='sun-panel'||state.panel.y>=Math.max(...state.tools.map(b=>b.bottom));
    results.push({touch,mode,width,height,expanded,panelId:panel,ok:layerOk&&panelOk&&desktopOk&&scrollOk&&sunOk,...state});
    await page.screenshot({path:new URL(`${process.env.WEBKIT?'webkit-':''}${live?'live-':''}${mode}-${width}-${height}-${expanded}-${panel}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
   }
  }
  if(!touch&&!live){
   await page.evaluate(()=>document.getElementById('topbar').style.setProperty('height','63px','important'));
   await page.waitForFunction(()=>Math.abs(document.getElementById('layer-panel').getBoundingClientRect().top-document.getElementById('topbar').getBoundingClientRect().bottom)<1);
   assert.equal(await page.evaluate(()=>document.getElementById('layer-panel').getBoundingClientRect().top),63);
  }
  await context.close();
 }
 fs.writeFileSync(new URL('results.json',out),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({live,release:expected,checks:results.length,failures:results.filter(r=>!r.ok),errors},null,2));
 assert.equal(results.filter(r=>!r.ok).length,0);assert.deepEqual(errors,[]);
}finally{await browser.close();}
