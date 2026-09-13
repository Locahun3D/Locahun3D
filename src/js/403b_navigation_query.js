// Query only decoded, source-bound precomputed geometry. No navmesh baking here.
(() => {
  const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000);
  globalThis.LocahunNavigationQuery={create(T,Pathfinding,mesh){
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(mesh.vertices,3));geometry.setIndex(new T.BufferAttribute(mesh.triangles,1));
    let zone;
    try{zone=Pathfinding.createZone(geometry);}finally{geometry.dispose();}
    const finder=new Pathfinding();finder.setZoneData('scene',zone);
    const triangle=new T.Triangle(),point=new T.Vector3(),projected=new T.Vector3();
    function nearest(p,maxDistance){
      point.set(p.x,p.y,p.z);let best=maxDistance*maxDistance,result=null;
      for(let group=0;group<zone.groups.length;group++)for(const node of zone.groups[group]){
        triangle.set(zone.vertices[node.vertexIds[0]],zone.vertices[node.vertexIds[1]],zone.vertices[node.vertexIds[2]]);
        triangle.closestPointToPoint(point,projected);const d=projected.distanceToSquared(point);
        if(d<=best){best=d;result={point:projected.clone(),group};}
      }
      return result;
    }
    return {
      find(from,to,source){
        if(!zone||source!==mesh.source||!valid(from)||!valid(to)||Math.hypot(from.x-to.x,from.y-to.y,from.z-to.z)>100)return null;
        const a=nearest(from,.35),b=nearest(to,.25);
        if(!a||!b||a.group!==b.group)return null;
        const route=finder.findPath(a.point,b.point,'scene',a.group),last=route?.at(-1);
        if(!last||last.distanceTo(b.point)>.01||route.length>1024)return null;
        let previous=a.point,length=0;
        for(const p of route){if(!valid(p))return null;length+=p.distanceTo(previous);previous=p;}
        if(length>100)return null;
        return [a.point,...route].map(p=>({x:p.x,y:p.y,z:p.z}));
      },
      dispose(){zone=null;finder.zones={};}
    };
  }};
})();
