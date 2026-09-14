// Existing input owners dispatch only unconsumed clicks/taps. Passive cancellation
// listeners never pick; the timer exists only while a move is active.
(() => {
  'use strict';
  const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
  globalThis.LocahunClickNavigation={create(io){
    let move=null,stopReason='idle';
    const cancel=(reason='cancelled')=>{move=null;stopReason=typeof reason==='string'?reason:'cancelled';};
    return {
      get active(){return !!move;},get stopReason(){return stopReason;},cancel,
      start(hit,now,route){
        cancel();
        if(!Number.isFinite(now)||!valid(hit?.point)||!valid(hit?.normal))return false;
        const n=Math.hypot(hit.normal.x,hit.normal.y,hit.normal.z);
        if(n<1e-8||hit.normal.y/n<Math.SQRT1_2)return false;
        const from={...io.position()},to={...hit.point,y:hit.point.y+1.8};
        if(!valid(from)||!valid(to)||!io.ready()||io.blocked()||!io.coverage(from,to)||!io.clear(from,0)||!io.clear(to,1))return false;
        if(route!==undefined&&(!Array.isArray(route)||!route.length||route.length>1024||!route.every(valid)||distance(route.at(-1),to)>.001))return false;
        const corners=route||[to],path=[{point:from,at:0}];let length=0,previous=from;
        for(const corner of corners){
          const segment=distance(previous,corner),count=Math.ceil(segment/.1);
          if(length+segment>30||path.length+count>2048)return false;
          for(let i=1;i<=count;i++)path.push({point:mix(previous,corner,i/count),at:length+segment*i/count});
          length+=segment;previous={...corner};
        }
        if(length<.01||length>30)return false;
        move={from,to,last:from,path,cursor:1,length,epoch:io.epoch(),start:now,previous:now,duration:Math.max(450,length/5*1000)};
        stopReason='moving';
        return true;
      },
      tick(now){
        if(!move)return false;
        const m=move,gap=now-m.previous;
        if(!Number.isFinite(now)||gap<0||gap>250){cancel('frame-gap');return false;}
        if(!io.ready()||io.blocked()||io.epoch()!==m.epoch||distance(io.position(),m.last)>.0001){cancel('ownership-or-readiness');return false;}
        const t=Math.min(1,Math.max(0,(now-m.start)/m.duration));
        const travel=m.length*t*t*(3-2*t),targets=[];
        let cursor=m.cursor;
        while(cursor<m.path.length&&m.path[cursor].at<=travel){targets.push(m.path[cursor]);cursor++;}
        if(cursor<m.path.length){
          const a=m.path[cursor-1],b=m.path[cursor];
          if(travel>a.at)targets.push({point:mix(a.point,b.point,(travel-a.at)/(b.at-a.at)),at:travel});
        }
        // Bound work per tick; a stalled/very distant movement stops, never jumps.
        if(targets.length>256){cancel('step-limit');return false;}
        for(const sample of targets){
          const next=sample.point,progress=sample.at/m.length;
          if(!io.coverage(m.last,next)||!io.clear(next,progress)){cancel('clearance-or-coverage');return false;}
          const swept=io.sweep(m.last,next);
          // moveCamera supports sliding; click travel deliberately does not.
          if(!valid(swept)||distance(swept,next)>.0001){cancel('sweep');return false;}
          io.setPosition(next);m.last=next;
        }
        m.cursor=cursor;
        m.previous=now;
        if(t===1)cancel('complete');
        return true;
      }
    };
  },resolveSurface(hit,origin,cast){
    if(!valid(hit?.point)||!valid(hit?.normal)||!valid(origin))return null;
    const n=Math.hypot(hit.normal.x,hit.normal.y,hit.normal.z);
    if(n<1e-8)return null;
    if(hit.normal.y/n>=Math.SQRT1_2)return hit;
    let x=hit.normal.x,z=hit.normal.z,length=Math.hypot(x,z);
    if(length<1e-8){x=origin.x-hit.point.x;z=origin.z-hit.point.z;length=Math.hypot(x,z);}
    if(length<1e-8)return null;
    const from={x:hit.point.x+x/length*.45,y:hit.point.y+.05,z:hit.point.z+z/length*.45};
    const floor=cast(from,{x:0,y:-1,z:0},3.5);
    if(!valid(floor?.point)||!valid(floor?.normal)||!Number.isFinite(floor.distance)||floor.distance<0||floor.distance>3.5||floor.point.y>from.y)return null;
    const normalLength=Math.hypot(floor.normal.x,floor.normal.y,floor.normal.z);
    return normalLength>1e-8&&floor.normal.y/normalLength>=Math.SQRT1_2?floor:null;
  },resolveOrigin(core,from){
    const nominal={x:from.x,y:from.y-1.8,z:from.z};
    const support=core.raycastSurface(from,{x:0,y:-1,z:0},1.8);
    if(valid(support?.point)&&valid(support?.normal)&&Number.isFinite(support.distance)&&
      support.distance>=.6&&support.distance<=1.8&&support.point.y<from.y&&support.normal.y>=Math.SQRT1_2&&
      Math.hypot(support.point.x-from.x,support.point.z-from.z)<.001)return {...support.point};
    return nominal;
  },createRouteGround(from,points){
    from={...from};
    const first=points[0],sameColumn=valid(first)&&Math.hypot(first.x-from.x,first.z-from.z)<.001;
    const lift=sameColumn&&from.y-first.y>=.6&&from.y-first.y<1.8;
    // Only the initial vertical segment adapts to a saved low eye height.
    // Every pose, including the rise to normal height, retains capsule/sweep checks.
    return p=>({x:p.x,z:p.z,y:lift&&Math.hypot(p.x-from.x,p.z-from.z)<.001&&p.y>=from.y-.0001&&p.y<=first.y+1.8?first.y:p.y-1.8});
  },createRouteClearance(core,from,points){
    const ground=this.createRouteGround(from,points);
    return p=>{const base=ground(p).y+.3,height=p.y+.2-base;
      return height>=.3&&core.isCapsuleClear({x:p.x,y:base,z:p.z},height,.15);};
  },createClearance(core,from,ground){
    if(!valid(from)||!valid(ground))return null;
    const support=core.raycastSurface(from,{x:0,y:-1,z:0},1.8);
    let floor=from.y-1.8;
    if(support){
      if(!valid(support.point)||!valid(support.normal)||!Number.isFinite(support.distance)||support.distance<.6||support.distance>1.8||support.point.y>=from.y||support.normal.y<Math.SQRT1_2)return null;
      floor=support.point.y;
    }
    // Only the virtual feet adapt to the existing camera height. Camera position
    // never snaps; every point still checks body/head clearance and a sphere sweep.
    return (p,progress)=>{
      const feetY=floor+(ground.y-floor)*progress+.02,height=p.y+.2-feetY;
      return height>=.3&&core.isCapsuleClear({x:p.x,y:feetY,z:p.z},height,.15);
    };
  },createGesture(tolerance=5){
    let pending=null,lastTap=-Infinity;
    return {reset(){pending=null;},arm(p,now){pending={...p,at:now,moved:false};},
      move(p){if(pending&&(p.id!==pending.id||Math.hypot(p.x-pending.x,p.y-pending.y)>=tolerance))pending.moved=true;},
      waiting(){return !!pending&&!pending.moved;},
      take(p,now,consumed){
        const old=pending;pending=null;
        if(!old||consumed||old.moved||p.id!==old.id||now-old.at>600||now<old.at||Math.hypot(p.x-old.x,p.y-old.y)>=tolerance)return null;
        const double=now-lastTap<300;lastTap=now;
        return double?null:p;
      }};
  }};
})();

