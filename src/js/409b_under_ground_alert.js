// ── 地面の裏に回ったらカメラリセットを緑に点滅（2026-09-26 本人要望） ─────────
// スキャンの床より下へ抜けると、裏返った3DGSだけが見えて戻り方が分からなくなる。
// 判定（2026-09-26 本人指摘「地下だったら？」で改訂）:
//   旧: 真下に床が無く真上に面がある → 地下室や、床の判定に穴がある所で誤検知する。
//   新: カメラの周り5本の縦の柱（中心＋前後左右1.2m）それぞれで、上から下まで面をたどり
//       「その柱でいちばん下の面」を求める。面のある柱が3本以上あり、そのすべてで
//       カメラがいちばん下の面よりさらに下にいるときだけ「スキャンの外（裏）」とする。
//       地下室の床はいちばん下の面なので、その上に立っていれば鳴らない。床の穴は局所的なので
//       周りの柱が止める。これが 1 秒続いたら点滅。
(function(){
  const st=document.createElement('style');
  st.textContent='@keyframes l3dResetBlink{0%,100%{background:rgba(20,20,22,.88);border-color:rgba(255,255,255,.18)}'+
    '50%{background:rgba(40,190,100,.75);border-color:rgba(130,255,180,.95)}}'+
    '#btn-cam-reset.cam-reset-alert{animation:l3dResetBlink 1s ease-in-out infinite!important;color:#f2fff6!important}';
  document.head.appendChild(st);
  const DOWN={x:0,y:-1,z:0};
  // ── 2026-09-27 再設計（2回目） ────────────────────────────────────
  // 1回目: 区画索引から柱ごとの「いちばん下の面」を求め、カメラがそれより下なら裏。
  //   → 路面の下に散ったノイズの箱があると、それが「いちばん下の面」になり鳴らなかった
  //     （本人報告: 坂の住宅街で裏に回っても点滅しない）。
  // 2回目: 柱ごとに「カメラより下にある面の高さ」を全部集め、5本の柱のうち3本以上で
  //   ほぼ同じ高さ（±0.35m）に面があれば、それは本物の床（地下室の床も含む）とみなして鳴らさない。
  //   そろわない散らばった面はノイズとして無視する。床が無く、3本以上の柱でカメラより上に
  //   面があれば「スキャンの裏」。1秒続いたら点滅。
  // 索引が無い小さいシーンは物理側の光線で同じことをする。
  const columnSurfaces=(x,z)=>{
    // その柱にある箱の [下端, 上端] を索引から集める（読み込み範囲に関係なくスキャン全体）。
    const index=walkSetup.wholeIndex,out=[];
    if(index){
      const cs=index.cellSize;
      const gx=Math.floor(x/cs),gz=Math.floor(z/cs);
      const tx=Math.floor(gx/32),tz=Math.floor(gz/32);
      const cx=gx-tx*32,cz=gz-tz*32;
      for(const tile of index.tiles.values()){
        if(tile.coord[0]!==tx||tile.coord[2]!==tz)continue;
        const a=tile.data,base=tile.coord[1]*32;
        for(let j=0;j<a.length;j+=6){
          if(cx<a[j]||cx>=a[j+3]||cz<a[j+2]||cz>=a[j+5])continue;
          out.push([(base+a[j+1])*cs,(base+a[j+4])*cs]);
        }
      }
      return out;
    }
    const core=walkSetup.core;if(!core)return out;
    // 光線版: 上から順に面をたどる（面の中から撃つと距離0が返るので 0.3m ずつ抜ける）。
    let y=camPos.y+60;
    for(let i=0;i<40;i++){
      const d=core.raycast({x,y,z},DOWN,120);
      if(d===null)break;
      const top=y-d;out.push([top-.25,top]);y=top-.3;
    }
    return out;
  };
  const OFFSETS=[[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]];
  // 判定（2026-09-27 本人指示「判定を厳しく／床下以外でも建物の内部に入ったときも点灯」）:
  //  ① カメラの位置そのものが箱の中（壁や床にめり込んでいる）→ 即・裏。
  //  ② 5本の柱のうち3本以上に何かの箱がある（＝スキャンの範囲内）のに、
  //     3本以上でそろう高さの床がカメラより下に無い → 裏。
  //     上に面があるかは問わない。屋根が無い建物の内側や、外壁の裏に抜けたときも鳴る。
  //  床は「カメラより下で、3本以上の柱が ±0.35m にそろう面の上端」。地下室の床も床。
  //  散らばったノイズの面はそろわないので床にならない。
  const _underScan=(core,p)=>{
    const cols=OFFSETS.map(([dx,dz])=>columnSurfaces(p.x+dx,p.z+dz));
    if(cols[0].some(([lo,hi])=>lo<=p.y&&p.y<=hi))return true;          // ①
    if(cols.filter(c=>c.length).length<3)return false;                  // スキャンの外
    const belowTops=cols.map(c=>c.filter(([,hi])=>hi<=p.y+.02).map(([,hi])=>hi));
    for(const tops of belowTops)for(const h of tops){
      let agree=0;
      for(const t2 of belowTops)if(t2.some(t=>Math.abs(t-h)<=.35))agree++;
      if(agree>=3)return false;                                         // 床がある
    }
    return true;                                                        // ②
  };
  // 診断用（自動テストから読むだけ／位置を置くだけ）
  window.__columnSurfaces=columnSurfaces;
  window.__setCamPos=(x,y,z)=>{camPos.set(x,y,z);if(typeof markDirty==='function')markDirty(3);};
  let streak=0,lastKey='',lastUnder=false;
  const check=()=>{
    const btn=document.getElementById('btn-cam-reset');if(!btn)return;
    let under=false;
    try{
      const core=walkSetup.core;
      if(core&&!walkMode.active&&!document.hidden){
        const key=[camPos.x,camPos.y,camPos.z].map(v=>Math.round(v*4)).join(',');
        if(key!==lastKey){lastKey=key;lastUnder=_underScan(core,camPos);}
        under=lastUnder;
      }
    }catch(_){under=false;}
    streak=under?streak+1:0;
    const on=streak>=2;
    btn.classList.toggle('cam-reset-alert',on);
  };
  setInterval(check,500);
  window.__underScan=_underScan; // 診断用（自動テストから判定だけ呼ぶ）
  window.__underScanHere=(x,y,z)=>({whole:!!walkSetup.wholeIndex,under:_underScan(walkSetup.core,{x,y,z}),cols:OFFSETS.map(([dx,dz])=>columnSurfaces(x+dx,z+dz).length)});
  window.__underGroundAlert=()=>({streak,on:!!document.getElementById('btn-cam-reset')?.classList.contains('cam-reset-alert')});
})();
