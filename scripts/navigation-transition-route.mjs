// Offline two-region probe. Callers own verified queries and collision clearance.
export function findTwoRegionRoute({from,to,candidates,a,b,clearance}){
 const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 const inside=(p,bounds)=>['x','y','z'].every((k,i)=>p[k]>=bounds[0][i]&&p[k]<=bounds[1][i]);
 const boundsOK=b=>Array.isArray(b)&&b.length===2&&b.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))&&b[1].every((v,i)=>v>b[0][i]);
 if(!valid(from)||!valid(to)||distance(from,to)>30||!Array.isArray(candidates)||candidates.length>256||typeof clearance!=='function'||
  ![a,b].every(e=>e&&/^[a-f0-9]{64}$/.test(e.key)&&boundsOK(e.bounds)&&typeof e.query?.find==='function')||a.key===b.key)return null;
 const routeOK=(points,start,end,bounds,startTolerance,endTolerance)=>Array.isArray(points)&&points.length>=2&&points.length<=1024&&points.every(p=>valid(p)&&inside(p,bounds))&&distance(points[0],start)<=startTolerance&&distance(points.at(-1),end)<=endTolerance;
 const pairs=candidates.filter(p=>valid(p?.a)&&valid(p?.b)&&distance(p.a,p.b)<=.025&&inside(p.a,a.bounds)&&inside(p.b,b.bounds));
 pairs.sort((p,q)=>distance(from,p.a)+distance(p.b,to)-distance(from,q.a)-distance(q.b,to));
 for(const pair of pairs){
  try{
   if(clearance(pair)!==true)continue;
   const left=a.query.find(from,pair.a,a.key),right=b.query.find(pair.b,to,b.key);
   if(!routeOK(left,from,pair.a,a.bounds,.35,.025)||!routeOK(right,pair.b,to,b.bounds,.025,.25)||distance(left.at(-1),right[0])>.025)continue;
   const points=[...left,...right].map(p=>({...p}));if(points.length>1024)continue;
   let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);if(length>30)continue;
   return {status:'unverified-route',keys:[a.key,b.key],points,length,transition:{a:{...left.at(-1)},b:{...right[0]}}};
  }catch{/* A failed region query is not a cross-region connection. */}
 }
 return null;
}
