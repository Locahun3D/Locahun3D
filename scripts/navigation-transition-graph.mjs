// Desktop format only. A valid digest binds records, not physical traversability.
import {createHash} from 'node:crypto';
import {navigationRegionKey} from './navigation-region-contract.mjs';
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s),hash=b=>createHash('sha256').update(b).digest('hex');
const MAX=128*1024;
function binding(manifest){
 if(manifest?.schema!==1||!hex(manifest.source)||!Array.isArray(manifest.regions)||!manifest.regions.length||manifest.regions.length>1024)throw Error('Invalid graph manifest');
 const seen=new Set(),bounds=new Map(),records=manifest.regions.map(pair=>{
  const entries=['navigation','collision'].map(type=>{
   const e=pair?.[type];if(!e||e.source!==manifest.source||!hex(e.sha256)||!Number.isInteger(e.bytes)||e.bytes<1||e.bytes>2000000||navigationRegionKey(e.source,e.bounds)!==e.key)throw Error('Invalid graph region');
   return [e.key,e.bounds,e.bytes,e.sha256];
  });
  if(entries[0][0]!==entries[1][0]||seen.has(entries[0][0]))throw Error('Invalid graph region pair');
  seen.add(entries[0][0]);bounds.set(entries[0][0],entries[0][1]);return entries;
 }).sort((a,b)=>a[0][0].localeCompare(b[0][0]));
 return {key:hash(JSON.stringify(['transition-manifest-v1',manifest.source,records])),bounds};
}
function normalize(portals,bounds){
 if(!Array.isArray(portals)||!portals.length||portals.length>256)throw Error('Portal count limit');
 const seen=new Set();
 return portals.map(portal=>{
  const ends=['a','b'].map(side=>{
   const e=portal?.[side],p=e?.point,b=bounds.get(e?.key);
   if(!b||!p||!['x','y','z'].every((k,i)=>Number.isFinite(p[k])&&p[k]>=b[0][i]+.35&&p[k]<=b[1][i]-.35))throw Error('Invalid portal endpoint');
   return {key:e.key,point:{x:p.x,y:p.y,z:p.z}};
  }).sort((a,b)=>a.key.localeCompare(b.key));
  if(ends[0].key===ends[1].key||Math.hypot(...['x','y','z'].map(k=>ends[0].point[k]-ends[1].point[k]))>.025)throw Error('Invalid portal crossing');
  const value={a:ends[0],b:ends[1]},id=JSON.stringify(value);if(seen.has(id))throw Error('Duplicate portal');seen.add(id);return value;
 }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function encodeTransitionGraph(manifest,portals){
 const bound=binding(manifest),value={schema:1,source:manifest.source,manifest:bound.key,portals:normalize(portals,bound.bounds)};
 const bytes=new TextEncoder().encode(JSON.stringify(value));if(bytes.length>MAX)throw Error('Graph size limit');
 return {bytes,entry:{schema:1,source:manifest.source,manifest:bound.key,bytes:bytes.length,sha256:hash(bytes)}};
}
export function decodeTransitionGraph(bytes,entry,manifest){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX||entry?.schema!==1||entry.bytes!==bytes.length||!hex(entry.sha256)||hash(bytes)!==entry.sha256)throw Error('Graph digest mismatch');
 const bound=binding(manifest);if(entry.source!==manifest.source||entry.manifest!==bound.key)throw Error('Graph binding mismatch');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(value?.schema!==1||value.source!==manifest.source||value.manifest!==bound.key)throw Error('Graph binding mismatch');
 const normalized=encodeTransitionGraph(manifest,value.portals);
 if(normalized.entry.sha256!==entry.sha256)throw Error('Noncanonical graph');
 return JSON.parse(new TextDecoder().decode(normalized.bytes));
}
