// Candidate only: bounded fine collision around an already verified ground route.
(() => {
  const finite=n=>Number.isFinite(n)&&Math.abs(n)<=10000;
  const valid=p=>p&&['x','y','z'].every(k=>finite(p[k]));
  globalThis.LocahunNavigationCorridor={create(route,boxes){
    if(!Array.isArray(route)||route.length<2||route.length>1024||route.some(p=>!valid(p))||
      !Array.isArray(boxes)||boxes.length>100000||boxes.length*(route.length-1)>2000000)return null;
    const points=route.map(p=>({...p})),segments=[];let length=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],delta=['x','y','z'].map(k=>b[k]-a[k]),square=delta.reduce((n,v)=>n+v*v,0);
      length+=Math.sqrt(square);if(length>30)return null;
      segments.push({a,delta,square,min:[Math.min(a.x,b.x)-1,Math.min(a.y,b.y)-.5,Math.min(a.z,b.z)-1],
        max:[Math.max(a.x,b.x)+1,Math.max(a.y,b.y)+2.3,Math.max(a.z,b.z)+1]});
    }
    const selected=[];
    for(const box of boxes){
      if(!box||!Array.isArray(box.center)||box.center.length!==3||!box.center.every(finite)||
        !Array.isArray(box.half)||box.half.length!==3||!box.half.every(n=>finite(n)&&n>0&&n<=1000))return null;
      if(segments.some(s=>box.center.every((n,i)=>n+box.half[i]>=s.min[i]-.0001&&n-box.half[i]<=s.max[i]+.0001))){
        if(selected.length>=8192)return null;
        selected.push({center:[...box.center],half:[...box.half]});
      }
    }
    return {boxes:selected,covers(ground){
      if(!valid(ground))return false;
      return segments.some(s=>{
        const offset=['x','y','z'].map(k=>ground[k]-s.a[k]);
        const t=s.square?Math.max(0,Math.min(1,offset.reduce((n,v,i)=>n+v*s.delta[i],0)/s.square)):0;
        return offset.reduce((n,v,i)=>n+(v-t*s.delta[i])**2,0)<=.25**2;
      });
    }};
  }};
})();
