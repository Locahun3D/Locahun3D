import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const url=new URL('./navigation-transition-candidates.mjs',import.meta.url);
const find=fs.existsSync(url)?(await import(url)).findTransitionCandidates:null;
const source='a'.repeat(64),bounds=[[-1,-2,-1],[5,6,5]];
const mesh=(y=0)=>({source,vertices:new Float32Array([0,y,0,4,y,0,4,y,4,0,y,4]),triangles:new Uint32Array([0,2,1,0,3,2])});
test('overlapping surfaces provide bounded provisional pairs, not connections',()=>{
 assert.equal(typeof find,'function');
 const a=mesh(),b=mesh();b.triangles=new Uint32Array([0,3,1,1,3,2]);
 const points=find(a,b,bounds,bounds);
 assert(points.length>0);assert(points.length<=256);
 for(const point of points){assert.equal(point.status,'unverified');assert(Math.abs(point.a.y-point.b.y)<.025);}
});
test('stacked floors and separated geometry do not connect through overlapping bounds',()=>{
 assert.equal(typeof find,'function');
 assert.deepEqual(find(mesh(),mesh(3),bounds,bounds),[]);
 const b=mesh();for(let i=0;i<b.vertices.length;i+=3)b.vertices[i]+=5;
 assert.deepEqual(find(mesh(),b,bounds,[[-1,-2,-1],[10,6,5]]),[]);
});
test('boundary-only overlap and invalid geometry fail closed',()=>{
 assert.equal(typeof find,'function');
 assert.deepEqual(find(mesh(),mesh(),[[0,-2,0],[2,6,4]],[[2,-2,0],[4,6,4]]),[]);
 const invalid=mesh();invalid.vertices[0]=NaN;
 assert.throws(()=>find(invalid,mesh(),bounds,bounds),/geometry/i);
});

