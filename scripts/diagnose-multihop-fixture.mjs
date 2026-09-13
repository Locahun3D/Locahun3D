import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
import {Pathfinding} from './navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs';
import {decodeTransitionGraph} from './navigation-transition-graph.mjs';
const filename=process.argv[2];
if(!filename)throw Error('Expected read-only QA fixture path');
const fixture=JSON.parse(fs.readFileSync(filename)),files=new Map(fixture.files.map(([n,b])=>[n,new Uint8Array(b)]));
const c=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,Blob,CompressionStream,DecompressionStream});
for(const name of ['403_navigation_cache','403b_navigation_query','403p_navigation_multihop'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),c);
const entries=fixture.manifest.regions.map(p=>p.navigation),meshes=[],queries=new Map();
const graph=await decodeTransitionGraph(files.get('assets/'+fixture.manifest.graph.sha256+'.lng'),fixture.manifest.graph,fixture.manifest);
const inside=(p,e)=>['x','y','z'].every((k,i)=>p[k]>=e.bounds[0][i]+.35&&p[k]<=e.bounds[1][i]-.35);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
try{
 for(const e of entries){const mesh=await c.LocahunNavigationCache.decode(files.get('assets/'+e.key+'.lnv'),e.key);meshes.push(mesh);queries.set(e.key,c.LocahunNavigationQuery.create(THREE,Pathfinding,mesh));}
 const candidates=index=>{
  const mesh=meshes[index],points=[];
  for(let i=0;i<mesh.triangles.length;i+=3){
   const p={x:0,y:0,z:0};for(let j=0;j<3;j++)for(const [k,offset]of [['x',0],['y',1],['z',2]])p[k]+=mesh.vertices[mesh.triangles[i+j]*3+offset]/3;
   if(inside(p,entries[index])&&!entries.some((e,n)=>n!==index&&inside(p,e)))points.push(p);
  }
  return points;
 };
 const starts=candidates(0),ends=candidates(entries.length-1),plans=[];
 // Offline diagnostic only: inspect nearby endpoints instead of guessing a floor height.
 for(const from of starts)for(const to of ends){const length=distance(from,to);if(length<12)plans.push({from,to,length});}
 plans.sort((a,b)=>a.length-b.length);
 const seen=new Set();let checked=0,found=null;
 for(const plan of plans){
  const cell=JSON.stringify([plan.from,plan.to].map(p=>[p.x,p.y,p.z].map(n=>Math.round(n*2))));if(seen.has(cell))continue;seen.add(cell);
  if(checked++>=100)break;
  const route=await c.LocahunNavigationMultihop.find({source:fixture.manifest.source,from:plan.from,to:plan.to,entries,portals:graph.portals,prepare:async e=>queries.get(e.key),current:()=>true,accept:()=>true});
  if(route){found={...plan,route};break;}
 }
 console.log(JSON.stringify({starts:starts.length,ends:ends.length,checked,found}));
 if(!found)process.exitCode=1;
}finally{for(const q of queries.values())q.dispose();}
