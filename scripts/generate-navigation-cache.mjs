// Offline tooling only. The viewer never imports Recast or runs this build.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from './navigation-assets/node_modules/three/build/three.module.js';
import {init,getNavMeshPositionsAndIndices} from './navigation-assets/node_modules/@recast-navigation/core/dist/index.mjs';
import {generateSoloNavMesh} from './navigation-assets/node_modules/@recast-navigation/generators/dist/index.mjs';
import {navigationRegionKey} from './navigation-region-contract.mjs';
import {selectNavigationRegionBoxes} from './navigation-region-boxes.mjs';
const context=vm.createContext({Uint8Array,DataView,Float32Array,Uint32Array,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),context);
export async function generateNavigationCache(bytes,source,{bounds:regionBounds,outputSource=source}={}){
  if(regionBounds)navigationRegionKey(source,regionBounds);
  const index=await context.LocahunWholeCollision.decodeTiles(bytes,source);
  if(Math.abs(index.cellSize-.1)>1e-6)throw new Error('Navigation preparation requires verified 0.1m collision data');
  const allBoxes=[...index.tiles.values()].flatMap(tile=>index.boxes(tile));
  const boxes=regionBounds?selectNavigationRegionBoxes(allBoxes,regionBounds):allBoxes;
  if(!boxes.length||boxes.length>100000)throw new Error('Navigation source box limit');
  const bounds=new THREE.Box3();
  for(const b of boxes){bounds.expandByPoint(new THREE.Vector3(...b.center.map((v,i)=>v-b.half[i])));bounds.expandByPoint(new THREE.Vector3(...b.center.map((v,i)=>v+b.half[i])));}
  const size=regionBounds?new THREE.Vector3(...regionBounds[1].map((v,i)=>v-regionBounds[0][i])):bounds.getSize(new THREE.Vector3());
  const gridCells=Math.ceil(size.x/.05)*Math.ceil(size.z/.05);
  // Offline desktop-only cap; larger scans must use tiled generation, not unbounded allocation.
  if(gridCells>8000000)throw new Error('Navigation build grid limit ('+gridCells+' cells, '+size.x+' x '+size.z+'m); split this scene into regions');
  const positions=[],indices=[];
  for(const box of boxes){
    const geometry=new THREE.BoxGeometry(...box.half.map(v=>v*2));geometry.translate(...box.center);
    const offset=positions.length/3;positions.push(...geometry.attributes.position.array);
    indices.push(...Array.from(geometry.index.array,i=>i+offset));geometry.dispose();
  }
  await init();
  const result=generateSoloNavMesh(positions,indices,{cs:.05,ch:.025,walkableHeight:80,walkableClimb:12,walkableRadius:3,walkableSlopeAngle:45,minRegionArea:0,mergeRegionArea:0,...(regionBounds?{bounds:regionBounds}:{})});
  if(!result.success)throw new Error('Navigation generation failed: '+result.error);
  try{
    const [vertices,triangles]=getNavMeshPositionsAndIndices(result.navMesh);
    const encoded=await context.LocahunNavigationCache.encode({vertices,triangles},outputSource);
    return {bytes:encoded,source:outputSource,vertices:vertices.length/3,triangles:triangles.length/3};
  }finally{result.navMesh.destroy();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  if(!['--input','--source','--output'].every(n=>args.includes(n)&&value(n)&&!value(n).startsWith('--')))throw new Error('Required: --input collision.lct --source SHA256 --output navigation.lnv');
  const input=path.resolve(value('--input')),output=path.resolve(value('--output'));
  if(input===output||fs.existsSync(output))throw new Error('Output must be a new file; existing data is never overwritten');
  const size=fs.statSync(input).size;if(size>16000000)throw new Error('Collision input size limit');
  const result=await generateNavigationCache(new Uint8Array(fs.readFileSync(input)),value('--source'));
  fs.writeFileSync(output,result.bytes,{flag:'wx'});
  console.log(JSON.stringify({output,source:result.source,bytes:result.bytes.length,vertices:result.vertices,triangles:result.triangles}));
}
