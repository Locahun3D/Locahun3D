import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = name => readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(r => setTimeout(r, 5));
function harness(beforeBridge) {
  const ready=deferred(), cores=[], sizes=[], toasts=[], samples=[];
  const mesh={initialized:ready.promise, matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}, updateWorldMatrix(){}};
  const context=vm.createContext({
    console, setTimeout, clearTimeout, setInterval:()=>1, clearInterval(){}, performance,
    THREE:{Vector3:class {}},
    layers:[{id:1,type:'splat',visible:true,mesh}],
    camPos:{x:0,y:2,z:0}, yaw:0, walkMode:{active:false},
    document:{getElementById:()=>null}, scene:{add(){},remove(){}},
    markDirty(){}, showUndoToast:m=>toasts.push(m),
    _acCollectSplatPoints(){samples.push(true);return {points:new Float32Array([0,0,0, .05,0,.05]),count:2,meshes:1};},
    LocahunWalkCollision:{
      refineLocal(points,boxes){return {boxes,region:null};},
      voxelize(points,opts){sizes.push(opts.cellSize);return [{center:[0,-.1,0],half:[2,.1,2]}];},
      async create(){const c={disposed:false,builds:[],rebuild(x){this.builds.push(x);},dispose(){this.disposed=true;},isCapsuleClear(){return true;},raycast(o,d,max){return d.y===-1&&o.y>=0&&o.y<=max?o.y:null;},setCharacter(p){this.feet={...p};}};cores.push(c);return c;},
    },
  });
  context.window=context;
  if(beforeBridge)beforeBridge(context);
  for(const name of ['216_walk_settings.js','217_walk_collision_bridge.js'])vm.runInContext(source(name),context,{filename:name});
  return {context,ready,cores,sizes,toasts,samples,run:s=>vm.runInContext(s,context)};
}

test('import permits a new bake without choosing a saved spawn', async()=>{
 const h=harness();
 h.run('_walkGenerateCollision=options=>Promise.resolve(options)');
 const options=await h.run('_walkAutoImport()');
 assert.equal(options.allowBake,true);
 assert.equal(options.findSpawn,false);
});

test('current camera spawn ignores saved spawn and never looks above the camera',()=>{
 const h=harness();
 h.run(`walkSetup.settings.spawn={x:20,y:10,z:20};camPos={x:2,y:4.8,z:3};
 walkSetup.core={raycast(o,d,max){return o.y>=3&&o.y-3<=max?o.y-3:null;},isCapsuleClear(p,height){return height<=1;}};`);
 const spawn=h.run('_walkCameraSpawnPosition()');
 assert.deepEqual(plain(spawn),{x:2,y:3.05,z:3});
 h.run('walkSetup.core.raycast=()=>null');
 assert.throws(()=>h.run('_walkCameraSpawnPosition()'));
});

test('import waits for Spark, automatically builds, and a walk request joins that job', {timeout:3000}, async () => {
  const h=harness();
  const automatic=h.run('_walkAutoImport()');
  const walking=h.run('_walkPrepareCollision()');
  await tick();
  assert.equal(h.samples.length,0,'must not sample before initialized');
  h.ready.resolve();
  assert.equal(await automatic,true);
  await walking;
  assert.equal(h.cores.length,1,'walk must share the automatic generation');
  assert.ok(h.run('walkSetup.settings.boxes.length')>0);
});
test('failed automatic refinement retains the valid old collision signature and core',async()=>{
 const h=harness();h.ready.resolve();assert.equal(await h.run('_walkAutoImport()'),true);
 const old=h.run('walkSetup.core'),signature=h.run('walkSetup.settings.signature');
 h.context.LocahunWalkCollision.create=async()=>{throw new Error('replacement fixture failure');};
 assert.equal(await h.run('_walkGenerateCollision({automatic:true})'),false);
 assert.equal(h.run('walkSetup.core'),old);assert.equal(old.disposed,false);
 assert.equal(h.run('walkSetup.settings.signature'),signature);
});
test('legacy splat collision is regenerated once while mesh-only signature stays compatible',async()=>{
 const h=harness();h.ready.resolve();await h.run('_walkAutoImport()');
 const parts=JSON.parse(h.run('_walkSourceSignature()'));
 const legacy=JSON.stringify(typeof parts[0]==='string'?parts.slice(1):parts);
 h.context.legacySignature=legacy;h.run('walkSetup.settings.signature=legacySignature');
 const count=h.samples.length;await h.run('_walkAutoImport()');
 assert.ok(h.samples.length>count,'legacy coarse proxies must not take the reuse fast path');
 const updated=h.samples.length;await h.run('_walkAutoImport()');assert.equal(h.samples.length,updated);
 h.run('walkSetup.settings.meshOnly=true');assert.equal(JSON.parse(h.run('_walkSourceSignature()'))[0],true);
});

