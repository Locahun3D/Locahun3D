(() => {
  const half=h=>{const e=(h>>10)&31,m=h&1023,s=h&32768?-1:1;return s*(e===0?m*2**-24:e===31?Infinity:(1+m/1024)*2**(e-15));};
  async function generate(sources,{check=()=>{},progress=()=>{},cellSize=.15,awaitJob=p=>p}={}){
    const accumulator=new LocahunWholeCollision.Accumulator({cellSize});let entries=0,leaves=0;
    function consume(chunk,matrix,hierarchy){
      const packed=chunk.packedArray,count=chunk.numSplats,tree=chunk.extra?.lodTree;
      if(!(packed instanceof Uint32Array)||!Number.isSafeInteger(count)||count<0||packed.length<count*4||(hierarchy&&(!(tree instanceof Uint32Array)||tree.length<count*4)))throw new Error('Incomplete collision source payload');
      entries+=count;
      for(let i=0;i<count;i++){
        if(hierarchy&&tree[i*4+2]!==0)continue;
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
        for(let i=0;i<meta.chunks.length;i++){
          check();const chunk=await awaitJob(s.paged.fetchDecodeChunk(i));check();consume(chunk,s.matrix,true);
          progress({source,chunk:i+1,chunks:meta.chunks.length,entries,leaves,cells:accumulator.cells.size});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        if(entries-before!==meta.count)throw new Error('Incomplete RAD collision coverage');
      }else if(s.packed){consume(s.packed,s.matrix,false);await new Promise(resolve=>setTimeout(resolve,0));}
      else throw new Error('No complete collision source');
    }
    check();const tiles=accumulator.tiles();check();
    return {tiles,entries,leaves,cellSize,cells:accumulator.cells.size};
  }
  globalThis.LocahunCollisionBake={generate};
})();
