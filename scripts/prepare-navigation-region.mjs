import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {navigationSourceKey,navigationRegionKey,navigationRegionEntry} from './navigation-region-contract.mjs';
import {selectNavigationRegionBoxes} from './navigation-region-boxes.mjs';
const context=vm.createContext({Uint8Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
vm.runInContext(fs.readFileSync(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),context);
// Desktop only. No writes: caller publishes both payloads only after verification.
export async function prepareNavigationRegion({sources,bounds,collision,collisionSource}){
 const source=navigationSourceKey(sources),key=navigationRegionKey(source,bounds);
 const expected=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
 if(collisionSource!==expected)throw Error('Navigation collision/source transform mismatch');
 const index=await context.LocahunWholeCollision.decodeTiles(collision,collisionSource);
 if(Math.abs(index.cellSize-.1)>1e-6)throw Error('Fine navigation source required');
 const boxes=selectNavigationRegionBoxes([...index.tiles.values()].flatMap(t=>index.boxes(t)),bounds);
 const {generateNavigationCache}=await import('./generate-navigation-cache.mjs');
 const nav=await generateNavigationCache(collision,collisionSource,{bounds,outputSource:key});
 const proxy=await context.LocahunWholeCollision.encode(boxes,key);
 return {manifest:{schema:1,source,regions:[{navigation:navigationRegionEntry(source,bounds,nav.bytes),collision:navigationRegionEntry(source,bounds,proxy)}]},
  payloads:[{name:key+'.lnv',bytes:nav.bytes},{name:key+'.lcp',bytes:proxy}]};
}
