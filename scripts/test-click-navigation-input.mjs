import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=n=>fs.readFileSync(new URL('../src/js/'+n,import.meta.url),'utf8');
function setup(){
 const handlers=new Map(),elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{id,style:{},getBoundingClientRect:()=>({left:0,top:0,width:176,height:176}),addEventListener(type,fn){const k=id+':'+type;handlers.set(k,[...(handlers.get(k)||[]),fn]);}});return elements.get(id);};
 const canvas=element('canvas'),win=element('window'),noop=()=>{};let now=1000,moves=0,selected=false;
 const ctx=vm.createContext({console,window:win,canvas,document:{activeElement:null,pointerLockElement:null,getElementById:element},navigator:{},performance:{now:()=>now},setTimeout:()=>1,clearTimeout:noop,innerWidth:1000,
  msr:{active:false},lpv:{dragging:null},walkMode:{active:false},camAnim:{playing:false,open:false},cam:{active:false},keys:{},layers:[],joyDX:0,joyDY:0,
  _pathMode:false,_placeMode:false,_pathDragH:-1,_pathEditId:null,_pathProbing:false,_placeProbing:false,
  _boneRotDrag:{active:false},_ikDrag:{active:false},_handleTouchId:-1,_handleTouchKind:'',_lpvTouchId:-1,_lpvTouchHit:null,
  selectedLayerId:null,dragOn:false,tlId:-1,tlX:0,tlY:0,_yawTarget:0,_pitchTarget:0,_clickStartX:0,_clickStartY:0,
  _checkBoneRotateRingHit:()=>null,_checkIKHandleHit:()=>null,checkLpvHandle:()=>null,markDirty:noop,bumpSplatActive:noop,
  updateEventPanelHover:noop,_updateFigureHover:noop,_trySelectByClick:()=>selected,_pathUpdateProbe:noop,_placeUpdateProbe:noop,
  _placePathPoint:noop,_pathHideProbe:noop,_commitPlace:noop,commitPreview:noop,_endIKHandleDrag:noop,_endBoneRotateDrag:noop});
 vm.runInContext(read('400_input.js')+'\n'+read('402_input_shared_drag_touch.js')+'\n'+read('404_click_navigation.js'),ctx);
 ctx._clickNavigateAt=()=>{moves++;return true;};
 function event(type,extras={}){const e={clientX:400,clientY:200,button:0,target:canvas,preventDefault:noop,stopPropagation:noop,cancelable:true,changedTouches:[],touches:[],...extras};for(const fn of handlers.get(type)||[])fn(e);}
 function tap(){event('canvas:mousedown');now+=100;event('window:mouseup');}
 return {ctx,event,tap,canvas,get moves(){return moves;},setTime:t=>now=t,select:()=>selected=true};
}

test('touch joystick tracks twice the prior 153px slack without increasing speed or knob travel',()=>{
 const f=setup(),finger={identifier:8,clientX:88,clientY:88};
 f.event('joy:touchstart',{changedTouches:[finger],touches:[finger]});
 for(const distance of [51,153,154,250,306]){
  f.event('window:touchmove',{touches:[{...finger,clientX:88+distance}]});
  assert.equal(f.ctx.joyDX,1,'still tracking at '+distance+'px');assert.equal(f.ctx.joyDY,0);
  assert.equal(f.ctx.document.getElementById('jknob').style.left,'139px','visual travel remains 51px');
 }
 f.event('window:touchmove',{touches:[{...finger,clientX:395}]});assert.equal(f.ctx.joyDX,0);
});
test('outside joystick tracking remains finger-owned and ends on its release or cancellation',()=>{
 for(const end of ['touchend','touchcancel']){
  const f=setup(),finger={identifier:8,clientX:88,clientY:88},other={identifier:9,clientX:600,clientY:200};
  f.event('joy:touchstart',{changedTouches:[finger],touches:[finger]});
  f.event('window:touchmove',{touches:[other,{...finger,clientX:338}]});assert.equal(f.ctx.joyDX,1);
  f.event('window:'+end,{changedTouches:[other],touches:[finger]});assert.equal(f.ctx.joyDX,1);
  f.event('window:'+end,{changedTouches:[finger]});assert.equal(f.ctx.joyDX,0);assert.equal(f.ctx.joyDY,0);
 }
});

test('actual touch drag, pinch then last finger, UI and object selection never dispatch travel',()=>{
 for(const kind of ['drag','pinch','ui','selection']){
  const f=setup(),a={identifier:1,clientX:400,clientY:200},b={...a,identifier:2};
  if(kind==='selection')f.select();
  f.event('canvas:touchstart',{changedTouches:[a],touches:[a],...(kind==='ui'?{target:{}}:{})});
  if(kind==='drag'){
   f.event('canvas:touchmove',{changedTouches:[{...a,clientX:430}],touches:[{...a,clientX:430}]});
   f.event('canvas:touchmove',{changedTouches:[a],touches:[a]});
  }
  if(kind==='pinch'){
   f.event('canvas:touchstart',{changedTouches:[b],touches:[a,b]});
   f.event('canvas:touchend',{changedTouches:[b],touches:[a]});
  }
  f.setTime(1100);f.event('canvas:touchend',{changedTouches:[a]});assert.equal(f.moves,0,kind);
 }
});

