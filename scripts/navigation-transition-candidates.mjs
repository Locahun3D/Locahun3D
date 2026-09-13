// Offline candidate discovery only. Collision/component validation is still required.
import {Triangle,Vector3,Box3} from './navigation-assets/node_modules/three/build/three.module.js';
const inside=(p,b)=>['x','y','z'].every((k,i)=>p[k]>=b[0][i]&&p[k]<=b[1][i]);
function validateBounds(b){
 if(!Array.isArray(b)||b.length!==2||b.some(a=>!Array.isArray(a)||a.length!==3||a.some(n=>!Number.isFinite(n)))||b[1].some((n,i)=>n<=b[0][i]))throw Error('Invalid transition bounds');
}
function triangles(mesh,overlap){
 const v=mesh?.vertices,t=mesh?.triangles;
 if(!v||!t||v.length<9||v.length%3||v.length>180000||t.length<3||t.length%3||t.length>180000||
  Array.from(v).some(n=>!Number.isFinite(n)||Math.abs(n)>10000)||Array.from(t).some(i=>!Number.isInteger(i)||i<0||i>=v.length/3))throw Error('Invalid transition geometry');
 const result=[],normal=new Vector3(),box=new Box3();
 for(let i=0;i<t.length;i+=3){
  const tri=new Triangle(...[0,1,2].map(j=>new Vector3().fromArray(v,t[i+j]*3)));
  if(tri.getArea()<1e-8)throw Error('Degenerate transition geometry');
  tri.getNormal(normal);if(Math.abs(normal.y)<Math.SQRT1_2)continue;
  box.setFromPoints([tri.a,tri.b,tri.c]);
  if(['x','y','z'].some((k,j)=>box.max[k]<overlap[0][j]||box.min[k]>overlap[1][j]))continue;
  result.push({tri,index:i/3});
 }
 return result;
}
export function findTransitionCandidates(a,b,aBounds,bBounds){
 validateBounds(aBounds);validateBounds(bBounds);
 const overlap=[aBounds[0].map((v,i)=>Math.max(v,bBounds[0][i])+.35),aBounds[1].map((v,i)=>Math.min(v,bBounds[1][i])-.35)];
 // Validate even an empty intersection, so corrupt geometry is never reported as valid.
 const aa=triangles(a,overlap),bb=triangles(b,overlap);
 if(overlap[1].some((n,i)=>n<=overlap[0][i]))return [];
 const result=[],seen=new Set(),p=new Vector3(),q=new Vector3();let comparisons=0;
 const xyz=p=>({x:p.x,y:p.y,z:p.z});
 const scan=(left,right,reverse)=>{
  for(const item of left){
   item.tri.getMidpoint(p);if(!inside(p,overlap))continue;
   for(const target of right){
    if(++comparisons>2000000)throw Error('Transition comparison budget exceeded');
    target.tri.closestPointToPoint(p,q);
    if(p.distanceToSquared(q)>.025**2||!inside(q,overlap))continue;
    const key=[p.x,p.y,p.z].map(n=>Math.round(n/.1)).join(':');
    if(!seen.has(key)){
     seen.add(key);result.push({status:'unverified',a:xyz(reverse?q:p),b:xyz(reverse?p:q),aTriangle:reverse?target.index:item.index,bTriangle:reverse?item.index:target.index});
     if(result.length===256)return true;
    }
    break;
   }
  }
  return false;
 };
 if(!scan(aa,bb,false))scan(bb,aa,true);
 return result;
}
