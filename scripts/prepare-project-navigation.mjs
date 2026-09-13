import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({Uint8Array,DataView,Float32Array,Uint32Array,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),context);
function bytes(data,max){
 if(typeof data!=='string'||!data.length||data.length>max||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new Error('Invalid encoded navigation preparation data');
 const value=Buffer.from(data,'base64');
 if(value.toString('base64')!==data)throw new Error('Noncanonical base64 data');
 return value;
}
// Desktop packaging only. Runtime independently verifies source matrices/signature.
export async function prepareProjectNavigation(input){
 const project=structuredClone(input),whole=project.walk?.whole;
 if(!whole)return {project,status:'missing-collision'};
 const collision=bytes(whole.data,22000000);
 const index=await context.LocahunWholeCollision.decodeTiles(collision,whole.key);
 if(project.walk.cellSize!==undefined&&(!Number.isFinite(project.walk.cellSize)||Math.abs(index.cellSize-project.walk.cellSize)>1e-6))throw new Error('Collision cell size mismatch');
 if(Math.abs(index.cellSize-.1)>1e-6){
  delete project.walk.navigation;
  return {project,status:'unsupported-cell-size'};
 }
 const saved=project.walk.navigation;
 if(saved?.key===whole.key){
  try{
   await context.LocahunNavigationCache.decode(bytes(saved.data,2700000),whole.key);
   return {project,status:'reused'};
  }catch{/* Regenerate invalid optional routes from the validated collision proxy. */}
 }
 const {generateNavigationCache}=await import('./generate-navigation-cache.mjs');
 const result=await generateNavigationCache(collision,whole.key);
 project.walk.navigation={key:whole.key,data:Buffer.from(result.bytes).toString('base64')};
 return {project,status:'generated',bytes:result.bytes.length};
}
