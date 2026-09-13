// Offline-generated navigation geometry, source-bound and bounded before allocation.
(() => {
  const MAX=2000000,HEADER=60,PROFILE=[2,.15,.3,.05];
  const sourceOK=source=>typeof source==='string'&&/^[a-f0-9]{64}$/.test(source);
  function validate(vertices,triangles){
    if(!vertices||!triangles||vertices.length<9||vertices.length%3||vertices.length>180000||
      triangles.length<3||triangles.length%3||triangles.length>180000)throw new Error('Navigation geometry limit');
    for(const n of vertices)if(!Number.isFinite(n)||Math.abs(n)>10000)throw new Error('Invalid navigation coordinate');
    for(let i=0;i<triangles.length;i+=3){
      const a=triangles[i],b=triangles[i+1],c=triangles[i+2];
      for(const index of [a,b,c])if(!Number.isInteger(index)||index<0||index>=vertices.length/3)throw new Error('Invalid navigation index');
      if(a===b||b===c||a===c)throw new Error('Degenerate navigation triangle');
      // Validate the stored float32 positions, including vertices collapsed by encoding.
      const ax=Math.fround(vertices[a*3]),ay=Math.fround(vertices[a*3+1]),az=Math.fround(vertices[a*3+2]);
      const ux=Math.fround(vertices[b*3])-ax,uy=Math.fround(vertices[b*3+1])-ay,uz=Math.fround(vertices[b*3+2])-az;
      const vx=Math.fround(vertices[c*3])-ax,vy=Math.fround(vertices[c*3+1])-ay,vz=Math.fround(vertices[c*3+2])-az;
      if((uy*vz-uz*vy)**2+(uz*vx-ux*vz)**2+(ux*vy-uy*vx)**2<=1e-16)throw new Error('Degenerate navigation triangle');
    }
  }
  async function transform(bytes,decompress){
    if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX)throw new Error('Navigation payload limit');
    const stream=new Blob([bytes]).stream().pipeThrough(decompress?new DecompressionStream('gzip'):new CompressionStream('gzip'));
    const reader=stream.getReader(),parts=[];let size=0;
    try{
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX)throw new Error('Navigation decompression limit');parts.push(value);}
    }finally{await reader.cancel().catch(()=>{});}
    const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
  }
  globalThis.LocahunNavigationCache={
    async encode(mesh,source){
      if(!sourceOK(source))throw new Error('Invalid navigation source');
      const {vertices,triangles}=mesh;validate(vertices,triangles);
      const bytes=new Uint8Array(HEADER+(vertices.length+triangles.length)*4),view=new DataView(bytes.buffer);
      view.setUint32(0,0x31564e4c,true);view.setUint32(4,vertices.length,true);view.setUint32(8,triangles.length,true);
      for(let i=0;i<32;i++)bytes[12+i]=parseInt(source.slice(i*2,i*2+2),16);
      PROFILE.forEach((n,i)=>view.setFloat32(44+i*4,n,true));
      let offset=HEADER;for(const n of vertices){view.setFloat32(offset,n,true);offset+=4;}for(const n of triangles){view.setUint32(offset,n,true);offset+=4;}
      return transform(bytes,false);
    },
    async decode(bytes,expectedSource){
      if(!sourceOK(expectedSource))throw new Error('Invalid navigation source');
      const raw=await transform(bytes,true),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
      if(raw.length<HEADER||view.getUint32(0,true)!==0x31564e4c)throw new Error('Invalid navigation format');
      const nv=view.getUint32(4,true),nt=view.getUint32(8,true);
      if(nv<9||nv%3||nv>180000||nt<3||nt%3||nt>180000||HEADER+(nv+nt)*4!==raw.length)throw new Error('Navigation geometry limit');
      const source=Array.from(raw.slice(12,44),n=>n.toString(16).padStart(2,'0')).join('');
      if(source!==expectedSource)throw new Error('Navigation source mismatch');
      if(PROFILE.some((n,i)=>{const actual=view.getFloat32(44+i*4,true);return !Number.isFinite(actual)||Math.abs(actual-n)>1e-6;}))throw new Error('Navigation profile mismatch');
      const vertices=new Float32Array(nv),triangles=new Uint32Array(nt);let offset=HEADER;
      for(let i=0;i<nv;i++,offset+=4)vertices[i]=view.getFloat32(offset,true);
      for(let i=0;i<nt;i++,offset+=4)triangles[i]=view.getUint32(offset,true);
      validate(vertices,triangles);return {source,vertices,triangles};
    }
  };
})();