test('actual touch dispatcher starts eased travel to ground plus 1.8m through the real navigation adapter',()=>{
 const f=setup(),c=f.ctx,timers=new Map();let id=0;
 c.setTimeout=fn=>{timers.set(++id,fn);return id;};c.clearTimeout=id=>timers.delete(id);
 c.canvas.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:600,width:1000,height:600});
 c.camera={far:1000,updateWorldMatrix(){}};c._useOrtho=false;
 c.THREE={Vector2:class{},Raycaster:class{constructor(){this.ray={origin:{x:0,y:1.6,z:0},direction:{x:1,y:0,z:0}};}setFromCamera(){}}};
 c.camPos={x:0,y:1.6,z:0,set(x,y,z){Object.assign(this,{x,y,z});}};
 c.getCameraCollisionState=()=>({ready:true});c._walkNeedsRegion=()=>false;
 c.walkSetup={epoch:1,settings:{},wholeIndex:null,core:{raycastSurface(origin,dir){return {distance:1.6,point:{x:dir.y===-1?origin.x:4,y:0,z:0},normal:{x:0,y:1,z:0}};},
  isCapsuleClear:()=>true,moveCamera:(p,d)=>({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z})}};
 c._walkGenerateCollision=()=>{throw Error('No input-triggered bake');};
 const source=read('404_click_navigation.js');vm.runInContext(source.slice(source.indexOf('function _clickNavigateAt'),source.indexOf('const _clickGestures')),c);
 const finger={identifier:1,clientX:400,clientY:200};
 f.event('canvas:touchstart',{changedTouches:[finger],touches:[finger]});f.setTime(1100);
 f.event('canvas:touchend',{changedTouches:[finger]});assert.equal(c.camPos.x,0);assert(timers.size>0);
 for(let time=1200;time<=2100;time+=100){f.setTime(time);const pending=[...timers.values()];timers.clear();for(const tick of pending)tick();if(time===1200)assert(c.camPos.x>0&&c.camPos.x<4);}
 assert.equal(c.camPos.x,4);assert.equal(c.camPos.y,1.8);assert.equal(timers.size,0);
});
test('measurement short touch places once; drag and multi-touch do not place',()=>{
 for(const kind of ['tap','drag','multi']){
  const f=setup(),c=f.ctx;let commits=0;c.msr.active=true;c.pickWorldPos=()=>({x:1,y:0,z:2});c.updatePreview=()=>{};c.commitPreview=()=>commits++;
  const p={identifier:1,clientX:400,clientY:200};f.event('canvas:touchstart',{changedTouches:[p],touches:[p]});
  if(kind==='drag')f.event('canvas:touchmove',{changedTouches:[{...p,clientX:430}],touches:[{...p,clientX:430}]});
  if(kind==='multi')f.event('canvas:touchstart',{changedTouches:[{...p,identifier:2}],touches:[p,{...p,identifier:2}]});
  f.event('canvas:touchend',{changedTouches:[p],touches:[]});assert.equal(commits,kind==='tap'?1:0,kind);assert.equal(f.moves,0);
 }
});

