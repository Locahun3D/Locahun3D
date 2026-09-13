import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

export const setup = `
const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],packed=new Uint32Array(8);
const mesh={initialized:Promise.resolve(),matrixWorld:{elements:matrix},updateWorldMatrix(){},packedSplats:{packedArray:packed,numSplats:2}};
globalThis.layers=[{id:1,type:'splat',visible:true,mesh,_rawBuffer:packed}];
globalThis.camPos={x:0,y:2,z:0};globalThis.walkMode={height:1.65,active:false};
globalThis.scene={};globalThis.markDirty=()=>{};globalThis.showUndoToast=()=>{};globalThis.THREE={};
globalThis.coreBuilds=0;globalThis.bakes=0;
globalThis.LocahunWalkCollision={async create(){coreBuilds++;return {rebuild(){},setTileCoverage(){},dispose(){}};}};
`;
const files=['216b_whole_collision.js','216c_collision_bake.js','216d_collision_cache.js','216_walk_settings.js','217_walk_collision_bridge.js','217b_whole_collision_bridge.js'];
export const code=files.map(name=>fs.readFileSync(new URL('../src/js/'+name,import.meta.url),'utf8')).join('\n');
export const instrumentation=`
const originalGenerate=LocahunCollisionBake.generate;
LocahunCollisionBake.generate=async(...args)=>{bakes++;return originalGenerate(...args);};
globalThis.runFixture=async()=>({ok:await _walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true}),bakes,coreBuilds,key:walkSetup.settings.whole?.key,status:walkSetup.status});
`;
export function fixture(cache) {
  const c=vm.createContext({console,crypto:webcrypto,URL,location:{href:'https://locahun3d.com/viewer/'},Uint8Array,Uint32Array,Float32Array,TextEncoder,TextDecoder,DataView,Blob,
    CompressionStream,DecompressionStream,btoa,atob,performance,
    setTimeout:(fn,ms,...args)=>setTimeout(fn,ms===1750?20:ms,...args),clearTimeout,setInterval:()=>1,clearInterval(){},
    fetch:async()=>{throw Error('Unexpected public fetch');},document:{getElementById:()=>null}});
  c.window=c;vm.runInContext(setup+'\n'+code+'\n'+instrumentation,c);
  if(cache!==undefined)c.LocahunCollisionCache=cache;
  return {c,run:s=>vm.runInContext(s,c)};
}
