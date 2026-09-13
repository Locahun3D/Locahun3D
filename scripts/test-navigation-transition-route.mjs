import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=new URL('./navigation-transition-route.mjs',import.meta.url);
const find=fs.existsSync(url)?(await import(url)).findTwoRegionRoute:null;
const from={x:0,y:0,z:0},to={x:4,y:0,z:0};
const pair={a:{x:2,y:0,z:0},b:{x:2.01,y:0,z:0}};
const fixture=()=>({from,to,candidates:[pair],a:{key:'a'.repeat(64),bounds:[[-1,-1,-1],[3,4,1]],query:{find:(a,b)=>[a,b]}},b:{key:'b'.repeat(64),bounds:[[1,-1,-1],[5,4,1]],query:{find:(a,b)=>[a,b]}},clearance:()=>true});
test('both independently bound paths are required to join a transition',()=>{
 assert.equal(typeof find,'function');const result=find(fixture());
 assert.equal(result.status,'unverified-route');
 assert.equal(result.keys.length,2);assert.deepEqual(result.points[0],from);assert.deepEqual(result.points.at(-1),to);
});
test('disconnected, obstructed, partial or wrong-floor paths reject',()=>{
 assert.equal(typeof find,'function');
 for(const bad of [()=>null,(a,b)=>[a,{...b,y:3}],(a,b)=>[a,{...b,x:b.x-.5}]]){
  const input=fixture();input.b.query.find=bad;assert.equal(find(input),null);
 }
 assert.equal(find({...fixture(),clearance:()=>false}),null);
});
test('total path length and geometry bounds are checked, not just endpoints',()=>{
 assert.equal(typeof find,'function');const input=fixture();input.a.query.find=(a,b)=>[a,{x:2,y:0,z:99},b];assert.equal(find(input),null);
 const long=fixture();long.to={x:35,y:0,z:0};assert.equal(find(long),null);
});
