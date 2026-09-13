import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export function summarizeMotionTrace(trace,timeBasis='time'){
  if(trace.length<2)throw new Error('Trace requires at least two samples');
  const channels=['rootY','hipsY','headY','cameraY','applicationCameraY'];
  for(const row of trace)for(const key of [timeBasis,...channels])if(!Number.isFinite(row[key]))throw new Error('Non-finite trace '+key);
  const result={timeBasis};
  for(const key of [...channels,'hipsRelativeRoot','headRelativeRoot']){
    const values=trace.map(r=>key==='hipsRelativeRoot'?r.hipsY-r.rootY:key==='headRelativeRoot'?r.headY-r.rootY:r[key]);
    let maxAbsVelocity=0,maxAbsAcceleration=0,previousVelocity;
    for(let i=1;i<values.length;i++){
      const dt=trace[i][timeBasis]-trace[i-1][timeBasis];
      if(!(dt>0))throw new Error('Trace time must increase');
      const velocity=(values[i]-values[i-1])/dt;
      maxAbsVelocity=Math.max(maxAbsVelocity,Math.abs(velocity));
      if(previousVelocity!==undefined)maxAbsAcceleration=Math.max(maxAbsAcceleration,Math.abs(velocity-previousVelocity)/dt);
      previousVelocity=velocity;
    }
    result[key]={min:Math.min(...values),max:Math.max(...values),range:Math.max(...values)-Math.min(...values),maxAbsVelocity,maxAbsAcceleration};
  }
  return result;
}