let _clickNavigationController=null,_clickNavigationTimer=null,_clickNavigationToastAt=-Infinity;
let _clickNavigationIntent=0;
let _clickNavigationLease=null;
let _clickNavigationJourney=null;
function _clickNavigationTourOwnsCamera(){
  const tour=globalThis.__scTour;
  if(!tour)return false;
  // The showcase inspection hook survives endTour; use its live camera ownership.
  try{const state=tour.cam();return !state.aborted&&!state.yield;}catch(_){return true;}
}
function _clickNavigationBusy(){
  return (typeof msr!=='undefined'&&msr.active)||
    (typeof cam!=='undefined'&&cam.active)||(typeof arMode!=='undefined'&&arMode.active)||
    (typeof _useOrtho!=='undefined'&&_useOrtho)||(typeof _viewRec!=='undefined'&&_viewRec.active)||
    !!globalThis._captureBusy||_clickNavigationTourOwnsCamera()||
    (typeof location!=='undefined'&&/[?&](orbit|capture)=1(?:&|$)/.test(location.search))||
    (typeof walkMode!=='undefined'&&walkMode.active)||
    (typeof camAnim!=='undefined'&&(camAnim.playing||camAnim.open))||
    (typeof _pathMode!=='undefined'&&!!_pathMode)||
    (typeof _placeMode!=='undefined'&&!!_placeMode)||
    (typeof _pathDragH!=='undefined'&&_pathDragH>=0)||
    (typeof lpv!=='undefined'&&!!lpv.dragging)||
    (typeof _boneRotDrag!=='undefined'&&_boneRotDrag.active)||
    (typeof _ikDrag!=='undefined'&&_ikDrag.active)||
    (typeof joyDX!=='undefined'&&(joyDX!==0||joyDY!==0))||
    (typeof touchUpHeld!=='undefined'&&touchUpHeld)||(typeof touchDnHeld!=='undefined'&&touchDnHeld)||
    (typeof navigator!=='undefined'&&typeof navigator.getGamepads==='function'&&Array.from(navigator.getGamepads()).some(p=>p&&p.connected&&
      (p.axes.some(a=>Math.abs(a)>.15)||p.buttons.some(b=>b.pressed||b.value>.15))))||
    (typeof keys!=='undefined'&&Object.keys(keys).some(k=>keys[k]&&/^(Key[WASDQERF]|Arrow|Page|Equal|Minus|Numpad)/.test(k)));
}
function _cancelClickNavigation(preserveJourney=false){
  _clickNavigationIntent++;
  _clickNavigationController?.cancel();
  _clickNavigationLease?.dispose();_clickNavigationLease=null;
  if(preserveJourney!==true)_clickNavigationJourney?.cancel();
  if(typeof _hideNavigationPoint==='function')_hideNavigationPoint();
  if(_clickNavigationTimer!==null){clearTimeout(_clickNavigationTimer);_clickNavigationTimer=null;}
}
function _clickNavigationCoverage(a,b){
  if(typeof _walkNeedsRegion!=='function'||_walkNeedsRegion(a,.3,false)||_walkNeedsRegion(b,.3,false))return false;
  return !walkSetup.wholeIndex||(typeof _walkWholeCoverage==='function'&&_walkWholeCoverage(a,b,{drop:2,margin:.3})===true);
}
// The caller owns a supplied lease until a non-preview move is accepted.
function _clickNavigateAt(clientX,clientY,preview=false,preparedHit=null,preparedLease=null){
  if(!preview)_cancelClickNavigation(!!preparedLease);
  if(preparedLease&&!preparedLease.valid())return false;
  if(_clickNavigationBusy())return false;
  if(!_clickNavigationJourney&&walkSetup.settings.navigationRegions&&typeof _prepareRegionalNavigationProvider==='function'){
    const intent=_clickNavigationIntent,epoch=walkSetup.epoch,position=camPos.clone();
    const hold=preview&&typeof _navigationHold!=='undefined'?_navigationHold:null;
    if(hold?.navigationPending)return false;
    if(hold)hold.navigationPending=true;
    _prepareRegionalNavigationProvider().then(provider=>{
      if(!provider||intent!==_clickNavigationIntent||epoch!==walkSetup.epoch||camPos.distanceTo(position)>=.001||_clickNavigationBusy())return;
      if(preview){if(hold?.active&&typeof _navigationHold!=='undefined'&&_navigationHold===hold){hold.navigationPending=false;_navigationHoldPreview();}}
      else _clickNavigateAt(clientX,clientY,false,preparedHit);
    }).catch(()=>{}).finally(()=>{if(hold)hold.navigationPending=false;});
    return false;
  }
  const now=performance.now();
  if(!globalThis.getCameraCollisionState?.().ready){
    if(!preview&&globalThis.getCameraCollisionState?.().enabled&&typeof globalThis.prepareCameraCollision==='function'){
      const intent=_clickNavigationIntent,epoch=walkSetup.epoch,position={...camPos};
      const yaw=typeof _yawTarget==='undefined'?null:_yawTarget,pitch=typeof _pitchTarget==='undefined'?null:_pitchTarget;
      globalThis.prepareCameraCollision().then(ready=>{
        if(!ready||intent!==_clickNavigationIntent||epoch!==walkSetup.epoch||_clickNavigationBusy()||
          Math.hypot(camPos.x-position.x,camPos.y-position.y,camPos.z-position.z)>.001||
          (yaw!==null&&(yaw!==_yawTarget||pitch!==_pitchTarget)))return;
        _clickNavigateAt(clientX,clientY);
      }).catch(()=>{});
    }
    if(!preview&&now-_clickNavigationToastAt>1000&&typeof showUndoToast==='function'){
      showUndoToast('当たり判定の準備ができていません');_clickNavigationToastAt=now;
    }
    return false;
  }
  const rect=canvas.getBoundingClientRect();
  if(!Number.isFinite(clientX)||!Number.isFinite(clientY)||rect.width<=0||rect.height<=0||clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return false;
  const pickCamera=_useOrtho?_orthoCamera:camera;
  pickCamera.updateWorldMatrix(true,false);
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),pickCamera);
  try{
    // Seed the collision tile region from a single visible surface pick; do not
    // raycast only the currently resident near-camera tile or start a bake.
    if(walkSetup.wholeIndex){
      if(typeof pickWorldPos!=='function')return false;
      const depth=msr.placeDepth;let point;
      try{point=pickWorldPos(clientX,clientY,{strictVisible:true});}finally{msr.placeDepth=depth;}
      if(!point||Math.hypot(point.x-camPos.x,point.y+1.8-camPos.y,point.z-camPos.z)>30||!_clickNavigationCoverage(camPos,point))return false;
    }
    const picked=preparedHit||walkSetup.core.raycastSurface(ray.ray.origin,ray.ray.direction,Math.min(1000,pickCamera.far));
    if(!picked)return false;
    let hit=LocahunClickNavigation.resolveSurface(picked,camPos,(a,b,d)=>walkSetup.core.raycastSurface(a,b,d));
    // A coarse stair voxel may contain the downward probe. The regional query
    // still requires a nearby connected walkable triangle before accepting it.
    if(!hit&&_clickNavigationJourney)hit={...picked,normal:{x:0,y:1,z:0}};
    if(!hit)return preview?{point:picked.point,valid:false}:false;
    if(_clickNavigationJourney&&!preparedLease){
      const provider=_clickNavigationJourney,intent=_clickNavigationIntent,epoch=walkSetup.epoch,position=camPos.clone();
      const hold=preview&&typeof _navigationHold!=='undefined'?_navigationHold:null;
      if(preview&&!hold?.active)return {point:hit.point,valid:false};
      if(hold?.navigationPending)return {point:hit.point,valid:false};
      if(hold)hold.navigationPending=true;
      provider.acquire(LocahunClickNavigation.resolveOrigin(walkSetup.core,position),hit.point).then(lease=>{
        if(!lease)return;
        let adopted=false;
        try{
          if(provider!==_clickNavigationJourney||intent!==_clickNavigationIntent||epoch!==walkSetup.epoch||camPos.distanceTo(position)>=.001||_clickNavigationBusy())return;
          if(preview){
            if(!hold.active||typeof _navigationHold==='undefined'||_navigationHold!==hold)return;
            if(hold.point&&(hold.point.x!==clientX||hold.point.y!==clientY))return;
            const result=_clickNavigateAt(clientX,clientY,true,hit,lease);
            if(result&&typeof _showNavigationPoint==='function')_showNavigationPoint(result.point,result.valid);
          }else adopted=_clickNavigateAt(clientX,clientY,false,hit,lease)===true;
        }finally{if(!adopted)lease.dispose();}
      }).catch(()=>{}).finally(()=>{
        if(hold)hold.navigationPending=false;
        if(preview&&hold?.active&&typeof _navigationHold!=='undefined'&&_navigationHold===hold&&
          hold.point&&(hold.point.x!==clientX||hold.point.y!==clientY)&&intent===_clickNavigationIntent&&epoch===walkSetup.epoch&&
          typeof _navigationHoldPreview==='function')_navigationHoldPreview();
      });
      return preview?{point:hit.point,valid:false}:false;
    }
    let route=null,clear;
    const movementCore=preparedLease?.core||walkSetup.core;
    if(preparedLease){
      const points=preparedLease.points;
      if(!Array.isArray(points)||!points.length)return false;
      hit={...hit,point:points.at(-1)};route=points.map(p=>({x:p.x,y:p.y+1.8,z:p.z}));
      clear=LocahunClickNavigation.createRouteClearance(movementCore,camPos,points);
    }else if(walkSetup.settings?.navigation){
      const query=_getNavigationQuery();
      if(!query){
        const intent=_clickNavigationIntent,epoch=walkSetup.epoch,position=camPos.clone();
        const hold=preview&&typeof _navigationHold!=='undefined'?_navigationHold:null;
        if(hold?.navigationPending)return {point:hit.point,valid:false};
        if(hold)hold.navigationPending=true;
        _prepareNavigationQuery().then(ready=>{
          if(preview&&ready&&hold?.active&&typeof _navigationHold!=='undefined'&&_navigationHold===hold&&
            intent===_clickNavigationIntent&&epoch===walkSetup.epoch&&!_clickNavigationBusy())_navigationHoldPreview();
          if(!preview&&ready&&intent===_clickNavigationIntent&&epoch===walkSetup.epoch&&camPos.distanceTo(position)<.001&&!_clickNavigationBusy())
            _clickNavigateAt(clientX,clientY,false,hit);
        }).finally(()=>{if(hold)hold.navigationPending=false;});
        return preview?{point:hit.point,valid:false}:false;
      }
      const points=query.find(LocahunClickNavigation.resolveOrigin(walkSetup.core,camPos),hit.point,walkSetup.settings.navigation.key);
      if(!points)return preview?{point:hit.point,valid:false}:false;
      hit={...hit,point:points.at(-1)};route=points.map(p=>({x:p.x,y:p.y+1.8,z:p.z}));
      clear=LocahunClickNavigation.createRouteClearance(walkSetup.core,camPos,points);
    }else clear=LocahunClickNavigation.createClearance(walkSetup.core,camPos,hit.point);
    if(!clear)return preview?{point:hit.point,valid:false}:false;
    const routeGround=preparedLease?LocahunClickNavigation.createRouteGround(camPos,preparedLease.points):null;
    const controller=LocahunClickNavigation.create({
      position:()=>camPos,setPosition:p=>{camPos.set(p.x,p.y,p.z);markDirty(3);if(typeof bumpSplatActive==='function')bumpSplatActive(500);},
      ready:()=>!!globalThis.getCameraCollisionState?.().ready&&(!preparedLease||preparedLease.valid()),
      epoch:()=>walkSetup.epoch,blocked:_clickNavigationBusy,
      coverage:preparedLease?(a,b)=>[a,b].every(p=>preparedLease.covers(routeGround(p))):_clickNavigationCoverage,
      clear,
      sweep:(a,b)=>movementCore.moveCamera(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},.15)
    });
    const accepted=controller.start(hit,now,route||undefined);
    if(preview)return {point:hit.point,valid:accepted};
    if(!accepted)return false;
    _clickNavigationController=controller;
    _clickNavigationLease=preparedLease;
    if(typeof _showNavigationPoint==='function')_showNavigationPoint(hit.point,true);
    const step=()=>{
      _clickNavigationTimer=null;
      try{_clickNavigationController.tick(performance.now());}catch(_error){_cancelClickNavigation();}
      if(_clickNavigationController.active)_clickNavigationTimer=setTimeout(step,16);
      else{
        _clickNavigationLease?.dispose();_clickNavigationLease=null;
        if(typeof _hideNavigationPoint==='function')_hideNavigationPoint();
      }
    };
    _clickNavigationTimer=setTimeout(step,16);
    return true;
  }catch(_error){if(!preview)_cancelClickNavigation();return false;}
}

