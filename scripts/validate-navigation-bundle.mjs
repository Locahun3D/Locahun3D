import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {navigationRegionKey} from './navigation-region-contract.mjs';
const c=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
for(const n of ['216_walk_settings','216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+n+'.js',import.meta.url),'utf8'),c);
export async function validateNavigationBundle(value,read){
 const manifest=c.LocahunWalkSettings.parseNavigationRegions(value);
 if(!manifest)throw Error('Invalid regional navigation manifest');
 const total=manifest.regions.reduce((sum,p)=>sum+p.navigation.bytes+p.collision.bytes,0);
 if(total>64*1024*1024)throw Error('Navigation package size limit');
 const files=new Map();
 for(const pair of manifest.regions){
  for(const [type,extension] of [['navigation','lnv'],['collision','lcp']]){
   const e=pair[type],name='assets/'+e.key+'.'+extension;
   if(navigationRegionKey(e.source,e.bounds)!==e.key)throw Error('Navigation region key mismatch');
   const bytes=await read(name,e.bytes);
   if(!(bytes instanceof Uint8Array)||bytes.length!==e.bytes||createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw Error('Navigation payload digest mismatch: '+name);
   if(type==='navigation')await c.LocahunNavigationCache.decode(bytes,e.key);else await c.LocahunWholeCollision.decode(bytes,e.key);
   files.set(name,bytes);
  }
 }
 return {manifest:JSON.parse(JSON.stringify(manifest)),files};
}
