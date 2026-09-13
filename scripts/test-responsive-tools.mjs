import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url),out=new URL('docs/responsive-review/',root);
fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(new URL('src/template.html',root),'utf8').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,f)=>fs.readFileSync(new URL(f,root),'utf8'));
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const results=[];
try{
 for(const [name,width,height] of [['phone',390,844],['phone-landscape',844,390],['small-phone',375,667],['small-landscape',667,375],['ipad',820,1180],['ipad-landscape',1180,820]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true});
  const page=await context.newPage();await page.setContent(html);
  await page.evaluate(()=>{
   document.getElementById('dz').style.display='none';document.getElementById('hud').style.opacity='1';
   document.getElementById('view-tl-btns').style.display='flex';document.getElementById('view-tl-btns').append(document.getElementById('qi-badge'));
   document.body.style.background='#8399a6';
  });
  for(const panel of ['cam-panel','sun-panel','gizmo']){
   await page.evaluate(id=>{
    for(const p of ['cam-panel','sun-panel','gizmo'])document.getElementById(p).style.display=p===id?'block':'none';
    document.body.classList.toggle('cam-active',id==='cam-panel');
    document.body.classList.toggle('msr-active',id==='gizmo');
    document.body.classList.toggle('sun-active',id==='sun-panel');
   },panel);
   const metrics=await page.evaluate(id=>{
    const el=document.getElementById(id),r=el.getBoundingClientRect(),style=getComputedStyle(el);
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:el.clientHeight,scroll:el.scrollHeight,overflow:style.overflowY};
   },panel);
   const ok=metrics.left>=0&&metrics.right<=width+1&&metrics.top>=0&&metrics.bottom<=height+1&&
    (metrics.scroll<=metrics.client+1||['auto','scroll'].includes(metrics.overflow));
   const hits=await page.evaluate(()=>['btnMeasure','btnCamTool','btn-sun'].map(id=>{
    const button=document.getElementById(id),r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {id,clickable:!!hit&&(hit===button||button.contains(hit)),cover:hit?.id||hit?.tagName};
   }));
   results.push({name,panel,ok:ok&&hits.every(h=>h.clickable),hits,...metrics});
   await page.screenshot({path:new URL(name+'-'+panel+'.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
  }
  await context.close();
 }
}finally{await browser.close();}
fs.writeFileSync(new URL('results.json',out),JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
if(results.some(r=>!r.ok))process.exitCode=1;