const _clickGestures={mouse:LocahunClickNavigation.createGesture(),touch:LocahunClickNavigation.createGesture(12)};
let _clickSuppressMouseUntil=0;
function _clickPointerStart(kind,e){
  if(typeof _navigationHoldReset==='function')_navigationHoldReset();
  _clickGestures[kind].reset();
  if(kind==='mouse'&&(performance.now()<_clickSuppressMouseUntil||e.sourceCapabilities?.firesTouchEvents))return false;
  if(kind==='touch'){_clickGestures.mouse.reset();_clickSuppressMouseUntil=performance.now()+1000;}
  return true;
}
function _clickPointerPoint(kind,e){
  const p=kind==='touch'?e.changedTouches[0]:e;
  return p?{x:p.clientX,y:p.clientY,id:kind==='touch'?p.identifier:0}:null;
}
function _clickPointerArm(kind,e){
  if(e.target!==canvas||(typeof msr!=='undefined'&&msr.active)||
    (typeof _pathMode!=='undefined'&&_pathMode)||(typeof _placeMode!=='undefined'&&_placeMode)||
    (kind==='touch'&&e.touches.length!==1))return;
  const p=_clickPointerPoint(kind,e);if(p)_clickGestures[kind].arm(p,performance.now());
  if(p&&typeof _navigationHoldArm==='function')_navigationHoldArm(kind,p);
}
function _clickPointerMove(kind,e){
  if(typeof _navigationHoldMove==='function'&&_navigationHoldMove(kind,e))return true;
  if(kind==='touch'&&e.touches.length!==1){_clickGestures.touch.reset();return;}
  const p=_clickPointerPoint(kind,e);if(p)_clickGestures[kind].move(p);
  return kind==='touch'&&_clickGestures.touch.waiting();
}
function _clickPointerTake(kind,e,consumed=false){
  if(typeof _navigationHoldTake==='function'){
    const held=_navigationHoldTake(kind,e,consumed);
    if(held){_clickGestures[kind].reset();return held;}
  }
  const p=_clickPointerPoint(kind,e);if(!p){_clickGestures[kind].reset();return null;}
  if(kind==='touch')_clickSuppressMouseUntil=performance.now()+1000;
  return _clickGestures[kind].take(p,performance.now(),consumed||e.target!==canvas||
    (kind==='mouse'&&(e.button!==0||performance.now()<_clickSuppressMouseUntil))||
    (kind==='touch'&&e.touches.length!==0));
}
if(typeof window!=='undefined'){
  window.addEventListener('wheel',_cancelClickNavigation,{passive:true,capture:true});
}
