import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import RAPIER from '../vendor/rapier-walk/rapier.mjs';
import '../src/js/215_walk_collision.js';
import '../src/js/216b_whole_collision.js';
const C=globalThis.LocahunWholeCollision;
test('prebuilt tile changes preserve character and do not rebuild unchanged tiles',async t=>{
 const a=new C.Accumulator({cellSize:.1,minPoints:1});
 for(let x=-10;x<90;x++)for(let z=-3;z<4;z++)a.add((x+.5)*.1,-.05,(z+.5)*.1);
 const index=await C.decodeTiles(await C.encodeTiles(a.tiles(),'floor',.1),'floor');
 const core=await LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>core.dispose());
 const bounds={min:[-1,-1,-1],max:[4,2,1]};
 const first=core.setTileCoverage(index,bounds);assert(first.added>0);
 core.setCharacter({x:0,y:.02,z:0});
 const same=core.setTileCoverage(index,bounds);assert.equal(same.added,0);assert.equal(same.removed,0);
 for(let i=0;i<240;i++){
   const x=i*.025;
   core.setTileCoverage(index,{min:[x-1,-1,-1],max:[x+2,2,1]});
   const result=core.move({x:.025,y:-.02,z:0});assert(Math.abs(result.feet.y)<.06);
 }
 const end=core.move({x:0,y:-.02,z:0});assert(end.feet.x>5.8);assert(end.grounded);
});
test('invalid new tile cannot remove valid old geometry',async t=>{
 const core=await LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>core.dispose());
 const tile={id:'0',count:1};const good={query:()=>[tile],boxes:()=>[{center:[0,-.1,0],half:[2,.1,2]}]};
 core.setTileCoverage(good,{});
 const bad={query:()=>[{id:'1',count:1}],boxes:()=>[{center:[NaN,0,0],half:[1,1,1]}]};
 assert.throws(()=>core.setTileCoverage(bad,{}));assert(core.raycast({x:0,y:1,z:0},{x:0,y:-1,z:0},2)!==null);
});

test('tile transition budgets final occupancy while retaining rollback headroom',async t=>{
 const source=fs.readFileSync(new URL('../src/js/215_walk_collision.js',import.meta.url),'utf8');
 const c=vm.createContext({console});vm.runInContext(source.replace('const MAX_CELLS = 100000;','const MAX_CELLS = 8;'),c);
 const core=await c.LocahunWalkCollision.create({rapier:RAPIER});t.after(()=>core.dispose());
 const make=(id,x)=>({query:()=>[{id}],boxes:()=>Array.from({length:6},(_,z)=>({center:[x,-.1,z],half:[.4,.1,.4]}))});
 core.setTileCoverage(make('old',0),{});
 assert.doesNotThrow(()=>core.setTileCoverage(make('new',4),{}));
 assert.equal(core.raycast({x:0,y:1,z:0},{x:0,y:-1,z:0},2),null);
 assert(core.raycast({x:4,y:1,z:0},{x:0,y:-1,z:0},2)!==null);
});
