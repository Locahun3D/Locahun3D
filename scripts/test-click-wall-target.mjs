import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../src/js/404_click_navigation.js',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(source.slice(0,source.indexOf('let _clickNavigationController')),context);
const resolve=(...args)=>context.LocahunClickNavigation.resolveSurface(...args);
test('ground remains an exact hit without another query',()=>{
 const hit={point:{x:0,y:3,z:1},normal:{x:0,y:1,z:0}};
 assert.equal(resolve(hit,{x:0,y:1.8,z:0},()=>{throw Error('unneeded query');}),hit);
});
test('wall hit projects down on its visible side and preserves the destination storey',()=>{
 const hit={point:{x:0,y:4.5,z:3},normal:{x:0,y:0,z:-1}};
 const target=resolve(hit,{x:0,y:1.8,z:0},(from,direction,max)=>{
  assert(from.z<2.7);assert.equal(direction.y,-1);assert(max<=3.5);
  return {point:{x:from.x,y:3,z:from.z},normal:{x:0,y:1,z:0},distance:from.y-3};
 });
 assert.equal(target.point.y,3);
});
test('missing floor, wall below and invalid hits do not fabricate a destination',()=>{
 const hit={point:{x:0,y:1.5,z:3},normal:{x:0,y:0,z:-1}},camera={x:0,y:1.8,z:0};
 assert.equal(resolve(hit,camera,()=>null),null);
 assert.equal(resolve(hit,camera,()=>({...hit,distance:1})),null);
 assert.equal(resolve({...hit,point:{x:NaN,y:1,z:0}},camera,()=>{throw Error('invalid query');}),null);
});
