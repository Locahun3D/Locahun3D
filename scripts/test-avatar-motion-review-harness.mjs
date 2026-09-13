import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildMotionReviewSource,summarizeMotionTrace} from './review-avatar-motion-asset.mjs';
import {rawMotionHtml} from './review-avatar-raw-motion.mjs';

const base=fs.readFileSync(new URL('test-avatar-locomotion-browser.mjs',import.meta.url),'utf8');
const args={base,root:'F:/fixture',out:'F:/private/review',motionBytes:Buffer.from('synthetic-only')};
test('motion asset path is isolated from corrective morphs and production embeds',()=>{
  const source=buildMotionReviewSource(args);
  assert.match(source,/modelData:_b64ToArrayBuffer\(window.PRIVATE_MOTION_ASSET\)/);
  assert.match(source,/motionMode,'embedded'/);
  assert.doesNotMatch(source,/Elbow_R_|createElbowMorphDriver|male165_glb_b64/);
  assert.match(source,/headless:false/);
  assert.match(source,/browser\?\.close/);
  assert.match(source,/\[15,30,60\]/);
  assert.match(source,/keyboard.down/);
  assert.match(source,/\['side','front'\]/);
  assert.match(source,/applicationCameraY/);
  assert.match(source,/getVideoPlaybackQuality/);
  assert.match(source,/keyboard transition missing/);
  assert.match(source,/processedDt:motionProcessedDt/);
  assert.match(source,/summaryByProcessedTime/);
  assert.match(source,/nominalRunSpeed/);
  assert.match(source,/jumpTime:api.actions.jump.time/);
  assert.match(source,/jumpRate:api.actions.jump.getEffectiveTimeScale/);
  assert.match(source,/collisionSteps:motionCollisionSteps/);
  assert.match(source,/Stop -> Idle incomplete/);
  assert.match(source,/\['stop',3,\[\]\]/);
});
test('15fps input and clamped processed time produce explicitly different derivatives',()=>{
  const trace=[0,1,2].map(i=>({time:i/15,processedTime:i*.05,rootY:i*.1,hipsY:1+i*.1,headY:1.6+i*.1,cameraY:2+i*.1,applicationCameraY:3+i*.1}));
  const input=summarizeMotionTrace(trace,'time'),processed=summarizeMotionTrace(trace,'processedTime');
  assert.equal(input.timeBasis,'time');assert.equal(processed.timeBasis,'processedTime');
  assert.ok(Math.abs(input.rootY.maxAbsVelocity-1.5)<1e-10);
  assert.ok(Math.abs(processed.rootY.maxAbsVelocity-2)<1e-10);
});
test('generated node runner and expanded browser module parse without starting a browser',()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const source=buildMotionReviewSource({...args,root});
  const check=code=>{
    const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:code,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  };
  check(source);
  const prefix=source.slice(0,source.indexOf('const server=')).replace(/^import .*;\n/gm,'');
  const html=vm.runInNewContext(prefix+'\nhtml',{fs:{readFileSync:fs.readFileSync,mkdirSync(){}},path,assert,
    createRequire:()=>()=>({chromium:{}})});
  const module=html.split('<script type="module">')[1].split('</script>')[0];
  check(module);
});
test('changed shared fixture fails closed instead of running the wrong review',()=>{
  assert.throws(()=>buildMotionReviewSource({...args,base:base.replace('const states={};','const states = {};')}),/fixture changed/);
});
test('trace summary separates body motion from root movement and checks finite data',()=>{
  const trace=[0,1,2].map(i=>({time:i/30,rootY:i*.1,hipsY:1+i*.1,headY:1.6+i*.1,cameraY:2+i*.1,applicationCameraY:3+i*.1,state:'run'}));
  const result=summarizeMotionTrace(trace);
  assert.ok(result.hipsRelativeRoot.range<1e-12);
  assert.ok(Math.abs(result.rootY.maxAbsVelocity-3)<1e-10);
  assert.throws(()=>summarizeMotionTrace([{...trace[0],headY:NaN},trace[1]]),/Non-finite/);
  assert.throws(()=>summarizeMotionTrace([]),/at least two/);
  assert.throws(()=>summarizeMotionTrace([trace[0],trace[0]]),/time must increase/);
});
test('partial raw review parses real clips directly without fake stop or runtime fallback',()=>{
  const html=rawMotionHtml(Buffer.from('synthetic-only'));
  assert.doesNotMatch(html,/_buildKawaii|Stop_Locomotion|_makeKawaii/);
  assert.match(html,/gltf.animations/);
  const module=html.split('<script type="module">')[1].split('</script>')[0];
  const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:module,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