test('published v2 collision regenerates into v3 once and keeps manual mesh-only format',async()=>{
 const h=harness();h.ready.resolve();await h.run('_walkAutoImport()');
 const parts=JSON.parse(h.run('_walkSourceSignature()'));assert.equal(parts[0],'walk-stair-detail-v3');
 parts[0]='walk-stair-detail-v2';h.context.publishedV2=JSON.stringify(parts);h.run('walkSetup.settings.signature=publishedV2');
 const before=h.samples.length;await h.run('_walkAutoImport()');assert.ok(h.samples.length>before);
 const current=h.samples.length;await h.run('_walkAutoImport()');assert.equal(h.samples.length,current);
 h.run('walkSetup.settings.meshOnly=true');assert.equal(JSON.parse(h.run('_walkSourceSignature()'))[0],true);
});

test('occupancy overflow coarsens automatically and persists the effective resolution', {timeout:3000}, async () => {
  const h=harness(); h.ready.resolve();
  h.context.LocahunWalkCollision.voxelize=(p,o)=>{
    h.sizes.push(o.cellSize);
    if(o.cellSize<.5)throw new RangeError('Walk collision: maxCells (30000) exceeded after minPoints filtering.');
    return [{center:[0,0,0],half:[.25,.25,.25]}];
  };
  assert.equal(await h.run('_walkAutoImport()'),true);
  assert.ok(h.sizes.length>1);
  assert.ok(h.run('_walkSaveSettings().effectiveCellSize')>=.5);
  assert.equal(h.toasts.length,0,'recoverable capacity overflow is not a user failure');
});

test('replacing a project cancels an unresolved import without blocking the next one', {timeout:3000}, async () => {
  const h=harness();
  const old=h.run('_walkAutoImport()');
  await tick();
  h.run('_walkRestoreSettings(null)');
  assert.equal(await old,false);
  h.context.layers[0].mesh.initialized=Promise.resolve();
  assert.equal(await h.run('_walkAutoImport()'),true);
  h.ready.resolve();await tick();
  assert.equal(h.cores.length,1,'old initialization must not publish a second core');
});

test('Spark failure is visible and a later explicit walk can retry', {timeout:3000}, async () => {
  const h=harness();
  const pending=h.run('_walkAutoImport()');
  h.ready.reject(new Error('decode fixture failed'));
  assert.equal(await pending,false);
  assert.match(h.run('walkSetup.status'),/decode fixture failed/);
  assert.ok(h.toasts.some(m=>m.includes('decode fixture failed')));
  h.context.layers[0].mesh.initialized=Promise.resolve();
  await h.run('_walkPrepareCollision()');
  assert.equal(h.cores.length,1);
});

test('automatic placement uses a spawn candidate without moving the visible camera', {timeout:3000}, async () => {
  const h=harness(); h.ready.resolve();
  h.context.camPos={x:0,y:80,z:0};
  h.context.computeAutoInitialView=()=>({position:{x:0,y:2,z:0},yaw:0,failed:false});
  const before=plain(h.context.camPos);
  assert.equal(await h.run('_walkGenerateCollision({findSpawn:true})'),true);
  assert.deepEqual(plain(h.context.camPos),before);
  assert.ok(h.run('_walkSpawnPosition().y')<1,'spawn should be on collision floor, not at overview camera height');
  assert.ok(h.run('_walkSaveSettings().region.center.y')<10);
});

