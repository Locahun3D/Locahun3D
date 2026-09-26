// ── Mouse button swap (2026-09-26 試験) ─────────────────────────────
// 「左ドラッグで視点を回す（ストリートビュー感覚）」を試すため、キャンバス上の
// 左右ボタンを入れ替える。以降の全ハンドラは e.button を見るだけなので、
// capture 段階でイベントの button を書き換えて一括で入れ替える。
//   左ドラッグ = 視点回転 / 右クリック = 選択・クリック移動・計測
//   左クリック（動かさずに離す）= その場所へ移動（2026-09-26 渡邊さんFB「左クリックでストリートビュー移動」）
// ?swapMouse=0 で従来操作に戻せる。
(function(){
  let on=true;
  try{ on=new URLSearchParams(location.search).get('swapMouse')!=='0'; }catch(_){}
  window.__mouseButtonSwap=on;
  if(!on)return;
  const _gizmoUnder=(x,y)=>{
    try{
      const measuring=typeof msr!=='undefined'&&msr.active;
      if(!measuring&&typeof _checkBoneRotateRingHit==='function'&&_checkBoneRotateRingHit(x,y))return true;
      if(!measuring&&typeof _checkIKHandleHit==='function'&&_checkIKHandleHit(x,y))return true;
      if(!measuring&&typeof selectedLayerId!=='undefined'&&selectedLayerId!=null&&typeof checkLpvHandle==='function'&&checkLpvHandle(x,y))return true;
      if(measuring&&typeof checkAxisHandle==='function'&&checkAxisHandle(x,y))return true;
      if(measuring&&typeof nearMarker==='function'&&nearMarker(x,y))return true;
      if(typeof _pathEditId!=='undefined'&&_pathEditId!=null&&typeof _pathHandleAt==='function'&&_pathHandleAt(x,y)>=0)return true;
    }catch(_){}
    return false;
  };
  const swap=e=>{
    if(e.__l3dSynthetic)return;
    if(e.pointerType&&e.pointerType!=='mouse')return;
    if(e.button!==0&&e.button!==2)return;
    // mouseup は window で拾う処理があるので、押下がキャンバス起点なら常に入れ替える
    if(e.type.endsWith('down')&&e.target!==canvas)return;
    // ギズモの持ち手（ピボット・軸・測定点・パスの角・ボーン）の上で押したときは入れ替えない
    // （2026-09-27 本人指摘: 左ドラッグの見回しが優先されてギズモが動かせなかった）。
    if(e.type.endsWith('down')&&e.button===0&&_gizmoUnder(e.clientX,e.clientY)){ swap.fromCanvas=false; swap.skip=true; return; }
    if(e.type.endsWith('up')&&swap.skip){ if(e.type==='mouseup')swap.skip=false; return; }
    if(e.type.endsWith('up')&&e.target!==canvas&&!swap.fromCanvas)return;
    if(e.type.endsWith('down'))swap.fromCanvas=true;
    try{ Object.defineProperty(e,'button',{value:e.button===0?2:0,configurable:true}); }catch(_){}
  };
  swap.fromCanvas=false;
  for(const t of['pointerdown','mousedown','pointerup','mouseup'])
    window.addEventListener(t,swap,true);
  window.addEventListener('mouseup',()=>{ setTimeout(()=>{ swap.fromCanvas=false; },0); });
  // 物理の左ボタン: 押してから動いた量を数え、ほぼ動かさずに離したら「右クリック（旧左クリック）」を1回送る。
  // ポインターロック中は clientX が動かないので movementX/Y を合計する。
  let tap=null;
  canvas.addEventListener('mousedown',e=>{ if(!e.__l3dSynthetic&&e.button===2&&swap.fromCanvas)tap={x:e.clientX,y:e.clientY,t:performance.now(),m:0}; });
  window.addEventListener('mousemove',e=>{ if(tap)tap.m+=Math.abs(e.movementX||0)+Math.abs(e.movementY||0); });
  window.addEventListener('mouseup',e=>{
    if(e.__l3dSynthetic||!tap||e.button!==2){ if(e.button===2)tap=null; return; }
    const t=tap;tap=null;
    if(t.m>=5||performance.now()-t.t>500)return;
    setTimeout(()=>{
      // 測定中は右クリック（旧左）が点置きなので、合成せずに移動だけ呼ぶ。
      if(typeof msr!=='undefined'&&msr.active){ if(typeof _clickNavigateAt==='function')_clickNavigateAt(t.x,t.y); return; }
      const opt={button:0,buttons:1,bubbles:true,cancelable:true,clientX:t.x,clientY:t.y};
      const down=new MouseEvent('mousedown',opt);down.__l3dSynthetic=true;canvas.dispatchEvent(down);
      const up=new MouseEvent('mouseup',{...opt,buttons:0});up.__l3dSynthetic=true;canvas.dispatchEvent(up);
    },0);
  });
})();
