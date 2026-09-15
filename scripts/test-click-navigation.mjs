import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({console});
const file=new URL('../src/js/404_click_navigation.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
function fixture(overrides={}){
 let p={x:0,y:1.6,z:0},ready=true,epoch=1,blocked=false;
 const nav=ctx.LocahunClickNavigation.create({position:()=>p,setPosition:q=>p={...q},ready:()=>ready,epoch:()=>epoch,blocked:()=>blocked,coverage:()=>true,clear:()=>true,sweep:(a,b)=>b,...overrides});
 return {nav,get p(){return p;},setReady:v=>ready=v,setEpoch:v=>epoch=v,setBlocked:v=>blocked=v};
}
const ground={point:{x:4,y:0,z:0},normal:{x:0,y:1,z:0}};

test('collision-free tap travel ignores wall sweeps and clearance, including source overlaps',()=>{
 const fail=()=>{throw Error('Tap movement must not query collision');};
 const f=fixture({collision:false,coverage:fail,clear:fail,sweep:fail});
 assert(f.nav.start(ground,0));
 for(let t=100;t<=2000;t+=100)f.nav.tick(t);
 assert.equal(f.p.x,4);assert.equal(f.p.y,1.8);assert.equal(f.nav.stopReason,'complete');
});

test('successive quick taps remain actionable',()=>{
 const g=ctx.LocahunClickNavigation.createGesture(),p={x:10,y:10,id:1};
 for(let time=0;time<1000;time+=100){g.arm(p,time);assert(g.take(p,time+40,false));}
});
test('ground +1.8, no instantaneous jump, bounded eased motion',()=>{
 const f=fixture();assert(f.nav.start(ground,0));assert.equal(f.p.x,0);
 f.nav.tick(100);assert(f.p.x>0&&f.p.x<4);
 for(let t=200;t<=2000;t+=100)f.nav.tick(t);
 assert.equal(f.p.x,4);assert.equal(f.p.y,1.8);assert.equal(f.nav.active,false);
});
test('reject walls, ceilings, missing and nonfinite points',()=>{
 for(const h of [null,{...ground,normal:{x:1,y:0,z:0}},{...ground,normal:{x:0,y:-1,z:0}},{...ground,point:{x:NaN,y:0,z:0}}])assert.equal(fixture().nav.start(h,0),false);
});
test('unready, uncovered and clearance failure never start',()=>{
 for(const key of ['ready','coverage','clear']){const f=fixture({[key]:()=>false});assert.equal(f.nav.start(ground,0),false);assert.equal(f.p.x,0);}
});
test('scene change, readiness loss, manual ownership and long frame cancel',()=>{
 for(const cause of ['epoch','ready','blocked','gap']){const f=fixture();f.nav.start(ground,0);if(cause==='epoch')f.setEpoch(2);if(cause==='ready')f.setReady(false);if(cause==='blocked')f.setBlocked(true);f.nav.tick(cause==='gap'?1000:100);assert.equal(f.p.x,0);assert.equal(f.nav.active,false);}
});
test('sweep obstruction stops without accepting axis slide',()=>{
 const f=fixture({sweep:(a,b)=>({...b,z:1})});f.nav.start(ground,0);f.nav.tick(100);assert.equal(f.p.x,0);assert.equal(f.p.z,0);assert.equal(f.nav.active,false);
});
test('intermediate clearance is checked and idle has no queries',()=>{
 let checks=0;const f=fixture({clear:p=>{checks++;return p.x===0||p.x===4;}});f.nav.tick(0);assert.equal(checks,0);f.nav.start(ground,0);f.nav.tick(100);assert.equal(f.nav.active,false);assert.equal(f.p.x,0);
});
test('new click cancels old target even if new hit invalid',()=>{
 const f=fixture();f.nav.start(ground,0);f.nav.start(null,100);f.nav.tick(150);assert.equal(f.p.x,0);assert.equal(f.nav.active,false);
});
test('gesture rejects consumed, outside, long hold, out-and-back drag and stale release',()=>{
 const g=ctx.LocahunClickNavigation.createGesture();
 const p={x:10,y:10,id:1};
 for(const reason of ['consumed','outside','long','drag']){
  g.arm(p,0);if(reason==='drag'){g.move({...p,x:30});g.move(p);}
  assert.equal(g.take(p,reason==='long'?900:100,reason==='outside'||reason==='consumed'),null);
  assert.equal(g.take(p,100,false),null);
 }
 g.arm(p,1000);assert(g.take(p,1100,false));g.arm(p,1200);assert(g.take(p,1250,false));
 g.arm(p,2000);g.reset();assert.equal(g.take(p,2100,false),null);
});
test('travel distances 3/10/20m have bounded speed and duration; over 30m rejected',()=>{
 for(const meters of [3,10,20]){const f=fixture();assert(f.nav.start({...ground,point:{x:meters,y:0,z:0}},0));let old=0;
  for(let t=100;t<=6100;t+=100){f.nav.tick(t);assert(f.p.x-old<=.751,'peak speed <=7.5 m/s');old=f.p.x;}
  assert.equal(f.p.x,meters);assert.equal(f.nav.active,false);}
 assert.equal(fixture().nav.start({...ground,point:{x:31,y:0,z:0}},0),false);
});

test('multi-floor route follows every corner without cutting across a floor',()=>{
 const visited=[],f=fixture({sweep:(a,b)=>{visited.push({...b});return b;}});
 const target={point:{x:0,y:3,z:0},normal:{x:0,y:1,z:0}};
 const route=[{x:3,y:1.8,z:0},{x:3,y:4.8,z:3},{x:0,y:4.8,z:3},{x:0,y:4.8,z:0}];
 assert(f.nav.start(target,0,route));
 for(let t=16;t<=5000;t+=16)f.nav.tick(t);
 for(const corner of route)assert(visited.some(p=>Math.hypot(p.x-corner.x,p.y-corner.y,p.z-corner.z)<1e-6),'route corner omitted');
 assert.equal(f.nav.stopReason,'complete');assert.equal(f.p.y,4.8);
});

test('reject incomplete, nonfinite and excessive route length before moving',()=>{
 for(const route of [[],[{x:1,y:1.8,z:0}],[{x:NaN,y:1.8,z:0}], [{x:29,y:1.8,z:0},{x:4,y:1.8,z:0}]]){
  const f=fixture();assert.equal(f.nav.start(ground,0,route),false);assert.equal(f.p.x,0);
 }
});