test('camera movement and layer edits schedule a fresh local region', {timeout:3000}, async () => {
  const h=harness(); h.ready.resolve();
  assert.equal(await h.run('_walkAutoImport()'),true);
  h.context.camPos.x=7;
  await h.run('_walkAutoTick()');
  assert.equal(h.cores.length,2);
  assert.equal(h.run('walkSetup.settings.region.center.x'),7);
  h.context.layers[0].mesh.matrixWorld.elements[12]=2;
  await h.run('_walkAutoTick()');
  assert.equal(h.cores.length,3);
});

test('walking stops before leaving the generated region and requests extension', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();
  await h.run('_walkAutoImport()');
  let moves=0;
  h.cores[0].move=()=>{moves++;throw new Error('must not move outside coverage');};
  const avatar={position:{x:11.5,y:0,z:0}};
  h.context.avatar=avatar;
  Object.assign(h.context.walkMode,{active:true,avatar,groundOffset:0,height:1.7,bodyRadius:.22,velocity:{y:0}});
  h.run('_walkCollisionAdvance(avatar,.05,2,0,false)');
  assert.equal(moves,0);
  assert.equal(h.context.walkMode.active,true,'pause movement rather than dropping the walking mode');
  await h.run('walkSetup.pending');
  assert.equal(h.cores.length,2);
  assert.equal(h.cores[1].feet.x,11.5,'new core must retain the current character');
});

test('source edits while Rapier loads cannot publish stale proxies', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();
  const created=deferred(), called=deferred();
  const core={disposed:false,rebuild(){},dispose(){this.disposed=true;}};
  h.context.LocahunWalkCollision.create=()=>{called.resolve();return created.promise;};
  const pending=h.run('_walkAutoImport()');await called.promise;
  h.context.layers[0].mesh.matrixWorld.elements[12]=3;
  created.resolve(core);
  assert.equal(await pending,false);
  assert.equal(core.disposed,true);
  assert.equal(h.run('walkSetup.core'),null);
});

test('RAD root-only data is not accepted and cancellation releases the readiness wait', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();
  h.context.layers[0].mesh.paged={numSplats:1};
  const pending=h.run('_walkAutoImport()');await tick();await tick();
  assert.equal(h.cores.length,0,'one streamed root cannot become a usable collision region');
  h.run('_walkRestoreSettings(null)');
  assert.equal(await pending,false);
});

test('resident growth retries a failed RAD build but an unchanged failure does not spam', {timeout:8000}, async () => {
  const h=harness();h.ready.resolve();
  h.context.layers[0].mesh.paged={numSplats:1000};
  h.context.LocahunWalkCollision.voxelize=()=>{throw new Error('resident fixture incomplete');};
  assert.equal(await h.run('_walkAutoImport()'),false);
  const failures=h.toasts.length;
  await h.run('_walkAutoTick()');
  assert.equal(h.toasts.length,failures);
  h.context.layers[0].mesh.paged.numSplats=10000;
  h.context.LocahunWalkCollision.voxelize=()=>[{center:[0,0,0],half:[1,.1,1]}];
  assert.equal(await h.run('_walkAutoTick()'),true);
  assert.equal(h.cores.length,1);
});

test('late import hooks are ignored and matching saved proxies are reused', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();
  const oldEpoch=h.run('_walkBeginImport()');
  h.run('_walkRestoreSettings(null)');
  assert.equal(await h.run('_walkAutoImport('+oldEpoch+')'),false);
  assert.equal(h.cores.length,0);
  await h.run('_walkAutoImport()');
  const saved=plain(h.run('_walkSaveSettings()'));
  saved.spawn={x:0,y:.05,z:0};
  h.run('_walkRestoreSettings('+JSON.stringify(saved)+')');
  const calls=h.samples.length;
  assert.equal(await h.run('_walkAutoImport()'),true);
  assert.equal(h.samples.length,calls,'valid saved proxy should not be re-voxelized');
  assert.deepEqual(plain(h.run('_walkSaveSettings().spawn')),saved.spawn);
});

