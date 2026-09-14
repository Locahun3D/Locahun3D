import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json')('playwright');
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const at=html.lastIndexOf('</script>');
html=html.slice(0,at)+`window.anchorTest=()=>{loadEmptyProject();document.getElementById('dz').style.display='none';};window.anchorClose=()=>{closeAllPanels();if(sun.active)toggleSunMode();};`+html.slice(at);
const out=new URL('docs/touch-anchor-review/',root);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:820,height:1180}});
 const page=await context.newPage();
 await page.route('http://127.0.0.1:18994/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18994/');
 await page.waitForFunction(()=>window.anchorTest,null,{timeout:60000});
 await page.evaluate(()=>anchorTest());
 for(const [w,h] of [[820,1180],[1180,820],[744,1133],[1133,744],[390,844],[844,390],[375,667],[667,375]]){
  await page.setViewportSize({width:w,height:h});
  for(const expanded of [false,true]){
   await page.evaluate(expanded=>{document.getElementById('layer-panel').classList.toggle('collapsed',!expanded);},expanded);
   for(const [button,panel] of [['btnCamTool','cam-panel'],['btn-sun','sun-panel']]){
    await page.evaluate(()=>anchorClose());
    await page.locator('#'+button).tap();await page.waitForTimeout(350);
    const state=await page.evaluate(panel=>{
     const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
     const buttons=[...document.querySelectorAll('#hud .cbar>button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {id:e.id,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
     return {header:rect('topbar'),layer:rect('layer-panel'),panel:rect(panel),toolbar:rect('view-tl-btns'),buttons};
    },panel);
    const tablet=Math.min(w,h)>=700;
    const ok=(!tablet||(Math.abs(state.layer.y-state.header.bottom)<1&&state.layer.x===0&&state.layer.right<=state.toolbar.x))&&state.panel.x>=0&&state.panel.right<=w+1&&state.panel.bottom<=h+1&&state.buttons.every(b=>b.hit);
    results.push({w,h,expanded,panelId:panel,ok,...state});
    await page.screenshot({path:new URL(`${w}-${h}-${expanded}-${panel}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
   }
  }
 }
 const desktop=await browser.newContext({viewport:{width:1440,height:900}});
 const pc=await desktop.newPage();
 await pc.route('http://127.0.0.1:18994/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await pc.goto('http://127.0.0.1:18994/');await pc.waitForFunction(()=>window.anchorTest);
 await pc.evaluate(()=>anchorTest());
 for(const button of ['btnCamTool','btn-sun']){
  await pc.evaluate(()=>anchorClose());await pc.locator('#'+button).click();
  await pc.waitForTimeout(350);
  const state=await pc.evaluate(()=>({layerTop:document.getElementById('layer-panel').getBoundingClientRect().top,touch:matchMedia('(pointer:coarse) and (any-hover:none)').matches}));
  results.push({desktop:true,button,...state,ok:!state.touch&&state.layerTop===45});
  await pc.screenshot({path:new URL(`desktop-${button}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
 }
 fs.writeFileSync(new URL('results.json',out),JSON.stringify(results,null,2));
 console.log(JSON.stringify({checks:results.length,failures:results.filter(x=>!x.ok)},null,2));
 assert.equal(results.filter(x=>!x.ok).length,0);
}finally{await browser.close();}
