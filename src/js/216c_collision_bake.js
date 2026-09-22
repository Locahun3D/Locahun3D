(() => {
  const CONCURRENCY=6;
  const half=h=>{const e=(h>>10)&31,m=h&1023,s=h&32768?-1:1;return s*(e===0?m*2**-24:e===31?Infinity:(1+m/1024)*2**(e-15));};
  async function generate(sources,{check=()=>{},progress=()=>{},cellSize=.15,awaitJob=p=>p,opacityMin=0,dropIsolated=false}={}){
    const accumulator=new LocahunWholeCollision.Accumulator({cellSize});let entries=0,leaves=0;
    function consume(chunk,matrix,hierarchy){
      const packed=chunk.packedArray,count=chunk.numSplats,tree=chunk.extra?.lodTree;
      if(!(packed instanceof Uint32Array)||!Number.isSafeInteger(count)||count<0||packed.length<count*4||(hierarchy&&(!(tree instanceof Uint32Array)||tree.length<count*4)))throw new Error('Incomplete collision source payload');
      entries+=count;
      for(let i=0;i<count;i++){
        if(hierarchy&&tree[i*4+2]!==0)continue;
        // ほぼ透明な点は壁として数えない（2026-09-22 本人指摘「廊下を通り抜けられないときがある」）。
        // 実データ（歌舞伎町）では末端の点の約3割が不透明度0.2未満で、宙に浮いた薄いもやが
        // 通路の升を埋めていた。不透明度は word0 の上位8bit（RAD は lodOpacity のため実値の半分で入る）。
        if(hierarchy&&opacityMin&&(packed[i*4]>>>24)<opacityMin)continue;
        const w1=packed[i*4+1],w2=packed[i*4+2],x=half(w1&65535),y=half(w1>>>16),z=half(w2&65535);
        const m=matrix;
        accumulator.add(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);leaves++;
      }
    }
    for(let source=0;source<sources.length;source++){
      check();const s=sources[source];if(s.matrix?.length!==16||!s.matrix.every(Number.isFinite))throw new Error('Invalid collision source transform');
      if(s.paged){
        const {meta}=await awaitJob(s.paged.getRadMeta());check();
        if(!Array.isArray(meta.chunks)||meta.chunks.length>100000||!Number.isSafeInteger(meta.count)||meta.count<1)throw new Error('Invalid RAD collision metadata');
        const before=entries;
        // 2026-09-22: 塊を1つずつ順番に取りに行っていたため、塊の数（歌舞伎町で約180）だけ通信の
        // 待ち時間が積み重なり、Worker 経由では生成に約60秒かかっていた（本人指摘「当たり判定の生成が悪い」）。
        // 同時に CONCURRENCY 個まで取りに行き、届いた順に積む。セルの数え方は順番に依らない
        // （Accumulator は各セルの点数を上限つきで数えるだけ）ので、結果は順番に取った場合と同じ。
        const total=meta.chunks.length;let next=0,done=0;
        const worker=async()=>{
          for(;;){
            const i=next++;if(i>=total)return;
            check();const chunk=await awaitJob(s.paged.fetchDecodeChunk(i));check();consume(chunk,s.matrix,true);
            progress({source,chunk:++done,chunks:total,entries,leaves,cells:accumulator.cells.size});
            await new Promise(resolve=>setTimeout(resolve,0));
          }
        };
        await Promise.all(Array.from({length:Math.min(CONCURRENCY,total)},worker));
        if(entries-before!==meta.count)throw new Error('Incomplete RAD collision coverage');
      }else if(s.packed){consume(s.packed,s.matrix,false);await new Promise(resolve=>setTimeout(resolve,0));}
      else throw new Error('No complete collision source');
    }
    check();const tiles=accumulator.tiles({dropIsolated});check();
    return {tiles,entries,leaves,cellSize,cells:accumulator.cells.size};
  }
  globalThis.LocahunCollisionBake={generate};
})();
