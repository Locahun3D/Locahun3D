// Authoring-PC only. No graph or fine-collision generation runs in viewer startup.
import fs from 'node:fs';
import vm from 'node:vm';
import {validateNavigationBundle} from './validate-navigation-bundle.mjs';
import {findTransitionCandidates} from './navigation-transition-candidates.mjs';
import {verifyTransitionClearance} from './navigation-transition-clearance.mjs';
import {encodeTransitionGraph} from './navigation-transition-graph.mjs';
const c=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
for(const name of ['215_walk_collision','216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),c);
export async function prepareNavigationTransitions(manifest,payloads){
 if(manifest.regions.length<2||manifest.regions.length>4)return null;
 const raw=new Map(payloads.map(p=>['assets/'+p.name,p.bytes]));
 const checked=await validateNavigationBundle(manifest,name=>raw.get(name));
 const meshes=[],boxes=new Map();
 for(const pair of checked.manifest.regions){
  meshes.push(await c.LocahunNavigationCache.decode(checked.files.get('assets/'+pair.navigation.key+'.lnv'),pair.navigation.key));
  for(const box of await c.LocahunWholeCollision.decode(checked.files.get('assets/'+pair.collision.key+'.lcp'),pair.collision.key)){
   boxes.set(JSON.stringify([box.center,box.half]),box);if(boxes.size>100000)throw Error('Transition collision limit');
  }
 }
 const regions=checked.manifest.regions;
 const rapier=await import('../vendor/rapier-walk/rapier.mjs'),core=await c.LocahunWalkCollision.create({rapier});
 try{
  core.rebuild({boxes:[...boxes.values()]});
  const portals=[];
  for(let a=0;a<regions.length;a++)for(let b=a+1;b<regions.length;b++){
   const candidates=findTransitionCandidates(meshes[a],meshes[b],regions[a].navigation.bounds,regions[b].navigation.bounds);
   for(const p of candidates)if(verifyTransitionClearance(p,core)){
    if(portals.length===256)throw Error('Transition graph portal limit');
    portals.push({a:{key:regions[a].navigation.key,point:p.a},b:{key:regions[b].navigation.key,point:p.b}});
   }
  }
  if(!portals.length)return null;
  const graph=await encodeTransitionGraph(checked.manifest,portals);
  return {...graph,name:graph.entry.sha256+'.lng',portals:portals.length};
 }finally{core.dispose();}
}