test('automatic spawn retains candidate yaw without applying it to the overview camera', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();
  h.context.camPos.y=80;
  h.context.computeAutoInitialView=()=>({position:{x:0,y:2,z:0},yaw:1.25});
  await h.run('_walkGenerateCollision({findSpawn:true})');
  assert.equal(h.context.yaw,0);
  assert.equal(h.run('_walkSpawnPosition().yaw'),1.25);
});

test('overview camera does not replace an automatic spawn region unless actually moved', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();h.context.camPos.y=80;
  h.context.computeAutoInitialView=()=>({position:{x:0,y:2,z:0},yaw:1});
  await h.run('_walkGenerateCollision({findSpawn:true})');
  await h.run('_walkAutoTick()');await h.run('_walkAutoTick()');
  assert.equal(h.cores.length,1);
  assert.equal(h.run('walkSetup.settings.region.center.y'),2);
});

test('capacity fallback stops at one metre and exposes failure without retry spam', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();
  h.context.LocahunWalkCollision.voxelize=(p,o)=>{h.sizes.push(o.cellSize);throw new RangeError('maxCells exceeded');};
  assert.equal(await h.run('_walkAutoImport()'),false);
  assert.ok(h.sizes.every(s=>s<=1));
  assert.match(h.run('walkSetup.status'),/1 m/);
  assert.equal(h.toasts.length,1);
  await h.run('_walkAutoTick()');assert.equal(h.toasts.length,1);
});

test('walk button shows background work while remaining clickable and clears busy on completion', {timeout:3000}, async t => {
  const h=harness();const attrs={};
  t.after(()=>h.run('_walkRestoreSettings(null)'));
  const button={dataset:{},title:'Walk',setAttribute:(k,v)=>{attrs[k]=v;}};
  const label={textContent:'Walk'};
  h.context.document.getElementById=id=>id==='btnAvatarWalk'?button:id==='lbl-walk'?label:null;
  const pending=h.run('_walkAutoImport()');
  assert.equal(attrs['aria-busy'],'true');
  assert.notEqual(label.textContent,'Walk');
  assert.notEqual(button.disabled,true);
  h.ready.resolve();await pending;
  assert.equal(attrs['aria-busy'],'false');assert.equal(label.textContent,'Walk');
});

test('saving before the first walk retains the automatically found spawn and yaw', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();h.context.camPos.y=80;
  h.context.computeAutoInitialView=()=>({position:{x:0,y:2,z:0},yaw:1.25});
  await h.run('_walkGenerateCollision({findSpawn:true})');
  const saved=plain(h.run('_walkSaveSettings()'));
  assert.ok(saved.spawn,'automatic spawn must survive saving without entering walk');
  assert.equal(saved.spawnYaw,1.25);
  h.run('_walkRestoreSettings('+JSON.stringify(saved)+')');
  await h.run('_walkAutoImport()');
  assert.equal(h.run('_walkSpawnPosition().yaw'),1.25);
});

test('failed automatic regeneration exits walking instead of using stale geometry', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();await h.run('_walkAutoImport()');
  let moves=0;h.cores[0].move=()=>{moves++;return {feet:{x:0,y:0,z:0},grounded:true};};
  h.context.avatar={position:{x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}}};
  Object.assign(h.context.walkMode,{active:true,avatar:h.context.avatar,velocity:{y:0},groundOffset:0});
  h.context._avatarWalkExit=()=>{h.context.walkMode.active=false;};
  h.run('walkSetup.settings.signature="";walkSetup.checkedAt=performance.now();walkSetup.failedKey=_walkRequestKey()');
  h.run('_walkCollisionAdvance(avatar,.05,1,0,false)');
  assert.equal(moves,0);
  assert.equal(h.context.walkMode.active,false);
});

