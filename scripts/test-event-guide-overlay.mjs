import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const THREE=createRequire(import.meta.url)('../../../kawaii-motion/node_modules/three/build/three.cjs');

const source=fs.readFileSync(new URL('../src/js/150_pivot_hover_glow_2d_overlay.js',import.meta.url),'utf8');
function render(text,distance){
 const drawn=[],boxes=[];
 const camera=new THREE.PerspectiveCamera();
 const mesh=new THREE.Object3D();mesh.position.z=-distance;
 const context={THREE,camera,window:{_activeBillboardCount:1},msr:{active:false,step:0},selectedLayerId:null,_hoveredAxis:null,
  layers:[{type:'event',visible:true,mesh,eventGuide:text}],overlay:{width:800,height:600},screenPos:()=>({x:400,y:300,behind:false}),
  octx:{clearRect(){},save(){},restore(){},beginPath(){},fill(){},measureText:t=>({width:t.length*13}),roundRect:(...a)=>boxes.push(a),fillText:(...a)=>drawn.push(a)}};
 vm.runInNewContext(source+'\nupdateOverlay();',context);return {drawn,boxes};
}
test('event guide draws each entered line separately and grows the background',()=>{
 const {drawn,boxes}=render('昇降式の室内物干し\r\nリモコンから起動可能',3);
 assert.deepEqual(drawn.map(d=>d[0]),['昇降式の室内物干し','リモコンから起動可能']);
 assert.ok(drawn[1][2]>drawn[0][2]);assert.ok(boxes[0][3]>22);
});
test('event guide hides beyond 5m but includes the boundary',()=>{
 assert.equal(render('案内',5).drawn.length,1);
 assert.equal(render('案内',5.01).drawn.length,0);
 assert.equal(render('案内',1000).drawn.length,0);
});
test('blank lines keep their vertical spacing',()=>{
 const {drawn}=render('一行目\n\n三行目',2);
 assert.equal(drawn.length,3);assert.equal(drawn[1][0],'');
 assert.equal(drawn[2][2]-drawn[0][2],36);
});
