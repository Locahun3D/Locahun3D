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
        const eye=Number.isFinite(io.eyeHeight)?io.eyeHeight:1.8;
        const from={...io.position()},to={...hit.point,y:hit.point.y+eye};
        if(!valid(from)||!valid(to)||!io.ready()||io.blocked())return false;
        if(io.collision!==false&&(!io.coverage(from,to)||!io.clear(from,0)||!io.clear(to,1)))return false;
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
        if(!Number.isFinite(now)||gap<0){cancel('frame-gap');return false;}
        // 描画が止まった（重い読み込み・タブの裏）間は進めず、その分あとへずらして続ける。以前はここで打ち切っていて、
        // 直線移動の途中（家具や壁の中のこともある）にカメラが残った（2026-10-08）。
        if(gap>250){m.start+=gap;m.previous=now;return true;}
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
          if(io.collision!==false&&(!io.coverage(m.last,next)||!io.clear(next,progress))){cancel('clearance-or-coverage');return false;}
          const swept=io.collision===false?next:io.sweep(m.last,next);
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
    let pending=null;
    return {reset(){pending=null;},arm(p,now){pending={...p,at:now,moved:false};},
      move(p){if(pending&&(p.id!==pending.id||Math.hypot(p.x-pending.x,p.y-pending.y)>=tolerance))pending.moved=true;},
      waiting(){return !!pending&&!pending.moved;},
      take(p,now,consumed){
        const old=pending;pending=null;
        if(!old||consumed||old.moved||p.id!==old.id||now-old.at>600||now<old.at||Math.hypot(p.x-old.x,p.y-old.y)>=tolerance)return null;
        return p;
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
  // 2026-09-27 本人指示: 測定中・カメラツール中・カメラアニメーション編集中もクリック移動を使う。
  // 測定中は「右クリック長押し＝点を置く」のまま（mouseup/touch 側で測定を優先）。再生中だけは止める。
  return (typeof arMode!=='undefined'&&arMode.active)||
    (typeof _useOrtho!=='undefined'&&_useOrtho)||(typeof _viewRec!=='undefined'&&_viewRec.active)||
    !!globalThis._captureBusy||_clickNavigationTourOwnsCamera()||
    (typeof location!=='undefined'&&/[?&](orbit|capture)=1(?:&|$)/.test(location.search))||
    (typeof walkMode!=='undefined'&&walkMode.active)||
    (typeof camAnim!=='undefined'&&camAnim.playing)||
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
// Tap travel uses collision geometry only to identify a destination floor.
function _clickStandingSurface(core,hit,eyeHeight,from,hereGiven){
  // 立てるかどうかは人の背丈（1.8m）で見る。目線を低くしても机の天面には立たせない。
  const need=Math.max(eyeHeight,1.8)+.15,up=n=>{const l=Math.hypot(n.x,n.y,n.z);return l>1e-8&&n.y/l>=Math.SQRT1_2;};
  const roomyTo=(h,d)=>!core.raycastSurface({x:h.point.x,y:h.point.y+.05,z:h.point.z},{x:0,y:1,z:0},d);
  const roomy=h=>roomyTo(h,need);
  // 今いる階の床（カメラの真下）。無ければ（宙に浮いている等）家具の判定はしない。
  const hereHit=hereGiven!==undefined?hereGiven:core.raycastSurface({x:from.x,y:from.y,z:from.z},{x:0,y:-1,z:0},3);
  const here=hereHit&&up(hereHit.normal)?hereHit:null;
  // 階段らしさ: 周り（30・55cm）に 10〜35cm の段差の面が 2 つ以上ある。家具の天面は周りが同じ高さか床まで落ちる。
  const stairish=h=>{let n=0;for(const r of [.3,.55])for(let k=0;k<8;k++){const a=k*Math.PI/4,x=h.point.x+Math.cos(a)*r,z=h.point.z+Math.sin(a)*r;
    const s=core.raycastSurface({x,y:h.point.y+.6,z},{x:0,y:-1,z:0},1.2);if(s&&up(s.normal)){const d=Math.abs(s.point.y-h.point.y);if(d>=.1&&d<=.35&&++n>=2)return true;}}return false;};
  // 今いる階の床へ降ろす（家具の下の床）。階段の段の下・下の階へは降ろさない。
  const drop=()=>{
    if(!here)return null;
    const x=hit.point.x,z=hit.point.z;
    // 箱の中から下向きに撃つと自分の箱に当たるので、空いている高さまで 10cm ずつ下りてから床を探す。
    for(let y=hit.point.y-.05;y>hit.point.y-2.5;y-=.1){
      if(!core.isCapsuleClear({x,y,z},.06,.03))continue;
      const floor=core.raycastSurface({x,y:y+.01,z},{x:0,y:-1,z:0},2.5);
      if(!floor)return null;
      if(up(floor.normal)&&roomy(floor))return Math.abs(floor.point.y-here.point.y)<.35?floor:null;
      y=floor.point.y;
    }
    return null;
  };
  const rise=here?hit.point.y-here.point.y:0,isStair=stairish(hit);
  // 机・ソファ・台の天面（今の床より 0.3〜1.7m 上、真下に今の階の床）は、天井が高い部屋でも床へ降ろす
  // （2026-10-08 本人「机の上をタッチしたときなど」）。
  if(rise>.3&&rise<1.7&&!isStair){const f=drop();if(f)return f;}
  if(roomy(hit))return hit;
  // 階段: 当たり判定は 25cm の箱で天井や上の段の裏が実際より低く出るので、目線＋25cm 空いていれば立てる
  // （1.95m を求めると普通の階段でも段に上がれなかった。2026-10-08 計測で階段の拒否の 4 割）。
  if(isStair&&roomyTo(hit,eyeHeight+.25))return hit;
  return drop();
}
// 壁際ぎりぎりに止めない（2026-10-08 本人提案「壁際ぎりぎりに移動できないようにしたら？」）。
// 行き先の目線の高さで水平16方向に壁までの距離を測り、近すぎれば壁から押し戻す（腰の高さも見ると階段の上の段を壁と
// 取り違え、非常階段で移動できない所が 4→12 か所に増えた。2026-10-08 計測）。
// 必要な距離は 40cm。ただし狭い通路・両側が壁の階段では止まれる所が無くなるので、
// その向きの通路幅の 45% までに緩める（＝中央に寄せる）。押し戻しても足りなければ、来た方向へ 10cm ずつ戻して探す
// （戻る途中の床は、出発点と行き先のあいだの高さなら階段でもよい）。1.5m 戻しても無ければ移動しない。
function _clickWallClearance(core,hit,from,eyeHeight){
  const CLEAR=.4,N=16,dirs=[];for(let k=0;k<N;k++)dirs.push({x:Math.cos(k*2*Math.PI/N),y:0,z:Math.sin(k*2*Math.PI/N)});
  const dist=(x,y,z)=>{const d=new Array(N).fill(2);for(const h of [eyeHeight])for(let k=0;k<N;k++){const r=core.raycastSurface({x,y:y+h,z},dirs[k],2);if(r&&r.distance<d[k])d[k]=r.distance;}return d;};
  // 押し戻し量（0 なら十分に空いている）
  const push=(x,y,z)=>{const d=dist(x,y,z);let px=0,pz=0,short=false;
    for(let k=0;k<N;k++){const need=Math.min(CLEAR,.45*(d[k]+d[(k+N/2)%N]));if(d[k]<need-.02){short=true;px-=dirs[k].x*(need-d[k]);pz-=dirs[k].z*(need-d[k]);}}
    return short?{x:px,z:pz}:null;};
  const up=n=>{const l=Math.hypot(n.x,n.y,n.z);return l>1e-8&&n.y/l>=Math.SQRT1_2;};
  const roomy=(x,y,z)=>!core.raycastSurface({x,y:y+.05,z},{x:0,y:1,z:0},Math.max(eyeHeight,1.8)+.15);
  const fromFeet=from.y-eyeHeight,lo=Math.min(fromFeet,hit.point.y)-.3,hi=Math.max(fromFeet,hit.point.y)+.3;
  const standAt=(x,z,near)=>{const fl=core.raycastSurface({x,y:near+.5,z},{x:0,y:-1,z:0},1);
    return fl&&up(fl.normal)&&fl.point.y>=lo&&fl.point.y<=hi&&roomy(x,fl.point.y,z)?fl:null;};
  const settle=(x,z,near)=>{let s=standAt(x,z,near);if(!s)return null;
    for(let it=0;it<3;it++){const p=push(x,s.point.y,z);if(!p)return s;x+=p.x;z+=p.z;s=standAt(x,z,s.point.y);if(!s)return null;}
    return push(x,s.point.y,z)?null:s;};
  const p=hit.point;if(!push(p.x,p.y,p.z))return hit;
  const first=settle(p.x,p.z,p.y);if(first)return first;
  let dx=from.x-p.x,dz=from.z-p.z;const len=Math.hypot(dx,dz);if(len<1e-6)return null;dx/=len;dz/=len;
  let y=p.y;
  for(let s=.1;s<=Math.min(1.5,len)+1e-6;s+=.1){
    const g=standAt(p.x+dx*s,p.z+dz*s,y);if(g)y=g.point.y;
    const r=settle(p.x+dx*s,p.z+dz*s,y);if(r)return r;
  }
  return null;
}
// クリック・タップの行き先を決める（2026-10-08 全シーン監査で整理。scripts/camera-height-audit.mjs も同じ関数で理由を数える）。
// 返り値: {hit} か {fail:'理由', point?}。
// ⚠ 大きいシーンの当たり判定はタイルを場所ごとに読み込む（walkSetup.wholeIndex）。以前は「目に見えた点のまわり」しか
//   読まず、手すりの隙間から下の床が見えると階段のタイルが無いまま判定して下の階へ素通りした・天井が無い扱いで天井すれすれに
//   止まった（有明 非常階段・清澄SOHO）。今はカメラの真下→視線に沿って 4m ずつ→行き先のまわり、の順に読みながら判定する。
function _clickResolveTarget(clientX,clientY,eyeHeight=1.2,preparedHit=null){
  const rect=canvas.getBoundingClientRect(),core=walkSetup.core,whole=!!walkSetup.wholeIndex;
  const cover=(a,b,o)=>{if(whole&&typeof _walkWholeCoverage==='function')_walkWholeCoverage(a,b,o);};
  const pickCamera=_useOrtho?_orthoCamera:camera;
  // Use the currently displayed camera, including its latest eased rotation.
  pickCamera.updateWorldMatrix(true,false);
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),pickCamera);
  let point=null;
  if(typeof pickWorldPos==='function'){const depth=msr.placeDepth;try{point=pickWorldPos(clientX,clientY,{strictVisible:true});}catch(_e){point=null;}finally{msr.placeDepth=depth;}}
  if(whole&&(!point||Math.hypot(point.x-camPos.x,point.y+1.8-camPos.y,point.z-camPos.z)>30))return {fail:'no-visible-point'};
  // 今いる階の床（カメラの真下）を先に測る。
  cover(camPos,camPos,{drop:4,margin:1});
  const hereHit=core.raycastSurface({x:camPos.x,y:camPos.y,z:camPos.z},{x:0,y:-1,z:0},3);
  let picked=preparedHit;
  if(!picked){
    const o=ray.ray.origin,d=ray.ray.direction;
    const maxDist=whole?Math.min(40,Math.hypot(point.x-o.x,point.y-o.y,point.z-o.z)+3):Math.min(1000,pickCamera.far);
    for(let s=0;s<maxDist&&!picked;s+=4){
      const len=whole?Math.min(4,maxDist-s):maxDist,a={x:o.x+d.x*s,y:o.y+d.y*s,z:o.z+d.z*s};
      cover(a,{x:a.x+d.x*len,y:a.y+d.y*len,z:a.z+d.z*len},{drop:.5,margin:.6});
      const h=core.raycastSurface(a,d,len);
      if(h)picked={distance:s+h.distance,point:h.point,normal:h.normal};
      if(!whole)break;
    }
  }
  if(!picked)return {fail:'no-collision-hit'};
  // 壁の外へ出てしまう対策（2026-09-20 本人報告）。判定形状には窓・薄い壁で穴があり、視線がそこを抜けると
  // 外の地面が行き先になっていた。見えている 3DGS の面が、判定上の当たり位置よりはっきり手前にあるなら
  // 「見えている壁の向こう」を指しているので行かない（長押しの玉は赤）。戸口越しの床は両者が一致するので通る。
  if(!preparedHit&&point&&picked.point){
    const o=ray.ray.origin;
    const seen=Math.hypot(point.x-o.x,point.y-o.y,point.z-o.z),solid=Math.hypot(picked.point.x-o.x,picked.point.y-o.y,picked.point.z-o.z);
    if(solid-seen>.75)return {fail:'behind-visible-surface',point:{x:point.x,y:point.y,z:point.z}};
  }
  // 行き先のまわり（壁・天井・下の床を調べる範囲）を読み込む。
  cover(picked.point,picked.point,{drop:4,margin:2.5});
  let hit=LocahunClickNavigation.resolveSurface(picked,camPos,(a,b,dd)=>core.raycastSurface(a,b,dd));
  if(!hit)return {fail:'not-floor',point:picked.point};
  // 立てない面に降りない（2026-10-08 スタジオバベル/バルス「目線が天井から見下ろす高さになる・天井を突き抜ける」）。
  // 当たり判定は 25cm の箱の集まりで、ソファ・机・棚は中身の詰まった箱になる。その天面を行き先にすると目線が
  // 天井の箱に埋まる。机などの天面は下の床へ降ろし、階段は目線が入れば立てる。立てなければ移動しない。
  hit=_clickStandingSurface(core,hit,eyeHeight,camPos,hereHit);
  if(!hit)return {fail:'no-standing-room',point:picked.point};
  hit=_clickWallClearance(core,hit,camPos,eyeHeight);
  if(!hit)return {fail:'wall-clearance',point:picked.point};
  // 最後に、行き先に人の体（足元 30cm〜目線）が入る空間があるかを確かめる。入らなければ移動しない。
  if(!core.isCapsuleClear({x:hit.point.x,y:hit.point.y+.3,z:hit.point.z},Math.max(.3,eyeHeight-.2),.1))return {fail:'no-body-space',point:picked.point};
  return {hit};
}
function _clickNavigateAt(clientX,clientY,preview=false,preparedHit=null,eyeHeight=1.2){
  // 移動中のクリック・タップは無視して今の移動を最後まで終える（2026-10-08 全シーン検査で、移動中に押し直すと
  // 壁を抜けて建物の外へ出る・家具に埋まって止まる、を再現）。移動中の画面は1つ前の描画なので、行き先の見え方の
  // 判定（壁の向こうを指していないか）が合わない。移動は直線（当たり判定なし）なので、途中で止めると物の中に残る。
  if(!preview&&_clickNavigationController?.active)return false;
  if(!preview)_cancelClickNavigation();
  if(_clickNavigationBusy())return false;
  const now=performance.now();
  const rect=canvas.getBoundingClientRect();
  if(!Number.isFinite(clientX)||!Number.isFinite(clientY)||rect.width<=0||rect.height<=0||clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return false;
  if(!walkSetup.core||walkSetup.importPending||walkSetup.settings.signature!==_walkSourceSignature()){
    if(!preview&&typeof globalThis.prepareCameraCollision==='function'){
      const intent=_clickNavigationIntent,epoch=walkSetup.epoch;
      globalThis.prepareCameraCollision({force:true}).then(ready=>{
        if(ready&&intent===_clickNavigationIntent&&epoch===walkSetup.epoch&&!_clickNavigationBusy())
          _clickNavigateAt(clientX,clientY,false,null,eyeHeight);
      }).catch(()=>{});
    }
    if(!preview&&now-_clickNavigationToastAt>1000&&typeof showUndoToast==='function'){
      showUndoToast((window._lang==='en'?'Preparing the ground at the destination':'移動先の地面を準備しています'));_clickNavigationToastAt=now;
    }
    return false;
  }
  try{
    const r=_clickResolveTarget(clientX,clientY,eyeHeight,preparedHit);
    if(r.fail)return preview&&r.point?{point:r.point,valid:false}:false;
    const hit=r.hit;
    const controller=LocahunClickNavigation.create({
      collision:false,eyeHeight,
      position:()=>camPos,setPosition:p=>{camPos.set(p.x,p.y,p.z);markDirty(3);if(typeof bumpSplatActive==='function')bumpSplatActive(500);},
      ready:()=>true,epoch:()=>walkSetup.epoch,blocked:_clickNavigationBusy
    });
    const accepted=controller.start(hit,now);
    if(preview)return {point:hit.point,valid:accepted};
    if(!accepted)return false;
    _clickNavigationController=controller;
    if(typeof _showNavigationPoint==='function')_showNavigationPoint(hit.point,true);
    const step=()=>{
      _clickNavigationTimer=null;
      try{controller.tick(performance.now());}catch(_error){_cancelClickNavigation();}
      if(controller.active)_clickNavigationTimer=setTimeout(step,16);
      else if(typeof _hideNavigationPoint==='function')_hideNavigationPoint();
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
