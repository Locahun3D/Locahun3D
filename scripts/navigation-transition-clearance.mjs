// Offline gate only; a clear crossing does not establish navmesh connectivity.
export function verifyTransitionClearance(pair,core){
 const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 if(!valid(pair?.a)||!valid(pair?.b)||distance(pair.a,pair.b)>.025)return false;
 try{
  for(const [a,b] of [[pair.a,pair.b],[pair.b,pair.a]]){
   const steps=Math.max(1,Math.ceil(distance(a,b)/.01));let previous={...a,y:a.y+1.8};
   for(let i=0;i<=steps;i++){
    const t=i/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
    const hit=core.raycastSurface({...p,y:p.y+.1},{x:0,y:-1,z:0},.2);
    if(!valid(hit?.point)||!valid(hit?.normal)||hit.normal.y<.7||Math.abs(hit.point.y-p.y)>.075)return false;
    if(!core.isCapsuleClear({...p,y:p.y+.02},1.98,.15))return false;
    const eye={...p,y:p.y+1.8};
    if(i){const moved=core.moveCamera(previous,{x:eye.x-previous.x,y:eye.y-previous.y,z:eye.z-previous.z},.15);
     if(!valid(moved)||distance(moved,eye)>.001)return false;
    }
    previous=eye;
   }
  }
  return true;
 }catch{return false;}
}
