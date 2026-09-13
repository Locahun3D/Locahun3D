import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

export function rawMotionHtml(bytes){
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#45494b}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three.js","three/addons/":"/addons/"}}</script>
<script type="module">
import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const bytes=Uint8Array.from(atob('${bytes.toString('base64')}'),c=>c.charCodeAt(0));
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer,'',resolve,reject));
const model=gltf.scene,scene=new THREE.Scene();scene.background=new THREE.Color(0x45494b);scene.add(model);
model.updateMatrixWorld(true);const rest=new THREE.Box3().setFromObject(model,true),center=rest.getCenter(new THREE.Vector3());
model.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false;});
scene.add(new THREE.HemisphereLight(0xffffff,0x999999,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(3,5,4);scene.add(light);
const floor=new THREE.GridHelper(8,40,0x909496,0x626669);floor.position.y=rest.min.y;scene.add(floor);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshStandardMaterial({color:0x373c3f,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=rest.min.y-.001;scene.add(ground);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});document.body.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.01,100),mixer=new THREE.AnimationMixer(model);
let view='front',active=null,playing=false,last=performance.now();
function draw(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
const upper=view.startsWith('upper'),feet=view==='feet';const distance=upper?2.0:feet?1.5:3.8;
const y=feet?.3:upper?1.27:center.y;const look=new THREE.Vector3(center.x,y,center.z);
camera.position.copy(look).add(new THREE.Vector3(view==='side'?distance:0,.06,view.includes('back')?-distance:view==='side'?.12:distance));camera.lookAt(look);renderer.render(scene,camera);}
function select(name,phase=0){playing=false;mixer.stopAllAction();const clip=THREE.AnimationClip.findByName(gltf.animations,name);if(!clip)throw new Error('Missing raw clip '+name);
active=mixer.clipAction(clip);active.reset().setLoop(THREE.LoopOnce,1);active.clampWhenFinished=true;active.play();active.time=clip.duration*phase;mixer.update(0);draw();}
function frame(now){const dt=(now-last)/1000;last=now;if(playing)mixer.update(dt);draw();requestAnimationFrame(frame);}
requestAnimationFrame(frame);
window.rawReview={clips:gltf.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),nominalRunSpeed:model.getObjectByName('B1_Rig')?.userData.nominal_run_speed_mps,restHeight:rest.max.y-rest.min.y,select,
setView(v){view=v;draw();},
pixels(){const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let n=0;for(let i=0;i<p.length;i+=4)if(p[i]>150&&p[i+1]>150&&p[i+2]>150)n++;return n;},
async record(v,rate=1,runOnly=false){view=v;const chunks=[],stream=renderer.domElement.captureStream(30),rec=new MediaRecorder(stream,{mimeType:'video/webm'});rec.ondataavailable=e=>chunks.push(e.data);rec.start();const timeline=[];
for(const clip of gltf.animations.filter(c=>!runOnly||c.name==='Run_Locomotion')){select(clip.name);active.setEffectiveTimeScale(rate);if(runOnly)active.setLoop(THREE.LoopRepeat,Infinity);last=performance.now();playing=true;
const seconds=runOnly?Math.max(2,Math.min(4,3*clip.duration/rate)):Math.min(4,clip.duration/rate);
timeline.push({name:clip.name,rate,capturedSeconds:seconds,clipDuration:clip.duration,loop:runOnly});await new Promise(r=>setTimeout(r,(seconds+.15)*1000));playing=false;}
await new Promise(r=>{rec.onstop=r;rec.stop();});stream.getTracks().forEach(t=>t.stop());return {timeline,bytes:Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()))};}
};window.rawReady=true;
</script>`;
}

async function review(asset,out){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const bytes=fs.readFileSync(asset),html=rawMotionHtml(bytes),sha256=createHash('sha256').update(bytes).digest('hex');
  fs.mkdirSync(out,{recursive:true});
  const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
  const {chromium}=require('playwright');
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
    let file;
    if(req.url==='/three.js')file=path.join(root,'scripts/avatar-assets/node_modules/three/build/three.module.js');
    else if(req.url==='/three.core.js')file=path.join(root,'scripts/avatar-assets/node_modules/three/build/three.core.js');
    else if(/^\/addons\/[A-Za-z0-9/_-]+\.js$/.test(req.url))file=path.join(root,'scripts/avatar-assets/node_modules/three/examples/jsm',req.url.slice(8));
    else if(/^\/raw-(front|side)(-run-native|-run616)?\.webm$/.test(req.url))file=path.join(out,req.url.slice(1));
    if(!file||!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.webm')?'video/webm':'text/javascript');res.end(fs.readFileSync(file));
  });
  let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch({channel:'chrome',headless:false});
    const page=await browser.newPage({viewport:{width:900,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:'+server.address().port;await page.goto(url);
    await page.waitForFunction(()=>window.rawReady,{timeout:60000});
    const info=await page.evaluate(()=>({clips:rawReview.clips,restHeight:rawReview.restHeight,nominalRunSpeed:rawReview.nominalRunSpeed}));
    assert(info.clips.length>0,'no clips');const shots=[];
    for(const clip of info.clips){
      const safe=clip.name.replace(/[^A-Za-z0-9_-]/g,'_');
      for(const phase of [.25,.75])for(const view of ['front','back','side','upper-front','upper-back','feet']){
        await page.evaluate(({name,phase,view})=>{rawReview.select(name,phase);rawReview.setView(view);},{name:clip.name,phase,view});
        assert(await page.evaluate(()=>rawReview.pixels())>500,'blank raw clip '+clip.name);
        const file=safe+'-'+phase+'-'+view+'.png';await page.screenshot({path:path.join(out,file)});shots.push({file,name:clip.name,phase,view});
      }
    }
    const recordings={},playback={};
    assert(Number.isFinite(info.nominalRunSpeed)&&info.nominalRunSpeed>0,'run calibration required for6.16 comparison');
    const runRate=6.16/info.nominalRunSpeed;
    const cases=['front','side'].flatMap(view=>[{id:view,view,rate:1,runOnly:false},
      {id:view+'-run-native',view,rate:1,runOnly:true},{id:view+'-run616',view,rate:runRate,runOnly:true}]);
    for(const entry of cases){
      const recording=await page.evaluate(({view,rate,runOnly})=>rawReview.record(view,rate,runOnly),entry);
      fs.writeFileSync(path.join(out,'raw-'+entry.id+'.webm'),Buffer.from(recording.bytes));recordings[entry.id]=recording.timeline;
    }
    for(const {id} of cases){
      await page.goto(url+'/raw-'+id+'.webm');const player=page.locator('video');
      await player.evaluate(v=>{v.muted=true;return v.play();});
      await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.4);
      const first=await player.evaluate(v=>v.getVideoPlaybackQuality().totalVideoFrames);await page.waitForTimeout(600);
      playback[id]=await player.evaluate(v=>({frames:v.getVideoPlaybackQuality().totalVideoFrames,time:v.currentTime,error:v.error?.message}));
      assert(playback[id].frames>first);assert(!playback[id].error);
    }
    assert.deepEqual(errors,[]);
    const report={asset,sha256,...info,runComparison:{nativeRate:1,targetSpeed:6.16,targetRate:runRate,
      assumedTwoStepCadencePerMinute:120*runRate/info.clips.find(c=>c.name==='Run_Locomotion').duration,
      limitation:'Cadence assumes a complete two-step cycle; source metadata/visual foot phases must confirm. No stride scaling.'},shots,recordings,playback,errors,
      limitation:'RAW CLIPS ONLY: no214, no physics, no runtime transitions, no fake missing actions. Each montage clip captures up to4seconds. Numerical/decode checks do not establish visual acceptance.'};
    fs.writeFileSync(path.join(out,'raw-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({sha256,clips:info.clips,playback,errors},null,2));
  }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const asset=process.argv.find(a=>a.startsWith('--motion-asset='))?.slice(15),out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
  if(!asset||!out)throw new Error('Require --motion-asset=PRIVATE.glb --out=PRIVATE_DIRECTORY; reserve GPU first');
  await review(path.resolve(asset),path.resolve(out));
}
