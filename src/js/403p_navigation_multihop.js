// Bounded portal planning over existing verified region queries.
(() => {
 const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 const inside=(p,b,m=0)=>['x','y','z'].every((k,i)=>p[k]>=b[0][i]+m&&p[k]<=b[1][i]-m);
 const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
 const bounds=b=>Array.isArray(b)&&b.length===2&&b.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))&&b[1].every((v,i)=>v>b[0][i]);
 globalThis.LocahunNavigationMultihop={async find(io){
  if(!hash(io?.source)||!valid(io.from)||!valid(io.to)||distance(io.from,io.to)>100||
   !Array.isArray(io.entries)||io.entries.length>32||!Array.isArray(io.portals)||io.portals.length>256||
   !['prepare','current','accept'].every(k=>typeof io[k]==='function')||!io.current())return null;
  const from={...io.from},to={...io.to},entries=new Map();
  for(const e of io.entries){
   if(!e||e.source!==io.source||!hash(e.key)||!bounds(e.bounds))continue;
   if(entries.has(e.key))return null;
   entries.set(e.key,{...e,bounds:e.bounds.map(v=>[...v])});
  }
  const edges=new Map();
  for(const p of io.portals)for(const [a,b] of [[p?.a,p?.b],[p?.b,p?.a]]){
   const x=entries.get(a?.key),y=entries.get(b?.key);
   if(!x||!y||x===y||!valid(a.point)||!valid(b.point)||distance(a.point,b.point)>.025||
    !inside(a.point,x.bounds,.35)||!inside(b.point,y.bounds,.35))continue;
   if(!edges.has(x.key))edges.set(x.key,[]);
   edges.get(x.key).push({a:{key:x.key,point:{...a.point}},b:{key:y.key,point:{...b.point}}});
  }
  const queue=[...entries.values()].filter(e=>inside(from,e.bounds,.35)).map(e=>({keys:[e.key],links:[],point:from,length:0,score:distance(from,to)}));
  const plans=[];let expanded=0;
  while(queue.length&&plans.length<16&&expanded++<256){
   queue.sort((a,b)=>a.score-b.score);const state=queue.shift(),last=entries.get(state.keys.at(-1));
   if(state.keys.length>=2&&inside(to,last.bounds,.35)){plans.push(state);continue;}
   if(state.keys.length===4)continue;
   for(const link of edges.get(last.key)||[]){
    if(state.keys.includes(link.b.key))continue;
    const length=state.length+distance(state.point,link.a.point)+distance(link.a.point,link.b.point),score=length+distance(link.b.point,to);
    if(score>100)continue;
    queue.push({keys:[...state.keys,link.b.key],links:[...state.links,link],point:link.b.point,length,score});
    if(queue.length>32){queue.sort((a,b)=>a.score-b.score);queue.length=32;}
   }
  }
  let queries=0,checked=0;
  for(const plan of plans){
   let points=[],length=0,failed=false;
   for(let i=0;i<plan.keys.length;i++){
    if(!io.current()||queries++>=32)return null;
    const entry=entries.get(plan.keys[i]),start=i?plan.links[i-1].b.point:from,end=i<plan.links.length?plan.links[i].a.point:to;
    try{
     const query=await io.prepare(entry);if(!io.current())return null;
     const raw=query?.find(start,end,entry.key);
     if(!Array.isArray(raw)||raw.length<2||raw.length>1024||raw.some(p=>!valid(p)||!inside(p,entry.bounds))||
      distance(raw[0],start)>(i?.025:.35)||distance(raw.at(-1),end)>(i<plan.links.length?.025:.25)){failed=true;break;}
     // Queries may be evicted by the next prepare; copy before any await.
     const segment=raw.map(p=>({...p}));
     if(points.length&&distance(points.at(-1),segment[0])>.025){failed=true;break;}
     for(const p of segment){if(points.length)length+=distance(points.at(-1),p);points.push(p);}
     if(points.length>1024||length>100){failed=true;break;}
    }catch{failed=true;break;}
   }
   if(failed)continue;if(!io.current()||checked++>=4)return null;
   const route={key:plan.keys[0],keys:[...plan.keys],points};
   points.forEach(Object.freeze);Object.freeze(points);Object.freeze(route.keys);Object.freeze(route);
   let accepted=false;try{accepted=await io.accept(route)===true;}catch{}
   if(!io.current())return null;if(accepted)return route;
  }
  return null;
 }};
})();
