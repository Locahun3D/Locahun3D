// Candidate bounded transport; manifest verification lives in the region store.
(() => {
  globalThis.LocahunNavigationRegionLoader={create({baseUrl,fetchFn=fetch,timeoutMs=5000,extension='lnv'}){
    if(!['lnv','lcp','lng'].includes(extension))throw Error('Invalid navigation extension');
    const base=new URL(baseUrl);
    if((base.protocol!=='https:'&&!(base.protocol==='http:'&&base.hostname==='127.0.0.1'))||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/'))throw Error('Invalid navigation base URL');
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid navigation timeout');
    return async(entry,signal)=>{
      if(!entry||typeof entry.key!=='string'||!/^[a-f0-9]{64}$/.test(entry.key)||!Number.isInteger(entry.bytes)||entry.bytes<1||entry.bytes>(extension==='lng'?128*1024:2000000))throw Error('Invalid navigation entry');
      const limit=entry.bytes,url=new URL(entry.key+'.'+extension,base).href,controller=new AbortController();let timer,reader,stop;
      const stopped=new Promise((_,reject)=>{stop=reason=>{controller.abort();reject(Error(reason));};});
      const abort=()=>stop('Navigation cancelled');signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>stop('Navigation timeout'),timeoutMs);
      try{
        if(signal?.aborted)abort();
        const response=await Promise.race([stopped,Promise.resolve().then(()=>{
          if(controller.signal.aborted)throw Error('Navigation cancelled');
          return fetchFn(url,{signal:controller.signal,redirect:'error',credentials:'same-origin'});
        })]);
        if(!response.ok||response.status!==200||response.redirected)throw Error('Navigation HTTP '+response.status);
        const length=response.headers.get('content-length');
        if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==limit))throw Error('Navigation content length mismatch');
        if(!response.body)throw Error('Navigation body missing');reader=response.body.getReader();
        const chunks=[];let size=0;
        for(;;){
          const {done,value}=await Promise.race([stopped,reader.read()]);if(done)break;
          size+=value.length;if(size>limit)throw Error('Navigation streaming limit');chunks.push(value);
        }
        if(size!==limit)throw Error('Navigation payload length mismatch');
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
      }finally{
        clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();
        if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}
      }
    };
  }};
})();
