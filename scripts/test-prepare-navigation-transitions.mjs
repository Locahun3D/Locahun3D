import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {prepareNavigationRegion} from './prepare-navigation-region.mjs';
import {prepareNavigationTransitions} from './prepare-navigation-transitions.mjs';
import {decodeTransitionGraph} from './navigation-transition-graph.mjs';
const c=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
vm.runInContext(fs.readFileSync(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),c);
async function fixture(count=3){
 const sources=[{sha256:'ab'.repeat(32),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}];
 const collisionSource=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
 const collision=await c.LocahunWholeCollision.encodeTiles([{coord:[0,-1,0],boxes:[{center:[1.6,-.05,1.6],half:[1.6,.05,1.6]}]}],collisionSource,.1);
 let manifest;const payloads=[];
 for(let i=0;i<count;i++){
  const result=await prepareNavigationRegion({sources,bounds:[[-1-i*.1,-1,-1],[5,4,5]],collision,collisionSource});
  if(!manifest)manifest=result.manifest;else manifest.regions.push(...result.manifest.regions);
  payloads.push(...result.payloads);
 }
 return {manifest,payloads};
}
test('three-region authoring emits verified pair connections without changing inputs',async()=>{
 const {manifest,payloads}=await fixture(),before=JSON.stringify(manifest);
 const result=await prepareNavigationTransitions(manifest,payloads);assert(result);
 const graph=await decodeTransitionGraph(result.bytes,result.entry,manifest);
 const pairs=new Set(graph.portals.map(p=>[p.a.key,p.b.key].sort().join(':')));
 assert.equal(pairs.size,3);assert.equal(JSON.stringify(manifest),before);
});
test('corrupt third-region payload rejects before graph creation',async()=>{
 const {manifest,payloads}=await fixture();payloads.at(-1).bytes[0]^=1;
 await assert.rejects(prepareNavigationTransitions(manifest,payloads),/digest/);
});
test('existing two-region authoring still generates connections',async()=>{
 const {manifest,payloads}=await fixture(2);assert((await prepareNavigationTransitions(manifest,payloads))?.portals>0);
});

if(process.argv.includes('--studio'))test('actual studio prepares three source-bound connected regions within existing budgets',async()=>{
 const dir='F:/Codex/locahun-navigation-20260913',meta=JSON.parse(fs.readFileSync(dir+'/studio-full-fine.json'));
 const sources=meta.sources.map(s=>({sha256:meta.source,matrix:s.matrix}));
 const collisionSource=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
 const index=await c.LocahunWholeCollision.decodeTiles(new Uint8Array(fs.readFileSync(dir+'/studio-full-fine.lct')),meta.source);
 const collision=await c.LocahunWholeCollision.encodeTiles([...index.tiles.values()].map(t=>({coord:t.coord,boxes:index.boxes(t)})),collisionSource,.1);
 const bounds=[[[-8,-10,-8],[7.5,30,24]],[[5.5,-10,-8],[10.5,30,24]],[[8.5,-10,-8],[24,30,24]]];
 let manifest;const payloads=[];
 for(const region of bounds){const result=await prepareNavigationRegion({sources,bounds:region,collision,collisionSource});
  if(!manifest)manifest=result.manifest;else manifest.regions.push(...result.manifest.regions);payloads.push(...result.payloads);}
 const result=await prepareNavigationTransitions(manifest,payloads);assert(result);
 const graph=await decodeTransitionGraph(result.bytes,result.entry,manifest);
 assert.equal(new Set(graph.portals.flatMap(p=>[p.a.key,p.b.key])).size,3);
 if(process.argv.includes('--write-fixture')){
  manifest.graph=result.entry;
  const files=payloads.map(p=>['assets/'+p.name,Array.from(p.bytes)]);
  files.push(['assets/'+result.name,Array.from(result.bytes)]);
  fs.writeFileSync(dir+'/studio-three-region-fixture.json',JSON.stringify({manifest,files}));
 }
 console.log(JSON.stringify({source:manifest.source,regions:3,portals:graph.portals.length,totalBytes:payloads.reduce((n,p)=>n+p.bytes.length,0)+result.bytes.length}));
});
