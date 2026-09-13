import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
import {Pathfinding} from './navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs';
const out='F:/Codex/locahun-navigation-20260913',source=JSON.parse(fs.readFileSync(out+'/studio-full-fine.json')).source;
const context=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,Blob,CompressionStream,DecompressionStream});
for(const name of ['403_navigation_cache','403b_navigation_query'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),context);
const start=performance.now(),decoded=await context.LocahunNavigationCache.decode(new Uint8Array(fs.readFileSync(out+'/studio-navigation.lnv')),source);
const query=context.LocahunNavigationQuery.create(THREE,Pathfinding,decoded),preparedMs=performance.now()-start;
try{
 const from={x:6.6,y:-.45,z:2.25},to={x:8.6,y:1,z:1.2},times=[];let route;
 for(let i=0;i<100;i++){const t=performance.now();route=query.find(from,to,source);times.push(performance.now()-t);}
 assert(route&&Math.hypot(route.at(-1).x-to.x,route.at(-1).y-to.y,route.at(-1).z-to.z)<.25,'binary cache must retain actual staircase route');
 assert.equal(query.find(from,{x:8.6,y:8,z:1.2},source),null,'unsupported higher floor must be rejected');
 times.sort((a,b)=>a-b);
 const report={preparedMs,queryMedianMs:times[50],queryP95Ms:times[95],route,scope:'Actual saved studio binary cache; no live renderer or project writes'};
 fs.writeFileSync(out+'/binary-query-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{query.dispose();}
