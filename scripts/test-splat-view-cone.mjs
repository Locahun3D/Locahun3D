import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const THREE=createRequire(import.meta.url)('../../../kawaii-motion/node_modules/three/build/three.cjs');
function setup(){
 const sr={coneFov0:90,coneFov:120,lodSplatCount:2500000,maxPagedSplats:16777216,onBeforeRender(){this.called=true;}};
 const c={THREE,sparkRenderer:sr};
 const file=new URL('../src/js/031_splat_view_cone.js',import.meta.url);
 vm.runInNewContext(fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',c);return sr;
}
test('detail cone includes every viewport corner for wide, portrait and offset cameras',()=>{
 for(const aspect of [1920/820,820/1180,390/844]){
  const camera=new THREE.PerspectiveCamera(90,aspect,.05,2000);
  for(const offset of [false,true]){
   if(offset)camera.setViewOffset(1920,1080,300,80,1400,850);
   const sr=setup();sr.onBeforeRender(null,null,camera);
   for(const x of [-1,1])for(const y of [-1,1]){
    const p=new THREE.Vector3(x,y,0).applyMatrix4(camera.projectionMatrixInverse);
    const angle=THREE.MathUtils.radToDeg(p.angleTo(new THREE.Vector3(0,0,-1)));
    assert.ok(sr.coneFov0/2>=angle,'visible corner must not be foveated');
   }
   assert.equal(sr.called,true);assert.equal(sr.lodSplatCount,2500000);assert.equal(sr.maxPagedSplats,16777216);
  }
 }
});
test('projection change invalidates LOD once, stable projection does not',()=>{
 const sr=setup(),camera=new THREE.PerspectiveCamera(90,2.3,.05,2000);
 sr.onBeforeRender(null,null,camera);assert.equal(sr.lodDirty,true);
 sr.lodDirty=false;sr.onBeforeRender(null,null,camera);assert.equal(sr.lodDirty,false);
 camera.zoom=2;camera.updateProjectionMatrix();sr.onBeforeRender(null,null,camera);assert.equal(sr.lodDirty,true);
});
test('camera-frame scissor pass keeps the wider context cone without repeated LOD invalidation',()=>{
 const sr=setup(),wide=new THREE.PerspectiveCamera(90,2.3,.05,2000),narrow=new THREE.PerspectiveCamera(45,1.5,.05,2000);
 sr.onBeforeRender({getScissorTest:()=>false},null,wide);const outer=sr.coneFov0;
 sr.lodDirty=false;
 for(let frame=0;frame<3;frame++){
  sr.onBeforeRender({getScissorTest:()=>true},null,narrow);
  sr.onBeforeRender({getScissorTest:()=>false},null,wide);
  assert.equal(sr.coneFov0,outer);assert.equal(sr.lodDirty,false);
 }
});
