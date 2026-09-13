import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/216b_whole_collision.js';
import '../src/js/216c_collision_bake.js';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
test('bake reads every RAD chunk and excludes hierarchy parents',async()=>{
 const calls=[];const packed=new Uint32Array([0,0,0,0,0,0,0,0]);
 const paged={getRadMeta:async()=>({meta:{count:4,chunks:[{},{}]}}),fetchDecodeChunk:async i=>{calls.push(i);return {numSplats:2,packedArray:packed,extra:{lodTree:new Uint32Array([0,0,1,0,0,0,0,0])}};}};
 const result=await LocahunCollisionBake.generate([{paged,matrix:I}],{});
 assert.deepEqual(calls,[0,1]);assert.equal(result.entries,4);assert.equal(result.leaves,2);assert.equal(result.tiles.length,1);
});
test('bake applies source transform and rejects incomplete coverage',async()=>{
 const packed=new Uint32Array(8),matrix=[...I];matrix[12]=50;
 const r=await LocahunCollisionBake.generate([{packed:{packedArray:packed,numSplats:2},matrix}],{});
 assert(r.tiles[0].boxes[0].center[0]>49);
 const paged={getRadMeta:async()=>({meta:{count:3,chunks:[{}]}}),fetchDecodeChunk:async()=>({numSplats:2,packedArray:packed,extra:{lodTree:new Uint32Array(8)}})};
 await assert.rejects(LocahunCollisionBake.generate([{paged,matrix:I}],{}),/coverage/);
});
test('cancelled source cannot finish a bake',async()=>{
 let cancelled=false;
 const paged={getRadMeta:async()=>({meta:{count:2,chunks:[{}]}}),fetchDecodeChunk:async()=>{cancelled=true;return {numSplats:2,packedArray:new Uint32Array(8),extra:{lodTree:new Uint32Array(8)}};}};
 await assert.rejects(LocahunCollisionBake.generate([{paged,matrix:I}],{check(){if(cancelled)throw Error('cancelled');}}),/cancelled/);
});

test('RAD metadata and chunks use the job bounded await',async()=>{
 let awaits=0;
 const paged={getRadMeta:async()=>({meta:{count:2,chunks:[{}]}}),fetchDecodeChunk:async()=>({numSplats:2,packedArray:new Uint32Array(8),extra:{lodTree:new Uint32Array(8)}})};
 await LocahunCollisionBake.generate([{paged,matrix:I}],{awaitJob:async p=>{awaits++;return await p;}});
 assert.equal(awaits,2);
});
