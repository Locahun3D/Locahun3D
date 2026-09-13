import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const ctx=vm.createContext({console,Float32Array,Uint32Array});
vm.runInContext(fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8'),ctx);
vm.runInContext(fs.readFileSync(new URL('../src/js/404_click_navigation.js',import.meta.url),'utf8'),ctx);
test('surface ray exposes first hit point and normal; distance API unchanged',async t=>{
 const c=await ctx.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>c.dispose());
 c.rebuild({boxes:[{center:[0,-.1,0],half:[5,.1,5]},{center:[2,2,0],half:[.1,2,5]}]});
 const hit=c.raycastSurface({x:0,y:2,z:0},{x:0,y:-2,z:0},10);
 assert(Math.abs(hit.point.y)<1e-5);assert(hit.normal.y>.99);assert.equal(hit.distance,c.raycast({x:0,y:2,z:0},{x:0,y:-2,z:0},10));
 assert(c.raycastSurface({x:0,y:2,z:0},{x:1,y:0,z:0},10).normal.x<-.99);
 assert.equal(c.raycastSurface({x:0,y:2,z:0},{x:0,y:1,z:0},10),null);
 assert.throws(()=>c.raycastSurface({x:0,y:0,z:0},{x:0,y:0,z:0},1));
});
test('real navigation cannot cross thin wall or low obstacle below eye',async t=>{
 for(const obstacle of [{center:[2,2,0],half:[.005,2,2]},{center:[2,.35,0],half:[.005,.35,2]}]){
  const c=await ctx.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>c.dispose());
  c.rebuild({boxes:[{center:[0,-.1,0],half:[10,.1,10]},obstacle]});
  let p={x:0,y:1.6,z:0};const trace=[];
  const nav=ctx.LocahunClickNavigation.create({position:()=>p,setPosition:q=>p={...q},ready:()=>true,blocked:()=>false,epoch:()=>1,coverage:()=>true,
    clear:q=>{const ok=c.isCapsuleClear({x:q.x,y:q.y-1.6+.02,z:q.z},1.78,.15);trace.push({q,ok});return ok;},sweep:(a,b)=>{const out=c.moveCamera(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});trace.push({a,b,out});return out;}});
  assert(nav.start({point:{x:4,y:0,z:0},normal:{x:0,y:1,z:0}},0));
  for(let ms=100;ms<3000&&nav.active;ms+=100)nav.tick(ms);
  assert(p.x<1.86);assert(p.x>0,JSON.stringify({p,trace}));assert.equal(nav.active,false);assert.equal(p.z,0);
 }
});
test('real low ceiling destination is rejected without moving camera',async t=>{
 const c=await ctx.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>c.dispose());
 c.rebuild({boxes:[{center:[0,-.1,0],half:[10,.1,10]},{center:[4,1.75,0],half:[1,.1,1]}]});
 let p={x:0,y:1.6,z:0};
 const nav=ctx.LocahunClickNavigation.create({position:()=>p,setPosition:q=>p=q,ready:()=>true,blocked:()=>false,epoch:()=>1,coverage:()=>true,
  clear:q=>c.isCapsuleClear({x:q.x,y:q.y-1.6+.002,z:q.z},1.798,.15),sweep:()=>{throw Error('must not move');}});
 assert.equal(nav.start({point:{x:4,y:0,z:0},normal:{x:0,y:1,z:0}},0),false);assert.equal(p.x,0);
});
test('initial 1.2m eye rises continuously to target1.8 using real bounded floor support',async t=>{
 const c=await ctx.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>c.dispose());
 c.rebuild({boxes:[{center:[0,-.1,0],half:[10,.1,10]}]});
 let p={x:0,y:1.2,z:0};const hit={point:{x:4,y:0,z:0},normal:{x:0,y:1,z:0}};
 assert.equal(c.isCapsuleClear({x:0,y:1.2-1.58,z:0},1.78,.15),false);
 const clear=ctx.LocahunClickNavigation.createClearance(c,p,hit.point);
 const nav=ctx.LocahunClickNavigation.create({position:()=>p,setPosition:q=>p=q,ready:()=>true,blocked:()=>false,epoch:()=>1,coverage:()=>true,clear,
  sweep:(a,b)=>c.moveCamera(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z})});
 assert(nav.start(hit,0));assert.equal(p.y,1.2);nav.tick(100);assert(p.y>1.2&&p.y<1.6);
 for(let ms=200;ms<=1000;ms+=100)nav.tick(ms);
 assert.equal(p.x,4);assert.equal(p.y,1.8);
 assert.equal(ctx.LocahunClickNavigation.createClearance(c,{x:0,y:.2,z:0},hit.point),null);
 const airborne=ctx.LocahunClickNavigation.createClearance(c,{x:0,y:5,z:0},hit.point);assert(airborne({x:0,y:5,z:0},0));
});
