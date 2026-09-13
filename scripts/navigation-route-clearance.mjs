// Offline full-trip gate; reuse the shipped controller, never a shortcut teleport.
export function verifyRouteClearance(points,core,Navigation){
 const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000);
 if(!Array.isArray(points)||points.length<2||points.length>1024||!points.every(valid))return false;
 try{
  for(const route of [points,[...points].reverse()]){
   let position={...route[0],y:route[0].y+1.8};
   const nav=Navigation.create({position:()=>position,setPosition:p=>position={...p},ready:()=>true,blocked:()=>false,epoch:()=>1,coverage:()=>true,
    clear:p=>{
     const feet=p.y-1.8,hit=core.raycastSurface({x:p.x,y:feet+.3,z:p.z},{x:0,y:-1,z:0},.65);
     return valid(hit?.point)&&valid(hit?.normal)&&hit.normal.y>=.7&&Math.abs(hit.point.y-feet)<=.3&&
      core.isCapsuleClear({x:p.x,y:feet+.3,z:p.z},1.7,.15);
    },sweep:(a,b)=>core.moveCamera(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},.15)});
   if(!nav.start({point:route.at(-1),normal:{x:0,y:1,z:0}},0,route.slice(1).map(p=>({...p,y:p.y+1.8}))))return false;
   for(let time=16;time<=8000&&nav.active;time+=16)nav.tick(time);
   if(nav.active||nav.stopReason!=='complete')return false;
   const last=route.at(-1);if(Math.hypot(position.x-last.x,position.y-last.y-1.8,position.z-last.z)>.001)return false;
  }
  return true;
 }catch{return false;}
}
