import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/216b_whole_collision.js';
const C=globalThis.LocahunWholeCollision;
test('tiled proxy preserves occupancy across zero and tile boundaries',async()=>{
 const a=new C.Accumulator({cellSize:.1,minPoints:1});
 for(const x of [-3.21,-.01,.01,3.19,3.21,100])a.add(x,0,0);
 const tiles=a.tiles();assert(tiles.length>=5);
 const bytes=await C.encodeTiles(tiles,'asset-hash',.1);
 const index=await C.decodeTiles(bytes,'asset-hash');
 const local=index.query({min:[-4,-1,-1],max:[4,1,1]});
 const boxes=local.flatMap(t=>index.boxes(t));
 for(const x of [-3.21,-.01,.01,3.19,3.21])assert(boxes.some(b=>Math.abs(x-b.center[0])<=b.half[0]+1e-6));
 assert(!boxes.some(b=>b.center[0]>90));
 await assert.rejects(C.decodeTiles(bytes,'different'),/source/);
});
test('surface mesh removes internal faces and merges coplanar voxel faces',()=>{
 const a=new C.Accumulator({cellSize:.1,minPoints:1});
 for(let x=0;x<3;x++)for(let y=0;y<2;y++)for(let z=0;z<4;z++)a.add((x+.5)*.1,(y+.5)*.1,(z+.5)*.1);
 const m=a.surface();assert.equal(m.indices.length,36);assert.equal(m.vertices.length,72);
 for(const n of m.vertices)assert(Number.isFinite(n));
});
test('solid neighboring rows merge without changing occupied volume',()=>{
 const a=new C.Accumulator({cellSize:.1,minPoints:1});
 for(let x=0;x<3;x++)for(let y=0;y<2;y++)for(let z=0;z<4;z++)a.add((x+.5)*.1,(y+.5)*.1,(z+.5)*.1);
 const b=a.finish();assert.equal(b.length,1);assert(Math.abs(b[0].half.reduce((v,n)=>v*n*2,1)-.024)<1e-7);
});
test('whole-scene accumulator retains distant and negative cells and merges adjacent cells only',()=>{
 const a=new C.Accumulator({cellSize:.1});
 for(const p of [[-.05,0,0],[.05,0,0],[.25,0,0],[50,0,0]]){a.add(...p);a.add(...p);}
 const boxes=a.finish();assert.equal(boxes.length,3);
 assert(boxes.some(b=>b.center[0]>49));
 assert(boxes.some(b=>Math.abs(b.center[0])<1e-5&&Math.abs(b.half[0]-.1)<1e-5));
});
test('compact proxy roundtrip is source bound, bounded and rejects corruption',async()=>{
 const boxes=[{center:[-1,2,30],half:[.05,.1,.2]}];
 const bytes=await C.encode(boxes,'source-a');
 const round=await C.decode(bytes,'source-a');
 assert.equal(round.length,1);assert(Math.abs(round[0].half[0]-.05)<1e-7);
 await assert.rejects(C.decode(bytes,'source-b'),/source/);
 await assert.rejects(C.decode(bytes.subarray(0,8),'source-a'));
 await assert.rejects(C.encode([{center:[NaN,0,0],half:[1,1,1]}],'a'));
 await assert.rejects(C.encode([{center:[0,0,0],half:[0,1,1]}],'a'));
});
test('capacity overflow never silently coarsens or drops geometry',()=>{
 const a=new C.Accumulator({cellSize:.1,maxCells:1});a.add(0,0,0);
 assert.throws(()=>a.add(1,0,0),/limit/);
 assert.throws(()=>a.add(Infinity,0,0),/coordinate/);
});
