import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/310_zip_project_save_load_fflate.js', import.meta.url), 'utf8');
function setup() {
  const layers = [
    {id:1,name:'scan',type:'splat',pos:{x:1,y:2,z:3},rot:{y:90},size:{x:1,y:1,z:1},_streamUrl:'http://localhost/private.rad',_rawExt:'rad',_flipAxes:{x:true}},
    {id:2,name:'boundary',type:'path',pathPoints:[{x:1,y:0,z:1}],pathLabel:'Entrance',pathColor:'#ef4567',pathWidth:.5},
  ];
  const ctx = vm.createContext({console, layers, showUndoToast(){},T:x=>x, isMobile:false,
    _pathWidth:x=>x||.1, _pathLayerName:x=>x.split('\n')[0], _projectName:'Studio',camPos:{x:4,y:5,z:6},yaw:1,pitch:2,
    _initCamPos:{x:7,y:8,z:9},_initYaw:3,_initPitch:4,_layerNextId:3,
    _walkSaveSettings:()=>({height:1.7}),sun:{city:'tokyo'}});
  ctx.window=ctx; vm.runInContext(source,ctx);
  return ctx;
}
test('local checkpoint returns metadata without fetching or zipping unchanged assets', async()=>{
  const ctx=setup(); const seen=[];
  const project=await ctx.saveProjectZip(false,{localProject:{resolveAsset:async L=>{seen.push(L.id);return 'assets/a.rad';}}});
  assert.ok(project,'local serializer must return project or throw');
  assert.deepEqual(seen,[1]);
  assert.equal(project.layers[0].file,'assets/a.rad');
  assert.equal(project.layers[0].streamUrl,undefined);
  assert.equal(project.layers[0]._flipAxes.x,true);
  assert.equal(project.layers[1].pathWidth,.5);
  assert.equal(project.layers[1].pathColor,'#ef4567');
  assert.equal(project.cameraInit.yaw,3);
  assert.equal(project.walk.height,1.7);
});
test('local serialization propagates storage failure, never reports success',async()=>{
  const ctx=setup();
  await assert.rejects(()=>ctx.saveProjectZip(false,{localProject:{resolveAsset:async()=>{throw new Error('disk full');}}}),/disk full/);
});
test('concurrent local saves reject instead of silently returning undefined',async()=>{
  const ctx=setup(); let release;
  const first=ctx.saveProjectZip(false,{localProject:{resolveAsset:()=>new Promise(r=>{release=r;})}});
  await assert.rejects(()=>ctx.saveProjectZip(false,{localProject:{resolveAsset:async()=>''}}),/progress|saving/i);
  release('assets/a.rad'); await first;
});
test('unsupported camera layers fail explicitly instead of silently dropping savedPose',async()=>{
  const ctx=setup();ctx.layers.push({id:3,type:'camera',savedPose:{fov:30}});
  await assert.rejects(()=>ctx.saveProjectZip(false,{localProject:{resolveAsset:async()=> 'assets/a.rad'}}),/camera/);
});
