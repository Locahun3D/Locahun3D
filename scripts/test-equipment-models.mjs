import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const THREE = require(process.env.THREE_TEST_MODULE || '../../../kawaii-motion/node_modules/three/build/three.cjs');
const read = name => {
  const path = new URL('../src/' + name, import.meta.url);
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
};
const ctx = vm.createContext({ console });
vm.runInContext(read('js/274_equipment_geometry.js'), ctx);
const expected = [
  ['hiace', 1.695, 1.98, 4.695], ['truck2t', 1.695, 1.965, 4.69],
  ['truck4t', 2.47, 2.55, 8.485],
];
test('six equipment choices build finite lightweight geometry with feet at zero', () => {
  assert(ctx.LocahunEquipment, 'equipment geometry is available');
  const ids = Array.from(ctx.LocahunEquipment.catalog, item => item.id);
  assert.deepEqual(ids, ['hiace', 'truck2t', 'truck4t', 'jib', 'scorpio', 'lightstand']);
  for (const id of ids) {
    const root = ctx.LocahunEquipment.build(THREE, id);
    const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
    assert(Math.abs(bounds.min.y) < .001, id + ': ground-contact origin');
    assert(size.x > .1 && size.y > .5 && size.z > .1, id + ': nonblank geometry');
    let triangles = 0, meshes = 0;
    root.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      assert(o.geometry.attributes.position.array.every(Number.isFinite));
      triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
    });
    assert(triangles < 12000 && meshes < 100, id + ': bounded geometry');
    const again = ctx.LocahunEquipment.build(THREE, id);
    assert.notEqual(root.children[0].geometry, again.children[0].geometry, 'placements own their resources');
  }
});
test('vehicle bodies retain selected manufacturer dimensions, not normalized import size', () => {
  assert(ctx.LocahunEquipment, 'equipment geometry is available');
  for (const [id, x, y, z] of expected) {
    const root=ctx.LocahunEquipment.build(THREE,id);
    for(const child of [...root.children])if(child.userData.mirror)root.remove(child);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    for (const axis of ['x', 'y', 'z']) assert(Math.abs(size[axis] - ({ x, y, z })[axis]) < .001, id + ' ' + axis);
  }
});
test('Japanese vehicles have external mirrors and trucks have dual rear wheels',()=>{
  for(const [id] of expected){
    const root=ctx.LocahunEquipment.build(THREE,id);
    assert.equal(root.children.filter(p=>p.name==='mirror-housing').length,2);
    assert(root.getObjectByName('door-seam'));
    if(id!=='hiace')assert.equal(root.children.filter(p=>p.name==='tire').length,6);
  }
});
test('HiAce wheel-arch outline is simple and windshield follows the body surface', () => {
  const root=ctx.LocahunEquipment.build(THREE,'hiace');root.updateMatrixWorld(true);
  const body=root.getObjectByName('van-body'), glass=root.getObjectByName('windshield');
  const points=body.geometry.parameters.shapes.getPoints();
  if(points[0].equals(points.at(-1)))points.pop();
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++) {
    if(i===0&&j===points.length-1)continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
    assert(!(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0),'self-intersecting body/arch outline');
  }
  for(const y of [1.25,1.52,1.78]) {
    const ray=new THREE.Raycaster(new THREE.Vector3(0,y,4),new THREE.Vector3(0,0,-1));
    const skin=ray.intersectObject(body)[0],pane=ray.intersectObject(glass)[0];
    assert(skin&&pane,'both body and windshield cover the sampled point');
    assert(skin.distance-pane.distance>=0&&skin.distance-pane.distance<.006,'windshield is seated within 6mm of body');
  }
});
test('crane poses and stand extension match their documented representative setup', () => {
  assert(ctx.LocahunEquipment, 'equipment geometry is available');
  const jib = ctx.LocahunEquipment.build(THREE, 'jib');
  assert(Math.abs(jib.getObjectByName('camera-mount').position.z - 2.12) < .001);
  const scorpio = ctx.LocahunEquipment.build(THREE, 'scorpio');
  assert(Math.abs(scorpio.getObjectByName('camera-mount').position.z - 7.16) < .001);
  const stand = new THREE.Box3().setFromObject(ctx.LocahunEquipment.build(THREE, 'lightstand'));
  assert(Math.abs(stand.max.y - 3.66) < .001);
  assert.throws(() => ctx.LocahunEquipment.build(THREE, 'unknown'), /Unknown equipment/);
});

