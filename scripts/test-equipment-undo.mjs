import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../kawaii-motion/node_modules/three/build/three.module.js';
const read=p=>fs.readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
test('equipment add records once and real undo/redo preserve mesh, original GLB and transforms',()=>{
 const asset=read('assets/equipment_models.html');
 const c=vm.createContext({THREE,console,Uint8Array,atob,scene:new THREE.Scene(),setTimeout,clearTimeout,
  document:{getElementById:id=>id==='equipment-assets'?{textContent:asset.slice(asset.indexOf('>')+1,asset.lastIndexOf('</script>'))}:null,addEventListener(){}},
  renderLayerList(){},renderTransformPanel(){},markDirty(){},_recountLayerActivity(){},selectLayer(){},showUndoToast(){},T:x=>x,
  _collectLayerSceneAttachments:()=>[],_detachLayerSceneAttachments(){}});c.window=c;
 const manager=read('js/240_layer_manager.js');
 vm.runInContext(manager.slice(0,manager.indexOf('// ── Layer duplication')),c);
 for(const name of ['230_global_undo_layer_ops_measurement_max_10.js','274_equipment_geometry.js','275_equipment_menu.js'])vm.runInContext(read('js/'+name),c);
 const L=c.addEquipmentLayer('hiace',new THREE.Vector3(3,0,7)),raw=L._rawBuffer,mesh=L.mesh;
 assert.equal(vm.runInContext('globalUndoStack.length',c),1);
 assert.throws(()=>c.addEquipmentLayer('invalid',new THREE.Vector3()));
 assert.equal(vm.runInContext('globalUndoStack.length',c),1,'failed add must not record');
 for(let i=0;i<2;i++){
  c.globalUndo();assert.equal(vm.runInContext('layers.length',c),0);assert.equal(mesh.parent,null);
  c.globalRedo();const restored=vm.runInContext('layers[0]',c);
  assert.equal(restored.mesh,mesh);assert.equal(restored._rawBuffer,raw);assert.equal(restored._rawExt,'glb');
  assert.deepEqual(restored.mesh.position.toArray(),[3,0,7]);assert.equal(restored.scale.x,1);
  assert.equal(vm.runInContext('globalUndoStack.length',c),1);
 }
});
