import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=new URL('./navigation-transition-clearance.mjs',import.meta.url);
const verify=fs.existsSync(url)?(await import(url)).verifyTransitionClearance:null;
const pair={a:{x:0,y:0,z:0},b:{x:.02,y:0,z:0}};
const core=()=>({isCapsuleClear:()=>true,raycastSurface:p=>({point:{...p,y:0},normal:{x:0,y:1,z:0}}),moveCamera:(a,d)=>({x:a.x+d.x,y:a.y+d.y,z:a.z+d.z})});
test('clearance checks both endpoints and both travel directions',()=>{
 assert.equal(typeof verify,'function');let calls=0;const c=core(),move=c.moveCamera;c.moveCamera=(...args)=>{calls++;return move(...args);};
 assert(verify(pair,c));assert(calls>=4);
});
test('walls, low ceilings, absent floors and wrong floor height reject',()=>{
 assert.equal(typeof verify,'function');
 for(const c of [ {...core(),isCapsuleClear:()=>false}, {...core(),raycastSurface:()=>null},
  {...core(),raycastSurface:()=>({point:{x:0,y:-2,z:0},normal:{x:0,y:1,z:0}})},
  {...core(),moveCamera:p=>p} ])assert.equal(verify(pair,c),false);
});
test('distant or nonfinite candidates reject before invoking collision',()=>{
 assert.equal(typeof verify,'function');
 assert.equal(verify({...pair,b:{x:1,y:0,z:0}},null),false);
 assert.equal(verify({...pair,a:{x:NaN,y:0,z:0}},null),false);
});
