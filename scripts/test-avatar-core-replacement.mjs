import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const ctx=vm.createContext({console,Float32Array,Uint32Array});
vm.runInContext(fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8'),ctx);
const box=(x,y,z,hx,hy,hz)=>({center:[x,y,z],half:[hx,hy,hz]});
test('actual indoor stair straddle is clear but has only 1/5 or 2/5 spawn supports',async t=>{
 const c=await ctx.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>c.dispose());
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/avatar-indoor-replacement-2fstudio.json',import.meta.url),'utf8'));
 for(const s of fixture.samples){c.rebuild({boxes:s.boxes});assert.ok(s.probes[0].supports<3);assert.equal(s.probes[0].clear,true);
  const p=c.reconcileFeet(s.feet,1.7,.22,true);assert.ok(p);assert.equal(p.x,s.feet.x);assert.equal(p.z,s.feet.z);
  assert.ok(Math.abs(p.y-s.feet.y)<.01);assert.equal(c.isCapsuleClear(p,1.7,.22),true);
 }
});
test('replacement settles grounded capsule vertically, never snaps airborne or crosses walls/ceilings/gaps',async t=>{
 const c=await ctx.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>c.dispose());
 const p={x:0,y:.06,z:0};c.rebuild({boxes:[box(0,-.1,0,2,.1,2)]});
 const down=c.reconcileFeet(p,1.7,.22,true);assert.ok(down&&down.y<.03);assert.equal(down.x,0);assert.equal(down.z,0);assert.equal(p.y,.06);
 assert.equal(c.reconcileFeet(p,1.7,.22,false),null);
 c.rebuild({boxes:[box(0,-.02,0,2,.1,2)]});const up=c.reconcileFeet(p,1.7,.22,true);assert.ok(up&&up.y>=.08&&up.y<.15);
 c.rebuild({boxes:[box(0,-.1,0,2,.1,2),box(0,1,0,.05,1,1)]});assert.equal(c.reconcileFeet(p,1.7,.22,true),null);
 c.rebuild({boxes:[box(0,-.02,0,2,.1,2),box(0,1.8,0,2,.08,2)]});assert.equal(c.reconcileFeet(p,1.7,.22,true),null);
 c.rebuild({boxes:[]});assert.equal(c.reconcileFeet(p,1.7,.22,true),null);
 c.rebuild({boxes:[box(0,-.6,0,2,.1,2)]});assert.equal(c.reconcileFeet(p,1.7,.22,true),null);
});
