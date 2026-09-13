import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyCandidate} from './perf-streaming-candidate.mjs';
const read=f=>applyCandidate(fs.readFileSync(new URL('../src/js/'+f,import.meta.url),'utf8'),f);
const source=read('291_render_loop.js');
const active=source.slice(source.indexOf('function _pagedStreamActive(now)'),source.indexOf('function animate(now)'));
function fixture(pager={}){
 const mesh={paged:{numSplats:100},_lastPagedN:100,_lastPagedNAt:10};
 const c=vm.createContext({layers:[{mesh}],sparkRenderer:{pager},performance:{now:()=>10000}});
 vm.runInContext(active,c);return {c,mesh,run:()=>vm.runInContext('_pagedStreamActive(10000)',c)};
}
for(const queue of ['lodTreeUpdates','readyUploads','newUploads'])test('late '+queue+' wakes a plateaued RAD',()=>{
 const p={[queue]:[{}]},h=fixture(p);assert.equal(h.run(),true);p[queue]=[];assert.equal(h.run(),false);
});
test('queued updates wake even when resident count equals header total',()=>{
 const h=fixture({lodTreeUpdates:[{}]});h.mesh._radTargetCount=100;assert.equal(h.run(),true);
});
test('resident priority list and slow in-flight fetch do not cause continuous render',()=>{
 const h=fixture({fetchPriority:[{}],fetchers:[{}],fetched:[]});assert.equal(h.run(),false);
});
test('disposed scene does not wake for stale pager queues',()=>{
 const h=fixture({lodTreeUpdates:[{}]});h.c.layers=[];assert.equal(h.run(),false);
});
test('Spark completion schedules finite existing dirty frames, without a second loop',()=>{
 const s=read('030_renderer_scene.js'),start=s.indexOf('const sparkRenderer ='),end=s.indexOf('scene.add(sparkRenderer)',start);
 let options,dirty=0;
 vm.runInNewContext(s.slice(start,end),{renderer:{},_numLodFetchers:16,SparkRenderer:class{constructor(o){options=o;}},markDirty(n){dirty=Math.max(dirty,n);}});
 assert.equal(typeof options.onDirty,'function');options.onDirty();assert(dirty>0&&dirty<=2);
});