test('in-place replacement of a mesh cannot complete a job for the old mesh', {timeout:3000}, async () => {
  const h=harness();const pending=h.run('_walkAutoImport()');await tick();
  h.context.layers[0].mesh={...h.context.layers[0].mesh,initialized:Promise.resolve()};
  h.ready.resolve();
  assert.equal(await pending,false);assert.equal(h.cores.length,0);
});

test('URL and in-place reload observers schedule only current successful imports', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();
  const loaded=deferred();
  h.context.importer=async()=>{await loaded.promise;h.context.layers[0].mesh={...h.context.layers[0].mesh,initialized:Promise.resolve()};};
  h.run('var observed=_walkObserveImport(importer)');
  const pending=h.run('observed()');
  assert.ok(h.run('walkSetup.importPending'));
  loaded.resolve();await pending;await h.run('walkSetup.pending');
  assert.equal(h.cores.length,1);
  const old=deferred();h.context.importer2=async()=>{await old.promise;};
  const stale=h.run('_walkObserveImport(importer2)()');
  h.run('_walkRestoreSettings(null)');old.resolve();await stale;
  assert.equal(h.run('walkSetup.autoEnabled'),false);
});

test('paged initialization waits for resident stability rather than accepting early coarse points', {timeout:5000}, async () => {
  const h=harness();h.ready.resolve();h.context.layers[0].mesh.paged={numSplats:1000};
  const pending=h.run('_walkAutoImport()');
  await new Promise(r=>setTimeout(r,300));
  assert.equal(h.cores.length,0);
  h.context.layers[0].mesh.paged.numSplats=10000;
  await new Promise(r=>setTimeout(r,300));
  assert.equal(h.cores.length,0,'changed resident data must reset stabilization');
  assert.equal(await pending,true);
});

test('spawn rejects a tiny support and a low ceiling using actual collision queries', {timeout:5000}, async t => {
  const h=harness();
  vm.runInContext(source('215_walk_collision.js'),h.context);
  const rapier=await import('../vendor/rapier-walk/rapier.mjs');
  const core=await h.context.LocahunWalkCollision.create({rapier});
  t.after(()=>core.dispose());h.context.core=core;
  h.run('walkSetup.core=core;walkMode.height=1.7;walkMode.bodyRadius=.22;walkSetup.settings.spawn={x:0,y:0,z:0}');
  core.rebuild({boxes:[{center:[0,-.1,0],half:[.02,.1,.02]}]});
  assert.throws(()=>h.run('_walkSpawnPosition()'));
  core.rebuild({boxes:[{center:[0,-.1,0],half:[5,.1,5]},{center:[0,.8,0],half:[5,.1,5]}]});
  assert.throws(()=>h.run('_walkSpawnPosition()'));
  core.rebuild({boxes:[{center:[0,-.1,0],half:[5,.1,5]}]});
  assert.ok(h.run('_walkSpawnPosition().y')<.1);
});

test('refined streamed geometry cannot replace the world with an embedded active character', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();await h.run('_walkAutoImport()');
  const old=h.cores[0], next={disposed:false,characters:0,rebuild(){},dispose(){this.disposed=true;},raycast(){return 0;},setCharacter(){this.characters++;}};
  h.context.LocahunWalkCollision.create=async()=>next;
  Object.assign(h.context.walkMode,{active:true,height:1.7,bodyRadius:.22,groundOffset:0,avatar:{position:{x:0,y:.05,z:0}}});
  assert.equal(await h.run('_walkGenerateCollision({automatic:true})'),false);
  assert.equal(h.run('walkSetup.core'),old);
  assert.equal(old.disposed,false);
  assert.equal(next.disposed,true);
  assert.equal(next.characters,0);
  assert.equal(h.run('walkSetup.settings.signature'),h.run('_walkSourceSignature()'));
});