test('actual mouse dispatches one ground click; selection/tool/outside release consumes it',()=>{
 const f=setup();f.tap();assert.equal(f.moves,1);
 for(const kind of ['selection','path','placement','outside','measurement']){
  const g=setup();if(kind==='selection')g.select();if(kind==='path')g.ctx._pathMode=true;if(kind==='placement')g.ctx._placeMode=true;
  if(kind==='measurement'){g.ctx.msr.active=true;g.ctx.checkAxisHandle=()=>true;g.ctx.pushUndo=()=>{};g.ctx.startAxisDrag=()=>{};}
  g.event('canvas:mousedown');g.setTime(1100);g.event('window:mouseup',kind==='outside'?{target:{}}:{});assert.equal(g.moves,0,kind);
 }
});
test('actual mouse out-and-back drag and stale release never navigate',()=>{
 const f=setup();f.event('canvas:mousedown');f.event('window:mousemove',{clientX:420});f.event('window:mousemove',{clientX:400});f.setTime(1100);f.event('window:mouseup');f.event('window:mouseup');assert.equal(f.moves,0);
});
test('camera-tool mode still allows existing object selection',()=>{
 const f=setup();let selected=0;f.ctx.cam.active=true;f.ctx._trySelectByClick=()=>{selected++;return true;};f.tap();assert.equal(selected,1);assert.equal(f.moves,0);
});
test('actual touch tap dispatches once; compatibility mouse and second tap suppressed',()=>{
 const f=setup(),finger={identifier:1,clientX:400,clientY:200};
 f.event('canvas:touchstart',{changedTouches:[finger],touches:[finger]});f.setTime(1100);f.event('canvas:touchend',{changedTouches:[finger]});assert.equal(f.moves,1);
 f.tap();assert.equal(f.moves,1);
 f.event('canvas:touchstart',{changedTouches:[finger],touches:[finger]});f.setTime(1250);f.event('canvas:touchend',{changedTouches:[finger]});assert.equal(f.moves,1);
});
test('actual multi-touch and cancelled touch do not navigate',()=>{
 for(const cancel of [false,true]){const f=setup(),a={identifier:1,clientX:400,clientY:200},b={...a,identifier:2};
 f.event('canvas:touchstart',{changedTouches:[a],touches:[a]});
 if(cancel)f.event('canvas:touchcancel',{changedTouches:[a]});else f.event('canvas:touchstart',{changedTouches:[b],touches:[a,b]});
 f.setTime(1100);f.event('canvas:touchend',{changedTouches:[a]});assert.equal(f.moves,0);}
});
test('navigation mode gates include camera, AR, ortho, capture, avatar and held input',()=>{
 for(const name of ['cam','arMode','walkMode','_viewRec']){const f=setup();f.ctx[name]={active:true};assert.equal(f.ctx._clickNavigationBusy(),true,name);}
 for(const name of ['_useOrtho','_captureBusy','touchUpHeld','touchDnHeld']){const f=setup();f.ctx[name]=true;assert.equal(f.ctx._clickNavigationBusy(),true,name);}
 const f=setup();f.ctx.navigator.getGamepads=()=>[{connected:true,axes:[.5,0],buttons:[]}];assert.equal(f.ctx._clickNavigationBusy(),true);
});
test('showcase URL permits navigation after camera yield or tour end, but blocks automatic ownership',()=>{
 const f=setup(),c=f.ctx;c.location={search:'?demo=1&showcase=1'};
 assert.equal(!!c._clickNavigationBusy(),false,'URL alone does not own camera');
 let state={yield:false,aborted:false};c.__scTour={cam:()=>state};
 assert.equal(!!c._clickNavigationBusy(),true,'automatic tour owns camera');
 state={yield:true,aborted:false};assert.equal(!!c._clickNavigationBusy(),false,'manual input yields camera');
 state={yield:false,aborted:true};assert.equal(!!c._clickNavigationBusy(),false,'ended hook remains but does not own camera');
 state={yield:false,aborted:false};assert.equal(!!c._clickNavigationBusy(),true,'next automatic chapter reacquires camera');
 c.__scTour.cam=()=>{throw new ReferenceError('not initialized');};assert.equal(!!c._clickNavigationBusy(),true);
 delete c.__scTour;
 for(const mode of ['orbit','capture']){c.location.search='?'+mode+'=1';assert.equal(!!c._clickNavigationBusy(),true,mode);}
});
test('real adapter prepares far target coverage before surface ray, never bakes',()=>{
 const f=setup(),c=f.ctx,order=[];let x=20,ready=true;
 c.canvas.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:600,width:1000,height:600});
 c.camera={far:1000,updateWorldMatrix(){}};c._useOrtho=false;
 c.THREE={Vector2:class{},Raycaster:class{constructor(){this.ray={origin:{x:0,y:1.6,z:0},direction:{x:1,y:0,z:0}};}setFromCamera(){}}};
 c.camPos={x:0,y:1.6,z:0,set(){}};
 c.getCameraCollisionState=()=>({ready});c._walkNeedsRegion=()=>false;
 c._walkWholeCoverage=(a,b)=>{order.push('coverage');return true;};
 c.pickWorldPos=()=>{order.push('pick');return {x,y:0,z:0};};
 c.walkSetup={epoch:1,settings:{},wholeIndex:{},core:{raycastSurface(origin,dir){order.push('ray');assert(order.indexOf('coverage')<order.indexOf('ray'));return {distance:dir.y===-1?1.6:x,point:{x:dir.y===-1?origin.x:x,y:0,z:0},normal:{x:0,y:1,z:0}};},isCapsuleClear:()=>true}};
 c._walkGenerateCollision=()=>{throw Error('bake forbidden');};
 // setup's dispatcher spy is intentionally replaced by the real adapter here.
 vm.runInContext(read('404_click_navigation.js').slice(read('404_click_navigation.js').indexOf('function _clickNavigateAt'),read('404_click_navigation.js').indexOf('const _clickGestures')),c);
 assert.equal(c._clickNavigateAt(400,200),true);assert.deepEqual(order.slice(0,3),['pick','coverage','ray']);
 order.length=0;x=31;assert.equal(c._clickNavigateAt(400,200),false);assert.deepEqual(order,['pick']);
 order.length=0;ready=false;assert.equal(c._clickNavigateAt(400,200),false);assert.deepEqual(order,[]);
});
