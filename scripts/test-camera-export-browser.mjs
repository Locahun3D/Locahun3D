import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json')('playwright');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const at=html.lastIndexOf('</script>');
html=html.slice(0,at)+`window.exportTest={start(){loadEmptyProject();document.getElementById('dz').style.display='none';addCubeLayer(new THREE.Vector3(0,0,0));layers.find(l=>l.type==='cube').mesh.children[0].material=new THREE.MeshBasicMaterial({color:0xff2222});camPos.set(0,.5,4);setCamRotImmediate(Math.PI,0);camAnim.keys=[];camAnimAddKey();camPos.x=1;camAnimAddKey();camAnimSetSpeed(1);camAnim.warmupMs=100;_camAnimSaveBlob=blob=>{window.recordedBlob=blob;};camAnimRecordExport();},state(){return {playing:camAnim.playing,warming:camAnim.warming,recording:!!camAnim._recRec,total:camAnim.totalSec};}};`+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:820,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:18997/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18997/');await page.waitForFunction(()=>window.exportTest);
 await page.evaluate(()=>exportTest.start());
 await page.waitForFunction(()=>window.recordedBlob,null,{timeout:60000});
 const result=await page.evaluate(async()=>{
  const video=document.createElement('video');video.muted=true;video.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:99999;background:black';video.src=URL.createObjectURL(recordedBlob);document.body.append(video);
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Recorded video decode failed'));});
  await video.play();await new Promise(resolve=>setTimeout(resolve,300));video.pause();
  const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;const x=c.getContext('2d');x.drawImage(video,0,0);
  const pixels=x.getImageData(0,0,c.width,c.height).data;let nonblack=0,red=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]+pixels[i+1]+pixels[i+2]>40)nonblack++;if(pixels[i]>150&&pixels[i]>pixels[i+1]*1.5&&pixels[i]>pixels[i+2]*1.5)red++;}
  return {bytes:recordedBlob.size,duration:video.duration,width:c.width,height:c.height,time:video.currentTime,nonblack,red,...exportTest.state()};
 });
 assert(result.bytes>1000);assert(result.duration>.5);assert(result.time>0);assert(result.nonblack>1000);assert(result.red>100,'recorded scene model must be visible');assert.equal(result.recording,false);assert.deepEqual(errors,[]);
 fs.mkdirSync('docs/camera-export-review',{recursive:true});
  await page.screenshot({path:'docs/camera-export-review/playback.png'});console.log(JSON.stringify(result));
 await page.evaluate(()=>{window.recordedBlob=null;exportTest.start();});
 await page.waitForFunction(()=>exportTest.state().recording);
 await page.waitForTimeout(150);await page.evaluate(()=>camAnimStopRecord());
 await page.waitForFunction(()=>window.recordedBlob&&!exportTest.state().recording);
 assert(await page.evaluate(()=>recordedBlob.size>1000));assert.deepEqual(errors,[]);
 console.log('Manual stop saved a nonempty MP4 and restored recording state.');
}finally{await browser.close();}
