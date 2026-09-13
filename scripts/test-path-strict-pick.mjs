import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const THREE=require(process.env.THREE_TEST_MODULE || '../../../kawaii-motion/node_modules/three/build/three.cjs');
const source=fs.readFileSync(new URL('../src/js/090_layer_pivot_gizmo_xyz_xz_handle_for_sele.js',import.meta.url),'utf8');
const pickSource=source.slice(source.indexOf('function pickWorldPos('),source.indexOf('function updateMeasureLine('));
function setup(points=[],hits=[],ortho=false){
  const camera=ortho?new THREE.OrthographicCamera(-5,5,3,-3,.3,100):new THREE.PerspectiveCamera(60,1000/600,.3,100);
  camera.updateMatrixWorld(true);
  const mesh=new THREE.Object3D();
  mesh.raycast=(_ray,output)=>{for(const point of hits)output.push({distance:point.length(),point,object:mesh});};
  const ctx=vm.createContext({THREE,camera,_orthoCamera:camera,_useOrtho:ortho,
    _v2:new THREE.Vector2(),_ray:new THREE.Raycaster(),innerHeight:600,fov:60,
    canvas:{getBoundingClientRect:()=>({left:40,top:20,width:1000,height:600})},
    layers:[{type:'splat',visible:true,mesh,_splatCache:new Float32Array(points.flat()),_splatCacheCount:points.length}],
    splatMesh:null,msr:{placeDepth:3},console});
  ctx.window=ctx;ctx.DEBUG_PICK=false;vm.runInContext(pickSource,ctx);
  return ctx;
}
const xyz=p=>[p.x,p.y,p.z];
test('strict path pick rejects near-camera off-ray cache point and accepts valid far point',()=>{
  const c=setup([[.1,0,-.1],[0,0,-5]]);
  assert.ok(c.pickWorldPos(540,320).z>-.2,'legacy mode is intentionally unchanged');
  assert.deepEqual(xyz(c.pickWorldPos(540,320,{strictVisible:true})),[0,0,-5]);
});
test('strict cache tolerance is CSS pixels, not 30cm at short distance',()=>{
  const c=setup([[.2,0,-1],[.1,0,-5]]);
  assert.equal(c.pickWorldPos(540,320).z,-1);
  const p=c.pickWorldPos(540,320,{strictVisible:true});
  assert.equal(p.z,-5); assert.ok(Math.abs(p.x-.1)<1e-6);
});
test('ray hits before near, beyond far, offscreen and outside pointer radius are skipped',()=>{
  for(const invalid of [new THREE.Vector3(0,0,-.1),new THREE.Vector3(0,0,-101),
    new THREE.Vector3(20,0,-1),new THREE.Vector3(.3,0,-1),new THREE.Vector3(0,0,1)]){
    const c=setup([], [invalid,new THREE.Vector3(0,0,-10)]);
    assert.deepEqual(xyz(c.pickWorldPos(540,320,{strictVisible:true})),[0,0,-10]);
  }
});
test('no visible candidates retains existing ray-depth fallback',()=>{
  const c=setup([[.1,0,-.1],[0,0,-150]], [new THREE.Vector3(0,0,-.1)]);
  assert.deepEqual(xyz(c.pickWorldPos(540,320,{strictVisible:true})),[0,0,-3]);
});
test('strict picking respects orthographic projection and viewport offsets',()=>{
  const c=setup([[.3,0,-1],[.1,0,-5]],[],true);
  const p=c.pickWorldPos(540,320,{strictVisible:true});
  assert.equal(p.z,-5); assert.ok(Math.abs(p.x-.1)<1e-6);
});
