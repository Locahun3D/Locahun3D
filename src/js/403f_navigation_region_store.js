// Candidate module, not included in the viewer until regional coverage is verified.
(() => {
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  function snapshot(entry){
    if(!entry||!hex(entry.source)||!hex(entry.key)||!hex(entry.sha256)||!Number.isInteger(entry.bytes)||entry.bytes<1||entry.bytes>2000000)return null;
    const b=entry.bounds;
    if(!Array.isArray(b)||b.length!==2||b.some(a=>!Array.isArray(a)||a.length!==3||a.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))||
      b[1].some((n,i)=>n<=b[0][i])||b[1][0]-b[0][0]>32||b[1][2]-b[0][2]>32)return null;
    return {source:entry.source,key:entry.key,sha256:entry.sha256,bytes:entry.bytes,bounds:b.map(a=>[...a])};
  }
  globalThis.LocahunNavigationRegionStore={create(io){
    let stamp='',version=0,pending=null;const ready=new Map();
    function clear(){version++;pending?.controller.abort();pending=null;for(const q of ready.values())q.dispose();ready.clear();}
    function sync(){const s=io.read(),next=s&&hex(s.source)&&Number.isSafeInteger(s.epoch)?s.source+':'+s.epoch:'';if(next!==stamp){clear();stamp=next;}return s;}
    const id=e=>JSON.stringify(e);
    function get(entry){const state=sync(),e=snapshot(entry);if(!e||e.source!==state?.source)return null;const key=id(e),q=ready.get(key);if(q){ready.delete(key);ready.set(key,q);}return q||null;}
    return {clear,get,prepare(entry){
      const state=sync(),e=snapshot(entry);if(!stamp||!e||e.source!==state?.source)return Promise.resolve(null);
      const existing=get(e);if(existing)return Promise.resolve(existing);
      const key=id(e);if(pending?.key===key)return pending.promise;
      pending?.controller.abort();version++;const ticket=version,controller=new AbortController();
      const current=()=>{sync();return ticket===version&&!controller.signal.aborted;};
      const promise=(async()=>{
        const expected=await hash(new TextEncoder().encode(JSON.stringify(['navigation-region-v1',e.source,e.bounds,[2,.15,.3,.05,.025]])));
        if(expected!==e.key||!current())return null;
        // The loader must enforce e.bytes while streaming, not after an unbounded response read.
        const bytes=await io.load(e,controller.signal);
        if(!current()||!(bytes instanceof Uint8Array)||bytes.length!==e.bytes||await hash(bytes)!==e.sha256)return null;
        if(!current())return null;
        const mesh=await io.decode(bytes,e.key);if(!current()||mesh.source!==e.key)return null;
        const query=io.build(mesh);if(!current()){query.dispose();return null;}
        ready.set(key,query);
        while(ready.size>2){const oldest=ready.keys().next().value;ready.get(oldest).dispose();ready.delete(oldest);}
        return query;
      })().catch(()=>null).finally(()=>{if(pending?.ticket===ticket)pending=null;});
      pending={key,promise,controller,ticket};return promise;
    }};
  }};
})();
