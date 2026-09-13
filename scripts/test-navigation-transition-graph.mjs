import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {navigationRegionKey} from './navigation-region-contract.mjs';
const url=new URL('./navigation-transition-graph.mjs',import.meta.url),api=fs.existsSync(url)?await import(url):{};
const source='a'.repeat(64);
function fixture(){
 const regions=[[[0,-1,0],[10,4,10]],[[5,-1,0],[15,4,10]]].map(bounds=>{
  const entry={source,bounds,key:navigationRegionKey(source,bounds),sha256:'b'.repeat(64),bytes:100};return {navigation:entry,collision:{...entry,sha256:'c'.repeat(64)}};
 });
 return {manifest:{schema:1,source,regions},portals:[{a:{key:regions[0].navigation.key,point:{x:7,y:0,z:3}},b:{key:regions[1].navigation.key,point:{x:7.01,y:0,z:3}}}]};
}
test('graph roundtrip binds exact region payloads independent of manifest order',async()=>{
 assert.equal(typeof api.encodeTransitionGraph,'function');const {manifest,portals}=fixture(),before=JSON.stringify(manifest);
 const packed=await api.encodeTransitionGraph(manifest,portals),graph=await api.decodeTransitionGraph(packed.bytes,packed.entry,manifest);
 assert.equal(graph.portals.length,1);assert.equal(JSON.stringify(manifest),before);
 assert.deepEqual(await api.decodeTransitionGraph(packed.bytes,packed.entry,{...manifest,regions:[...manifest.regions].reverse()}),graph);
});

test('asynchronous hashing owns input bytes and manifest snapshots',async()=>{
 const {manifest,portals}=fixture(),encoded=api.encodeTransitionGraph(manifest,portals);
 portals[0].a.point.x=999;const packed=await encoded;
 const decoding=api.decodeTransitionGraph(packed.bytes,packed.entry,manifest);
 packed.bytes.fill(0);manifest.source='f'.repeat(64);packed.entry.sha256='f'.repeat(64);
 assert.equal((await decoding).portals.length,1);
});
test('changed payload, corrupt graph, unknown key and stacked-floor portal reject',async()=>{
 assert.equal(typeof api.encodeTransitionGraph,'function');const {manifest,portals}=fixture(),packed=await api.encodeTransitionGraph(manifest,portals);
 const changed=structuredClone(manifest);changed.regions[0].collision.sha256='d'.repeat(64);
 await assert.rejects(api.decodeTransitionGraph(packed.bytes,packed.entry,changed),/binding/i);
 const bytes=packed.bytes.slice();bytes[0]^=1;await assert.rejects(api.decodeTransitionGraph(bytes,packed.entry,manifest),/digest/i);
 portals[0].b.point.y=3;await assert.rejects(api.encodeTransitionGraph(manifest,portals),/portal/i);
 portals[0].b.point.y=0;portals[0].b.key='f'.repeat(64);await assert.rejects(api.encodeTransitionGraph(manifest,portals),/portal/i);
});
