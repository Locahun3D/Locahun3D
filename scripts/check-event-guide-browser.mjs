import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
let html=fs.readFileSync('docs/event-guide-review.html','utf8');
const at=html.lastIndexOf('</script>');
html=html.slice(0,at)+`
window.__guideCheck=(distance)=>{
 document.getElementById('dz').style.display='none';
 let L=layers.find(l=>l.type==='event');if(!L){addEventLayer();L=layers.find(l=>l.type==='event');}
 L.eventGuide='昇降式の室内物干し\\nリモコンから起動可能';
 const position=camera.getWorldPosition(new THREE.Vector3()).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(distance));
 L.mesh.position.copy(position);L.pos={x:position.x,y:position.y,z:position.z};
 window._activeBillboardCount=1;
 const drawn=[],original=octx.fillText;octx.fillText=function(...a){drawn.push(a);return original.apply(this,a);};
 updateOverlay();octx.fillText=original;return drawn;
};
`+html.slice(at);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>typeof window.__guideCheck==='function',null,{timeout:60000});
 for(const width of [1440,820,390]){
  await page.setViewportSize({width,height:900});
  const near=await page.evaluate(()=>__guideCheck(3));
  assert.deepEqual(near.map(x=>x[0]),['昇降式の室内物干し','リモコンから起動可能']);
  await page.screenshot({path:`docs/event-guide-near-${width}.png`});
  const far=await page.evaluate(()=>__guideCheck(6));assert.equal(far.length,0);
  await page.screenshot({path:`docs/event-guide-far-${width}.png`});
 }
 console.log('PASS actual viewer Chrome: multiline near / hidden far, 1440/820/390');
}finally{await browser.close();server.close();}
