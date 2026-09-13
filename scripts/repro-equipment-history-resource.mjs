// Diagnostic reproduction, not a correctness test or a GPU memory measurement.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from '../../../kawaii-motion/node_modules/three/build/three.module.js';
const read=p=>fs.readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const assets=read('assets/equipment_models.html');
const c=vm.createContext({THREE,console,Uint8Array,atob,scene:new THREE.Scene(),
 document:{getElementById:id=>id==='equipment-assets'?{textContent:assets.slice(assets.indexOf('>')+1,assets.lastIndexOf('</script>'))}:null,addEventListener(){}},
 renderLayerList(){},renderTransformPanel(){},markDirty(){},selectLayer(){},_recountLayerActivity(){},
 _isLayerLocked:()=>false,_collectLayerSceneAttachments:()=>[],_detachLayerSceneAttachments(){}});c.window=c;
vm.runInContext(read('js/230_global_undo_layer_ops_measurement_max_10.js'),c);
const manager=read('js/240_layer_manager.js');
vm.runInContext(manager.slice(0,manager.indexOf('// ── Layer duplication')),c);
vm.runInContext(manager.slice(manager.indexOf('window.removeLayer=function'),manager.indexOf('window.setLayerVisible=')),c);
for(const name of ['274_equipment_geometry.js','275_equipment_menu.js'])vm.runInContext(read('js/'+name),c);
let geometries=0,materials=0,disposed=0;
for(let i=0;i<25;i++){
 const L=c.addEquipmentLayer('hiace',new THREE.Vector3());
 L.mesh.traverse(o=>{
  if(o.geometry){geometries++;o.geometry.addEventListener('dispose',()=>disposed++);}
  if(o.material){materials++;o.material.addEventListener('dispose',()=>disposed++);}
 });
 const duplicate=L.mesh.clone(true);
 assert.equal(duplicate.children[0].geometry,L.mesh.children[0].geometry,'generic object clones share geometry');
 assert.equal(duplicate.children[0].material,L.mesh.children[0].material,'generic object clones share materials');
 c.removeLayer(L.id);
}
console.log(JSON.stringify({activeLayers:vm.runInContext('layers.length',c),undoEntries:vm.runInContext('globalUndoStack.length',c),geometries,materials,disposeEvents:disposed},null,2));
