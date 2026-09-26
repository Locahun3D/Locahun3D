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
  // その柱でいちばん下の面の高さ（無ければ null）。面の中から撃つと距離0が返るので 0.3m ずつ抜ける。
  const lowestSurface=(core,x,z,top)=>{
    let y=top,lowest=null;
    for(let i=0;i<40;i++){
      const d=core.raycast({x,y,z},DOWN,120);
      if(d===null)break;
      lowest=y-d;y=lowest-.3;
    }
    return lowest;
  };
  const _underScan=(core,p)=>{
    let columns=0;
    for(const [dx,dz] of [[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]]){
      const low=lowestSurface(core,p.x+dx,p.z+dz,p.y+60);
      if(low===null)continue;
      columns++;
      if(p.y>low-.1)return false;
    }
    return columns>=3;
  };
  let streak=0;
  const check=()=>{
    const btn=document.getElementById('btn-cam-reset');if(!btn)return;
    let under=false;
    try{
      const core=walkSetup.core;
      if(core&&!walkMode.active&&!document.hidden)under=_underScan(core,camPos);
    }catch(_){under=false;}
    streak=under?streak+1:0;
    btn.classList.toggle('cam-reset-alert',streak>=2);
  };
  setInterval(check,500);
  window.__underScan=_underScan; // 診断用（自動テストから判定だけ呼ぶ）
  window.__underGroundAlert=()=>({streak,on:!!document.getElementById('btn-cam-reset')?.classList.contains('cam-reset-alert')});
})();