test('Japanese cab-over proxies expose grille slats, wipers and plate within the mesh budget',()=>{
  for(const [id] of expected){
    const root=ctx.LocahunEquipment.build(THREE,id);
    for(const name of ['grille-slats','windshield-wipers','number-plate'])assert(root.getObjectByName(name),id+': '+name);
    let meshes=0;root.traverse(o=>{if(o.isMesh)meshes++;});
    assert(meshes<100);
  }
});
test('place equipment at the requested position with persistent owned GLB bytes', () => {
  assert(ctx.LocahunEquipment, 'equipment geometry is available');
  const assetText = read('assets/equipment_models.html');
  assert(assetText, 'embedded assets are available');
  const assetJson = assetText.slice(assetText.indexOf('>') + 1, assetText.lastIndexOf('</script>'));
  const scene = new THREE.Scene(), layers = [];
  const c = vm.createContext({ THREE, console, Uint8Array, atob,
    LocahunEquipment: ctx.LocahunEquipment, layers, scene, markDirty() {},pushGlobalUndo(){},
    document: { getElementById: id => id === 'equipment-assets' ? { textContent: assetJson } : null,
      addEventListener() {} },
    addLayer(opts) { const L = { ...opts, id: layers.length + 1 }; layers.push(L); scene.add(L.mesh); return L; },
    selectLayer(id) { c.selected = id; },
  });
  c.window = c;
  vm.runInContext(read('js/275_equipment_menu.js'), c);
  assert.equal(typeof c.addEquipmentLayer, 'function');
  const L = c.addEquipmentLayer('hiace', new THREE.Vector3(3, 4, 5));
  assert.equal(L.type, 'obj');
  assert.deepEqual(L.mesh.position.toArray(), [3, 4, 5]);
  assert.equal(c.selected, L.id);
  assert.equal(L._rawExt, 'glb');
  assert.equal(new DataView(L._rawBuffer).getUint32(0, true), 0x46546c67);
  assert.equal(L.objOpacity, 1);
  assert.equal(L.objColor, null);
  assert.throws(() => c.addEquipmentLayer('bad', new THREE.Vector3()), /Unknown equipment/);
  assert.equal(layers.length, 1);
});
test('shared placement dispatch confirms equipment once, rejects empty picks, and retains cube placement',()=>{
  const added=[],c=vm.createContext({THREE,console,addEventListener(){},
    document:{getElementById:()=>null,addEventListener(){},removeEventListener(){}},markDirty(){},
    pickWorldPos:(x,y,options)=>{c.pickOptions=options;return c.pick;},addEquipmentLayer:(id,p)=>added.push([id,p.toArray()]),addCubeLayer:p=>added.push(['cube',p.toArray()]),
  });c.window=c;
  vm.runInContext(read('js/350_path_object_4_point_closed_region_center.js'),c);
  vm.runInContext(read('js/351_equipment_placement.js'),c);
  c.pick=new THREE.Vector3(1,2,3);
  vm.runInContext('_placeMode="equipment:hiace";_commitPlace(20,30);_commitPlace(20,30)',c);
  assert.deepEqual(added,[['hiace',[1,2,3]]]);
  assert.equal(vm.runInContext('_placeMode',c),null);
  c.pick=null;vm.runInContext('_placeMode="equipment:truck2t";_commitPlace(20,30)',c);assert.equal(added.length,1);
  assert.equal(c.pickOptions.groundFallback,true);
  c.pick=new THREE.Vector3(4,5,6);vm.runInContext('_placeMode="cube";_commitPlace(20,30)',c);
  assert.deepEqual(added[1],['cube',[4,5,6]]);
});

test('equipment preview and commit share options and invalid preview hides without cancelling aim',()=>{
 const options=[],scene=new THREE.Scene(),added=[];
 const c=vm.createContext({THREE,scene,console,addEventListener(){},markDirty(){},
  document:{getElementById:()=>null,addEventListener(){},removeEventListener(){}},
  pickWorldPos:(x,y,o)=>{options.push(o);return c.pick;},addEquipmentLayer:(id,p)=>added.push(p.toArray())});c.window=c;
 vm.runInContext(read('js/350_path_object_4_point_closed_region_center.js'),c);
 vm.runInContext(read('js/351_equipment_placement.js'),c);
 c.pick=new THREE.Vector3(2,0,4);
 vm.runInContext('_placeMode="equipment:hiace";_placeProbing=true;_placeUpdateProbe(20,30)',c);
 assert.equal(options.at(-1)?.groundFallback,true);
 assert.deepEqual(scene.children[0].position.toArray(),[2,0,4]);
 c.pick=null;c._placeUpdateProbe(20,30);
 assert.equal(scene.children[0].visible,false);
 assert.equal(vm.runInContext('_placeProbing',c),true,'aim can recover before release');
 c.pick=new THREE.Vector3(3,0,5);c._placeUpdateProbe(20,30);
 assert.equal(scene.children[0].visible,true);
 vm.runInContext('_commitPlace(20,30)',c);
 assert.deepEqual(options.at(-1),options.at(-2));assert.deepEqual(added,[[3,0,5]]);
 assert.equal(scene.children.length,0,'confirmation disposes preview');
 vm.runInContext('_placeMode="cube";_placeUpdateProbe(20,30)',c);
 assert.equal(options.at(-1),undefined,'legacy preview keeps default picking');
 c._placeHideProbe();
});

test('equipment ground fallback hits Y0, rejects sky, preserves real scan and legacy depth',()=>{
 const camera=new THREE.PerspectiveCamera(60,1,.1,100);camera.position.set(0,2,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const c=vm.createContext({THREE,console,camera,canvas:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},
  innerHeight:100,fov:60,_useOrtho:false,_v2:new THREE.Vector2(),_ray:new THREE.Raycaster(),layers:[],msr:{placeDepth:3},_pickMat:new THREE.Matrix4()});c.window=c;
 const source=read('js/090_layer_pivot_gizmo_xyz_xz_handle_for_sele.js');
 vm.runInContext(source.slice(source.indexOf('function pickWorldPos('),source.indexOf('function updateMeasureLine(')),c);
 const ground=c.pickWorldPos(50,50,{groundFallback:true});assert(Math.abs(ground.y)<1e-8);assert(Math.abs(ground.z)<1e-6);
 assert(c.pickWorldPos(50,50).y>0,'legacy fixed depth preserved');
 camera.lookAt(0,3,0);camera.updateMatrixWorld();assert.equal(c.pickWorldPos(50,50,{groundFallback:true}),null);
 const mesh=new THREE.Object3D();mesh.raycast=(ray,hits)=>hits.push({distance:2,point:new THREE.Vector3(1,4,2),object:mesh});
 c.layers.push({type:'splat',visible:true,mesh});
 assert.deepEqual(c.pickWorldPos(50,50,{groundFallback:true}).toArray(),[1,4,2]);
});
