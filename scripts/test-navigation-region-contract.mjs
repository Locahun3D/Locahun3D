import test from 'node:test';
import assert from 'node:assert/strict';
const url=new URL('./navigation-region-contract.mjs',import.meta.url);
let api;try{api=await import(url);}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const source='ab'.repeat(32),bounds=[[0,-2,0],[32,8,32]];
test('region identity binds source and exact bounds deterministically',()=>{
 assert(api);const id=api.navigationRegionKey(source,bounds);
 assert.match(id,/^[a-f0-9]{64}$/);assert.equal(api.navigationRegionKey(source,structuredClone(bounds)),id);
 assert.notEqual(api.navigationRegionKey('cd'.repeat(32),bounds),id);
 assert.notEqual(api.navigationRegionKey(source,[[0,-2,0],[31,8,32]]),id);
 assert.notEqual(api.navigationRegionKey(source,[[0,-1,0],[32,8,32]]),id);
});
test('regional metadata rejects oversized, inverted or nonfinite bounds',()=>{
 assert(api);
 for(const b of [[[0,0,0],[33,8,32]],[[0,0,0],[32,8,0]],[[NaN,0,0],[32,8,32]],[[0,0,0],[32,Infinity,32]]])assert.throws(()=>api.navigationRegionKey(source,b),/region/);
 assert.throws(()=>api.navigationRegionKey('not-a-source',bounds),/source/);
});
test('region manifest pins content and exposes no arbitrary source URL',()=>{
 assert(api);const bytes=new Uint8Array([1,2,3]);const entry=api.navigationRegionEntry(source,bounds,bytes);
 assert.equal(entry.key,api.navigationRegionKey(source,bounds));assert.equal(entry.source,source);assert.equal(entry.bytes,3);assert.match(entry.sha256,/^[a-f0-9]{64}$/);
 assert.equal(entry.url,undefined);bounds[0][0]=1;assert.equal(entry.bounds[0][0],0);bounds[0][0]=0;
 assert.throws(()=>api.navigationRegionEntry(source,bounds,new Uint8Array(2000001)),/limit/);
});
