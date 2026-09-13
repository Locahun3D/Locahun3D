// Read-only source project; outputs stay outside Dropbox and production.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const root='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio';
const out='F:/Codex/locahun-navigation-20260913';
const fine=process.argv.includes('--fine'),cellSize=fine?.1:.15,suffix=fine?'-fine':'';
const saved=fs.readFileSync(path.join(root,'project-state.json'));
const project=JSON.parse(saved).project;
const entry=project.layers.find(l=>l.type==='splat');
assert(/^assets\/[a-f0-9]+\.rad$/.test(entry.file));
const file=path.join(root,entry.file),stat=await fsp.stat(file),hash=createHash('sha256');
for await(const chunk of fs.createReadStream(file))hash.update(chunk);
const source=hash.digest('hex');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const hook=`window.studioBake=async(project,source)=>{
 setCameraCollision(false);
 for(const l of project.layers)if(l.type==='splat')l.streamUrl=new URL(l.file,location.href).href;
 await restoreProject(project,{strict:true});
 const sources=layers.filter(l=>l.type==='splat').map(l=>{l.mesh.updateMatrixWorld(true);return {paged:l.mesh.paged,matrix:[...l.mesh.matrixWorld.elements]};});
 const result=await LocahunCollisionBake.generate(sources,{cellSize:${cellSize},progress:p=>{if(p.chunk%20===0)console.log('BAKE '+JSON.stringify(p));}});
 const bytes=await LocahunWholeCollision.encodeTiles(result.tiles,source,result.cellSize);
 return {bytes:Array.from(bytes),sources:sources.map(s=>({matrix:s.matrix})),entries:result.entries,leaves:result.leaves,cells:result.cells,tiles:result.tiles.length,boxes:result.tiles.reduce((n,t)=>n+t.boxes.length,0)};
};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
let browser;const timeout=setTimeout(()=>browser?.close(),180000);
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('BAKE '))console.log(m.text());});
 await page.route('http://127.0.0.1:18996/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['GET','HEAD'].includes(request.method()))return route.abort();
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname!=='/'+entry.file)return route.fulfill({status:404,body:''});
  const range=request.headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range?.[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
  const headers={'accept-ranges':'bytes','content-length':String(end-start+1),'etag':'"'+source+'"','content-type':'application/octet-stream'};
  if(range)headers['content-range']='bytes '+start+'-'+end+'/'+stat.size;
  if(request.method()==='HEAD')return route.fulfill({status:200,headers,body:''});
  const handle=await fsp.open(file,'r');let body;
  try{body=Buffer.alloc(end-start+1);await handle.read(body,0,body.length,start);}finally{await handle.close();}
  return route.fulfill({status:range?206:200,headers,body});
 });
 await page.goto('http://127.0.0.1:18996/');await page.waitForFunction(()=>window.studioBake,null,{timeout:60000});
 const result=await page.evaluate(({project,source})=>studioBake(project,source),{project,source});
 assert.deepEqual(errors,[]);assert(fs.readFileSync(path.join(root,'project-state.json')).equals(saved));
 assert.equal((await fsp.stat(file)).mtimeMs,stat.mtimeMs);
 const bytes=Buffer.from(result.bytes);delete result.bytes;
 fs.writeFileSync(out+'/studio-full'+suffix+'.lct',bytes);fs.writeFileSync(out+'/studio-full'+suffix+'.json',JSON.stringify({source,cellSize,bytes:bytes.length,...result},null,2));
 console.log(JSON.stringify({source,bytes:bytes.length,...result}));
}finally{clearTimeout(timeout);await browser?.close();}
