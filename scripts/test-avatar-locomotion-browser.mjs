import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.AVATAR_VERIFY_DIR||'F:/Codex/locahun-walk/verification/locomotion-2026-09-10';
fs.mkdirSync(out,{recursive:true});
const source=n=>fs.readFileSync(path.join(root,'src/js',n),'utf8');
const state=source('211_fly_camera_google_earth_scheme.js').split('const walkMode = ')[1];
const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#27292b}canvas{display:block;width:100%;height:100%}</style>
<script type="importmap">{"imports":{"three":"/three.js","three/addons/":"/addons/"}}</script>
${fs.readFileSync(path.join(root,'src/assets/kawaii_walk_glb_b64.html'),'utf8')}
<script type="module">
import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import RAPIER from '/rapier.mjs';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x27292b);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});document.body.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,100);
const camPos=new THREE.Vector3(4,2,-5),layers=[],keys={};let joyDX=0,joyDY=0,yaw=0,pitch=-.35,_yawTarget=0,_pitchTarget=-.35;
const camAnim={playing:false},cam={active:false},arMode={active:false};
function markDirty(){}function showUndoToast(){}function _refreshResetBtnLabel(){}function T(x){return x;}
function _readGamepadInput(){return null;}function setCamRotImmediate(y,p){yaw=_yawTarget=y;pitch=_pitchTarget=p;}
function _addonLoader(){return Promise.resolve(GLTFLoader);}function _b64ToArrayBuffer(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;}
const walkMode = ${state}
${['212_fly_camera_walk_cycle_clip.js','213_fly_camera_avatar_ground.js','214_kawaii_walk_avatar.js','215_walk_collision.js','216_walk_settings.js','217_walk_collision_bridge.js','219_collision_walk_update.js'].map(source).join('\n')}
scene.add(new THREE.HemisphereLight(0xffffff,0x606060,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(4,7,3);scene.add(light);
const scenery=new THREE.Group();scene.add(scenery);
const grid=new THREE.GridHelper(30,60,0x53575a,0x414446);grid.position.y=.003;scene.add(grid);
walkSetup.core=await LocahunWalkCollision.create({rapier:RAPIER});walkSetup.settings.signature=_walkSourceSignature();walkSetup.settings.spawn={x:0,y:.02,z:0};
walkMode.avatar=await _buildKawaiiWalkAvatar(1.7);scene.add(walkMode.avatar);walkMode.speed=walkMode.avatar.userData.kawaiiAnimation.nominalSpeed;walkMode.runMul=1.85;
let auto=false,view='side',clock=0,last=performance.now(),stepBoxes=[];
function reset(stairs=false){
  scenery.clear();const boxes=[{center:[0,-.1,5],half:[5,.1,15]}];
  if(stairs)for(let i=0;i<8;i++)boxes.push({center:[0,(i+1)*.09,1+(i+.5)*.24],half:[1,(i+1)*.09,.12]});
  stepBoxes=boxes.slice(1);
  for(const b of boxes){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...b.half.map(v=>v*2)),new THREE.MeshStandardMaterial({color:b.center[1]<0?0x494d50:0x267f83,roughness:.9}));mesh.position.set(...b.center);scenery.add(mesh);}
  walkSetup.core.rebuild({boxes});walkSetup.core.setCharacter({x:0,y:.02,z:0},1.7,.22);
  Object.keys(keys).forEach(k=>keys[k]=false);Object.assign(walkMode,{active:true,airborne:false,actualSpeed:0,moveX:0,moveZ:0,jumpHeld:false,exitTransition:null,awaitInputRelease:false});
  walkMode.avatar.visible=true;walkMode.avatar.position.set(0,.02,0);walkMode.avatar.rotation.set(0,0,0);walkMode.velocity.set(0,0,0);
  walkMode.avatar.userData.kawaiiAnimation.reset();walkMode.entryCamera={position:{x:0,y:2.55,z:-3.2},yaw:0,pitch:-.35};setCamRotImmediate(0,-.35);clock=0;
}
function draw(){
  renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  const p=walkMode.avatar.position;
  if(view==='exit'){camera.position.copy(camPos);camera.lookAt(camPos.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch))));}
  else{camera.position.set(p.x+(view==='side'?4:0),p.y+1.3,p.z+(view==='side'?.3:4.7));camera.lookAt(p.x,p.y+.95,p.z);}
  renderer.render(scene,camera);
}
function step(dt){clock+=dt;if(walkMode.active)_updateCollisionAvatarWalk(dt);else _avatarWalkPostExit(dt);draw();}
function frame(now){const dt=Math.min(.04,(now-last)/1000);last=now;if(auto)step(dt);else draw();requestAnimationFrame(frame);}
reset();requestAnimationFrame(frame);
function footClipping(){
  let testedVertices=0,insideVertices=0,maxBelowTread=0,maxInteriorDepth=0;
  const p=new THREE.Vector3();walkMode.avatar.updateMatrixWorld(true);
  walkMode.avatar.traverse(o=>{
    if(!o.isSkinnedMesh)return;
    const indices=o.geometry.getAttribute('skinIndex'),weights=o.geometry.getAttribute('skinWeight');
    for(let i=0;i<indices.count;i++){
      let footWeight=0;for(let j=0;j<4;j++)if(/^(Left|Right)(Foot|Toe)/.test(o.skeleton.bones[indices.getComponent(i,j)].name))footWeight+=weights.getComponent(i,j);
      if(footWeight<.5)continue;testedVertices++;
      o.getVertexPosition(i,p).applyMatrix4(o.matrixWorld);
      for(const b of stepBoxes){const distances=[b.half[0]-Math.abs(p.x-b.center[0]),b.half[1]-Math.abs(p.y-b.center[1]),b.half[2]-Math.abs(p.z-b.center[2])];
        const depth=Math.min(...distances);if(depth>.001){insideVertices++;maxInteriorDepth=Math.max(maxInteriorDepth,depth);maxBelowTread=Math.max(maxBelowTread,b.center[1]+b.half[1]-p.y);break;}
      }
    }
  });return {testedVertices,insideVertices,maxBelowTread,maxInteriorDepth,units:'metres',sample:'single frame; vertices with foot/toe skin weight >= 0.5; 1mm interior tolerance'};
}
window.fixture={reset,footClipping,setView(v){view=v;},advance(n){auto=false;for(let i=0;i<n;i++)step(1/60);},input(v){Object.assign(keys,v);},exit(){toggleAvatarWalk();},
 state(){const api=walkMode.avatar.userData.kawaiiAnimation;return {state:api.state,speed:walkMode.actualSpeed,feet:walkMode.avatar.position.toArray(),camera:camPos.toArray(),visible:walkMode.avatar.visible,active:walkMode.active};},
 pixels(){const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let n=0;for(let i=0;i<p.length;i+=4)if(p[i]>130&&p[i+1]>110&&p[i+2]>90)n++;return n;},
 async record(){reset();view='side';auto=true;const chunks=[],stream=renderer.domElement.captureStream(30),rec=new MediaRecorder(stream,{mimeType:'video/webm'});rec.ondataavailable=e=>chunks.push(e.data);rec.start();keys.KeyW=true;
  await new Promise(r=>setTimeout(r,1000));keys.ShiftLeft=true;await new Promise(r=>setTimeout(r,1100));keys.Space=true;await new Promise(r=>setTimeout(r,250));keys.Space=false;
  await new Promise(r=>setTimeout(r,1000));keys.KeyW=false;keys.ShiftLeft=false;await new Promise(r=>setTimeout(r,700));view='exit';toggleAvatarWalk();await new Promise(r=>setTimeout(r,600));
  await new Promise(r=>{rec.onstop=r;rec.stop();});stream.getTracks().forEach(t=>t.stop());auto=false;return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));}
};window.fixtureReady=true;
</script>`;
const server=http.createServer((req,res)=>{
  let file;
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(req.url==='/three.js')file=path.join(root,'scripts/avatar-assets/node_modules/three/build/three.module.js');
  else if(req.url==='/three.core.js')file=path.join(root,'scripts/avatar-assets/node_modules/three/build/three.core.js');
  else if(req.url==='/rapier.mjs')file=path.join(root,'vendor/rapier-walk/rapier.mjs');
  else if(/^\/addons\/[A-Za-z0-9/_-]+\.js$/.test(req.url))file=path.join(root,'scripts/avatar-assets/node_modules/three/examples/jsm',req.url.slice(8));
  else if(req.url==='/motion.webm'){res.setHeader('Content-Type','video/webm');res.end(fs.readFileSync(path.join(out,'motion.webm')));return;}
  if(!file||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>window.fixtureReady,{timeout:60000});
  const states={};
  for(const mode of ['walk','run','jump','landing','stop','stairs']){
    await page.evaluate(mode=>{fixture.reset(mode==='stairs');fixture.setView('side');fixture.input({KeyW:true,ShiftLeft:mode==='run'});fixture.advance(mode==='stairs'?180:60);
      if(mode==='jump'||mode==='landing'){fixture.input({Space:true});fixture.advance(mode==='jump'?15:64);}
      if(mode==='stop'){fixture.input({KeyW:false});fixture.advance(40);}},mode);
    states[mode]=await page.evaluate(()=>fixture.state());
    if(mode==='stairs')states[mode].footClipping=await page.evaluate(()=>fixture.footClipping());
    assert((await page.evaluate(()=>fixture.pixels()))>5000,'blank avatar '+mode);
    await page.screenshot({path:path.join(out,mode+'.png')});
  }
  assert(states.run.speed>states.walk.speed*1.6);assert.equal(states.jump.state,'airborne');assert(states.stairs.feet[1]>.7);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{fixture.reset();fixture.setView('front');fixture.input({KeyW:true,ShiftLeft:true});fixture.advance(60);});
  await page.screenshot({path:path.join(out,'mobile-run.png')});assert((await page.evaluate(()=>fixture.pixels()))>1000);
  await page.setViewportSize({width:1100,height:780});
  const video=await page.evaluate(()=>fixture.record());fs.writeFileSync(path.join(out,'motion.webm'),Buffer.from(video));
  await page.goto(url+'/motion.webm');const player=page.locator('video');await player.evaluate(v=>{v.muted=true;return v.play();});
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.5);
  const first=await player.evaluate(v=>v.getVideoPlaybackQuality().totalVideoFrames);await page.waitForTimeout(1200);
  const last=await player.evaluate(v=>({frames:v.getVideoPlaybackQuality().totalVideoFrames,time:v.currentTime,error:v.error?.message}));
  assert(last.frames>first);assert(!last.error);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({states,playback:last,errors},null,2));console.log(JSON.stringify({states,playback:last,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
