import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
const context=vm.createContext({Uint8Array,Float32Array,Uint32Array,DataView,Blob,CompressionStream,DecompressionStream});
const file=new URL('../src/js/403_navigation_cache.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),context);
const source='ab'.repeat(32),mesh={vertices:[0,0,0,1,0,0,0,0,1],triangles:[0,2,1]};
test('navigation cache roundtrips exact geometry and source profile',async()=>{
 const c=context.LocahunNavigationCache;assert(c);
 const bytes=await c.encode(mesh,source),decoded=await c.decode(bytes,source);
 assert.deepEqual(Array.from(decoded.vertices),mesh.vertices);assert.deepEqual(Array.from(decoded.triangles),mesh.triangles);
 assert.equal(decoded.source,source);assert(bytes.length<200);
});
test('wrong source, broken compression and nonfinite geometry reject',async()=>{
 const c=context.LocahunNavigationCache;assert(c);
 const bytes=await c.encode(mesh,source);
 await assert.rejects(c.decode(bytes,'cd'.repeat(32)),/source/);
 await assert.rejects(c.decode(bytes.slice(0,8),source));
 for(const bad of [{...mesh,vertices:[NaN,0,0,1,0,0,0,0,1]},{...mesh,triangles:[0,2,9]},{...mesh,triangles:[0,0,1]}])await assert.rejects(c.encode(bad,source));
});
test('oversized input and malformed source reject without decompression',async()=>{
 const c=context.LocahunNavigationCache;assert(c);
 await assert.rejects(c.decode(new Uint8Array(2000001),source),/limit/);
 await assert.rejects(c.encode(mesh,'not-a-hash'),/source/);
});
test('decompression expansion and NaN movement profile reject',async()=>{
 const c=context.LocahunNavigationCache;
 await assert.rejects(c.decode(new Uint8Array(gzipSync(Buffer.alloc(2000001))),source),/limit/);
 const raw=gunzipSync(await c.encode(mesh,source));raw.writeFloatLE(NaN,44);
 await assert.rejects(c.decode(new Uint8Array(gzipSync(raw)),source),/profile/);
});

test('distinct indices cannot hide collinear, duplicate-position or float32-collapsed triangles',async()=>{
 const c=context.LocahunNavigationCache;
 for(const vertices of [[0,0,0,1,0,0,2,0,0],[0,0,0,0,0,0,0,0,1],[9999,0,0,9999.00001,0,0,9999,0,1]]){
  await assert.rejects(c.encode({vertices,triangles:[0,1,2]},source),/Degenerate/);
 }
 const raw=gunzipSync(await c.encode(mesh,source));
 raw.writeFloatLE(2,60+6*4);raw.writeFloatLE(0,60+8*4);
 await assert.rejects(c.decode(new Uint8Array(gzipSync(raw)),source),/Degenerate/);
});
