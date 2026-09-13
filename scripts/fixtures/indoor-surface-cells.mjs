// Diagnostic only: exact cell substitution, never a broad region deletion.
export function replaceSurfaceCells(boxes, fixture) {
  if(fixture?.schema!==1 || !Array.isArray(fixture.replacements) || fixture.replacements.length>20000)
    throw new Error('Invalid surface fixture');
  const columns=new Map(),seen=new Set(),eps=1e-7;
  for(const r of fixture.replacements) {
    const s=r.cellSize;
    if(s!==.1 || !Array.isArray(r.cell) || r.cell.length!==3 || !r.cell.every(Number.isSafeInteger))
      throw new Error('Invalid surface cell');
    const key=r.cell.join(','),column=[r.cell[0],r.cell[2]].join(',');
    if(seen.has(key))throw new Error('Duplicate surface cell');
    seen.add(key);
    const low=r.cell.map(v=>v*s),high=low.map(v=>v+s),v=r.vertices,ix=r.indices;
    if(!Array.isArray(v)||v.length<12||v.length%3||v.length>3000||!Array.isArray(ix)||ix.length<12||ix.length%3||ix.length>6000)
      throw new Error('Invalid surface mesh');
    if(v.some((n,i)=>!Number.isFinite(n)||n<low[i%3]-eps||n>high[i%3]+eps)||
      ix.some(i=>!Number.isSafeInteger(i)||i<0||i>=v.length/3))throw new Error('Surface mesh outside cell');
    const edges=new Map();
    for(let i=0;i<ix.length;i+=3){
      const ids=ix.slice(i,i+3),a=v.slice(ids[0]*3,ids[0]*3+3),b=v.slice(ids[1]*3,ids[1]*3+3),c=v.slice(ids[2]*3,ids[2]*3+3);
      const u=b.map((n,j)=>n-a[j]),w=c.map((n,j)=>n-a[j]);
      if(Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])<1e-12)
        throw new Error('Degenerate surface triangle');
      for(let j=0;j<3;j++){
        const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');
        const edge=edges.get(key)||{count:0,winding:0};edge.count++;edge.winding+=a<b?1:-1;edges.set(key,edge);
      }
    }
    if([...edges.values()].some(e=>e.count!==2||e.winding!==0))throw new Error('Surface fixture must be a closed oriented volume');
    const entry={low:low[1],high:high[1],mesh:{vertices:new Float32Array(v),indices:new Uint32Array(ix)}};
    if(!columns.has(column))columns.set(column,[]);
    columns.get(column).push(entry);
  }
  for(const list of columns.values())list.sort((a,b)=>a.low-b.low);
  const output=[],meshes=[];
  for(const b of boxes) {
    if(Math.abs(b.half[0]-.05)>eps||Math.abs(b.half[2]-.05)>eps){output.push(b);continue;}
    const x=Math.round((b.center[0]-.05)/.1),z=Math.round((b.center[2]-.05)/.1);
    if(Math.abs(b.center[0]-(x+.5)*.1)>eps||Math.abs(b.center[2]-(z+.5)*.1)>eps){output.push(b);continue;}
    const low=b.center[1]-b.half[1],high=b.center[1]+b.half[1];
    const matches=(columns.get([x,z].join(','))||[]).filter(r=>r.low>=low-eps&&r.high<=high+eps);
    if(!matches.length){output.push(b);continue;}
    const slice=(a,c)=>{if(c-a>eps)output.push({center:[b.center[0],(a+c)/2,b.center[2]],half:[b.half[0],(c-a)/2,b.half[2]]});};
    let cursor=low;
    for(const r of matches){slice(cursor,r.low);meshes.push(r.mesh);cursor=r.high;}
    slice(cursor,high);
  }
  if(output.length+meshes.length>100000)throw new Error('Surface fixture collider limit');
  return {boxes:output,meshes,applied:meshes.length};
}