if(process.argv.includes('--studio'))test('real studio independently generated overlapping regions yield surface candidates',async()=>{
 const {prepareNavigationRegion}=await import('./prepare-navigation-region.mjs');
 const c=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,Blob,TextEncoder,TextDecoder,CompressionStream,DecompressionStream});
 for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),c);
 const root='F:/Codex/locahun-navigation-20260913',meta=JSON.parse(fs.readFileSync(root+'/studio-full-fine.json'));
 const sources=meta.sources.map(s=>({sha256:meta.source,matrix:s.matrix}));
 const collisionSource=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',.1,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
 const index=await c.LocahunWholeCollision.decodeTiles(new Uint8Array(fs.readFileSync(root+'/studio-full-fine.lct')),meta.source);
 const collision=await c.LocahunWholeCollision.encodeTiles([...index.tiles.values()].map(t=>({coord:t.coord,boxes:index.boxes(t)})),collisionSource,.1);
 const boundsA=[[-8,-10,-8],[8.5,30,24]],boundsB=[[process.argv.includes('--narrow')?6.8:process.argv.includes('--cross-route')?6.4:6,-10,-8],[24,30,24]],meshes=[],manifests=[],bundleFiles=[];
 for(const bounds of [boundsA,boundsB]){
  const bundle=await prepareNavigationRegion({sources,bounds,collision,collisionSource});
  manifests.push(bundle.manifest);
  bundleFiles.push(...bundle.payloads.map(p=>['assets/'+p.name,[...p.bytes]]));
  meshes.push(await c.LocahunNavigationCache.decode(bundle.payloads[0].bytes,bundle.manifest.regions[0].navigation.key));
 }
 const candidates=find(...meshes,boundsA,boundsB);
 assert(candidates.length>0);assert(candidates.every(p=>p.status==='unverified'));
 console.log(JSON.stringify({studioTransitionCandidates:candidates.length,stairs:candidates.filter(p=>p.a.z>0&&p.a.z<3&&p.a.y>-1&&p.a.y<2).length}));
 if(process.argv.includes('--clearance')){
  const {verifyTransitionClearance}=await import('./navigation-transition-clearance.mjs');
  const {verifyRouteClearance}=await import('./navigation-route-clearance.mjs');
  const {selectNavigationRegionBoxes}=await import('./navigation-region-boxes.mjs');
  const boxes=selectNavigationRegionBoxes([...index.tiles.values()].flatMap(t=>index.boxes(t)),[[5.5,-10,-8],[9,30,24]]);
  const require=createRequire(new URL('../../locahun3d_online/package.json',import.meta.url)),{chromium}=require('playwright');
  let html=fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');
  const hook=fs.readFileSync(new URL('../src/js/403n_navigation_transition_graph.js',import.meta.url),'utf8')+`window.verifySeam=async({boxes,candidates})=>{
   const verify=${verifyTransitionClearance.toString()},core=await LocahunWalkCollision.create();
   try{core.rebuild({boxes});const accepted=candidates.filter(p=>verify(p,core));
    if(!accepted.length)return {accepted:0};
    const p=accepted[0].a;
    core.rebuild({boxes:[...boxes,{center:[p.x,p.y+1,p.z],half:[.3,1,.3]}]});
    const blocked=verify(accepted[0],core);
    core.rebuild({boxes:[...boxes,{center:[p.x,p.y+1.5,p.z],half:[.4,.1,.4]}]});
    return {accepted:accepted.length,acceptedIndices:accepted.map(p=>candidates.indexOf(p)),stairs:accepted.filter(p=>p.a.z>0&&p.a.z<3&&p.a.y>-1&&p.a.y<2).length,blocked,lowCeiling:verify(accepted[0],core)};
   }finally{core.dispose();}
  };
  window.verifySeamRoute=async({boxes,points,wall})=>{
   const core=await LocahunWalkCollision.create();
   try{core.rebuild({boxes:wall?[...boxes,{center:[7.5,1.5,1.7],half:[.15,2,2]}]:boxes});
    let position={...points[0],y:points[0].y+1.8};
    const nav=LocahunClickNavigation.create({position:()=>position,setPosition:p=>position={...p},ready:()=>true,blocked:()=>false,epoch:()=>1,coverage:()=>true,
     clear:p=>core.isCapsuleClear({x:p.x,y:p.y-1.5,z:p.z},1.7,.15),
     sweep:(a,b)=>core.moveCamera(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},.15)});
    const accepted=nav.start({point:points.at(-1),normal:{x:0,y:1,z:0}},0,points.slice(1).map(p=>({...p,y:p.y+1.8})));
    for(let t=16;t<=10000&&nav.active;t+=16)nav.tick(t);
    return {accepted,reason:nav.stopReason,position};
   }finally{core.dispose();}
  };`;
  const fullGate=`window.graphZipRoundtrip=async({manifest,files})=>{
   walkSetup.settings.navigationRegions=manifest;
   _regionalNavigationFiles={source:manifest.source,files:new Map(files.map(([name,bytes])=>[name,new Uint8Array(bytes)]))};
   const blob=await saveProjectZip(true,{returnBlob:true});if(!(blob instanceof Blob))throw Error('Graph ZIP failed');
   const fflate=await getFflate(),zip=fflate.unzipSync(new Uint8Array(await blob.arrayBuffer()));
   const names=Object.keys(zip).filter(name=>/\\.(lnv|lcp|lng)$/.test(name));
   _regionalNavigationFiles=null;await _loadProjectZipFromFile(new File([blob],'graph-roundtrip.zip'));
   return {bytes:blob.size,count:names.length,restored:_regionalNavigationFiles?.files.size,graph:_walkSaveSettings().navigationRegions?.graph};
  };
  window.verifyFullRoute=async({boxes,points,wall})=>{const core=await LocahunWalkCollision.create();try{
   core.rebuild({boxes:wall?[...boxes,{center:[7.5,1.5,1.7],half:[.15,2,2]}]:boxes});
   return (${verifyRouteClearance.toString()})(points,core,LocahunClickNavigation);
  }finally{core.dispose();}};`;
  const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+fullGate+html.slice(at);
  const browser=await chromium.launch({channel:'chrome',headless:true}),timer=setTimeout(()=>browser.close(),90000);
  try{
   const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://127.0.0.1:18995/',r=>r.fulfill({contentType:'text/html',body:html}));
   await page.goto('http://127.0.0.1:18995/');await page.waitForFunction(()=>window.verifySeam);
   const result=await page.evaluate(input=>verifySeam(input),{boxes,candidates});
   assert(result.accepted>0);assert.equal(result.blocked,false);assert.equal(result.lowCeiling,false);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({actualRapierClearance:{...result,acceptedIndices:undefined},boxes:boxes.length}));
   if(process.argv.includes('--cross-route')){
    const {findTwoRegionRoute,selectVerifiedTwoRegionRoute}=await import('./navigation-transition-route.mjs');
    const THREE=await import('./navigation-assets/node_modules/three/build/three.module.js');
    const {Pathfinding}=await import('./navigation-assets/node_modules/three-pathfinding/dist/three-pathfinding.modern.mjs');
    vm.runInContext(fs.readFileSync(new URL('../src/js/403b_navigation_query.js',import.meta.url),'utf8'),c);
    const queries=meshes.map(m=>c.LocahunNavigationQuery.create(THREE,Pathfinding,m));
    try{
     const safe=result.acceptedIndices.map(i=>candidates[i]);
     if(process.env.DEBUG_TRANSITIONS)console.log(JSON.stringify(safe.map(p=>({p,left:queries[0].find({x:6.6,y:-.47,z:2.25},p.a,meshes[0].source),right:queries[1].find(p.b,{x:8.6,y:1.1,z:1.2},meshes[1].source)})).filter(p=>p.left||p.right)));
     const input={from:{x:6.6,y:-.47,z:2.25},to:{x:8.6,y:1.1,z:1.2},candidates:safe,
      a:{key:meshes[0].source,bounds:boundsA,query:queries[0]},b:{key:meshes[1].source,bounds:boundsB,query:queries[1]},clearance:p=>safe.includes(p)};
     const route=findTwoRegionRoute(input);
     assert(route,'Real cross-region staircase route missing');
     let attempts=0;const verified=await selectVerifiedTwoRegionRoute(input,route=>{attempts++;return page.evaluate(input=>verifyFullRoute(input),{boxes,points:route.points});});
     console.log(JSON.stringify({verifiedSelection:{attempts,status:verified?.status||null}}));
     if(process.argv.includes('--narrow')){
      assert.equal(await page.evaluate(input=>verifyFullRoute(input),{boxes,points:route.points}),false,'Wall-adjacent narrow route must fail the full-trip gate');
      assert.equal(verified,null,'No blocked narrow route may be certified');
      console.log('Narrow overlap route rejected by full-trip gate');return;
     }
     assert.equal(verified?.status,'verified-route');
     const {encodeTransitionGraph,decodeTransitionGraph}=await import('./navigation-transition-graph.mjs');
     const manifest={...manifests[0],regions:manifests.flatMap(m=>m.regions)};
     const packed=await encodeTransitionGraph(manifest,[{a:{key:verified.keys[0],point:verified.transition.a},b:{key:verified.keys[1],point:verified.transition.b}}]);
     assert.equal((await decodeTransitionGraph(packed.bytes,packed.entry,manifest)).portals.length,1);
     const browserGraph=await page.evaluate(async({bytes,entry,manifest})=>{
      const codec=LocahunTransitionGraph.create(async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''));
      const graph=await codec.decode(new Uint8Array(bytes),entry,manifest);
      const corrupt=new Uint8Array(bytes);corrupt[0]^=1;let rejected=false;
      try{await codec.decode(corrupt,entry,manifest);}catch{rejected=true;}
      return {portals:graph.portals.length,rejected};
     },{bytes:[...packed.bytes],entry:packed.entry,manifest});
     assert.deepEqual(browserGraph,{portals:1,rejected:true});
     const collected=await page.evaluate(async({manifest,files})=>{
      const data=new Map(files.map(([name,bytes])=>[name,new Uint8Array(bytes)]));
      return (await LocahunNavigationFiles.read(manifest,name=>data.get(name))).files.size;
     },{manifest:{...manifest,graph:packed.entry},files:[...bundleFiles,['assets/'+packed.entry.sha256+'.lng',[...packed.bytes]]]});
     assert.equal(collected,5,'Browser packaging must retain both regions and graph');
     if(process.argv.includes('--graph-zip')){
      const result=await page.evaluate(input=>graphZipRoundtrip(input),{manifest:{...manifest,graph:packed.entry},files:[...bundleFiles,['assets/'+packed.entry.sha256+'.lng',[...packed.bytes]]]});
      assert.equal(result.count,5);assert.equal(result.restored,5);assert.equal(result.graph.sha256,packed.entry.sha256);
      console.log(JSON.stringify({graphZip:result}));
     }
     console.log(JSON.stringify({sourceBoundGraphBytes:packed.bytes.length}));
     assert.equal(await page.evaluate(input=>verifyFullRoute(input),{boxes,points:route.points}),true,'Full route gate must pass');
     assert.equal(await page.evaluate(input=>verifyFullRoute(input),{boxes,points:route.points,wall:true}),false,'Full route gate must reject wall');
     console.log(JSON.stringify({crossRegionRoute:route}));
     const upward=await page.evaluate(input=>verifySeamRoute(input),{boxes,points:route.points});
     const downward=await page.evaluate(input=>verifySeamRoute(input),{boxes,points:[...route.points].reverse()});
     const blocked=await page.evaluate(input=>verifySeamRoute(input),{boxes,points:route.points,wall:true});
     console.log(JSON.stringify({crossRegionController:{upward,downward,blocked}}));
     assert(upward.accepted&&upward.reason==='complete');assert(downward.accepted&&downward.reason==='complete');assert.notEqual(blocked.reason,'complete');
     assert.deepEqual(errors,[]);
    }finally{queries.forEach(q=>q.dispose());}
   }
  }finally{clearTimeout(timer);await browser.close();}
 }
});
