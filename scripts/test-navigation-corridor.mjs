import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({}),file=new URL('../src/js/403i_navigation_corridor.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);
const route=[{x:0,y:0,z:0},{x:3,y:1,z:0}];
const box=(x,y=1,z=0)=>({center:[x,y,z],half:[.1,.1,.1]});
const create=(boxes,r=route)=>{assert(c.LocahunNavigationCorridor);return c.LocahunNavigationCorridor.create(r,boxes);};
test('retains complete intersecting boxes without clipping and rejects distant boxes',()=>{
 const intersect=box(4.1),outside=box(5),corridor=create([intersect,outside]);
 assert(corridor);assert.equal(corridor.boxes.length,1);assert.deepEqual(Array.from(corridor.boxes[0].center),intersect.center);
 intersect.center[0]=100;assert.equal(corridor.boxes[0].center[0],4.1);
});
test('coverage follows the three-dimensional route, not another floor or a segment bounding box',()=>{
 const corridor=create([box(1)]);assert(corridor.covers({x:1.5,y:.5,z:0}));
 assert(!corridor.covers({x:1.5,y:3.5,z:0}));assert(!corridor.covers({x:0,y:1,z:0}));
 assert(!corridor.covers({x:NaN,y:0,z:0}));
});
test('invalid and excessive inputs fail closed without truncated collision',()=>{
 assert.equal(create([box(1)],[]),null);
 assert.equal(create([box(1)],[route[0],{x:31,y:0,z:0}]),null);
 assert.equal(create([null]),null);
 assert.equal(create(Array.from({length:8193},()=>box(1))),null);
 assert.equal(create([box(1)],[route[0],{x:Infinity,y:0,z:0}]),null);
});
test('rounding at corridor boundary is conservative and route snapshots cannot be mutated',()=>{
 const points=route.map(p=>({...p})),corridor=create([box(4.100001)],points);
 assert.equal(corridor.boxes.length,1);points[0].x=100;
 assert(corridor.covers({x:0,y:0,z:0}));
});
