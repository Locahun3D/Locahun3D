import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const ctx=vm.createContext({console,Float32Array,Uint32Array});
vm.runInContext(fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8'),ctx);
async function core(t,boxes){const c=await ctx.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>c.dispose());c.rebuild({boxes});return c;}
test('camera sphere sweep stops at thin walls even at high speed and slides',async t=>{
 const c=await core(t,[{center:[1,1,0],half:[.01,5,5]}]);
 const p=c.moveCamera({x:0,y:1,z:0},{x:10,y:0,z:2});
 assert(p.x<.86&&p.x>.7);assert(p.z>1.9);
});
test('camera stops at floor and ceiling without gravity or moving avatar',async t=>{
 const c=await core(t,[{center:[0,-.1,0],half:[5,.1,5]},{center:[0,3.1,0],half:[5,.1,5]}]);
 c.setCharacter({x:3,y:.02,z:3});const before=c._avatar.translation();
 assert(c.moveCamera({x:0,y:1,z:0},{x:0,y:-20,z:0}).y>.14);
 assert(c.moveCamera({x:0,y:1,z:0},{x:0,y:20,z:0}).y<2.86);
 assert.deepEqual(c._avatar.translation(),before);
 const p=c.moveCamera({x:0,y:1,z:0},{x:0,y:0,z:2});assert(Math.abs(p.y-1)<1e-5);assert.equal(p.z,2);
});

test('camera initially overlapping a wall can retreat but cannot move deeper',async t=>{
 const c=await core(t,[{center:[1,1,0],half:[.1,5,5]}]);
 const start={x:.8,y:1,z:0}; // Radius .15 overlaps the wall by .05m.
 const retreat=c.moveCamera(start,{x:-.5,y:0,z:0});
 assert(retreat.x<.31,'retreat from initial overlap must not stick');
 const inward=c.moveCamera(start,{x:.5,y:0,z:0});
 assert(inward.x<=start.x+1e-5,'initial overlap must not permit deeper movement');
});

test('camera retreat from overlap still stops at a second wall',async t=>{
 const c=await core(t,[{center:[1,1,0],half:[.1,5,5]},{center:[-1,1,0],half:[.01,5,5]}]);
 const p=c.moveCamera({x:.8,y:1,z:0},{x:-10,y:0,z:0});
 assert(p.x>-.85&&p.x<-.8,'escape must retain collision with other obstacles');
});
