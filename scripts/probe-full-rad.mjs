import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();
 let html=fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');
 const at=html.lastIndexOf('</script>');
 html=html.slice(0,at)+fs.readFileSync(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8')+html.slice(at);
 await page.route('http://127.0.0.1:18994/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18994/');
 await page.exposeFunction('bakeProgress',console.log);
 const result=await page.evaluate(async(full)=>{
  const {PagedSplats,SplatFileType}=await import('@sparkjsdev/spark');
  const p=new PagedSplats({rootUrl:'https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad',fileType:SplatFileType.RAD,pager:{extSplats:false,maxSh:0}});
  const {meta}=await p.getRadMeta();
  if(!full)return {count:meta.count,chunks:meta.chunks.length};
  const a=new LocahunWholeCollision.Accumulator(),start=performance.now();let total=0,leaves=0;
  const half=h=>{const e=(h>>10)&31,m=h&1023,s=h&32768?-1:1;return s*(e===0?m*2**-24:e===31?Infinity:(1+m/1024)*2**(e-15));};
  for(let chunk=0;chunk<meta.chunks.length;chunk++){
   const c=await p.fetchDecodeChunk(chunk),tree=c.extra.lodTree,packed=c.packedArray;
   if(!tree||tree.length<c.numSplats*4)throw Error('Missing RAD hierarchy');
   total+=c.numSplats;
   for(let i=0;i<c.numSplats;i++){
    if(tree[i*4+2]!==0)continue;
    const w1=packed[i*4+1],w2=packed[i*4+2];
    a.add(half(w1&65535),half(w1>>>16),half(w2&65535));leaves++;
   }
   if(chunk%20===0)await window.bakeProgress({chunk,totalChunks:meta.chunks.length,cells:a.cells.size,leaves});
  }
  if(total!==meta.count)throw Error('Incomplete RAD coverage');
  const cells=a.cells.size;let boxes;
  if(full==='tiles'){
   const source=JSON.stringify({count:meta.count,chunks:meta.chunks});
   const tiles=a.tiles(),encoded=await LocahunWholeCollision.encodeTiles(tiles,source,a.cellSize);
   const before=performance.now(),index=await LocahunWholeCollision.decodeTiles(encoded,source),decodeMs=performance.now()-before;
   const maxTileBoxes=Math.max(...tiles.map(t=>t.boxes.length));
   let maxNearBoxes=0;
   for(const tile of tiles){const c=tile.coord.map(n=>(n+.5)*index.span);const near=index.query({min:c.map(n=>n-3),max:c.map(n=>n+3)});maxNearBoxes=Math.max(maxNearBoxes,near.reduce((n,t)=>n+t.count,0));}
   return {complete:true,total,leaves,cells,tiles:tiles.length,boxes:index.total,bytes:encoded.length,decodeMs,maxTileBoxes,maxNearBoxes,ms:performance.now()-start};
  }
  if(full==='surface'){
   try{const m=a.surface();return {complete:true,total,leaves,cells,triangles:m.indices.length/3,rawBytes:m.vertices.byteLength+m.indices.byteLength,ms:performance.now()-start};}
   catch(e){return {complete:true,total,leaves,cells,failure:e.message,ms:performance.now()-start};}
  }
  try{boxes=a.finish();}catch(e){return {complete:true,total,leaves,cells,failure:e.message,ms:performance.now()-start};}
  const encoded=await LocahunWholeCollision.encode(boxes,JSON.stringify({count:meta.count,chunks:meta.chunks}));
  return {complete:true,total,leaves,cells,boxes:boxes.length,bytes:encoded.length,ms:performance.now()-start};
 },process.argv.includes('--tiles')?'tiles':process.argv.includes('--surface')?'surface':process.argv.includes('--full'));
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
