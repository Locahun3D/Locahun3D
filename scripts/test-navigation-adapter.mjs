import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
function fixture(){
 let now=0,picks=0;
 const to={x:0,y:3,z:3},camPos=new THREE.Vector3(0,1.8,0);
 const forbidden=()=>{throw Error('Tap movement must not query routes or collision clearance');};
 const core={raycastSurface(){picks++;return {point:to,normal:{x:0,y:1,z:0}};},isCapsuleClear:forbidden,moveCamera:forbidden};
 const c=vm.createContext({THREE,camPos,camera:new THREE.PerspectiveCamera(),canvas:{getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100,width:100,height:100})},
 performance:{now:()=>now},setTimeout:()=>1,clearTimeout(){},_useOrtho:false,msr:{active:false},walkSetup:{core,epoch:1,settings:{signature:'scene',navigation:{key:'a'},navigationRegions:{}}},
 _walkSourceSignature:()=> 'scene',getCameraCollisionState:()=>({enabled:false,ready:false}),markDirty(){},
 _prepareRegionalNavigationProvider:forbidden,_getNavigationQuery:forbidden,_prepareNavigationQuery:forbidden});
 vm.runInContext(fs.readFileSync(new URL('../src/js/404_click_navigation.js',import.meta.url),'utf8'),c);
 return {c,get picks(){return picks;},tick(t){now=t;vm.runInContext('_clickNavigationController?.tick(performance.now())',c);},run(){for(let t=now+16;t<=5000;t+=16)this.tick(t);}};
}
// Routed/collision-enforced journey modules retain their own tests. The tap
// adapter now deliberately uses direct collision-free movement per user request.
test('direct tap ignores blocked navigation routes and collision toggle, retaining target floor height',()=>{
 const f=fixture();assert(f.c._clickNavigateAt(50,50));f.run();
 assert.equal(f.c.camPos.z,3);assert.equal(f.c.camPos.y,4.8);assert.equal(f.picks,1);
});
test('hold preview resolves target without moving or creating a journey',()=>{
 const f=fixture(),p=f.c._clickNavigateAt(50,50,true);assert(p.valid);f.run();assert.equal(f.c.camPos.z,0);
});
test('scene replacement and explicit cancellation still stop direct travel',()=>{
 for(const change of ['scene','cancel']){const f=fixture();assert(f.c._clickNavigateAt(50,50));
 if(change==='scene')f.c.walkSetup.epoch++;else f.c._cancelClickNavigation();
 f.run();assert.equal(f.c.camPos.z,0);}
});
test('missing target and out-of-canvas coordinates never fabricate movement',()=>{
 const f=fixture();f.c.walkSetup.core.raycastSurface=()=>null;
 assert.equal(f.c._clickNavigateAt(50,50),false);assert.equal(f.c._clickNavigateAt(110,50),false);f.run();assert.equal(f.c.camPos.z,0);
});
test('new destination replaces active movement even after repeated rapid taps',()=>{
 const f=fixture();for(let i=0;i<10;i++){assert(f.c._clickNavigateAt(50,50));f.tick(i*16);}
 f.run();assert.equal(f.c.camPos.z,3);
});