test('active replacement commits vertical settling only after new character installation succeeds',async()=>{
 const h=harness();h.ready.resolve();await h.run('_walkAutoImport()');const old=h.cores[0];
 const position={x:2,y:.05,z:3};Object.assign(h.context.walkMode,{active:true,airborne:false,height:1.7,bodyRadius:.22,groundOffset:.01,avatar:{position}});
 let fail=true;const made=[];
 h.context.LocahunWalkCollision.create=async()=>{const n={rebuild(){},raycast(){return null;},dispose(){this.disposed=true;},
  reconcileFeet(p,height,radius,grounded){assert.equal(grounded,true);return {...p,y:.08};},
  setCharacter(p){assert.equal(position.y,.05);if(fail)throw new Error('install failure');this.feet=p;}};made.push(n);return n;};
 await assert.rejects(h.run('_walkInstallCore([{center:[0,0,0],half:[1,1,1]}])'),/install failure/);
 assert.equal(h.run('walkSetup.core'),old);assert.equal(old.disposed,false);assert.equal(made[0].disposed,true);
 assert.deepEqual(position,{x:2,y:.05,z:3});fail=false;
 await h.run('_walkInstallCore([{center:[0,0,0],half:[1,1,1]}])');
 assert.equal(old.disposed,true);assert.equal(position.x,2);assert.equal(position.z,3);assert.equal(position.y,.07);
});

test('walk entry prepares the current camera region without overwriting saved metadata', {timeout:3000}, async () => {
  const h=harness();h.ready.resolve();await h.run('_walkAutoImport()');
  h.run('walkSetup.settings.spawn={x:0,y:.05,z:0};walkSetup.settings.spawnYaw=1.25');
  h.context.camPos.x=20;
  h.context._acCollectSplatPoints=()=>({points:new Float32Array([0,0,0,.05,0,.05,20,0,0,20.05,0,.05]),count:4,meshes:1});
  await h.run('_walkAutoTick()');
  assert.deepEqual(plain(h.run('_walkSaveSettings().spawn')),{x:0,y:.05,z:0});
  assert.equal(h.run('_walkSaveSettings().spawnYaw'),1.25);
  await h.run('_walkPrepareCollision()');
  assert.equal(h.run('walkSetup.settings.region.center.x'),20);
  assert.equal(h.context.camPos.x,20);
});

test('cancelled real URL loader cannot feed late bytes into loadSplatFile', {timeout:3000}, async () => {
  const bytes=deferred();let imports=0;
  const h=harness(ctx=>{
    const code=source('292_demo_scene_showcase.js');
    ctx._fetchBinaryChunked=()=>bytes.promise;
    ctx._splatFileTypeFor=()=>undefined;
    ctx.loadSplatFile=async()=>{imports++;};
    ctx.File=File;
    ctx.console={warn(){},error(){}};
    vm.runInContext(code.slice(code.indexOf('async function loadFromURL('),code.indexOf('// Handle URL params')),ctx);
  });
  const pending=h.run('loadFromURL("https://example.test/old.ply")');
  h.run('_walkRestoreSettings(null)');bytes.resolve(new ArrayBuffer(1));await pending;
  assert.equal(imports,0,'old URL must not enter the new import epoch');
});

test('cancelled JSON file read never calls restoreProject', {timeout:3000}, async () => {
  const h=harness(), text=deferred();let restored=0;
  vm.runInContext(source('311_zip_load_core.js'),h.context);
  h.context.file={text:()=>text.promise};h.context.restoreProject=async()=>{restored++;};
  const pending=h.run('loadProject_fromFile(file)');
  h.run('_walkRestoreSettings(null)');text.resolve(JSON.stringify({version:4,layers:[]}));await pending;
  assert.equal(restored,0);
});

test('cancelled ZIP reattachment never restores the old scene', {timeout:3000}, async () => {
  const h=harness(), picked=deferred(), asked=deferred();let restored=0;
  vm.runInContext(source('311_zip_load_core.js'),h.context);
  Object.assign(h.context,{
    showLd(){},setMsg(){},setBar(){},hideLd(){},T:k=>k,
    getFflate:async()=>({unzipSync:()=>({'project.json':new TextEncoder().encode(JSON.stringify({version:4,layers:[{type:'splat',file:'old.ply'}]}))}),strFromU8:b=>new TextDecoder().decode(b)}),
    _readFileArrayBufferChunked:async()=>new ArrayBuffer(1),
    _promptFilesForReattach:()=>{asked.resolve();return picked.promise;},
    restoreProject:async()=>{restored++;},
  });
  const pending=h.run('_loadProjectZipFromFile({name:"old.zip"})');await asked.promise;
  h.run('_walkRestoreSettings(null)');picked.resolve([]);await pending;
  assert.equal(restored,0);
});