export function buildMotionReviewSource({base,root,out,motionBytes}){
  let source=base.replace(/\r\n/g,'\n');
  function replace(before,after){
    if(!source.includes(before))throw new Error('Motion review fixture changed: '+before);
    source=source.replace(before,after);
  }
  replace("const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');",'const root='+JSON.stringify(root)+';');
  replace("const out=process.env.AVATAR_VERIFY_DIR||'F:/Codex/locahun-walk/verification/locomotion-2026-09-10';",'const out='+JSON.stringify(out)+';');
  replace("const source=n=>fs.readFileSync(path.join(root,'src/js',n),'utf8');",`const source=n=>{
    let code=fs.readFileSync(path.join(root,'src/js',n),'utf8');
    if(n==='219_collision_walk_update.js'){
      const anchor='dt=Math.min(.05,Math.max(0,dt));';
      assert(code.includes(anchor),'219 dt clamp changed; update trace instrumentation');
      code=code.replace(anchor,'motionCollisionSteps=[];motionInputDt=dt;'+anchor+'motionProcessedDt=dt;motionProcessedTime+=dt;');
    }
    if(n==='217_walk_collision_bridge.js'){
      const anchor='const result=core.move({x:dx*step,y:walkMode.velocity.y*step,z:dz*step},{requireSupport:walkMode.airborne});';
      assert(code.includes(anchor),'217 move changed; update trace instrumentation');
      code=code.replace(anchor,'const traceBefore=av.position.toArray();'+anchor+
        'motionCollisionSteps.push({before:traceBefore,requested:{x:dx*step,y:walkMode.velocity.y*step,z:dz*step},feet:{...result.feet},grounded:result.grounded,verticalSpeed:walkMode.velocity.y});');
    }
    return code;
  };`);
  replace("${fs.readFileSync(path.join(root,'src/assets/kawaii_walk_glb_b64.html'),'utf8')}",
    '<script>window.PRIVATE_MOTION_ASSET='+JSON.stringify(motionBytes.toString('base64'))+';</script>');
  replace('_buildKawaiiWalkAvatar(1.7)','_buildKawaiiWalkAvatar(1.65,{modelData:_b64ToArrayBuffer(window.PRIVATE_MOTION_ASSET)})');
  replace('walkSetup.core.setCharacter({x:0,y:.02,z:0},1.7,.22)','walkSetup.core.setCharacter({x:0,y:.02,z:0},1.65,.22)');
  replace("let auto=false,view='side'",`document.addEventListener('keydown',e=>{keys[e.code]=true;e.preventDefault();});
document.addEventListener('keyup',e=>{keys[e.code]=false;e.preventDefault();});
let auto=false,view='side'`);
  replace('function reset(stairs=false){','function reset(stairs=false){motionInputDt=0;motionProcessedDt=0;motionProcessedTime=0;');
  replace("let auto=false,view='side'","let motionInputDt=0,motionProcessedDt=0,motionProcessedTime=0,motionCollisionSteps=[];\nlet auto=false,view='side'");
  replace('window.fixture={reset,',`let recording=null,recordedFrames=[];
function sampleY(){
  walkMode.avatar.updateMatrixWorld(true);
  const api=walkMode.avatar.userData.kawaiiAnimation;
  const position=name=>{const bone=walkMode.avatar.getObjectByName(name);if(!bone)throw new Error('Missing trace bone '+name);return bone.getWorldPosition(new THREE.Vector3()).y;};
  return {time:clock,inputDt:motionInputDt,processedDt:motionProcessedDt,processedTime:motionProcessedTime,
    wallTime:performance.now()/1000,rootX:walkMode.avatar.position.x,rootZ:walkMode.avatar.position.z,
    rootY:walkMode.avatar.position.y,hipsY:position('Hips'),headY:position('Head'),
    cameraY:camera.position.y,applicationCameraY:camPos.y,speed:walkMode.actualSpeed,
    grounded:!walkMode.airborne,state:api.state,
    jumpTime:api.actions.jump.time,jumpRate:api.actions.jump.getEffectiveTimeScale(),
    jumpWeight:api.actions.jump.getEffectiveWeight(),jumpFlightSeconds:walkMode.jumpFlightSeconds,
    stopTime:api.actions.stop.time,stopWeight:api.actions.stop.getEffectiveWeight(),idleWeight:api.actions.idle.getEffectiveWeight(),
    commandedVelocity:{x:walkMode.moveX,z:walkMode.moveZ},verticalSpeed:walkMode.velocity.y,
    collisionSteps:motionCollisionSteps};
}
window.fixture={reset,
 info(){const api=walkMode.avatar.userData.kawaiiAnimation;return {motionMode:api.motionMode,source:api.source,motionSources:api.motionSources,nominalSpeed:api.nominalSpeed,nominalRunSpeed:api.nominalRunSpeed};},
 sampleY,
 advanceAt(fps){auto=false;step(1/fps);return sampleY();},
 startRecording(v){reset();view=v;draw();recordedFrames=[];const chunks=[],stream=renderer.domElement.captureStream(30),rec=new MediaRecorder(stream,{mimeType:'video/webm'});
   rec.ondataavailable=e=>chunks.push(e.data);recording={rec,stream,chunks};last=performance.now();auto=true;rec.start();},
 async stopRecording(){auto=false;const {rec,stream,chunks}=recording;await new Promise(r=>{rec.onstop=r;rec.stop();});stream.getTracks().forEach(t=>t.stop());recording=null;
   return {bytes:Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())),trace:recordedFrames};},`);
  replace('else _avatarWalkPostExit(dt);draw();}', 'else _avatarWalkPostExit(dt);draw();if(recording)recordedFrames.push(sampleY());}');
  // The base initializes reset/RAF before these declarations, but no step runs until ready.
  replace("else if(req.url==='/motion.webm')", "else if(/^\\/motion-(side|front)\\.webm$/.test(req.url))");
  replace("path.join(out,'motion.webm')", "path.join(out,req.url.slice(1))");
  replace("const browser=await chromium.launch({channel:'chrome',headless:true});\ntry{",
    "let browser;\ntry{\n  browser=await chromium.launch({channel:'chrome',headless:false});");
  replace('await browser.close();','await browser?.close();');
  replace('  const states={};',`  const assetInfo=await page.evaluate(()=>fixture.info());
  assert.equal(assetInfo.motionMode,'embedded','reject procedural fallback');
  const states={};`);
  const start=source.indexOf('  const video=await page.evaluate(()=>fixture.record());');
  const end=source.indexOf('\n}finally{',start);
  if(start<0||end<0)throw new Error('Motion review fixture changed: video runner');
  source=source.slice(0,start)+`
  const summarizeMotionTrace=${summarizeMotionTrace.toString()};
  const assetSha256=${JSON.stringify(createHash('sha256').update(motionBytes).digest('hex'))};
  const held=new Set();
  async function input(next){
    for(const key of [...held])if(!next.includes(key)){await page.keyboard.up(key);held.delete(key);}
    for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
  }
  const phases=[['idle',.5,[]],['walk',.8,['w']],['run',.8,['w','Shift']],
    ['jump',.1,['w','Shift','Space']],['air',.9,['w','Shift']],['landing',.2,['w','Shift']],['stop',3,[]]];
  const traces={};
  for(const fps of [15,30,60]){
    await input([]);await page.evaluate(()=>{fixture.reset();fixture.setView('side');fixture.advance(1);});
    const rows=[{...await page.evaluate(()=>fixture.sampleY()),phase:'initial'}];
    for(const [phase,seconds,keys] of phases){
      await input(keys);
      for(let i=0;i<Math.round(seconds*fps);i++)rows.push({...await page.evaluate(fps=>fixture.advanceAt(fps),fps),phase});
      await page.screenshot({path:path.join(out,'fps-'+fps+'-'+phase+'.png')});
    }
    for(const state of ['walk','run','airborne'])assert(rows.some(r=>r.state===state),'keyboard transition missing '+state+' at '+fps+'fps');
    assert(rows.at(-1).speed<.05,'keyboard release did not stop movement');
    assert(rows.at(-1).state==='idle'&&rows.at(-1).idleWeight>.99,'Stop -> Idle incomplete at '+fps+'fps');
    traces[fps]={samples:rows,summaryByInputTime:summarizeMotionTrace(rows),summaryByProcessedTime:summarizeMotionTrace(rows,'processedTime')};
  }
  await input([]);
  fs.writeFileSync(path.join(out,'fixed-step-y-traces.json'),JSON.stringify({assetSha256,units:'metres/seconds',
    limitation:'Fixed input dt, not a device FPS benchmark.219 caps processed dt at.05s:15fps advances movement/animation by.05s per.066667s input (75% time).Do not compare input-time speed/acceleration across FPS as equal simulation time.cameraY is diagnostic;applicationCameraY is actual follow-camera state.',traces},null,2));
  const recordings={};
  for(const view of ['side','front']){
    await page.evaluate(view=>fixture.startRecording(view),view);
    await page.waitForTimeout(300);
    await input(['w']);await page.waitForTimeout(800);
    await input(['w','Shift']);await page.waitForTimeout(800);
    await input(['w','Shift','Space']);await page.waitForTimeout(100);
    await input(['w','Shift']);await page.waitForTimeout(1000);
    await input([]);
    await page.waitForFunction(()=>{const s=fixture.sampleY();return s.state==='idle'&&s.idleWeight>.99;},{},{timeout:10000});
    await page.waitForTimeout(300);
    const result=await page.evaluate(()=>fixture.stopRecording());
    for(const state of ['walk','run','airborne'])assert(result.trace.some(r=>r.state===state),'recorded keyboard transition missing '+state);
    fs.writeFileSync(path.join(out,'motion-'+view+'.webm'),Buffer.from(result.bytes));
    recordings[view]={samples:result.trace,summaryByInputTime:summarizeMotionTrace(result.trace),
      summaryByProcessedTime:summarizeMotionTrace(result.trace,'processedTime'),summaryByWallTime:summarizeMotionTrace(result.trace,'wallTime')};
    await page.screenshot({path:path.join(out,'video-'+view+'-stop.png')});
  }
  fs.writeFileSync(path.join(out,'recordings.json'),JSON.stringify({assetInfo,states,recordings},null,2));
  const playback={};
  for(const view of ['side','front']){
    await page.goto(url+'/motion-'+view+'.webm');
    const player=page.locator('video');await player.evaluate(v=>{v.muted=true;return v.play();});
    await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.4);
    const first=await player.evaluate(v=>v.getVideoPlaybackQuality().totalVideoFrames);
    await page.waitForFunction(first=>document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames>first,first,{timeout:5000});
    playback[view]=await player.evaluate(v=>({frames:v.getVideoPlaybackQuality().totalVideoFrames,time:v.currentTime,error:v.error?.message}));
    assert(playback[view].frames>first);assert(!playback[view].error);
    await page.screenshot({path:path.join(out,'playback-'+view+'.png')});
  }
  assert.deepEqual(errors,[]);
  const report={assetSha256,assetInfo,states,recordings,playback,errors,
    visualAcceptance:'NOT automatic: inspect full-body, feet, shoulders/hands and play both videos before acceptance.',
    timingLimitation:'RAF caps input dt at40ms;219 additionally caps processing at50ms.Fixed-step15/30/60 bypass RAF cap ONLY,not219 cap.nominalSpeed/nominalRunSpeed are clip calibration;sample speed is actual movement per processed second,not wall speed.Use rootX/Z delta and explicit time basis for measured travel speed.'};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({assetSha256,assetInfo,playback,errors},null,2));`+source.slice(end);
  return source;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const asset=process.argv.find(a=>a.startsWith('--motion-asset='))?.slice(15);
  const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
  if(!asset||!out)throw new Error('Require --motion-asset=PRIVATE.glb --out=PRIVATE_DIRECTORY; reserve GPU before running');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const base=fs.readFileSync(new URL('test-avatar-locomotion-browser.mjs',import.meta.url),'utf8');
  let source=buildMotionReviewSource({base,root,out:path.resolve(out),motionBytes:fs.readFileSync(asset)});
  if(process.argv.includes('--headless'))source=source.replace('headless:false','headless:true');
  try{await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
