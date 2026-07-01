// ══════════════════════════════════════════════════
//  SCENE STATS (for camera placement)
// ══════════════════════════════════════════════════
function estimateSplatStats(buffer) {
  const ROWS=Math.min(Math.floor(buffer.byteLength/32),200000);
  if(!ROWS) return {center:new THREE.Vector3(),size:5,cache:null,cacheCount:0};
  const v=new DataView(buffer);
  const step=Math.max(1,Math.floor(ROWS/50000)); // up to 50K cached points
  const xs=[],ys=[],zs=[];
  const cache=new Float32Array(Math.ceil(ROWS/step)*3);
  let ci=0;
  for(let i=0;i<ROWS;i+=step){
    const o=i*32;
    const x=v.getFloat32(o,true),y=v.getFloat32(o+4,true),z=v.getFloat32(o+8,true);
    if(isFinite(x)&&isFinite(y)&&isFinite(z)&&Math.abs(x)<999&&Math.abs(y)<999&&Math.abs(z)<999){
      xs.push(x);ys.push(y);zs.push(z);
      cache[ci++]=x;cache[ci++]=y;cache[ci++]=z;
    }
  }
  if(!xs.length) return {center:new THREE.Vector3(),size:5,cache:null,cacheCount:0};
  xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
  const med=a=>a[Math.floor(a.length/2)];
  const size=Math.max(xs[xs.length-1]-xs[0],zs[zs.length-1]-zs[0],1);
  return {center:new THREE.Vector3(med(xs),med(ys),med(zs)),size,cache,cacheCount:ci/3};
}

function estimatePLYStats(buffer,flipYZ) {
  const hdrMax=Math.min(buffer.byteLength,16384);
  const hdrText=new TextDecoder().decode(new Uint8Array(buffer,0,hdrMax));
  const EMPTY={center:new THREE.Vector3(),size:5,cache:null,cacheCount:0};
  if(!hdrText.startsWith('ply')) return EMPTY;
  const endTag='end_header\n', endIdx=hdrText.indexOf(endTag);
  if(endIdx<0) return EMPTY;
  const dataStart=endIdx+endTag.length;
  let vCount=0,inVert=false,stride=0,xOff=-1,yOff=-1,zOff=-1;
  for(const line of hdrText.slice(0,endIdx).split('\n')){
    const p=line.trim().split(/\s+/);
    if(p[0]==='element'){inVert=p[1]==='vertex';if(inVert)vCount=parseInt(p[2])||0;}
    else if(p[0]==='property'&&inVert){
      const sz=(p[1]==='double'||p[1]==='float64')?8:(p[1]==='uchar'||p[1]==='uint8')?1:
               (p[1]==='short'||p[1]==='int16'||p[1]==='ushort'||p[1]==='uint16')?2:4;
      if(p[2]==='x')xOff=stride;if(p[2]==='y')yOff=stride;if(p[2]==='z')zOff=stride;
      stride+=sz;
    }
  }
  if(xOff<0||yOff<0||zOff<0||!vCount||!stride) return EMPTY;
  const dv=new DataView(buffer);
  // Cache up to 2M points (≈24 MB). For a 12 M-splat scan that's ~1 cached point
  // per ~0.5 m, dense enough that the screen-space pick cylinder reliably catches
  // a near-surface sample instead of falling through to a far wall.
  const TARGET_CACHE = 2000000;
  const step=Math.max(1,Math.floor(vCount/TARGET_CACHE));
  const xs=[],ys=[],zs=[];
  const cache=new Float32Array(Math.ceil(vCount/step)*3);
  let ci=0;
  // Use LARGER coord guard to allow real scans with ±300 m extents (kousaten_a7 etc.)
  const COORD_LIMIT = 5000;
  for(let i=0;i<vCount;i+=step){
    const base=dataStart+i*stride;
    if(base+stride>buffer.byteLength)break;
    const x=dv.getFloat32(base+xOff,true),y=dv.getFloat32(base+yOff,true),z=dv.getFloat32(base+zOff,true);
    if(!isFinite(x)||!isFinite(y)||!isFinite(z))continue;
    if(Math.abs(x)>COORD_LIMIT||Math.abs(y)>COORD_LIMIT||Math.abs(z)>COORD_LIMIT)continue;
    // Cache RAW local coords. The picker will apply mesh.matrixWorld at pick time,
    // which already includes the flip / axis-flip rotations.
    cache[ci++]=x;cache[ci++]=y;cache[ci++]=z;
    // Stats (center/size) are used for camera placement — use the world-space transform
    // (default flip for PLY) so the camera ends up looking at the visible scene.
    const wy = flipYZ ? -y : y;
    const wz = flipYZ ? -z : z;
    xs.push(x);ys.push(wy);zs.push(wz);
  }
  if(!xs.length) return EMPTY;
  xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
  const med=a=>a[Math.floor(a.length/2)];
  const size=Math.max(xs[xs.length-1]-xs[0],zs[zs.length-1]-zs[0],1);
  return {center:new THREE.Vector3(med(xs),med(ys),med(zs)),size,cache,cacheCount:ci/3};
}




