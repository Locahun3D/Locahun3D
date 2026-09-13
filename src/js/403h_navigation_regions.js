// Candidate regional routing: never infer a connection between disjoint region meshes.
(() => {
  const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const inside=(p,b,margin=0)=>['x','y','z'].every((k,i)=>p[k]>=b[0][i]+margin&&p[k]<=b[1][i]-margin);
  function boundsOK(b){return Array.isArray(b)&&b.length===2&&b.every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))&&b[1].every((v,i)=>v>b[0][i]);}
  globalThis.LocahunNavigationRegions={create(io){
    let intent=0;
    return {cancel(){intent++;},async find(from,to,accept){
      const ticket=++intent,state=io.read();
      if(!state||!valid(from)||!valid(to)||distance(from,to)>100||!Array.isArray(state.entries)||state.entries.length>1024)return null;
      const a={...from},b={...to};
      const candidates=state.entries.filter(e=>e&&e.source===state.source&&boundsOK(e.bounds)&&inside(a,e.bounds,.35)&&inside(b,e.bounds,.35))
        .map(e=>({...e,bounds:e.bounds.map(v=>[...v])}));
      const clearance=e=>Math.min(...[a,b].flatMap(p=>['x','y','z'].flatMap((k,i)=>[p[k]-e.bounds[0][i],e.bounds[1][i]-p[k]])));
      candidates.sort((x,y)=>clearance(y)-clearance(x)||String(x.key).localeCompare(String(y.key)));
      const current=()=>{const now=io.read();return ticket===intent&&now?.source===state.source&&now?.epoch===state.epoch;};
      for(const entry of candidates.slice(0,2)){
        if(!current())return null;
        let query;try{query=await io.store.prepare(entry);}catch(_){continue;}
        if(!current())return null;if(!query)continue;
        let points;try{points=query.find(a,b,entry.key);}catch(_){continue;}
        if(!Array.isArray(points)||!points.length||points.length>1024||points.some(p=>!valid(p)||!inside(p,entry.bounds))||
          distance(points[0],a)>.35||distance(points.at(-1),b)>.25)continue;
        let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);if(length>100)continue;
        return {key:entry.key,points:points.map(p=>({...p}))};
      }
      if(typeof io.loadGraph!=='function'||!current())return null;
      let graph;try{graph=await io.loadGraph();}catch{return null;}
      if(!current()||!Array.isArray(graph?.portals)||graph.portals.length>256)return null;
      // Journey supplies the physical gate; standalone region queries return geometry only.
      if(!globalThis.LocahunNavigationMultihop)return null;
      return LocahunNavigationMultihop.find({source:state.source,from:a,to:b,entries:state.entries,
        portals:graph.portals,prepare:entry=>io.store.prepare(entry),current,accept:accept||(()=>true)});
    }};
  }};
})();
