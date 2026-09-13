import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {prepareNavigationRegion} from './prepare-navigation-region.mjs';
const c=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,Blob,TextEncoder,TextDecoder,CompressionStream,DecompressionStream});
for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),c);
const sources=[{sha256:'ab'.repeat(32),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}],bounds=[[-1,-1,-1],[5,4,5]];
const collisionSource=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
test('regional bundle binds two bounded payloads to the same geometry identity',async()=>{
 const collision=await c.LocahunWholeCollision.encodeTiles([{coord:[0,-1,0],boxes:[{center:[1.6,-.05,1.6],half:[1.6,.05,1.6]}]}],collisionSource,.1);
 const result=await prepareNavigationRegion({sources,bounds,collision,collisionSource});
 const region=result.manifest.regions[0];assert.equal(region.navigation.key,region.collision.key);
 for(const [i,entry] of [region.navigation,region.collision].entries()){
  assert.equal(entry.bytes,result.payloads[i].bytes.length);assert.equal(createHash('sha256').update(result.payloads[i].bytes).digest('hex'),entry.sha256);
 }
 assert((await c.LocahunNavigationCache.decode(result.payloads[0].bytes,region.navigation.key)).vertices.length);
 assert.equal((await c.LocahunWholeCollision.decode(result.payloads[1].bytes,region.collision.key)).length,1);
 const changed=structuredClone(sources);changed[0].matrix[12]=1;
 await assert.rejects(prepareNavigationRegion({sources:changed,bounds,collision,collisionSource}),/mismatch/);
});

if(process.argv.includes('--studio'))test('actual studio bundle regenerates a connected staircase from matching evaluated source',async()=>{
 const dir='F:/Codex/locahun-navigation-20260913',meta=JSON.parse(fs.readFileSync(dir+'/studio-full-fine.json'));
 const sources=meta.sources.map(s=>({sha256:meta.source,matrix:s.matrix}));
 const collisionSource=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
 const index=await c.LocahunWholeCollision.decodeTiles(new Uint8Array(fs.readFileSync(dir+'/studio-full-fine.lct')),meta.source);
 const collision=await c.LocahunWholeCollision.encodeTiles([...index.tiles.values()].map(t=>({coord:t.coord,boxes:index.boxes(t)})),collisionSource,.1);
 const result=await prepareNavigationRegion({sources,bounds:[[-8,-10,-8],[24,30,24]],collision,collisionSource});
 const THREE=await import('./navigation-assets/node_modules/three/build/three.module.js');
 const {Pathfinding}=await import('./navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs');
 vm.runInContext(fs.readFileSync(new URL('../src/js/403b_navigation_query.js',import.meta.url),'utf8'),c);
 const key=result.manifest.regions[0].navigation.key,mesh=await c.LocahunNavigationCache.decode(result.payloads[0].bytes,key),query=c.LocahunNavigationQuery.create(THREE,Pathfinding,mesh);
 try{assert(query.find({x:6.6,y:-.47,z:2.25},{x:8.6,y:1.1,z:1.2},key)?.length);}finally{query.dispose();}
 console.log(JSON.stringify({source:result.manifest.source,payloads:result.payloads.map(p=>({name:p.name,bytes:p.bytes.length}))}));
});
