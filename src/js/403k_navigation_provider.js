// Candidate provider; callers must derive read().source from verified live geometry.
(() => {
  const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  globalThis.LocahunNavigationProvider={create(io){
    const m=io.manifest;
    if(!m||m.schema!==1||!hex(m.source)||!Array.isArray(m.regions)||!m.regions.length||m.regions.length>1024||io.read()?.source!==m.source)throw Error('Invalid navigation manifest');
    const entries=[],collisions=new Map();
    for(const pair of m.regions){
      const n=pair?.navigation,c=pair?.collision;
      for(const e of [n,c]){
        const b=e?.bounds;
        if(!e||e.source!==m.source||!hex(e.key)||!hex(e.sha256)||!Number.isInteger(e.bytes)||e.bytes<1||e.bytes>2000000||
          !Array.isArray(b)||b.length!==2||b.some(a=>!Array.isArray(a)||a.length!==3||a.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))||
          b[1].some((v,i)=>v<=b[0][i])||b[1][0]-b[0][0]>32||b[1][2]-b[0][2]>32)throw Error('Invalid navigation region pair');
      }
      if(n.key!==c.key||JSON.stringify(n.bounds)!==JSON.stringify(c.bounds)||collisions.has(n.key))throw Error('Mismatched navigation region pair');
      const copy=e=>({...e,bounds:e.bounds.map(a=>[...a])});entries.push(copy(n));collisions.set(c.key,copy(c));
    }
    const load=extension=>LocahunNavigationRegionLoader.create({baseUrl:io.baseUrl,extension,...(io.fetchFn?{fetchFn:io.fetchFn}:{})});
    const navStore=LocahunNavigationRegionStore.create({read:io.read,load:load('lnv'),decode:io.decodeNavigation,build:io.buildQuery});
    const collisionStore=LocahunNavigationRegionStore.create({read:io.read,load:load('lcp'),
      decode:async(bytes,key)=>({source:key,boxes:await io.decodeCollision(bytes,key)}),build:mesh=>({boxes:mesh.boxes,dispose(){this.boxes=[];}})});
    const regions=LocahunNavigationRegions.create({read:()=>({...io.read(),entries}),store:navStore});
    let disposed=false,collisionGeneration=0;
    const journey=LocahunNavigationJourney.create({read:io.read,regions,build:io.buildCore,
      loadCollision:async(key,signal)=>{
        const entry=collisions.get(key);if(!entry||signal.aborted)throw Error('Invalid collision request');
        const ticket=++collisionGeneration;
        const abort=()=>{if(ticket===collisionGeneration)collisionStore.clear();};signal.addEventListener('abort',abort,{once:true});
        try{const item=await collisionStore.prepare(entry);if(!item)throw Error('Collision unavailable');return item.boxes;}
        finally{signal.removeEventListener('abort',abort);if(ticket===collisionGeneration)collisionStore.clear();}
      }});
    return {acquire:(a,b)=>disposed?Promise.resolve(null):journey.acquire(a,b),
      cancel(){collisionGeneration++;journey.cancel();collisionStore.clear();},
      dispose(){if(disposed)return;disposed=true;collisionGeneration++;journey.cancel();collisionStore.clear();navStore.clear();}};
  }};
})();
