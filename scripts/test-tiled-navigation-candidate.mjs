// Isolated offline feasibility test; does not change the viewer or public assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
import {init,getNavMeshPositionsAndIndices,NavMeshQuery} from './navigation-assets/node_modules/@recast-navigation/core/dist/index.mjs';
import {generateTiledNavMesh,generateSoloNavMesh} from './navigation-assets/node_modules/@recast-navigation/generators/dist/index.mjs';
import {Pathfinding} from './navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {selectNavigationRegionBoxes} from './navigation-region-boxes.mjs';
import {navigationRegionKey,navigationRegionEntry} from './navigation-region-contract.mjs';
await init();
const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../src/js/403b_navigation_query.js',import.meta.url),'utf8'),context);
test('offline tiled candidate crosses tile boundaries but never jumps disconnected floors',()=>{
 const positions=[],indices=[];
 for(const y of [-.1,3.9]){
  const geometry=new THREE.BoxGeometry(48,.2,12);geometry.translate(24,y,6);
  const offset=positions.length/3;positions.push(...geometry.attributes.position.array);indices.push(...Array.from(geometry.index.array,i=>i+offset));geometry.dispose();
 }
 const result=generateTiledNavMesh(positions,indices,{cs:.05,ch:.025,tileSize:128,walkableHeight:80,walkableClimb:12,walkableRadius:3,walkableSlopeAngle:45,minRegionArea:0,mergeRegionArea:0});
 assert(result.success,result.error);
 try{
  const [vertices,triangles]=getNavMeshPositionsAndIndices(result.navMesh);
  const native=new NavMeshQuery(result.navMesh);
  const query=context.LocahunNavigationQuery.create(THREE,Pathfinding,{source:'candidate',vertices:new Float32Array(vertices.map(v=>Math.round(v*10000)/10000)),triangles:new Uint32Array(triangles)});
  try{
   for(const x of [6.4,12.8,19.2,25.6,32]){
    const route=query.find({x:x-2,y:.05,z:6},{x:x+2,y:.05,z:6},'candidate');
    assert(route?.length,'Disconnected at tile boundary '+x+' native='+JSON.stringify(native.computePath({x:x-2,y:.05,z:6},{x:x+2,y:.05,z:6})));
    assert(route.every(p=>p.y<.2));
   }
   assert.equal(query.find({x:6,y:.05,z:6},{x:8,y:4.05,z:6},'candidate'),null);
  }finally{query.dispose();native.destroy();}
 }finally{result.navMesh.destroy();}
});

if(process.argv.includes('--studio'))test('private actual studio tiled candidate retains staircase connectivity',async()=>{
 const dir='F:/Codex/locahun-navigation-20260913',meta=JSON.parse(fs.readFileSync(dir+'/studio-full-fine.json'));
 const codec=vm.createContext({Uint8Array,DataView,Float32Array,Uint32Array,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
 for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),codec);
 const index=await codec.LocahunWholeCollision.decodeTiles(fs.readFileSync(dir+'/studio-full-fine.lct'),meta.source);
 const regional=process.argv.includes('--regional'),filtered=process.argv.includes('--filter'),bounds=[[-8,-10,-8],[24,30,24]];
 assert(!filtered||regional,'Filtering requires explicit regional bounds');
 const allBoxes=[...index.tiles.values()].flatMap(tile=>index.boxes(tile)),selected=filtered?selectNavigationRegionBoxes(allBoxes,bounds):allBoxes;
 const positions=[],indices=[];let boxes=0;
 for(const box of selected){
  assert(++boxes<=100000);const geometry=new THREE.BoxGeometry(...box.half.map(v=>v*2));geometry.translate(...box.center);
  const offset=positions.length/3;positions.push(...geometry.attributes.position.array);indices.push(...Array.from(geometry.index.array,i=>i+offset));geometry.dispose();
 }
 const tileSize=process.argv.includes('--tile256')?256:128;
 const tag=regional?'regional'+(filtered?'-filtered':''):String(tileSize);
 const started=performance.now(),result=(regional?generateSoloNavMesh:generateTiledNavMesh)(positions,indices,{cs:.05,ch:.025,tileSize,walkableHeight:80,walkableClimb:12,walkableRadius:3,walkableSlopeAngle:45,minRegionArea:0,mergeRegionArea:0,...(regional?{bounds}:{})});
 assert(result.success,result.error);
 try{
  const [raw,triangles]=getNavMeshPositionsAndIndices(result.navMesh),vertices=raw.map(v=>Math.round(v*10000)/10000);
  const mesh={source:meta.source,vertices:new Float32Array(vertices),triangles:new Uint32Array(triangles)};
  const query=context.LocahunNavigationQuery.create(THREE,Pathfinding,mesh);
  try{
   const route=query.find({x:6.6,y:-.47,z:2.25},{x:8.6,y:1.1,z:1.2},meta.source);
   const native=new NavMeshQuery(result.navMesh);let nativeRoute;
   try{nativeRoute=native.computePath({x:6.6,y:-.47,z:2.25},{x:8.6,y:1.1,z:1.2});}finally{native.destroy();}
   fs.writeFileSync(dir+'/studio-tiled-diagnostic-'+tag+'.json',JSON.stringify({tileSize,regional,nativeRoute,route:route||null,vertices:vertices.length/3,triangles:triangles.length/3,logs:result.intermediates.buildContext.logs.filter(l=>/fail|error|too many/i.test(l.msg||l.message||''))},null,2));
   assert(route?.length,'actual staircase disconnected; native='+JSON.stringify(nativeRoute));
   const bytes=await codec.LocahunNavigationCache.encode(mesh,meta.source);
   if(filtered)assert(Buffer.from(bytes).equals(fs.readFileSync(dir+'/studio-regional-candidate.lnv')),'Filtered geometry changed the generated navigation binary');
   fs.writeFileSync(dir+'/studio-'+tag+'-candidate.lnv',bytes);
   if(filtered){
    const reference=JSON.parse(fs.readFileSync(dir+'/studio-regional-candidate.json'));assert.deepEqual(JSON.parse(JSON.stringify(route)),reference.route,'Filtering changed the verified staircase route');
   }
   fs.writeFileSync(dir+'/studio-'+tag+'-candidate.json',JSON.stringify({boxes,inputBoxes:allBoxes.length,regional,filtered,vertices:vertices.length/3,triangles:triangles.length/3,bytes:bytes.length,ms:performance.now()-started,route},null,2));
   if(regional){
    const key=navigationRegionKey(meta.source,bounds),bound=await codec.LocahunNavigationCache.encode(mesh,key);
    await codec.LocahunNavigationCache.decode(bound,key);
    await assert.rejects(codec.LocahunNavigationCache.decode(bound,navigationRegionKey(meta.source,[[-7,-10,-8],[24,30,24]])),/source/);
    const entry=navigationRegionEntry(meta.source,bounds,bound);
    fs.writeFileSync(dir+'/studio-'+tag+'-bound.lnv',bound);
    fs.writeFileSync(dir+'/studio-'+tag+'-entry.json',JSON.stringify(entry,null,2));
   }
  }finally{query.dispose();}
 }finally{result.navMesh.destroy();}
});
