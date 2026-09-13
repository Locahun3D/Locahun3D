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
      if(!state||!valid(from)||!valid(to)||distance(from,to)>30||!Array.isArray(state.entries)||state.entries.length>1024)return null;
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
        let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);if(length>30)continue;
        return {key:entry.key,points:points.map(p=>({...p}))};
      }
      if(typeof io.loadGraph!=='function'||!current())return null;
      let graph;try{graph=await io.loadGraph();}catch{return null;}
      if(!current()||!Array.isArray(graph?.portals)||graph.portals.length>256)return null;
      const routes=[];
      for(const portal of graph.portals)for(const [start,end] of [[portal.a,portal.b],[portal.b,portal.a]]){
        const x=state.entries.find(e=>e?.key===start?.key),y=state.entries.find(e=>e?.key===end?.key);
        if(!x||!y||x===y||x.source!==state.source||y.source!==state.source||!valid(start?.point)||!valid(end?.point)||distance(start.point,end.point)>.025||!boundsOK(x.bounds)||!boundsOK(y.bounds)||
          !inside(a,x.bounds,.35)||!inside(b,y.bounds,.35)||!inside(start.point,x.bounds,.35)||!inside(end.point,y.bounds,.35))continue;
        routes.push({x,y,start:{...start.point},end:{...end.point}});
      }
      routes.sort((p,q)=>distance(a,p.start)+distance(p.end,b)-distance(a,q.start)-distance(q.end,b));
      const segmentOK=(points,start,end,entry,snapStart,snapEnd)=>Array.isArray(points)&&points.length>=2&&points.length<=1024&&
        points.every(p=>valid(p)&&inside(p,entry.bounds))&&distance(points[0],start)<=snapStart&&distance(points.at(-1),end)<=snapEnd;
      let checked=0;
      for(const r of routes.slice(0,16)){
        if(!current())return null;
        try{
          const leftQuery=await io.store.prepare(r.x);if(!current()||!leftQuery)continue;
          const left=leftQuery.find(a,r.start,r.x.key)?.map(p=>({...p}));
          if(!segmentOK(left,a,r.start,r.x,.35,.025))continue;
          const rightQuery=await io.store.prepare(r.y);if(!current()||!rightQuery)continue;
          const right=rightQuery.find(r.end,b,r.y.key)?.map(p=>({...p}));
          if(!segmentOK(right,r.end,b,r.y,.025,.25)||distance(left.at(-1),right[0])>.025)continue;
          const points=[...left,...right];if(points.length>1024)continue;
          let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);if(length>30)continue;
          const route={key:r.x.key,keys:[r.x.key,r.y.key],points};
          if(accept){if(checked++>=4)return null;const accepted=await accept(route);if(!current())return null;if(accepted!==true)continue;}
          return route;
        }catch{/* Disconnected or disposed queries do not establish a crossing. */}
      }
      return null;
    }};
  }};
})();
