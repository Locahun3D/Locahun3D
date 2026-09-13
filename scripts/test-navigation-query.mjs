import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
import {Pathfinding} from './navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs';
const context=vm.createContext({console}),file=new URL('../src/js/403b_navigation_query.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),context);
const source='ab'.repeat(32);
const mesh={source,vertices:new Float32Array([0,0,0,3,0,0,3,0,3,0,0,3,0,3,0,3,3,0,3,3,3,0,3,3]),triangles:new Uint32Array([0,2,1,0,3,2,4,6,5,4,7,6])};
test('query follows same-floor targets but rejects disconnected stacked floors',()=>{
 assert(context.LocahunNavigationQuery);
 const q=context.LocahunNavigationQuery.create(THREE,Pathfinding,mesh);
 const a={x:.5,y:0,z:.5},b={x:2,y:0,z:2};
 assert(q.find(a,b,source)?.length);assert.equal(q.find(a,{...b,y:3},source),null);
 assert(q.find({...a,y:3},{...b,y:3},source)?.length);
});
test('query rejects invalid, remote and wrong-source endpoints and disposed reuse',()=>{
 assert(context.LocahunNavigationQuery);
 const q=context.LocahunNavigationQuery.create(THREE,Pathfinding,mesh),a={x:.5,y:0,z:.5};
 for(const b of [{x:20,y:0,z:2},{x:NaN,y:0,z:1},{x:1,y:1.5,z:1}])assert.equal(q.find(a,b,source),null);
 assert.equal(q.find(a,{x:2,y:0,z:2},'cd'.repeat(32)),null);q.dispose();assert.equal(q.find(a,a,source),null);
});
test('embedded query library initializes only on demand and is reused',()=>{
 const template=fs.readFileSync(new URL('../src/template.html',import.meta.url),'utf8');
 const start=template.indexOf('let _navigationPathfindingClass;'),end=template.indexOf('{{include:src/js/405_navigation_target_preview.js}}',start);
 assert(start>=0&&end>start);
 const code=template.slice(start,end).replace(/\{\{include:([^}]+)\}\}/g,(_,p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 const c=vm.createContext({THREE});vm.runInContext(code,c);
 assert.equal(vm.runInContext('typeof _navigationPathfindingClass',c),'undefined');
 assert.equal(vm.runInContext('_loadNavigationPathfinding()===_loadNavigationPathfinding()',c),true);
 assert.equal(vm.runInContext('typeof _loadNavigationPathfinding().createZone',c),'function');
});
