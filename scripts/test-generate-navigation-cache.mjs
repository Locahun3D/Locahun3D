import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const file=new URL('./generate-navigation-cache.mjs',import.meta.url);
const implementation=fs.existsSync(file)?await import(file):{};
const context=vm.createContext({Uint8Array,DataView,Float32Array,Uint32Array,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),context);
const source='ab'.repeat(32);
test('offline preparation produces source-matched bounded binary navmesh',async()=>{
 assert.equal(typeof implementation.generateNavigationCache,'function');
 const tiles=[{coord:[0,-1,0],boxes:[{center:[1,-.1,1],half:[1,.1,1]}]}];
 const lct=await context.LocahunWholeCollision.encodeTiles(tiles,source,.1);
 const result=await implementation.generateNavigationCache(lct,source);
 const mesh=await context.LocahunNavigationCache.decode(result.bytes,source);
 assert(mesh.triangles.length>0);assert(result.bytes.length<10000);
 await assert.rejects(implementation.generateNavigationCache(lct,'cd'.repeat(32)),/source/i);
});
test('coarse collision is not silently advertised as the verified navigation profile',async()=>{
 assert.equal(typeof implementation.generateNavigationCache,'function');
 const lct=await context.LocahunWholeCollision.encodeTiles([{coord:[0,-1,0],boxes:[{center:[.9,-.15,.9],half:[.9,.15,.9]}]}],source,.15);
 await assert.rejects(implementation.generateNavigationCache(lct,source),/0.1m/);
});
