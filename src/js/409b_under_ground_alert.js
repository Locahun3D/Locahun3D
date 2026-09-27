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
  // ── 面の集め方は2通り ──────────────────────────────────────
  //  A. 当たり判定の区画索引（walkSetup.wholeIndex）があればそこから（正確・軽い）。
  //  B. 無ければ 3DGS の点そのものから（2026-09-27 本人指示「歩行とかも出来なくても点滅したほうがいい」:
  //     当たり判定が未生成・未対応のシーンでも鳴らす）。表示中の点を5本の柱（0.6m角）で拾い、
  //     高さ 0.25m 刻みで数え、まとまりのある段だけを「面」とみなす。
  // 柱は歩行の開始判定と同じ足元の範囲（中心＋前後左右30cm）。
  const OFFSETS=[[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]];
  const BIN=.25,HALF=.5,MIN_PTS=3; // 点から作るときは升より広め（1m角）に拾う。表示中の点は疎らなことがある
  const half=h=>{const e=(h>>10)&31,m=h&1023,sg=h&32768?-1:1;return sg*(e===0?m*2**-24:e===31?Infinity:(1+m/1024)*2**(e-15));};
  const columnFromIndex=(index,x,z)=>{
    const out=[],cs=index.cellSize;
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
  };
  // 表示中の 3DGS の点から、5本の柱それぞれの面（[下端,上端]）を1回の走査で集める。
  let _splatCache={key:'',cols:null,ms:0,points:0,total:0,at:0};
  const columnsFromSplats=(p)=>{
    const key=[p.x,p.z].map(v=>Math.round(v*4)).join(',');
    if(_splatCache.key===key&&_splatCache.cols&&_splatCache.total>0&&performance.now()-_splatCache.at<1500)return _splatCache.cols;
    const t0=performance.now();
    const bins=OFFSETS.map(()=>new Map());let points=0;
    const boxes=OFFSETS.map(([dx,dz])=>[p.x+dx-HALF,p.x+dx+HALF,p.z+dz-HALF,p.z+dz+HALF]);
    const minX=Math.min(...boxes.map(b=>b[0])),maxX=Math.max(...boxes.map(b=>b[1])),minZ=Math.min(...boxes.map(b=>b[2])),maxZ=Math.max(...boxes.map(b=>b[3]));
    // 点が多いときは等間隔に間引いて、1回の走査を数十msに抑える（判定は密度の閾値も同じ比で下げる）。
    const srcs=[];
    for(const L of (typeof layers!=='undefined'?layers:[])){
      if(!L||L.type!=='splat'||!L.mesh||L.visible===false)continue;
      const mesh=L.mesh;let packed=null,indices=null,n=0;
      try{
        if(mesh.paged&&mesh.paged.pager&&mesh.paged.pager.packedTexture){
          packed=mesh.paged.pager.packedTexture.value.image.data;
          indices=mesh.paged.dynoIndices?.value?.image?mesh.paged.dynoIndices.value.image.data:null;
          n=mesh.paged.numSplats||0;
        }else if(mesh.packedSplats&&mesh.packedSplats.packedArray){
          packed=mesh.packedSplats.packedArray;n=mesh.packedSplats.numSplats||0;
        }
      }catch(_){}
      if(!packed||!n)continue;
      mesh.updateMatrixWorld(true);srcs.push({packed,indices,n,m:mesh.matrixWorld.elements});
    }
    const total=srcs.reduce((a,s)=>a+s.n,0),stride=Math.max(1,Math.ceil(total/250000)),minPts=Math.max(2,Math.round(MIN_PTS/stride));
    for(const {packed,indices,n,m} of srcs){
      for(let i=0;i<n;i+=stride){
        const idx=indices?indices[i]:i,b=idx*4;if(b+3>=packed.length)continue;
        const w1=packed[b+1],w2=packed[b+2];
        const lx=half(w1&65535),ly=half((w1>>>16)&65535),lz=half(w2&65535);
        const x=m[0]*lx+m[4]*ly+m[8]*lz+m[12],z=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if(x<minX||x>maxX||z<minZ||z>maxZ)continue;
        const y=m[1]*lx+m[5]*ly+m[9]*lz+m[13];if(!Number.isFinite(y))continue;
        points++;
        for(let c=0;c<5;c++){const bx=boxes[c];if(x<bx[0]||x>bx[1]||z<bx[2]||z>bx[3])continue;
          const k=Math.floor(y/BIN);bins[c].set(k,(bins[c].get(k)||0)+1);}
      }
    }
    const cols=bins.map(map=>{const out=[];for(const [k,cnt] of map)if(cnt>=minPts)out.push([k*BIN,(k+1)*BIN]);return out;});
    _splatCache={key,cols,ms:performance.now()-t0,points,total,stride,at:performance.now()};
    return cols;
  };
  let _source='';
  const columnsAt=(p)=>{
    const index=walkSetup.wholeIndex;
    if(index&&window.__underSource!=='splats'){_source='index';return OFFSETS.map(([dx,dz])=>columnFromIndex(index,p.x+dx,p.z+dz));}
    _source='splats';return columnsFromSplats(p);
  };
  // 判定（2026-09-27 本人指示「歩行が起動できない所＝外れている所を点滅にする」）:
  //  歩行モードの開始判定（_walkCameraSpawnPosition / _walkFeetClear）と同じ考え方で、
  //  カメラの位置に人を立たせられるかを見る。立たせられなければ「外れている」。
  //   ① カメラが箱の中（壁や床にめり込んでいる）→ 外れ。
  //   ② 真下 20m 以内に床が無い → 外れ。床＝カメラより下でいちばん近い面の上端。
  //   ③ 足元5点のうち、その床とほぼ同じ高さ（±0.3m＝升1段）の面が
  //      3点未満 → 床が細切れ・ノイズ → 外れ。
  //   ④ 真上の柱で、床の上 0.1〜1.0m（人の下半身）に何かある → めり込み → 外れ。
  //  路面の下・家の内側（床が無い）・壁の中・スキャンの外はすべて「外れ」。上空からの俯瞰は
  //  20m 以内に床があれば歩けるので鳴らない。
  const _underScanCols=(cols,p)=>{
    const tol=.3; // 面は 25cm 刻みの箱なので、隣の升が1段ずれても同じ床とみなす
    if(cols[0].some(([lo,hi])=>lo<=p.y&&p.y<=hi))return true;                       // ①
    let ground=null;
    for(const [,hi] of cols[0])if(hi<=p.y+.02&&hi>=p.y-20&&(ground===null||hi>ground))ground=hi;
    if(ground===null)return true;                                                     // ②
    let supports=0;
    for(const c of cols)if(c.some(([,hi])=>Math.abs(hi-ground)<=tol))supports++;
    if(supports<3)return true;                                                        // ③
    const lo=ground+.1,hi=ground+1;
    if(cols[0].some(([a,b])=>a<hi&&b>lo))return true;                                   // ④（身体の幅の外は問わない）
    return false;
  };
  const _underScan=(core,p)=>_underScanCols(columnsAt(p),p);
  // 診断用（自動テストから読むだけ／位置を置くだけ）
  window.__columnsAt=(x,z,y=0)=>columnsAt({x,y,z});
  window.__underScanHere=(x,y,z)=>{const cols=columnsAt({x,y,z});return {source:_source,under:_underScanCols(cols,{x,y,z}),cols:cols.map(c=>c.length),ms:+_splatCache.ms.toFixed(1),points:_splatCache.points,total:_splatCache.total,stride:_splatCache.stride};};
  window.__setCamPos=(x,y,z)=>{camPos.set(x,y,z);if(typeof markDirty==='function')markDirty(3);};
  let streak=0,lastKey='',lastUnder=false;
  const check=()=>{
    const btn=document.getElementById('btn-cam-reset');if(!btn)return;
    let under=false;
    try{
      const core=walkSetup.core;
      if(!walkMode.active&&!document.hidden){
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
  window.__underGroundAlert=()=>({streak,on:!!document.getElementById('btn-cam-reset')?.classList.contains('cam-reset-alert')});
})();
