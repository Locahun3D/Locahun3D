import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const THREE=createRequire(import.meta.url)('../../../kawaii-motion/node_modules/three/build/three.cjs');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ctx=vm.createContext({THREE,window:{addEventListener(){}}});
vm.runInContext(read('src/js/350_path_object_4_point_closed_region_center.js'),ctx);
test('path default is 0.05m while explicit widths stay unchanged',()=>{
  assert.equal(ctx._pathWidth(undefined),.05);assert.equal(ctx._pathWidth(.1),.1);assert.equal(ctx._pathWidth(.2),.2);assert.equal(ctx._pathWidth(.55),.55);
});
test('path names follow first nonempty text line and retain safe plain text',()=>{
  assert.equal(ctx._pathLayerName('商店街側入り口\nhttps://maps.example',4),'商店街側入り口');
  assert.equal(ctx._pathLayerName(' \n 出入口 ',3),'出入口');
  assert.equal(ctx._pathLayerName('',3),'Path 3');
  assert.equal(ctx._pathLayerName('<b>入口</b>',3),'<b>入口</b>');
});
test('walk settings gear is absent from the floating toolbar',()=>{
  assert.ok(!read('src/html/020_view_buttons_ar.html').includes('id="btnWalkSetup"'));
});

test('editing a selected path updates only its plain-text properties title',()=>{
  const layer={id:4,type:'path',name:'old',mesh:new THREE.Group()};
  const title={textContent:'Path old',dataset:{layerId:'4'}};
  const textarea={value:'\n <b>entrance</b>\nsecond line',selectionStart:5,selectionEnd:8};
  const document={activeElement:textarea,getElementById:id=>id==='lt-title'?title:null};
  const c=vm.createContext({THREE,document,selectedLayerId:4,LAYER_ICONS:{path:'Path'},
    findLayer:()=>layer,renderLayerList(){},
    renderTransformPanel(){assert.fail('must not rebuild the input panel');},
    window:{addEventListener(){}}});
  vm.runInContext(read('src/js/350_path_object_4_point_closed_region_center.js'),c);
  c._makePathLabelSprite=()=>new THREE.Sprite(new THREE.SpriteMaterial());
  c.window.setPathLabel(4,textarea.value);
  assert.equal(title.textContent,'Path <b>entrance</b>');
  assert.equal(layer.name,'<b>entrance</b>');
  assert.equal(layer.pathLabel,textarea.value);
  assert.equal(document.activeElement,textarea);
  assert.equal(textarea.selectionStart,5);assert.equal(textarea.selectionEnd,8);
  c.selectedLayerId=5;
  c.window.setPathLabel(4,'other');
  assert.equal(title.textContent,'Path <b>entrance</b>');
  c.selectedLayerId=4;title.dataset.layerId='5';
  c.window.setPathLabel(4,'stale panel');
  assert.equal(title.textContent,'Path <b>entrance</b>');
});

test('properties title identifies the rendered layer and escapes its name',()=>{
  const source=read('src/js/260_folder_system.js');
  assert.match(source,/id="lt-title" data-layer-id="\$\{L\.id\}"/);
  assert.match(source,/class="lt-title"[^\n]*_layerText\(L\.name\)/);
});
