import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
const read=n=>fs.readFileSync(new URL('../src/js/'+n,import.meta.url),'utf8');
function setup(height=1.7){
  const c={THREE,Event,console,window:{dispatchEvent(){}},document:{body:{classList:{remove(){},add(){}}},getElementById:()=>null},
    walkMode:{active:true,height,groundOffset:0,avatar:new THREE.Group(),velocity:new THREE.Vector3()},
    walkSetup:{epoch:0,core:{setCharacter(){}},settings:{}},camPos:new THREE.Vector3(),
    keys:{},joyDX:0,joyDY:0,yaw:0,pitch:0,camAnim:{playing:false},cam:{active:false},arMode:{active:false},
    markDirty(){},T:x=>x,showUndoToast(){},_refreshResetBtnLabel(){},_avatarResetBones(){},
    _walkPrepareCollision:async()=>{},_walkSpawnPosition:()=>({x:0,y:0,z:0}),
    scene:new THREE.Scene(),setCamRotImmediate(){}};
  vm.createContext(c);vm.runInContext(read('213_fly_camera_avatar_ground.js')+'\n'+read('219_collision_walk_update.js'),c);
  return c;
}
test('height-relative near hide and hysteresis leave physical camera unchanged',()=>{
  for(const height of [1.2,1.7,2.1]){
    const c=setup(height),av=c.walkMode.avatar;
    for(const [distance,visible] of [[2,true],[.6,false],[.75,false],[.9,true],[.75,true]]){
      c.camPos.set(0,height*.8,height*distance);const before=c.camPos.clone();
      c._avatarWalkCameraVisibility(av);
      assert.equal(av.visible,visible);assert.deepEqual(c.camPos,before);
    }
  }
});
test('normal exit and reenter reset hidden state; inactive helper never resurrects avatar',async()=>{
  const c=setup(),av=c.walkMode.avatar;c.camPos.set(0,1.36,.2);
  c._avatarWalkCameraVisibility(av);assert.equal(av.visible,false);
  c._avatarWalkExit();c.camPos.set(0,2,5);c._avatarWalkCameraVisibility(av);
  assert.equal(av.visible,false);
  await c._avatarWalkEnter();assert.equal(av.visible,true);
  c.camPos.set(0,1.36,1.7*.75);c._avatarWalkCameraVisibility(av);
  assert.equal(av.visible,true,'reentry resets hysteresis');
});
test('219 applies visibility only after collision, and can show a previously hidden avatar',()=>{
  const c=setup(),av=c.walkMode.avatar;
  Object.assign(c.walkMode,{speed:1,runMul:1.85,cameraDist:3.2,cameraHeight:2.55});
  c._readGamepadInput=()=>null;c._walkCollisionAdvance=()=>false;c._avatarUpdateAnimation=()=>{};
  c._walkCameraCollision=()=>c.camPos.set(0,1.36,.2);
  c._updateCollisionAvatarWalk(1/60);assert.equal(av.visible,false);
  assert.deepEqual(c.camPos.toArray(),[0,1.36,.2]);
  c._walkCameraCollision=()=>{};c._updateCollisionAvatarWalk(1/60);assert.equal(av.visible,true);
  assert.deepEqual(c.camPos.toArray(),[0,2.55,-3.2]);
});
test('real Chrome: same recorded RAD stair camera before/after, no project writes',
  {skip:process.env.CAMERA_NEAR_REAL!=='1',timeout:180000},async()=>{
  const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
  const {chromium}=require('playwright');
  const root=path.resolve(import.meta.dirname,'..');
  const project='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio';
  const previous='F:/Codex/locahun-walk/verification/real-rad-stair-headroom-2026-09-10';
  const out='F:/Codex/locahun-walk/verification/camera-near-avatar-2026-09-10';
  const sample=JSON.parse(fs.readFileSync(path.join(previous,'results.json'),'utf8')).samples[7];
  const url=JSON.parse(fs.readFileSync(path.join(project,'.local-project.lock'),'utf8')).url;
  const snapshot=()=>{
    const result={};
    function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())scan(file);
      else if(entry.isFile())result[path.relative(project,file)]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }}
    for(const name of ['project-state.json','history','assets']){
      const file=path.join(project,name);if(!fs.existsSync(file))continue;
      if(fs.statSync(file).isDirectory())scan(file);
      else result[name]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    return result;
  };
  const before=snapshot();fs.mkdirSync(out,{recursive:true});
  let html=fs.readFileSync(path.join(root,'src/template.html'),'utf8').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,f)=>fs.readFileSync(path.join(root,f),'utf8'));
  const hook=`window.__nearProbe={async prepare(){
    const s=${JSON.stringify(sample)};
    if(walkMode.active)_avatarWalkExit();
    const av=await _avatarBuild();scene.add(av);walkMode.avatar=av;
    av.position.set(...s.feet);av.rotation.y=s.yaw;av.visible=true;
    for(let i=0;i<60;i++)av.userData.kawaiiAnimation.update(1/60,.65,true);
    walkMode.groundOffset=0;walkMode.cameraNearHidden=false;
    camPos.set(...s.camera);setCamRotImmediate(s.yaw,s.pitch);
    layers.filter(l=>l.type==='path').forEach(l=>l.mesh.visible=false);
    markDirty(120);bumpSplatActive(10000);return this.state();
  },state(){return {camera:camPos.toArray(),yaw,pitch,visible:walkMode.avatar.visible,feet:walkMode.avatar.position.toArray()};},
  apply(){walkMode.active=true;_avatarWalkCameraVisibility(walkMode.avatar);walkMode.active=false;markDirty(120);return this.state();}};`;
  const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const report={writes:0,errors:[],method:'recorded walk-7 pose replay, exact same physical camera; not a new traversal'};
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror',e=>report.errors.push(e.message));
    await page.route('**/*',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){report.writes++;return r.abort();}return r.continue();});
    await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));
    await page.goto(url);await page.waitForFunction(()=>window.localProject?.ready,null,{timeout:120000});
    await page.waitForTimeout(12000);
    report.before=await page.evaluate(()=>__nearProbe.prepare());
    await page.waitForTimeout(4000);await page.screenshot({path:path.join(out,'before.png')});
    report.after=await page.evaluate(()=>__nearProbe.apply());
    await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,'after.png')});
    assert.equal(report.before.visible,true);assert.equal(report.after.visible,false);
    assert.deepEqual(report.after.camera,report.before.camera);
    assert.deepEqual(report.after.feet,report.before.feet);
    assert.equal(report.after.yaw,report.before.yaw);assert.equal(report.after.pitch,report.before.pitch);
    assert.equal(report.writes,0);assert.deepEqual(report.errors,[]);
  }finally{
    await browser.close();report.projectUnchanged=JSON.stringify(snapshot())===JSON.stringify(before);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
    assert.equal(report.projectUnchanged,true,'project, assets and history hashes unchanged');
  }
});
