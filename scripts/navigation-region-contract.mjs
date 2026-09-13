import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const profile=[2,.15,.3,.05,.025];
// Geometry identity deliberately excludes view quality and coarse collision resolution.
export function navigationSourceKey(sources){
 if(!Array.isArray(sources)||!sources.length||sources.length>1000)throw Error('Invalid navigation sources');
 const records=sources.map(s=>{
  if(!s||typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.sha256)||!Array.isArray(s.matrix)||s.matrix.length!==16||
   s.matrix.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)||s.matrix[3]!==0||s.matrix[7]!==0||s.matrix[11]!==0||s.matrix[15]!==1)throw Error('Invalid navigation source transform');
  return JSON.stringify([s.sha256,s.matrix]);
 }).sort();
 return hash(JSON.stringify(['navigation-source-v1',records.map(r=>JSON.parse(r))]));
}
export function navigationRegionKey(source,bounds){
 if(typeof source!=='string'||!/^[a-f0-9]{64}$/.test(source))throw Error('Invalid navigation source');
 if(!Array.isArray(bounds)||bounds.length!==2||bounds.some(a=>!Array.isArray(a)||a.length!==3||a.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))||
  bounds[1].some((n,i)=>n<=bounds[0][i])||bounds[1][0]-bounds[0][0]>32||bounds[1][2]-bounds[0][2]>32)throw Error('Invalid navigation region');
 return hash(JSON.stringify(['navigation-region-v1',source,bounds,profile]));
}
// Pins identity/content only. Callers still validate/decode LNV geometry against the region key.
export function navigationRegionEntry(source,bounds,bytes){
 const key=navigationRegionKey(source,bounds);
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>2000000)throw Error('Navigation region payload limit');
 return {source,key,bounds:bounds.map(a=>[...a]),bytes:bytes.length,sha256:hash(bytes)};
}
