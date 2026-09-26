// ── Mouse button swap (2026-09-26 試験) ─────────────────────────────
// 「左ドラッグで視点を回す（ストリートビュー感覚）」を試すため、キャンバス上の
// 左右ボタンを入れ替える。以降の全ハンドラは e.button を見るだけなので、
// capture 段階でイベントの button を書き換えて一括で入れ替える。
//   左ドラッグ = 視点回転 / 右クリック = 選択・クリック移動・計測
// ?swapMouse=0 で従来操作に戻せる。
(function(){
  let on=true;
  try{ on=new URLSearchParams(location.search).get('swapMouse')!=='0'; }catch(_){}
  window.__mouseButtonSwap=on;
  if(!on)return;
  const swap=e=>{
    if(e.pointerType&&e.pointerType!=='mouse')return;
    if(e.button!==0&&e.button!==2)return;
    // mouseup は window で拾う処理があるので、押下がキャンバス起点なら常に入れ替える
    if(e.type.endsWith('down')&&e.target!==canvas)return;
    if(e.type.endsWith('up')&&e.target!==canvas&&!swap.fromCanvas)return;
    if(e.type.endsWith('down'))swap.fromCanvas=true;
    try{ Object.defineProperty(e,'button',{value:e.button===0?2:0,configurable:true}); }catch(_){}
  };
  swap.fromCanvas=false;
  for(const t of['pointerdown','mousedown','pointerup','mouseup'])
    window.addEventListener(t,swap,true);
  window.addEventListener('mouseup',()=>{ setTimeout(()=>{ swap.fromCanvas=false; },0); });
})();
