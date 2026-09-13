import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('real demo artifact loads through canonical bridge for both approved resource aliases without baking',async()=>{
 const report=JSON.parse(read('collision/demo-source.json'));
 const bytes=fs.readFileSync(new URL('../collision/'+report.whole.key+'.lct',import.meta.url));
 for(const url of [report.sources[0].url,'/api/demo-asset/Kousaten_ForDemo_point_cloud.rad']){
  const mesh={initialized:Promise.resolve(),matrixWorld:{elements:report.sources[0].matrix},updateWorldMatrix(){},paged:{rootUrl:url}};let requested=0;
  const c=vm.createContext({console,crypto:webcrypto,Uint8Array,Uint32Array,Float32Array,TextEncoder,TextDecoder,DataView,Blob,CompressionStream,DecompressionStream,btoa,atob,performance,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},URL,location:{href:'https://locahun3d.com/viewer'},
   fetch:async(resource,options)=>{if(options?.method==='HEAD')return new Response(null,{headers:{etag:report.metadata.httpEtag,'content-length':String(report.metadata.size)}});assert.equal(resource,'https://viewer.locahun3d.com/collision/'+report.whole.key+'.lct');requested++;return new Response(bytes,{headers:{'content-length':String(bytes.length)}});},
   layers:[{id:1,type:'splat',visible:true,mesh,_streamUrl:url}],camPos:{x:0,y:2,z:0},walkMode:{height:1.65,active:false},document:{getElementById:()=>null},scene:{},markDirty(){},showUndoToast(){},THREE:{},
   LocahunWalkCollision:{async create(){return {rebuild(){},setTileCoverage(){},dispose(){}};}}
  });c.window=c;
  for(const file of ['216a_collision_manifest.js','216b_whole_collision.js','216c_collision_bake.js','216_walk_settings.js','217_walk_collision_bridge.js','217b_whole_collision_bridge.js'])vm.runInContext(read('src/js/'+file),c);
  c.LocahunCollisionBake.generate=async()=>{throw Error('Trusted demo must not rebake');};
  assert(await vm.runInContext('_walkAutoImport()',c),vm.runInContext('walkSetup.status',c));
  assert.equal(requested,1);assert.equal(vm.runInContext('walkSetup.settings.whole.key',c),report.whole.key);
  assert.equal(vm.runInContext('walkSetup.wholeIndex.total',c),report.boxes);
 }
});
