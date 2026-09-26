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
  // ── 2026-09-27 再設計 ─────────────────────────────────────────────
  // 大きいスキャンでは、当たり判定の箱は「カメラの周り数mの区画」だけが物理側に読み込まれる
  // （217b の _walkWholeCoverage）。裏に回ると周りの区画は空なので、光線が何にも当たらず
  // 検知できなかった（本人報告「起動しないな」）。
  // そこで光線ではなく、全体の区画索引（walkSetup.wholeIndex）そのものを読む。索引には
  // スキャン全体の箱が入っているので、その柱の上下全域を見て「いちばん下の面」を直接求める。
  // 索引が無い小さいシーンだけ、従来どおり物理側の光線で調べる。
  const lowestFromIndex=(index,x,z)=>{
    const cs=index.cellSize;
    // 先にセル番号（整数）にしてから区画と区画内位置に分ける。x=-0 のような境界値で
    // 区画内位置が 32 になって取りこぼすのを防ぐ（実測: 交差点の x=0 で柱が空になった）。
    const gx=Math.floor(x/cs),gz=Math.floor(z/cs);
    const tx=Math.floor(gx/32),tz=Math.floor(gz/32);
    const cx=gx-tx*32,cz=gz-tz*32;
    let lowest=null;
    for(const tile of index.tiles.values()){
      if(tile.coord[0]!==tx||tile.coord[2]!==tz)continue;
      const a=tile.data;
      for(let j=0;j<a.length;j+=6){
        if(cx<a[j]||cx>=a[j+3]||cz<a[j+2]||cz>=a[j+5])continue;
        const bottom=(tile.coord[1]*32+a[j+1])*cs;
        if(lowest===null||bottom<lowest)lowest=bottom;
      }
    }
    return lowest;
  };
  // 光線版（索引が無いとき）。面の中から撃つと距離0が返るので 0.3m ずつ抜ける。
  const lowestFromRay=(core,x,z,top)=>{
    let y=top,lowest=null;
    for(let i=0;i<40;i++){
      const d=core.raycast({x,y,z},DOWN,120);
      if(d===null)break;
      lowest=y-d;y=lowest-.3;
    }
    return lowest;
  };
  const lowestSurface=(core,x,z,top)=>{
    const index=walkSetup.wholeIndex;
    return index?lowestFromIndex(index,x,z):lowestFromRay(core,x,z,top);
  };
  const _underScan=(core,p)=>{
    let columns=0;
    for(const [dx,dz] of [[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]]){
      const low=lowestSurface(core,p.x+dx,p.z+dz,p.y+60);
      if(low===null)continue;
      columns++;
      if(p.y>low-.02)return false;
    }
    return columns>=3;
  };
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
    btn.classList.toggle('cam-reset-alert',streak>=2);
  };
  setInterval(check,500);
  window.__underScan=_underScan; // 診断用（自動テストから判定だけ呼ぶ）
  window.__underScanHere=(x,y,z)=>{const core=walkSetup.core;if(!core)return {core:false};const p={x,y,z};
    return {whole:!!walkSetup.wholeIndex,cols:[[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]].map(([dx,dz])=>lowestSurface(core,x+dx,z+dz,y+60)),under:_underScan(core,p)};};
  window.__underGroundAlert=()=>({streak,on:!!document.getElementById('btn-cam-reset')?.classList.contains('cam-reset-alert')});
})();
