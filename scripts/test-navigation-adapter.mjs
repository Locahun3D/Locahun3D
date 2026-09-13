import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
function fixture(){
 let now=0,release,ready=false,picks=0;
 const to={x:0,y:3,z:3},route=[{x:0,y:0,z:0},{x:3,y:0,z:0},{x:3,y:3,z:3},to];
 const camPos=new THREE.Vector3(0,1.8,0),core={raycastSurface(){picks++;return {point:to,normal:{x:0,y:1,z:0}};},isCapsuleClear:()=>true,moveCamera:(a,d)=>({x:a.x+d.x,y:a.y+d.y,z:a.z+d.z})};
 const c=vm.createContext({THREE,camPos,camera:new THREE.PerspectiveCamera(),canvas:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},
 performance:{now:()=>now},setTimeout:()=>1,clearTimeout(){},_useOrtho:false,msr:{active:false},walkSetup:{core,epoch:1,settings:{navigation:{key:'a'}}},
 getCameraCollisionState:()=>({ready:true}),_walkNeedsRegion:()=>false,markDirty(){},_getNavigationQuery:()=>ready?{find:()=>route}:null,
 _prepareNavigationQuery:()=>new Promise(r=>release=()=>{ready=true;r(true);})});
 vm.runInContext(fs.readFileSync(new URL('../src/js/404_click_navigation.js',import.meta.url),'utf8'),c);
 return {c,release:()=>release(),get picks(){return picks;},run(){for(now=16;now<=5000;now+=16)vm.runInContext('_clickNavigationController?.tick(performance.now())',c);}};
}
test('loading navigation resumes captured destination without picking again',async()=>{
 const f=fixture();assert.equal(f.c._clickNavigateAt(50,50),false);f.release();await new Promise(r=>setImmediate(r));
 f.run();assert.equal(f.picks,1);assert.equal(f.c.camPos.y,4.8);assert.equal(f.c.camPos.z,3);
});
test('cancelled input never resumes when navigation preparation finishes',async()=>{
 const f=fixture();f.c._clickNavigateAt(50,50);f.c._cancelClickNavigation();f.release();await new Promise(r=>setImmediate(r));
 f.run();assert.equal(f.c.camPos.y,1.8);assert.equal(f.c.camPos.z,0);
});

test('stationary hold refreshes when its navigation data becomes ready without starting travel',async()=>{
 const f=fixture();let refreshed=0;f.c._navigationHold={active:true};f.c._navigationHoldPreview=()=>refreshed++;
 f.c._clickNavigateAt(50,50,true);f.release();await new Promise(r=>setImmediate(r));
 assert.equal(refreshed,1);assert.equal(f.c.camPos.z,0);
});
test('released or replaced hold does not refresh after an earlier load',async()=>{
 for(const next of [null,{active:true}]){
  const f=fixture();let refreshed=0;f.c._navigationHold={active:true};f.c._navigationHoldPreview=()=>refreshed++;
  f.c._clickNavigateAt(50,50,true);f.c._navigationHold=next;f.release();await new Promise(r=>setImmediate(r));
  assert.equal(refreshed,0);
 }
});

test('prepared journey uses its own collision without replacing the scene core',()=>{
 const f=fixture(),original=f.c.walkSetup.core;let disposed=0;
 const point={x:0,y:0,z:3},lease={valid:()=>true,points:[{x:0,y:0,z:0},point],covers:()=>true,
  core:{isCapsuleClear:()=>true,moveCamera:(a,d)=>({x:a.x+d.x,y:a.y+d.y,z:a.z+d.z})},dispose(){disposed++;}};
 original.isCapsuleClear=()=>{throw Error('Coarse core must not check fine route');};
 assert.equal(f.c._clickNavigateAt(50,50,false,{point,normal:{x:0,y:1,z:0}},lease),true);
 f.run();assert.equal(f.c.camPos.z,3);assert.equal(f.c.walkSetup.core,original);
 f.c._cancelClickNavigation();assert.equal(disposed,1);
});

test('invalid prepared journey cannot start travel',()=>{
 const f=fixture();assert.equal(f.c._clickNavigateAt(50,50,false,{point:{x:0,y:0,z:3},normal:{x:0,y:1,z:0}},{valid:()=>false}),false);
 assert.equal(f.c.camPos.z,0);
});

test('regional provider asynchronously resumes click and never uses legacy query',async()=>{
 const f=fixture();let disposed=0;
 const lease={valid:()=>true,points:[{x:0,y:0,z:0},{x:0,y:3,z:3}],covers:()=>true,core:f.c.walkSetup.core,dispose(){disposed++;}};
 f.c.provider={cancel(){},acquire:async()=>lease};vm.runInContext('_clickNavigationJourney=provider',f.c);
 assert.equal(f.c._clickNavigateAt(50,50),false);await new Promise(r=>setImmediate(r));f.run();assert.equal(f.c.camPos.z,3);
 f.c._cancelClickNavigation();assert.equal(disposed,1);
});

test('late regional provider response after cancellation is disposed and does not move',async()=>{
 const f=fixture();let release,disposed=0;
 f.c.provider={cancel(){},acquire:()=>new Promise(r=>release=r)};vm.runInContext('_clickNavigationJourney=provider',f.c);
 f.c._clickNavigateAt(50,50);f.c._cancelClickNavigation();
 release({dispose(){disposed++;}});await new Promise(r=>setImmediate(r));assert.equal(disposed,1);assert.equal(f.c.camPos.z,0);
});

test('regional hold updates marker without moving and DOM cancellation still cancels provider',async()=>{
 const f=fixture();let marked=0,disposed=0,cancelled=0;
 f.c._navigationHold={active:true,point:{x:50,y:50}};f.c._showNavigationPoint=(_p,valid)=>{if(valid)marked++;};
 f.c.provider={cancel(){cancelled++;},acquire:async()=>({valid:()=>true,points:[{x:0,y:0,z:0},{x:0,y:3,z:3}],covers:()=>true,core:f.c.walkSetup.core,dispose(){disposed++;}})};
 vm.runInContext('_clickNavigationJourney=provider',f.c);f.c._clickNavigateAt(50,50,true);await new Promise(r=>setImmediate(r));
 assert.equal(marked,1);assert.equal(disposed,1);assert.equal(f.c.camPos.z,0);
 f.c._cancelClickNavigation({type:'blur'});assert.equal(cancelled,1);
});

test('regional query can resolve a stair edge when coarse wall-to-floor probing is inside a voxel',async()=>{
 const f=fixture();let target=null;
 f.c.walkSetup.core.raycastSurface=()=>({point:{x:0,y:3,z:3},normal:{x:0,y:0,z:0},distance:0});
 f.c.provider={cancel(){},acquire:async(_from,to)=>{target=to;return null;}};
 vm.runInContext('_clickNavigationJourney=provider',f.c);
 f.c._clickNavigateAt(50,50,false,{point:{x:0,y:3,z:3},normal:{x:0,y:0,z:1}});
 await new Promise(r=>setImmediate(r));assert.equal(target?.z,3);assert.equal(f.c.camPos.z,0);
});
