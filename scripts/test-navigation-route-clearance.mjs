import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({});
const source=fs.readFileSync(new URL('../src/js/404_click_navigation.js',import.meta.url),'utf8');
vm.runInContext(source.slice(0,source.indexOf('\n//',source.indexOf('})();'))>0?source.indexOf('\n//',source.indexOf('})();')):undefined),c);
const url=new URL('./navigation-route-clearance.mjs',import.meta.url);
const verify=fs.existsSync(url)?(await import(url)).verifyRouteClearance:null;
const points=[{x:0,y:0,z:0},{x:2,y:0,z:0}];
const core=()=>({isCapsuleClear:()=>true,raycastSurface:p=>({point:{...p,y:0},normal:{x:0,y:1,z:0}}),moveCamera:(p,d)=>({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z})});
test('complete route gate reuses controller and validates both directions',()=>{
 assert.equal(typeof verify,'function');assert.equal(verify(points,core(),c.LocahunClickNavigation),true);
});
test('mid-route wall or unsupported floor rejects before publication',()=>{
 assert.equal(typeof verify,'function');
 assert.equal(verify(points,{...core(),isCapsuleClear:p=>p.x<.9||p.x>1.1},c.LocahunClickNavigation),false);
 assert.equal(verify(points,{...core(),raycastSurface:()=>null},c.LocahunClickNavigation),false);
});
