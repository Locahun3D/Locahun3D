import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
const ctx=vm.createContext({console,Float32Array,Uint32Array});
vm.runInContext(fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8'),ctx);
const Core=ctx.LocahunWalkCollision;
test('vertical voxel union keeps occupied volume and gaps without mutating inputs',()=>{
 const boxes=[{center:[0,.05,0],half:[.05,.05,.05]},{center:[0,.15,0],half:[.05,.05,.05]},
  {center:[0,.4,0],half:[.05,.05,.05]},{center:[.1,.05,0],half:[.05,.05,.05]}];
 const before=JSON.stringify(boxes),merged=Core.mergeVerticalBoxes(boxes);
 assert.equal(merged.length,3);assert.equal(JSON.stringify(boxes),before);
 const inside=(bs,x,y,z)=>bs.some(b=>[x,y,z].every((v,i)=>Math.abs(v-b.center[i])<b.half[i]-1e-9));
 for(let x=-.045;x<.15;x+=.01)for(let y=-.045;y<.5;y+=.01)assert.equal(inside(boxes,x,y,0),inside(merged,x,y,0));
});
test('actual RAD stair proxy reaches upper landing with grounded capsule',async t=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/avatar-stairs-2fstudio.json',import.meta.url),'utf8'));
 const core=await Core.create({rapier:RAPIER});t.after(()=>core.dispose());
 core.rebuild({boxes:Core.mergeVerticalBoxes(fixture.boxes)});
 core.setCharacter({x:6.6,y:-.45,z:2.25},1.7,.22);
 let vy=0,last;
 for(let i=0;i<2700;i++){vy-=9.8/90;last=core.move({x:Math.sin(2.05)*1.2/90,y:vy/90,z:Math.cos(2.05)*1.2/90});if(last.grounded&&vy<0)vy=0;if(last.feet.x>8.7)break;}
 assert.ok(last.feet.x>8.7,JSON.stringify(last));assert.ok(last.feet.y>1);assert.equal(last.grounded,true);
});
test('actual RAD stair proxy also passes at 120Hz and actual B1 walk speed',async t=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/avatar-stairs-2fstudio.json',import.meta.url),'utf8'));
 const core=await Core.create({rapier:RAPIER});t.after(()=>core.dispose());core.rebuild({boxes:Core.mergeVerticalBoxes(fixture.boxes)});
 core.setCharacter({x:6.6,y:-.45,z:2.25},1.7,.22);let vy=0,last;
 for(let i=0;i<3600;i++){vy-=9.8/120;last=core.move({x:Math.sin(2.05)*1.32995/120,y:vy/120,z:Math.cos(2.05)*1.32995/120});if(last.grounded&&vy<0)vy=0;if(last.feet.x>8.7)break;}
 assert.ok(last.feet.x>8.7,JSON.stringify(last));assert.ok(last.feet.y>1);
});
test('actual Chrome hybrid boxes pass with normal B1 acceleration and body radius',async t=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/avatar-stairs-hybrid-2fstudio.json',import.meta.url),'utf8'));
 const core=await Core.create({rapier:RAPIER});t.after(()=>core.dispose());core.rebuild({boxes:fixture.boxes});
 core.setCharacter({x:6.6,y:-.45,z:2.25},1.7,.22);let vy=0,last;
 for(let i=0;i<2700;i++){const speed=Math.min(1.32995,4*(i+1)/90);vy-=9.8/90;last=core.move({x:Math.sin(2.05)*speed/90,y:vy/90,z:Math.cos(2.05)*speed/90});if(last.grounded&&vy<0)vy=0;if(last.feet.x>8.7)break;}
 assert.ok(last.feet.x>8.7,JSON.stringify(last));assert.ok(last.feet.y>1);
});
test('step fallback neither crosses a ceiling nor invents support after a floor ends',async t=>{
 const core=await Core.create({rapier:RAPIER});t.after(()=>core.dispose());
 const travel=boxes=>{core.rebuild({boxes});core.setCharacter({x:0,y:.02,z:0},1.7,.22);let vy=0,last;for(let i=0;i<360;i++){vy-=9.8/90;last=core.move({x:1.2/90,y:vy/90,z:0});if(last.grounded&&vy<0)vy=0;}return last;};
 const cliff=travel([{center:[0,-.1,0],half:[1,.1,1]}]);assert.ok(cliff.feet.y< -1);assert.equal(cliff.grounded,false);
 const ceiling=travel([{center:[2,-.1,0],half:[4,.1,1]},{center:[2,.1,0],half:[1,.1,1]},
  {center:[2,1.85,0],half:[1,.1,1]}]);assert.ok(ceiling.feet.x<1);assert.ok(ceiling.feet.y<.1);
});
test('local detail preserves distant walls and boundary boxes within total budget',()=>{
 const points=[];for(let x=-1;x<=1;x+=.025)for(let z=-1;z<=1;z+=.025)points.push(x,0,z);
 const far={center:[8,1,0],half:[.25,1,.25]},boundary={center:[2,1,0],half:[.25,1,.25]};
 const coarse=[{center:[0,.125,0],half:[.125,.125,.125]},far,boundary];
 const refined=Core.refineLocal(new Float32Array(points),coarse,{x:0,y:0,z:0});
 assert.ok(refined.region);assert.equal(refined.region.radius,2);
 assert.ok(refined.boxes.includes(far));assert.ok(refined.boxes.includes(boundary));
 assert.ok(!refined.boxes.includes(coarse[0]));assert.ok(refined.boxes.length<=30000);
 assert.equal(coarse.length,3);
 const absent=Core.refineLocal(new Float32Array(),coarse,{x:0,y:0,z:0});
 assert.equal(absent.boxes,coarse);assert.equal(absent.region,null);
});
test('detail includes step-up headroom instead of retaining a coarse upper boundary cap',()=>{
 const p=[];for(let x=-1;x<=1;x+=.025)for(let z=-1;z<=1;z+=.025)p.push(x,0,z);
 const cap={center:[0,2.0625,0],half:[.1875,.1875,.1875]};
 const result=Core.refineLocal(new Float32Array(p),[cap],{x:0,y:0,z:0});
 assert.ok(!result.boxes.includes(cap));assert.equal(result.region.halfHeight,3);
});
test('detail region persists and requests recentering before its boundary',()=>{
 const s=vm.createContext({console,LocahunWalkCollision:Core});
 for(const name of ['216_walk_settings.js','217_walk_collision_bridge.js'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name,import.meta.url),'utf8').split('window.openWalkSetup=')[0],s);
 vm.runInContext(`walkSetup.settings=LocahunWalkSettings.parse({region:{center:{x:0,y:0,z:0},radius:12},detailRegion:{center:{x:0,y:0,z:0},radius:2,halfHeight:3}});`,s);
 assert.equal(vm.runInContext('_walkNeedsRegion({x:1,y:0,z:0},2)',s),false);
 assert.equal(vm.runInContext('_walkNeedsRegion({x:1.5,y:0,z:0},2)',s),true);
 assert.equal(vm.runInContext('_walkNeedsRegion({x:1.5,y:0,z:0},2,false)',s),false,
  'detail prefetch must not be mistaken for leaving the still-valid global collision region');
 assert.equal(vm.runInContext('LocahunWalkSettings.parse(JSON.parse(JSON.stringify(walkSetup.settings))).detailRegion.radius',s),2);
});
