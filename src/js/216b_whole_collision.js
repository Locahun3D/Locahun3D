// Complete geometry in, bounded collision proxy out. No renderer residency dependency.
(() => {
  const MAX_BOXES=100000,MAX_RAW=MAX_BOXES*24+200016;
  const valid=n=>Number.isFinite(n)&&Math.abs(n)<=10000;
  function checkBox(b){
    if(!b||b.center?.length!==3||b.half?.length!==3||!b.center.every(valid)||!b.half.every(n=>valid(n)&&n>0&&n<=1000))throw new Error('Invalid collision box');
  }
  async function transform(bytes,kind,limit=MAX_RAW){
    if(!(bytes instanceof Uint8Array)||bytes.length>limit)throw new Error('Collision payload limit');
    const stream=new Blob([bytes]).stream().pipeThrough(kind==='gzip'?new CompressionStream('gzip'):new DecompressionStream('gzip'));
    const reader=stream.getReader(),parts=[];let size=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('Collision decompression limit');parts.push(value);}}
    finally{await reader.cancel().catch(()=>{});}
    const out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
  }
  class Accumulator {
    constructor({cellSize=.15,maxCells=2000000,minPoints=2}={}){
      if(!Number.isFinite(cellSize)||cellSize<.05||cellSize>1||!Number.isSafeInteger(maxCells)||maxCells<1||maxCells>2000000||!Number.isSafeInteger(minPoints)||minPoints<1)throw new Error('Invalid collision bake options');
      this.cellSize=cellSize;this.maxCells=maxCells;this.minPoints=minPoints;this.cells=new Map();this.points=0;
    }
    add(x,y,z){
      if(![x,y,z].every(valid))throw new Error('Invalid collision coordinate');
      const s=this.cellSize,key=[x,y,z].map(n=>Math.floor(n/s)).join(',');
      const n=this.cells.get(key)||0;
      if(!n&&this.cells.size>=this.maxCells)throw new Error('Whole-scene collision cell limit exceeded');
      this.cells.set(key,Math.min(this.minPoints,n+1));this.points++;
    }
    tiles(){
      const groups=new Map();
      for(const [key,count] of this.cells){
        if(count<this.minPoints)continue;
        const coord=key.split(',').map(n=>Math.floor(Number(n)/32)),id=coord.join(',');
        if(!groups.has(id))groups.set(id,{coord,acc:new Accumulator({cellSize:this.cellSize,minPoints:this.minPoints})});
        groups.get(id).acc.cells.set(key,count);
      }
      return [...groups.values()].map(({coord,acc})=>({coord,boxes:acc.finish()}));
    }
    finish(){
      const cells=new Set([...this.cells].filter(([,n])=>n>=this.minPoints).map(([k])=>k));
      let runs=[];const s=this.cellSize;
      // Merge filled X runs without bridging empty cells or changing Y/Z resolution.
      for(const key of cells){
        const [x,y,z]=key.split(',').map(Number);let lo=x,hi=x;
        while(cells.has([lo-1,y,z].join(',')))lo--;
        while(cells.has([hi+1,y,z].join(',')))hi++;
        for(let i=lo;i<=hi;i++)cells.delete([i,y,z].join(','));
        runs.push([lo,y,z,hi+1,y+1,z+1]);
      }
      for(const axis of [2,1]){
        const groups=new Map(),other=[0,1,2].filter(i=>i!==axis);
        for(const r of runs){const k=other.flatMap(i=>[r[i],r[i+3]]).join(',');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
        const merged=[];
        for(const group of groups.values()){
          group.sort((a,b)=>a[axis]-b[axis]);let previous;
          for(const r of group){if(previous&&previous[axis+3]===r[axis])previous[axis+3]=r[axis+3];else{previous=r;merged.push(r);}}
        }
        runs=merged;
      }
      if(runs.length>MAX_BOXES)throw new Error('Whole-scene collision box limit exceeded: '+runs.length);
      return runs.map(r=>({center:[0,1,2].map(i=>(r[i]+r[i+3])*s/2),half:[0,1,2].map(i=>(r[i+3]-r[i])*s/2)}));
    }
    surface(){
      const cells=new Set([...this.cells].filter(([,n])=>n>=this.minPoints).map(([k])=>k)),planes=new Map();
      for(const key of cells){
        const p=key.split(',').map(Number);
        for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
          const q=[...p];q[axis]+=sign;if(cells.has(q.join(',')))continue;
          const plane=[axis,sign,p[axis]+(sign>0?1:0)].join(','),uv=[p[(axis+1)%3],p[(axis+2)%3]].join(',');
          if(!planes.has(plane))planes.set(plane,new Set());planes.get(plane).add(uv);
        }
      }
      const vertices=[],indices=[];
      for(const [plane,faces] of planes){
        const [axis,sign,height]=plane.split(',').map(Number),u=(axis+1)%3,v=(axis+2)%3;
        for(const face of faces){
          const [x,y]=face.split(',').map(Number);let x0=x,x1=x+1,y1=y+1;
          while(faces.has([x0-1,y].join(',')))x0--;
          while(faces.has([x1,y].join(',')))x1++;
          let more=true;
          while(more){for(let i=x0;i<x1;i++)if(!faces.has([i,y1].join(','))){more=false;break;}if(more)y1++;}
          for(let j=y;j<y1;j++)for(let i=x0;i<x1;i++)faces.delete([i,j].join(','));
          const base=vertices.length/3;
          for(const [a,b] of [[x0,y],[x1,y],[x1,y1],[x0,y1]]){const p=[0,0,0];p[axis]=height*this.cellSize;p[u]=a*this.cellSize;p[v]=b*this.cellSize;vertices.push(...p);}
          indices.push(...(sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]).map(i=>base+i));
          if(indices.length>3000000)throw new Error('Whole-scene surface triangle limit exceeded');
        }
      }
      return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
    }
  }
  async function encode(boxes,source){
    if(!Array.isArray(boxes)||boxes.length>MAX_BOXES||typeof source!=='string'||!source.length)throw new Error('Invalid collision payload');
    const name=new TextEncoder().encode(source);if(name.length>200000)throw new Error('Collision source limit');
    const raw=new Uint8Array(16+name.length+boxes.length*24),v=new DataView(raw.buffer);
    raw.set([76,67,80,49]);v.setUint32(4,boxes.length,true);v.setUint32(8,name.length,true);raw.set(name,16);
    let offset=16+name.length;
    for(const b of boxes){checkBox(b);for(const n of [...b.center,...b.half]){v.setFloat32(offset,n,true);offset+=4;}}
    return transform(raw,'gzip');
  }
  async function decode(bytes,source){
    const raw=await transform(bytes,'gunzip');if(raw.length<16||raw[0]!==76||raw[1]!==67||raw[2]!==80||raw[3]!==49)throw new Error('Invalid collision header');
    const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),count=v.getUint32(4,true),len=v.getUint32(8,true);
    if(count>MAX_BOXES||len>200000||v.getUint32(12,true)!==0||raw.length!==16+len+count*24)throw new Error('Collision payload bounds');
    if(new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(16,16+len))!==source)throw new Error('Collision source mismatch');
    const boxes=[];let offset=16+len;
    for(let i=0;i<count;i++){const a=[];for(let j=0;j<6;j++){a.push(v.getFloat32(offset,true));offset+=4;}const b={center:a.slice(0,3),half:a.slice(3)};checkBox(b);boxes.push(b);}return boxes;
  }
  const TILE_LIMIT=16000000;
  async function encodeTiles(tiles,source,cellSize){
    if(!Array.isArray(tiles)||tiles.length>100000||typeof source!=='string'||!source.length||!Number.isFinite(cellSize)||cellSize<.05||cellSize>1)throw new Error('Invalid tiled collision');
    const name=new TextEncoder().encode(source);if(name.length>200000)throw new Error('Collision source limit');
    const total=tiles.reduce((n,t)=>n+t.boxes.length,0);
    if(total>2000000)throw new Error('Tiled collision box limit');
    const size=24+name.length+tiles.length*16+total*6;if(size>TILE_LIMIT)throw new Error('Tiled collision size limit');
    const raw=new Uint8Array(size),v=new DataView(raw.buffer);raw.set([76,67,84,49]);
    v.setUint32(4,tiles.length,true);v.setUint32(8,name.length,true);v.setFloat64(12,cellSize,true);v.setUint32(20,total,true);raw.set(name,24);
    let at=24+name.length;const seen=new Set();
    for(const t of tiles){
      if(!Array.isArray(t.coord)||t.coord.length!==3||!t.coord.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=6250)||seen.has(t.coord.join(','))||t.boxes.length>32768)throw new Error('Invalid collision tile');
      seen.add(t.coord.join(','));for(const n of t.coord){v.setInt32(at,n,true);at+=4;}v.setUint32(at,t.boxes.length,true);at+=4;
      for(const b of t.boxes){checkBox(b);for(const sign of [-1,1])for(let i=0;i<3;i++){
        const value=(b.center[i]+sign*b.half[i])/cellSize-t.coord[i]*32,integer=Math.round(value);
        if(Math.abs(value-integer)>1e-6||integer<0||integer>32)throw new Error('Collision box outside tile grid');raw[at++]=integer;
      }}
    }
    return transform(raw,'gzip',TILE_LIMIT);
  }
  async function decodeTiles(bytes,source){
    const raw=await transform(bytes,'gunzip',TILE_LIMIT),v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
    if(raw.length<24||raw[0]!==76||raw[1]!==67||raw[2]!==84||raw[3]!==49)throw new Error('Invalid tiled collision header');
    const count=v.getUint32(4,true),len=v.getUint32(8,true),cellSize=v.getFloat64(12,true),total=v.getUint32(20,true);
    if(count>100000||len>200000||total>2000000||!Number.isFinite(cellSize)||cellSize<.05||cellSize>1||raw.length!==24+len+count*16+total*6)throw new Error('Invalid tiled collision bounds');
    if(new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(24,24+len))!==source)throw new Error('Collision source mismatch');
    let at=24+len,loaded=0;const map=new Map();
    for(let i=0;i<count;i++){
      if(at+16>raw.length)throw new Error('Truncated collision tile');
      const coord=[v.getInt32(at,true),v.getInt32(at+4,true),v.getInt32(at+8,true)],n=v.getUint32(at+12,true);at+=16;
      const id=coord.join(',');if(n>32768||!coord.every(n=>Math.abs(n)<=6250)||map.has(id)||at+n*6>raw.length)throw new Error('Invalid collision tile');
      const data=raw.subarray(at,at+n*6);at+=data.length;loaded+=n;
      for(let j=0;j<data.length;j+=6)for(let k=0;k<3;k++)if(data[j+k]>=data[j+k+3]||data[j+k+3]>32)throw new Error('Invalid collision tile extent');
      map.set(id,{id,coord,data,count:n});
    }
    if(at!==raw.length||loaded!==total)throw new Error('Collision tile count mismatch');
    const span=cellSize*32;
    return {cellSize,span,total,tiles:map,
      query({min,max}){
        if(!Array.isArray(min)||!Array.isArray(max)||min.length!==3||max.length!==3||![...min,...max].every(valid)||min.some((n,i)=>n>max[i]))throw new Error('Invalid collision query bounds');
        const lo=min.map(n=>Math.floor(n/span)),hi=max.map(n=>Math.floor(n/span));
        if(hi.reduce((n,v,i)=>n*(v-lo[i]+1),1)>100000)throw new Error('Collision query tile limit');
        const found=[];for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){const tile=map.get([x,y,z].join(','));if(tile)found.push(tile);}return found;
      },
      boxes(tile){
        if(map.get(tile.id)!==tile)throw new Error('Foreign collision tile');
        const boxes=[],a=tile.data;
        for(let j=0;j<a.length;j+=6)boxes.push({center:[0,1,2].map(k=>(tile.coord[k]*32+(a[j+k]+a[j+k+3])/2)*cellSize),half:[0,1,2].map(k=>(a[j+k+3]-a[j+k])*cellSize/2)});
        return boxes;
      }
    };
  }
  globalThis.LocahunWholeCollision={Accumulator,encode,decode,encodeTiles,decodeTiles};
})();
