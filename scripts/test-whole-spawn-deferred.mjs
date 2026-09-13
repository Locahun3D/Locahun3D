import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './collision-cache-bridge-fixture.mjs';

async function cameraFixture(savedSpawn=null){
  const warm=fixture(null);assert(await warm.run('_walkGenerateCollision({allowBake:true})'));
  const f=fixture(null),coverage=[];
  f.c.saved=JSON.parse(warm.run('JSON.stringify(walkSetup.settings.whole)'));
  f.run('walkSetup.settings.whole=saved');
  if(savedSpawn){f.c.savedSpawn=savedSpawn;f.run('walkSetup.settings.spawn=savedSpawn;walkSetup.settings.spawnYaw=.7');}
  f.c.scans=0;f.c.validations=0;
  f.c.computeAutoInitialView=()=>{f.c.scans++;return {position:{x:10,y:1,z:12},yaw:.5};};
  f.c.LocahunWalkCollision.create=async()=>{f.c.coreBuilds++;return {rebuild(){},setTileCoverage(index,bounds){coverage.push(bounds);},dispose(){}};};
  f.run('_walkSpawnPosition=()=>{validations++;return {...(walkSetup.settings.spawn||walkSetup.spawnCandidate||camPos),yaw:walkSetup.settings.spawnYaw??walkSetup.spawnYawCandidate};}');
  return {...f,coverage};
}
test('camera-only whole reuse skips spawn scan and keeps initial coverage around camera',async()=>{
  const f=await cameraFixture();assert(await f.run('_walkAutoImport()'));
  await f.run('_walkAutoTick()');
  assert.equal(f.c.scans,0);assert.equal(f.c.validations,0);assert.equal(f.c.coreBuilds,1);
  assert.equal(f.run('walkSetup.settings.spawn'),null);
  assert.equal(f.c.camPos.x,0);assert.equal(f.c.camPos.y,2);
  assert.deepEqual(Array.from(f.coverage[0].min),[-3,-20,-3]);
});
test('first explicit entry scans once using ready core and persists verified spawn and yaw',async()=>{
  const f=await cameraFixture();assert(await f.run('_walkAutoImport()'));
  const core=f.run('walkSetup.core'),index=f.run('walkSetup.wholeIndex');
  f.c.LocahunWholeCollision.decodeTiles=()=>{throw Error('Unexpected proxy decode');};
  await f.run('_walkPrepareCollision()');
  assert.equal(f.c.scans,1);assert.equal(f.c.validations,1);assert.equal(f.c.coreBuilds,1);assert.equal(f.c.bakes,0);
  assert.equal(f.run('walkSetup.core'),core);assert.equal(f.run('walkSetup.wholeIndex'),index);
  assert.equal(f.run('walkSetup.settings.spawn.x'),10);assert.equal(f.run('walkSetup.settings.spawnYaw'),.5);
  assert.equal(f.c.camPos.x,0);assert.equal(f.c.walkMode.active,false);
  await f.run('_walkPrepareCollision()');assert.equal(f.c.scans,1);
});
test('saved distant spawn and yaw survive camera preparation with no scan or camera recenter',async()=>{
  const f=await cameraFixture({x:100,y:1,z:100});assert(await f.run('_walkAutoImport()'));
  assert.deepEqual(Array.from(f.coverage[0].min),[-3,-20,-3]);
  await f.run('_walkPrepareCollision()');assert.equal(f.c.scans,0);
  assert.equal(f.run('walkSetup.settings.spawn.x'),100);assert.equal(f.run('walkSetup.settings.spawnYaw'),.7);assert.equal(f.c.camPos.x,0);
});
test('invalid floor never saves a deferred spawn or activates avatar',async()=>{
  const f=await cameraFixture();assert(await f.run('_walkAutoImport()'));
  f.run('_walkSpawnPosition=()=>{throw Error("No safe floor");}');
  await assert.rejects(f.run('_walkPrepareCollision()'),/No safe floor/);
  assert.equal(f.run('walkSetup.settings.spawn'),null);assert.equal(f.c.walkMode.active,false);
});
test('scene or source change during deferred scan never writes stale candidate or spawn',async()=>{
  for(const kind of ['scene','transform']){
    const f=await cameraFixture();assert(await f.run('_walkAutoImport()'));
    f.c.computeAutoInitialView=()=>{
      f.run(kind==='scene'?'_walkRestoreSettings(null)':'layers[0].mesh.matrixWorld.elements[12]=9');
      return {position:{x:10,y:1,z:12},yaw:.5};
    };
    await assert.rejects(f.run('_walkPrepareCollision()'));
    assert.equal(f.run('walkSetup.settings.spawn'),null);assert.equal(f.run('walkSetup.spawnCandidate'),null);assert.equal(f.c.validations,0);
  }
});
test('explicit generation still computes a spawn only once',async()=>{
  const f=await cameraFixture();assert(await f.run('_walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true})'));
  await f.run('_walkPrepareCollision()');assert.equal(f.c.scans,1);assert.equal(f.c.coreBuilds,1);
});
test('replacing whole core with mesh-only core clears deferred whole-spawn state',async()=>{
  const f=await cameraFixture();assert(await f.run('_walkAutoImport()'));
  assert.equal(f.run('walkSetup.wholeSpawnDeferred'),true);
  await f.run('_walkInstallCore([{center:[0,0,0],half:[1,1,1]}])');
  assert.equal(f.run('walkSetup.wholeSpawnDeferred'),false);
});
test('no automatic candidate still uses the existing validated fallback at explicit entry',async()=>{
  const f=await cameraFixture();assert(await f.run('_walkAutoImport()'));
  f.c.computeAutoInitialView=()=>{f.c.scans++;return {failed:true};};
  await f.run('_walkPrepareCollision()');
  assert.equal(f.c.validations,1);assert.equal(f.run('walkSetup.settings.spawn.x'),f.c.camPos.x);
  assert.equal(f.run('walkSetup.spawnCandidate'),null);assert.equal(f.c.coreBuilds,1);
});
