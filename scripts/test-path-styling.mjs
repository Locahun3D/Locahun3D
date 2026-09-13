import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const THREE = require(process.env.THREE_TEST_MODULE || '../../../kawaii-motion/node_modules/three/build/three.cjs');
const read = name => fs.readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
function setup() {
  const draw = new Proxy({}, { get: (o, key) => key === 'measureText' ? text => ({ width: text.length * 30 }) : o[key] || (() => {}), set: (o, key, value) => (o[key] = value, true) });
  const elements = new Map();
  const document = { createElement: () => ({ style: {}, getContext: () => draw }),
    getElementById: id => elements.get(id), addEventListener() {}, removeEventListener() {},
    body: { appendChild: el => elements.set(el.id, el) } };
  const layers = [], scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
  const ctx = vm.createContext({ THREE, document, scene, camera, console, layers,
    canvas: { getBoundingClientRect: () => ({ height: 600, width: 600, left: 0, top: 0 }) },
    pick: new THREE.Vector3(0, 0, -5), pickWorldPos: () => ctx.pick,
    findLayer: id => layers.find(l => l.id === id), markDirty() {},
    selectedLayerId: null, addEventListener() {} });
  ctx.window = ctx;
  vm.runInContext(read('350_path_object_4_point_closed_region_center.js'), ctx);
  return { ctx, scene, camera, layers, run: code => vm.runInContext(code, ctx) };
}
const points = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }];
test('path diameter defaults to .05m and respects per-path widths', () => {
  const { ctx } = setup();
  for (const [width, expected] of [[undefined, .05], [.6, .6], [NaN, .05], [-1, .05]]) {
    const group = ctx._buildPathMesh(points, '#123456', .8, '', width);
    const cylinder = group.children.find(o => o.geometry?.type === 'CylinderGeometry');
    assert.equal(cylinder.geometry.parameters.radiusTop, expected / 2);
  }
});
test('width change rebuilds selected path without changing other style/transform', () => {
  const { ctx, layers } = setup();
  const mesh = ctx._buildPathMesh(points, '#123456', .8, 'A'); mesh.position.set(3, 4, 5);
  const L = { id: 1, type: 'path', mesh, pathPoints: points, pathColor: '#123456', pathOpacity: .8, pathLabel: 'A' };
  layers.push(L);
  assert.equal(typeof ctx.setPathWidth, 'function');
  ctx.setPathWidth(1, '.45');
  assert.equal(L.pathWidth, .45);
  assert.equal(mesh.children.find(o => o.geometry?.type === 'CylinderGeometry').geometry.parameters.radiusTop, .225);
  assert.deepEqual(mesh.position.toArray(), [3, 4, 5]);
  assert.equal(L.pathColor, '#123456'); assert.equal(L.pathLabel, 'A');
  ctx.setPathWidth(1, ''); assert.equal(L.pathWidth, .45);
});
test('probe is screen-sized numbered sprite and live line includes candidate', () => {
  const { ctx, camera, run } = setup();
  run('_pathMode=true; _pathPts=[new THREE.Vector3(1,0,-5)]; _pathProbing=true; _pathUpdateProbe(10,20);');
  const marker = run('_pathProbeMarker');
  assert.equal(marker.isSprite, true);
  assert.equal(marker.userData.pathPointNumber, 2);
  assert.equal(run('_pathPreviewLine.geometry.attributes.position.count'), 2);
  camera.updateMatrixWorld();
  marker.updateMatrixWorld(); marker.onBeforeRender(null, null, camera);
  const first = marker.scale.y;
  marker.position.z = -50; marker.updateMatrixWorld(); marker.onBeforeRender(null, null, camera);
  assert.ok(Math.abs(marker.scale.y / first - 10) < 1e-5);
  ctx.pick = null; ctx._pathUpdateProbe(20, 30);
  assert.equal(run('_pathProbeMarker'), null);
  assert.equal(run('_pathPreviewLine'), null);
  assert.equal(run('_pathProbing'), true, 'invalid surface must not prevent subsequent aiming');
  ctx._placePathPoint(20, 30); assert.equal(run('_pathPts.length'), 1);
});
test('fixed-size marker uses active viewport CSS height including pixel ratio', () => {
  const { camera, run } = setup();
  run('_pathMode=true; _pathUpdateProbe(10,20)');
  const marker=run('_pathProbeMarker');
  camera.updateMatrixWorld(); marker.updateMatrixWorld();
  for(const ratio of [1,2]){
    const renderer={getCurrentViewport:v=>v.set(0,0,500*ratio,300*ratio),getPixelRatio:()=>ratio};
    marker.onBeforeRender(renderer,null,camera);
    const pixels=marker.scale.y*camera.projectionMatrix.elements[5]/(2*5)*300;
    assert.ok(Math.abs(pixels-64)<1e-6, `marker is ${pixels}px in the active viewport`);
  }
});
test('cancel disposes marker textures and prevents stale release commit', () => {
  const { ctx, run, scene } = setup();
  run('_pathMode=true; _pathProbing=true; _pathUpdateProbe(1,2)');
  const marker = run('_pathProbeMarker'); let disposed = 0;
  marker.material.map?.addEventListener('dispose', () => disposed++);
  ctx._cancelPath();
  assert.equal(run('_pathProbeMarker'), null); assert.equal(run('_pathProbing'), false);
  assert.equal(scene.children.length, 0); assert.equal(disposed, 1);
  ctx._placePathPoint(1, 2); assert.equal(run('_pathPts.length'), 0);
});
test('both JSON and ZIP path serialization persist normalized width', () => {
  const { ctx } = setup();
  for (const file of ['310_zip_project_save_load_fflate.js', '311_zip_load_core.js']) {
    const source = read(file);
    const block = source.slice(source.indexOf('entry.pathPoints='), source.indexOf('\n      }', source.indexOf('entry.pathPoints=')));
    for (const value of [undefined, .7]) {
      ctx.L = { pathWidth: value, pathColor: '#d03478', pathLabel: 'P1', pathPoints: points }; ctx.entry = {};
      vm.runInContext(block, ctx);
      assert.equal(ctx.entry.pathWidth, value ?? .05, file);
      assert.equal(ctx.entry.pathColor, '#d03478');
      const stored = JSON.parse(JSON.stringify(ctx.entry));
      const restore = read('312_project_load_helpers.js');
      const start = restore.indexOf('L.pathPoints=');
      const assignments = restore.slice(start, restore.indexOf('\n    }', start));
      ctx.entry = stored; ctx.L = {}; ctx.mesh = null;
      vm.runInContext(assignments, ctx);
      assert.equal(ctx.L.pathWidth, value ?? .05);
      assert.equal(ctx.L.pathColor, '#d03478');
    }
  }
});
test('legacy restore builds .05m diameter when pathWidth is absent', () => {
  const { ctx } = setup();
  ctx.entry = { pathPoints: points, pathColor: '#abcdef' }; ctx.mesh = null; ctx.L = {};
  const source = read('312_project_load_helpers.js');
  const construction = source.match(/mesh=_buildPathMesh\([^\n]+/)[0];
  vm.runInContext(construction, ctx);
  const start = source.indexOf('L.pathPoints=');
  vm.runInContext(source.slice(start, source.indexOf('\n    }', start)), ctx);
  assert.equal(ctx.L.pathWidth, .05);
  assert.equal(ctx.mesh.children.find(o => o.geometry?.type === 'CylinderGeometry').geometry.parameters.radiusTop, .025);
});
test('probe resumes after null pick and canceled multi-point preview leaves no scene objects', () => {
  const { ctx, run, scene } = setup();
  run('_pathMode=true; _pathProbing=true; _pathUpdateProbe(0,0)');
  ctx._placePathPoint(0, 0);
  ctx.pick = new THREE.Vector3(1, 0, -5); ctx._placePathPoint(1, 0);
  run('_pathProbing=true'); ctx.pick = null; ctx._pathUpdateProbe(2, 0);
  ctx.pick = new THREE.Vector3(2, 0, -5); ctx._pathUpdateProbe(2, 0);
  assert.equal(run('_pathProbeMarker.userData.pathPointNumber'), 3);
  assert.equal(run('_pathPreviewLine.geometry.attributes.position.count'), 3);
  ctx._cancelPath();
  assert.equal(scene.children.length, 0);
  assert.equal(run('_pathPts.length'), 0);
  assert.equal(run('_pathProbePoint'), null);
});
test('finished path depth materials render before Spark and retain transparent pass at opacity one', () => {
  const { ctx, layers } = setup();
  const mesh = ctx._buildPathMesh(points, '#123456', 1, 'Label');
  layers.push({ id: 1, type: 'path', mesh });
  ctx.setPathOpacity(1, 1);
  const objects=[]; mesh.traverse(o=>{if(o.material)objects.push(o);});
  for (const object of objects) {
    assert.equal(object.material.depthTest, true);
    assert.equal(object.material.depthWrite, true);
    assert.equal(object.material.transparent, true);
    assert.equal(object.renderOrder, object.userData.isPathLabel ? -9 : -10);
    if (object.userData.isPathLabel) assert.equal(object.material.alphaTest, .01);
  }
});
test('fully transparent path outlines discard fragments instead of writing invisible depth', () => {
  const { ctx, layers } = setup();
  const mesh = ctx._buildPathMesh(points, '#123456', .95, '');
  layers.push({ id: 1, type: 'path', mesh });
  ctx.setPathOpacity(1, 0);
  for (const object of mesh.children.filter(o => o.userData.pathOutline)) {
    assert.ok(object.material.alphaTest > object.material.opacity);
    assert.equal(object.material.depthWrite, false);
  }
  assert.equal(mesh.userData.pathLabelSprite.material.depthWrite, true);
  ctx.setPathOpacity(1, .5);
  assert.ok(mesh.children.filter(o => o.userData.pathOutline).every(o => o.material.depthWrite));
  const invisible = ctx._buildPathMesh(points, '#123456', 0, '');
  assert.ok(invisible.children.filter(o => o.userData.pathOutline).every(o => !o.material.depthWrite));
});

test('labels within five world metres overlay geometry and gizmos, then restore occlusion', () => {
  const {ctx,layers,camera}=setup();
  const mesh=ctx._buildPathMesh(points,'#00d0ff',.95,'Entrance');
  layers.push({id:1,type:'path',mesh});
  const label=mesh.userData.pathLabelSprite;
  mesh.position.set(10,0,0); mesh.scale.setScalar(2); mesh.updateMatrixWorld(true);
  const world=label.getWorldPosition(new THREE.Vector3());
  camera.position.copy(world).add(new THREE.Vector3(0,0,5));
  ctx._pathUpdateLabelVisibility(camera);
  assert.equal(label.material.depthTest,false);
  assert.equal(label.material.depthWrite,false);
  assert.ok(label.parent.renderOrder>1001,'label group must sort after gizmo groups');
  camera.position.z+=.01;
  ctx._pathUpdateLabelVisibility(camera);
  assert.equal(label.material.depthTest,true);
  assert.equal(label.material.depthWrite,true);
  assert.equal(label.renderOrder,-9);
  assert.equal(label.parent.renderOrder,0);
  const empty=ctx._buildPathMesh(points,'#00d0ff',.95,'');
  layers.push({id:2,type:'path',mesh:empty});
  camera.position.set(0,0,0);ctx._pathUpdateLabelVisibility(camera);
  assert.equal(empty.userData.pathLabelSprite.visible,false);
});