test('saved Rapier wall-contact pose can reenter without moving it away from the wall', {timeout:5000}, async t => {
  const h=harness();
  vm.runInContext(source('215_walk_collision.js'),h.context);
  const rapier=await import('../vendor/rapier-walk/rapier.mjs');
  const core=await h.context.LocahunWalkCollision.create({rapier});
  t.after(()=>core.dispose());h.context.core=core;
  core.rebuild({boxes:[{center:[0,-.1,0],half:[5,.1,5]},
    {center:[1.85,1.5,0],half:[.1,1.5,5]}]});
  core.setCharacter({x:0,y:.05,z:0},1.7,.22);
  let stopped;
  for(let i=0;i<180;i++)stopped=core.move({x:.03,y:-.01,z:0});
  assert.ok(stopped.grounded);
  assert.ok(stopped.feet.x>1.5 && stopped.feet.x<1.53,'must exercise actual wall contact');
  h.context.saved=stopped.feet;
  h.run('walkSetup.core=core;walkMode.height=1.7;walkMode.bodyRadius=.22;walkSetup.settings.spawn=saved;walkSetup.settings.spawnYaw=1.25');
  const spawn=h.run('_walkSpawnPosition()');
  assert.equal(spawn.x,stopped.feet.x);
  assert.equal(spawn.y,stopped.feet.y,'do not lift a valid saved pose into overhead geometry');
  assert.equal(spawn.yaw,1.25);
  h.run('walkSetup.settings.spawn={x:1.55,y:.01,z:0}');
  assert.throws(()=>h.run('_walkSpawnPosition()'),'real capsule penetration must still fail');
});

test('body clearance rejects a small obstacle between radial ray heights', {timeout:5000}, async t => {
  const h=harness();
  vm.runInContext(source('215_walk_collision.js'),h.context);
  const rapier=await import('../vendor/rapier-walk/rapier.mjs');
  const core=await h.context.LocahunWalkCollision.create({rapier});
  t.after(()=>core.dispose());h.context.core=core;
  core.rebuild({boxes:[{center:[0,-.1,0],half:[5,.1,5]},
    {center:[.08,.5,.16],half:[.015,.04,.015]}]});
  h.run('walkSetup.core=core;walkMode.height=1.7;walkMode.bodyRadius=.22;walkSetup.settings.spawn={x:0,y:.01,z:0}');
  assert.equal(h.run('_walkFeetClear(core,walkSetup.settings.spawn)'),false);
  assert.throws(()=>h.run('_walkSpawnPosition()'));
});

test('saved capsule with legal ceiling clearance is not rejected by inflated headroom rays', {timeout:5000}, async t => {
  const h=harness();
  vm.runInContext(source('215_walk_collision.js'),h.context);
  const rapier=await import('../vendor/rapier-walk/rapier.mjs');
  const core=await h.context.LocahunWalkCollision.create({rapier});
  t.after(()=>core.dispose());h.context.core=core;
  core.rebuild({boxes:[{center:[0,-.1,0],half:[5,.1,5]},
    {center:[0,1.82,0],half:[5,.1,5]}]});
  h.run('walkSetup.core=core;walkMode.height=1.7;walkMode.bodyRadius=.22;walkSetup.settings.spawn={x:0,y:.01,z:0}');
  assert.equal(h.run('_walkSpawnPosition().y'),.01);
  core.rebuild({boxes:[{center:[0,-.1,0],half:[5,.1,5]},
    {center:[0,1.79,0],half:[5,.1,5]}]});
  assert.equal(h.run('_walkSpawnPosition().y'),.01,'head-only obstacles no longer reject lower-body clearance');
});
