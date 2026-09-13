// Offline feasibility test. This library is not loaded by the viewer.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {init,NavMeshQuery,exportNavMesh,importNavMesh,getNavMeshPositionsAndIndices} from 'file:///F:/Codex/locahun-navigation-20260913/node_modules/@recast-navigation/core/dist/index.mjs';
import {Pathfinding} from 'file:///F:/Codex/locahun-navigation-20260913/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs';
import {generateSoloNavMesh} from 'file:///F:/Codex/locahun-navigation-20260913/node_modules/@recast-navigation/generators/dist/index.mjs';
await init();
const out='F:/Codex/locahun-navigation-20260913';
function fixture(stairs){
 const boxes=[{center:[0,-.1,0],half:[5,.1,5]},{center:[-2,2.9,0],half:[3,.1,5]},
   {center:[2.5,2.9,4],half:[1.5,.1,1]}];
 if(stairs)for(let i=0;i<15;i++){const height=(i+1)*.2;boxes.push({center:[3,height/2,-3+(i+.5)*.4],half:[1,height/2,.2]});}
 return geometryFor(boxes);
}
function geometryFor(boxes){
 const positions=[],indices=[];
 for(const box of boxes){
  const geometry=new THREE.BoxGeometry(...box.half.map(v=>v*2));geometry.translate(...box.center);
  const offset=positions.length/3;positions.push(...geometry.attributes.position.array);indices.push(...Array.from(geometry.index.array,i=>i+offset));geometry.dispose();
 }
 return {positions,indices,boxes};
}
const config={cs:.1,ch:.05,walkableHeight:36,walkableClimb:6,walkableRadius:3,walkableSlopeAngle:45,minRegionArea:0,mergeRegionArea:0};
if(process.argv.includes('--camera-profile'))config.walkableRadius=2;
if(process.argv.includes('--voxel-margin'))config.walkableClimb=7;
if(process.argv.includes('--fine-nav'))Object.assign(config,{cs:.05,ch:.025,walkableHeight:72,walkableClimb:12,walkableRadius:3});
if(process.argv.includes('--camera-clearance'))Object.assign(config,{walkableHeight:80,walkableRadius:3});
const report={library:'recast-navigation@0.43.1',scope:'synthetic fixture only; no production import or runtime generation',cases:[]};
for(const stairs of [true,false]){
 const input=fixture(stairs),started=performance.now(),built=generateSoloNavMesh(input.positions,input.indices,config);
 assert(built.success,built.error);const buildMs=performance.now()-started;
 const bytes=exportNavMesh(built.navMesh);built.navMesh.destroy();
 const imported=importNavMesh(bytes),query=new NavMeshQuery(imported.navMesh);
 const [vertices,triangles]=getNavMeshPositionsAndIndices(imported.navMesh);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(triangles);
 const pathfinding=new Pathfinding(),zone=Pathfinding.createZone(geometry);pathfinding.setZoneData('fixture',zone);geometry.dispose();
 query.defaultQueryHalfExtents={x:.5,y:.3,z:.5};
 const start={x:-3,y:0,z:-3},end={x:-3,y:3,z:-3};
 const t=performance.now(),result=query.computePath(start,end),queryMs=performance.now()-t;
 const last=result.path?.at(-1),reached=!!last&&Math.hypot(last.x-end.x,last.y-end.y,last.z-end.z)<.15;
 assert.equal(reached,stairs,JSON.stringify(result));
 const jsStart=new THREE.Vector3(start.x,start.y,start.z),jsEnd=new THREE.Vector3(end.x,end.y,end.z);
 const jsPath=pathfinding.findPath(jsStart,jsEnd,'fixture',pathfinding.getGroup('fixture',jsStart));
 const jsLast=jsPath?.at(-1),jsReached=!!jsLast&&jsLast.distanceTo(jsEnd)<.15;
 assert.equal(jsReached,stairs,'small JS query must also reject disconnected floors: '+JSON.stringify(jsPath));
 if(stairs)assert(jsPath.some(p=>p.x>2));
 const serialized=Buffer.from(JSON.stringify({vertices,triangles})),compressed=gzipSync(serialized);
 if(stairs){assert(result.path.some(p=>p.x>2));assert(bytes.length<100000);fs.writeFileSync(out+'/two-floor.nav',bytes);}
 if(stairs){fs.writeFileSync(out+'/two-floor.navmesh.json',serialized);fs.writeFileSync(out+'/two-floor.navmesh.json.gz',compressed);}
 report.cases.push({stairs,buildMs,queryMs,bytes:bytes.length,reached,...result,jsReached,jsPath,meshJsonBytes:serialized.length,meshGzipBytes:compressed.length});
 query.destroy();imported.navMesh.destroy();
}
if(process.argv.includes('--saved-studio')||process.argv.includes('--full-studio')){
 const project=JSON.parse(fs.readFileSync('C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio/project-state.json','utf8')).project;
 let boxes=project.walk.boxes,description='Existing saved regional proxy, not full-scene collision';
 if(process.argv.includes('--full-studio')){
  const context=vm.createContext({Uint8Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
  vm.runInContext(fs.readFileSync(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),context);
  const suffix=process.argv.includes('--fine')?'-fine':'';
  const meta=JSON.parse(fs.readFileSync(out+'/studio-full'+suffix+'.json'));
  const index=await context.LocahunWholeCollision.decodeTiles(new Uint8Array(fs.readFileSync(out+'/studio-full'+suffix+'.lct')),meta.source);
  boxes=[...index.tiles.values()].flatMap(tile=>index.boxes(tile));description='Complete RAD leaf proxy at'+(meta.cellSize||.15)+'m; read-only source';
 }
 const input=geometryFor(boxes),t=performance.now(),built=generateSoloNavMesh(input.positions,input.indices,config);
 assert(built.success,built.error);
 const query=new NavMeshQuery(built.navMesh);query.defaultQueryHalfExtents={x:.5,y:.5,z:.5};
 const nearest=query.findClosestPoint(project.walk.spawn),[vertices,triangles]=getNavMeshPositionsAndIndices(built.navMesh);
 const bytes=gzipSync(Buffer.from(JSON.stringify({vertices,triangles})));
 report.savedStudio={source:description,boxes:boxes.length,
   buildMs:performance.now()-t,navTriangles:triangles.length/3,gzipBytes:bytes.length,spawn:project.walk.spawn,nearest};
 report.savedStudio.stairProbes=[{x:6.6,y:-.45,z:2.25},{x:7.2,y:0,z:1.85},{x:8.6,y:1,z:1.2}].map(point=>({input:point,result:query.findClosestPoint(point)}));
 const stairPoints=report.savedStudio.stairProbes.map(p=>p.result.point);
 report.savedStudio.stairRoute=query.computePath(stairPoints[0],stairPoints[2]);
 const last=report.savedStudio.stairRoute.path?.at(-1);
 report.savedStudio.stairsConnected=!!last&&Math.hypot(last.x-stairPoints[2].x,last.y-stairPoints[2].y,last.z-stairPoints[2].z)<.15;
 const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geom.setIndex(triangles);
 const finder=new Pathfinding();finder.setZoneData('studio',Pathfinding.createZone(geom));geom.dispose();
 const start=new THREE.Vector3(stairPoints[0].x,stairPoints[0].y,stairPoints[0].z),end=new THREE.Vector3(stairPoints[2].x,stairPoints[2].y,stairPoints[2].z);
 report.savedStudio.jsPath=finder.findPath(start,end,'studio',finder.getGroup('studio',start));
 report.savedStudio.jsReached=!!report.savedStudio.jsPath?.at(-1)&&report.savedStudio.jsPath.at(-1).distanceTo(end)<.15;
 report.savedStudio.accepted=report.savedStudio.stairsConnected&&report.savedStudio.jsReached;
 report.savedStudio.clearanceProfile=[];
 for(let x=7.5;x<8.8;x+=.1){
  const z=1.797-.445*(x-7.167);
  const spans=boxes.filter(b=>Math.abs(x-b.center[0])<=b.half[0]&&Math.abs(z-b.center[2])<=b.half[2]).map(b=>[b.center[1]-b.half[1],b.center[1]+b.half[1]]).sort((a,b)=>a[0]-b[0]);
  const merged=[];for(const s of spans){const last=merged.at(-1);if(last&&s[0]<=last[1]+.001)last[1]=Math.max(last[1],s[1]);else merged.push(s);}
  report.savedStudio.clearanceProfile.push({x,z,spans:merged.filter(s=>s[1]>-.6&&s[0]<4)});
 }
 const variant=process.argv.includes('--full-studio')?'full':'regional';
 fs.writeFileSync(out+'/'+variant+'-studio.navmesh.json.gz',bytes);query.destroy();built.navMesh.destroy();
}
const variant=(process.argv.includes('--full-studio')?'full':process.argv.includes('--saved-studio')?'regional':'synthetic')+(process.argv.includes('--camera-profile')?'-camera':'')+(process.argv.includes('--fine')?'-fine':'')+(process.argv.includes('--voxel-margin')?'-margin':'')+(process.argv.includes('--fine-nav')?'-nav05':'')+(process.argv.includes('--camera-clearance')?'-clearance':'');
fs.writeFileSync(out+'/nav-feasibility-'+variant+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(process.argv.includes('--fine-nav'))assert(report.savedStudio.accepted,'Actual stair route must also work in lightweight JS query');
