import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/js/217_walk_collision_bridge.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function _walkCollisionAdvance('),source.indexOf('let cameraCollisionEnabled='));
function fixture({outside=false,stale=false}={}){
 const av={position:{x:0,y:5,z:0,set(x,y,z){Object.assign(this,{x,y,z});}}};let moves=0;
 const c={performance,walkSetup:{pending:Promise.resolve(),core:{move(d){moves++;return {feet:{x:av.position.x+d.x,y:av.position.y+d.y,z:av.position.z+d.z},grounded:false};}},settings:{signature:'same',radius:12,spawn:{y:0}},checkedAt:0},walkMode:{active:true,airborne:true,groundOffset:0,velocity:{y:-3}},_walkSourceSignature:()=>stale?'changed':'same',_walkNeedsRegion:(_,margin)=>outside&&margin>0,_walkRequestKey:()=>'',_walkGenerateCollision(){},_walkAutoTick(){},_walkStatus(){},_avatarWalkExit(){c.walkMode.active=false;}};
 c.walkSetup.autoEnabled=true;vm.createContext(c);vm.runInContext(code,c);c.av=av;
 return {c,av,moves:()=>moves,run:()=>vm.runInContext('_walkCollisionAdvance(av,1/60,2,0,false)',c)};
}
test('replacement generation does not suspend gravity in unchanged valid geometry',()=>{const f=fixture();f.run();assert(f.moves()>0);assert(f.av.position.y<5);});
test('coverage edge stops horizontal travel but retains gravity',()=>{const f=fixture({outside:true});f.run();assert(f.moves()>0);assert.equal(f.av.position.x,0);assert(f.av.position.y<5);});
test('changed geometry cannot use the previous collision core',()=>{const f=fixture({stale:true});f.run();assert.equal(f.moves(),0);});
test('changed geometry exits walking instead of leaving an airborne avatar suspended',()=>{const f=fixture({stale:true});f.run();assert.equal(f.c.walkMode.active,false);});
