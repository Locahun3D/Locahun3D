// ── 地面の裏に回ったらカメラリセットを緑に点滅（2026-09-26 本人要望） ─────────
// スキャンの床より下へ抜けると、裏返った3DGSだけが見えて戻り方が分からなくなる。
// 当たり判定の形（カメラの当たり判定が OFF でもクリック移動用に作っている）に対して
// 真下と真上へ光線を飛ばし、「下に床が無く、上に面がある」が 1 秒続いたら裏と判断する。
(function(){
  const st=document.createElement('style');
  st.textContent='@keyframes l3dResetBlink{0%,100%{background:rgba(20,20,22,.88);border-color:rgba(255,255,255,.18)}'+
    '50%{background:rgba(40,190,100,.75);border-color:rgba(130,255,180,.95)}}'+
    '#btn-cam-reset.cam-reset-alert{animation:l3dResetBlink 1s ease-in-out infinite!important;color:#f2fff6!important}';
  document.head.appendChild(st);
  let streak=0;
  const check=()=>{
    const btn=document.getElementById('btn-cam-reset');if(!btn)return;
    let under=false;
    try{
      const core=walkSetup.core;
      if(core&&!walkMode.active&&!document.hidden){
        const o={x:camPos.x,y:camPos.y,z:camPos.z};
        under=core.raycast(o,{x:0,y:-1,z:0},40)===null&&core.raycast(o,{x:0,y:1,z:0},40)!==null;
      }
    }catch(_){under=false;}
    streak=under?streak+1:0;
    btn.classList.toggle('cam-reset-alert',streak>=2);
  };
  setInterval(check,500);
  window.__underGroundAlert=()=>({streak,on:!!document.getElementById('btn-cam-reset')?.classList.contains('cam-reset-alert')});
})();
