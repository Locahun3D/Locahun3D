import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../kawaii-motion/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../../kawaii-motion/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('real project serializer and restore preserve all six GLBs at scale one across two saves',async()=>{
  const text=read('assets/equipment_models.html'),assetText=text.slice(text.indexOf('>')+1,text.lastIndexOf('</script>'));
  const c=vm.createContext({THREE,GLTFLoader,console,Uint8Array,ArrayBuffer,Float32Array,atob,performance,
    scene:new THREE.Scene(),document:{getElementById:id=>id==='equipment-assets'?{textContent:assetText}:null,addEventListener(){}},
    markDirty(){},renderLayerList(){},renderTransformPanel(){},selectLayer(){},showUndoToast(){},pushGlobalUndo(){},T:x=>x,isMobile:false,
    _projectName:'Equipment',camPos:new THREE.Vector3(0,3,10),yaw:0,pitch:0,_initCamPos:new THREE.Vector3(0,3,10),_initYaw:0,_initPitch:0,
    sun:{city:'tokyo'},SUN_CITIES:{},_walkSaveSettings:()=>null,_walkRestoreSettings(){},walkSetup:{epoch:0},
    _walkBeginImport(){return ++c.walkSetup.epoch;},_walkAutoImport(){},_walkFailImport(){},
    _addonLoader:async()=>GLTFLoader,setObjOpacity(){},showHUD(){},hideDZ(){},
  });c.window=c;
  const layerSource=read('js/240_layer_manager.js');
  vm.runInContext(layerSource.slice(0,layerSource.indexOf('// ── Layer duplication')),c);
  vm.runInContext(layerSource.slice(layerSource.indexOf('function applyLayerTransform('),layerSource.indexOf('window.readTransformInputs=')),c);
  vm.runInContext(read('js/274_equipment_geometry.js')+'\n'+read('js/275_equipment_menu.js'),c);
  vm.runInContext(read('js/310_zip_project_save_load_fflate.js'),c);
  // Supply the real installed loader instead of the CDN import; restore code is otherwise unchanged.
  vm.runInContext(read('js/312_project_load_helpers.js').replace("await import('three/addons/loaders/GLTFLoader.js')",'({GLTFLoader:globalThis.GLTFLoader})'),c);
  const savedBytes=new Map(),ids=['hiace','truck2t','truck4t','jib','scorpio','lightstand'];
  const before=[];
  for(let i=0;i<ids.length;i++) {
    const L=c.addEquipmentLayer(ids[i],new THREE.Vector3(i*10,2,-3));
    const bounds=new THREE.Box3().setFromObject(L.mesh);before.push(bounds);
  }
  for(let cycle=0;cycle<2;cycle++) {
    const project=await c.saveProjectZip(false,{localProject:{resolveAsset:async L=>{
      const path='assets/'+L.id+'.glb';savedBytes.set(path,L._rawBuffer.slice(0));return path;
    }}});
    assert.equal(project.layers.length,6);
    const serialized=JSON.parse(JSON.stringify(project));
    for(const entry of serialized.layers){
      assert.deepEqual(entry.scale,{x:1,y:1,z:1});
      entry._buf=savedBytes.get(entry.file);entry._ext='glb';
    }
    await c.restoreProject(serialized,{strict:true});
    const restored=vm.runInContext('layers',c);
    for(let i=0;i<restored.length;i++) {
      const L=restored[i],box=new THREE.Box3().setFromObject(L.mesh);
      assert(box.min.distanceTo(before[i].min)<.0001&&box.max.distanceTo(before[i].max)<.0001,ids[i]+' original meters and placement');
      assert.equal(L._rawBuffer.byteLength,savedBytes.get('assets/'+L.id+'.glb').byteLength);
      assert.deepEqual(L.mesh.scale.toArray(),[1,1,1]);
    }
    const hiace=restored[0].mesh;
    const ray=new THREE.Raycaster(new THREE.Vector3(0,3.52,1),new THREE.Vector3(0,0,-1));
    const body=ray.intersectObject(hiace.getObjectByName('van-body'))[0];
    const glass=ray.intersectObject(hiace.getObjectByName('windshield'))[0];
    assert(body&&glass&&body.distance-glass.distance<.006,'saved windshield matches corrected source geometry');
  }
});
