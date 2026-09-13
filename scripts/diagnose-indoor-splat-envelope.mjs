// Offline hypothesis only. Source covariance is not a surveyed physical surface.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {replaceSurfaceCells} from './fixtures/indoor-surface-cells.mjs';
const require=createRequire(new URL('./avatar-assets/package.json',import.meta.url));
const THREE=require('three');
const input='F:/Codex/locahun-walk/verification/indoor-splat-attributes-20260910-contact/splat-attributes.json';
const out='F:/Codex/locahun-walk/verification/indoor-splat-envelope-20260910';
const data=JSON.parse(fs.readFileSync(input,'utf8')),s=.1,sigma=3;
const sources=new Map(data.sources.map(r=>[r.layerId,new THREE.Matrix4().fromArray(r.matrixWorld)]));
const cells=new Map(),observed=new Map();
const key=p=>p.map(n=>Math.floor(n/s)).join(',');
const interior=([x,y,z])=>x>=-20&&x<=-7&&y>=-13&&y<=-6&&z>=10&&z<=25;
for(let i=0;i<data.localPoints.length;i+=3){
 const p=data.localPoints.slice(i,i+3),k=key(p);
 if(!interior(k.split(',').map(Number)))continue;
 if(!observed.has(k))observed.set(k,[]);observed.get(k).push(p);
}
for(const r of data.records){
 const m=new THREE.Matrix4().compose(new THREE.Vector3(),new THREE.Quaternion().fromArray(r.quaternion),new THREE.Vector3().fromArray(r.scales));
 m.premultiply(sources.get(r.layerId));const e=m.elements;
 const extent=[0,1,2].map(i=>sigma*Math.hypot(e[i],e[i+4],e[i+8]));
 assert(extent.every(Number.isFinite));
 // The conservative AABB encloses the transformed ellipsoid, without deleting weak-opacity observations.
 const lo=r.center.map((v,i)=>v-extent[i]),hi=r.center.map((v,i)=>v+extent[i]);
 const start=lo.map(v=>Math.floor(v/s)),end=hi.map(v=>Math.floor(v/s));
 for(let x=Math.max(-20,start[0]);x<=Math.min(-7,end[0]);x++)
 for(let y=Math.max(-13,start[1]);y<=Math.min(-6,end[1]);y++)
 for(let z=Math.max(10,start[2]);z<=Math.min(25,end[2]);z++){
  const k=[x,y,z].join(',');if(!observed.has(k))continue;
  const c=cells.get(k)||{min:Infinity,max:-Infinity,count:0};
  c.min=Math.min(c.min,lo[1]);c.max=Math.max(c.max,hi[1]);c.count++;cells.set(k,c);
 }
}
const indices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
const replacements=[];
for(const [k,points] of observed){
 const c=cells.get(k);if(!c||points.length<2)continue;
 const cell=k.split(',').map(Number),[x,y,z]=cell.map(n=>n*s);
 const bottom=Math.max(y,Math.min(c.min,...points.map(p=>p[1])));
 const top=Math.min(y+s,Math.max(c.max,...points.map(p=>p[1])));
 if(top-bottom<.02 || (bottom-y<.002 && y+s-top<.002))continue;
 assert(points.every(p=>p[1]>=bottom-1e-7&&p[1]<=top+1e-7));
 const vertices=[x,bottom,z, x+s,bottom,z, x+s,bottom,z+s, x,bottom,z+s,
  x,top,z, x+s,top,z, x+s,top,z+s, x,top,z+s];
 replacements.push({cell,cellSize:s,vertices,indices,observations:points.length,overlappingEllipsoids:c.count,bottom,top});
}
const fixture={schema:1,replacements,diagnostics:{source:input,sigma,observations:data.records.length,
 method:'Full XZ cell footprint, vertical bounds enclosing captured 3-sigma ellipsoid AABBs and all same-call source centers',
 limitations:'Diagnostic cropped ROI only; unobserved and out-of-crop splats are not certified absent. No physical surface guarantee. Not production eligible.'}};
replaceSurfaceCells([],fixture);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'replacement-fixture.json'),JSON.stringify(fixture));
console.log(JSON.stringify({out,count:replacements.length,contact:replacements.find(r=>r.cell.join(',')==='-14,-11,18')||null},null,2));
