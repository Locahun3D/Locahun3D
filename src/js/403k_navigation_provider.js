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
    const graphManifest={schema:1,source:m.source,regions:entries.map(n=>({navigation:n,collision:collisions.get(n.key)})),...(m.graph?{graph:{...m.graph}}:{})};
    let graph=null,graphPending=null,graphController=null;
    const clearGraph=()=>{graphController?.abort();graphController=null;graphPending=null;graph=null;};
    const loadGraph=async()=>{
      if(!graphManifest.graph)return null;if(graph)return graph;if(graphPending)return graphPending;
      const entry=graphManifest.graph,controller=new AbortController();graphController=controller;
      const pending=(async()=>{
        const bytes=await load('lng')({...entry,key:entry.sha256},controller.signal);
        const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
        const value=await LocahunTransitionGraph.create(hash).decode(bytes,entry,graphManifest);
        if(controller.signal.aborted)return null;graph=value;return value;
      })();graphPending=pending;
      try{return await pending;}finally{if(graphPending===pending){graphPending=null;graphController=null;}}
    };
    const regions=LocahunNavigationRegions.create({read:()=>({...io.read(),entries}),store:navStore,...(m.graph?{loadGraph}:{})});
    let disposed=false,collisionGeneration=0;
    const journey=LocahunNavigationJourney.create({read:io.read,regions,build:io.buildCore,
      verifyCore:io.verifyCore||((points,core)=>LocahunRouteClearance(points,core,LocahunClickNavigation)),
      loadCollision:async(key,signal)=>{
        const entry=collisions.get(key);if(!entry||signal.aborted)throw Error('Invalid collision request');
        const ticket=++collisionGeneration;
        const abort=()=>{if(ticket===collisionGeneration)collisionStore.clear();};signal.addEventListener('abort',abort,{once:true});
        try{const item=await collisionStore.prepare(entry);if(!item)throw Error('Collision unavailable');return item.boxes;}
        finally{signal.removeEventListener('abort',abort);if(ticket===collisionGeneration)collisionStore.clear();}
      }});
    return {acquire:(a,b)=>disposed||io.read()?.source!==graphManifest.source?Promise.resolve(null):journey.acquire(a,b),
      cancel(){collisionGeneration++;journey.cancel();collisionStore.clear();clearGraph();},
      dispose(){if(disposed)return;disposed=true;collisionGeneration++;journey.cancel();collisionStore.clear();navStore.clear();clearGraph();}};
  }};
})();
