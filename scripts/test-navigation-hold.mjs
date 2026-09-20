import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
test('destination marker renders in the transparent overlay queue after splats',()=>{
 const c={THREE,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(60),canvas:{clientHeight:800,addEventListener(){}},
  window:{addEventListener(){}},markDirty(){}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../src/js/405_navigation_target_preview.js',import.meta.url),'utf8'),c);
 c._showNavigationPoint({x:0,y:0,z:4},true);
 const point=c.scene.getObjectByName('NavigationTarget');
 assert.equal(point.material.transparent,true);assert.equal(point.material.depthTest,false);
 assert.equal(point.material.depthWrite,false);assert.equal(point.renderOrder,10000);
 c._hideNavigationPoint();assert.equal(point.visible,false);
 point.geometry.dispose();point.material.dispose();
});
function fixture(){
 let timer,preview=0,hidden=0;
 const canvas={addEventListener(){}},c={canvas,window:{addEventListener(){}},
  clearTimeout(){timer=null;},setTimeout(fn){timer=fn;return 1;},
  _clickNavigationController:null,_clickNavigationBusy:()=>false,
  _clickPointerPoint:(kind,e)=>kind==='touch'?e.changedTouches[0]:e,
  _clickNavigateAt:(x,y,peek)=>{assert.equal(peek,true);preview++;return {point:{x,y,z:0},valid:true};}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../src/js/405_navigation_target_preview.js',import.meta.url),'utf8'),c);
 c._showNavigationPoint=()=>{};c._hideNavigationPoint=()=>hidden++;
 return {c,canvas,fire(){timer?.();},get preview(){return preview;},get hidden(){return hidden;}};
}
test('hold previews without starting travel and releases adjusted target',()=>{
 const f=fixture(),p={x:10,y:10,id:0};f.c._navigationHoldArm('mouse',p);assert.equal(f.preview,0);
 f.fire();assert.equal(f.preview,1);
 assert(f.c._navigationHoldMove('mouse',{...p,x:40}));assert.equal(f.preview,2);
 const result=f.c._navigationHoldTake('mouse',{...p,x:40,target:f.canvas,button:0},false);
 assert.equal(result.x,40);assert.equal(result.held,true);
});
// 2026-09-20 本人指示で仕様変更: マウスは「押して動かした時点」で探りを始める（測定ツールの A/B 点と同じ手触り）。
// タッチの1本指ドラッグは見回しなので、従来どおり長押し前に動かすと取り消し。他の操作が画面を持っている間は始めない。
test('mouse press-and-drag starts probing at once; touch drag and tool ownership never do',()=>{
 const m=fixture();m.c._navigationHoldArm('mouse',{x:0,y:0,id:0});
 assert.equal(m.c._navigationHoldMove('mouse',{x:3,y:0,id:0}),false,'5px 未満はまだ何もしない');assert.equal(m.preview,0);
 assert.equal(m.c._navigationHoldMove('mouse',{x:7,y:0,id:0}),true,'5px 以上動かしたら探り開始');assert.equal(m.preview,1);
 const held=m.c._navigationHoldTake('mouse',{x:7,y:0,id:0,target:m.canvas,button:0},false);
 assert.equal(held.held,true);assert.equal(held.x,7);
 const t=fixture(),p={x:0,y:0,id:2};t.c._navigationHoldArm('touch',p);
 assert.equal(t.c._navigationHoldMove('touch',{changedTouches:[{x:20,y:0,id:2}],touches:[{id:2}]}),false);t.fire();assert.equal(t.preview,0);
 const b=fixture();b.c._clickNavigationBusy=()=>true;b.c._navigationHoldArm('mouse',{x:0,y:0,id:0});b.fire();assert.equal(b.preview,0);
 const b2=fixture();b2.c._navigationHoldArm('mouse',{x:0,y:0,id:0});b2.c._clickNavigationBusy=()=>true;
 assert.equal(b2.c._navigationHoldMove('mouse',{x:9,y:0,id:0}),false);assert.equal(b2.preview,0);
});
test('multi-touch, consumed release and outside release cancel',()=>{
 for(const reason of ['multi','consumed','outside']){
  const f=fixture(),p={x:10,y:10,id:4};f.c._navigationHoldArm('touch',p);f.fire();
  if(reason==='multi')f.c._navigationHoldMove('touch',{changedTouches:[p],touches:[p,{id:5}]});
  const result=f.c._navigationHoldTake('touch',{changedTouches:[p],touches:[],target:reason==='outside'?{}:f.canvas},reason==='consumed');
  assert.equal(result,null);
 }
});
