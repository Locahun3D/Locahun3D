import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shipped,bodies,replaceBody,exportFunction,instantiate} from './perf-wasm-tools.mjs';
const original=shipped().bytes;
const replacement=fs.readFileSync('F:/Codex/locahun-performance-20260911/heap-pop.wasm');
const candidate=replaceBody(original,319,bodies(replacement)[0]);
assert(WebAssembly.validate(candidate),'candidate WASM validates');
const instances=[original,candidate].map(b=>instantiate(exportFunction(b,'perf_heap_pop',319)));
function priority(bits){const b=new ArrayBuffer(4);new Uint32Array(b)[0]=bits;return new Float32Array(b)[0];}
function greater(a,b){const x=priority(a[0]),y=priority(b[0]);if(x>y)return true;if(x<y)return false;if(Number.isNaN(x)!==Number.isNaN(y))return Number.isNaN(x);return a[1]>b[1]||(a[1]===b[1]&&a[2]>b[2]);}
function fixture(entries){const heap=[];for(const e of entries){let i=heap.length;heap.push(e);while(i){const p=(i-1)>>1;if(!greater(e,heap[p]))break;heap[i]=heap[p];i=p;}heap[i]=e;}return heap;}
function drain(instance,entries){const {memory,perf_heap_pop:pop}=instance.exports,start=memory.buffer.byteLength;memory.grow(Math.ceil((entries.length*12+64)/65536));const words=new Uint32Array(memory.buffer),h=start/4,out=h+4,data=h+8;words[h]=entries.length;words[h+1]=data*4;words[h+2]=entries.length;entries.forEach((e,i)=>words.set(e,data+i*3));const result=[];for(let i=0;i<=entries.length;i++){pop(out*4,h*4);result.push([...words.subarray(out,out+(words[out]?4:1))]);}return result;}
for(const count of [0,1,2,3,4,10,255,1024,65536])test('heap pop exact priority/tie/NaN/zero order, n='+count,()=>{
 let seed=42;const edge=[0,0x80000000,0x7fc00000,0x7f800000,0xff800000,0x3f800000,0xbf800000];
 const entries=fixture(Array.from({length:count},(_,i)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return [i%7===0?edge[(i/7)%edge.length|0]:seed,i%3,i];}));
 assert.deepEqual(drain(instances[1],entries),drain(instances[0],entries));
});
fs.writeFileSync('F:/Codex/locahun-performance-20260911/candidate-worker.wasm',candidate);

function heapify(entries){
 const heap=entries.map(e=>e.slice());
 for(let root=(heap.length>>1)-1;root>=0;root--){
  let at=root;const value=heap[at];
  while(at*2+1<heap.length){let child=at*2+1;if(child+1<heap.length&&greater(heap[child+1],heap[child]))child++;if(!greater(heap[child],value))break;heap[at]=heap[child];at=child;}
  heap[at]=value;
 }
 return heap;
}
for(const layout of ['insert','bottom-up'])test('random valid heap layouts and equal-priority ties: '+layout,()=>{
 let seed=98171;
 const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const edge=[0,0x80000000,0x7fc00000,0x7fa00001,0xffc00001,0x7f800000,0xff800000,0x3f800000];
 for(let trial=0;trial<100;trial++){
  const entries=Array.from({length:random()%2048},(_,i)=>[edge[random()%edge.length],random()%5,i]);
  for(let i=entries.length-1;i>0;i--){const j=random()%(i+1);[entries[i],entries[j]]=[entries[j],entries[i]];}
  const heap=(layout==='insert'?fixture:heapify)(entries);
  assert.deepEqual(drain(instances[1],heap),drain(instances[0],heap),'trial '+trial);
 }
});
test('identical tuple duplicates preserve exact output',()=>{
 const entries=heapify(Array.from({length:4096},(_,i)=>[0x3f800000,i%3,i%7]));
 assert.deepEqual(drain(instances[1],entries),drain(instances[0],entries));
});
test('equal-key signed-zero/NaN payload variants preserve semantic order and bit inventory',()=>{
 const bits=[0,0x80000000,0x7fc00000,0x7fa00001,0xffc00001,0x7f800000,0xff800000];
 const entries=heapify(Array.from({length:4096},(_,i)=>[bits[i%bits.length],0,0]));
 const outputs=instances.map(instance=>drain(instance,entries));
 const canonical=rows=>rows.map(r=>r.length===1?r:[r[0],Number.isNaN(priority(r[1]))?'NaN':priority(r[1])===0?0:priority(r[1]),r[2],r[3]]);
 assert.deepEqual(canonical(outputs[1]),canonical(outputs[0]));
 assert.deepEqual(outputs[1].map(JSON.stringify).sort(),outputs[0].map(JSON.stringify).sort());
});
