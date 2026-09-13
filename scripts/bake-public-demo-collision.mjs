// Bake only the public curated demo through the complete canonical viewer runtime.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const opt=name=>process.argv[process.argv.indexOf(name)+1];
if(!process.argv.includes('--gpu-approved')||!process.argv.includes('--metadata'))throw Error('GPU grant and authoritative before metadata required');
const metadata=JSON.parse(fs.readFileSync(opt('--metadata'),'utf8'));
const resource='https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad';
assert.equal(metadata.key,'Kousaten_ForDemo_point_cloud.rad');
assert.match(metadata.httpEtag,/^"[^"\r\n]+"$/);assert(Number.isSafeInteger(metadata.size)&&metadata.size>0);
assert(metadata.observedAt&&Date.now()-Date.parse(metadata.observedAt)<15*60*1000,'fresh R2 observation required');
const out='F:/Codex/public-demo-prebake';fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const sourceSha256=createHash('sha256').update(html).digest('hex');
const hook=`window.demoBakeTest={async run(){
 const generate=LocahunCollisionBake.generate;let measured=null;
 LocahunCollisionBake.generate=async(s,o)=>{const started=performance.now();const result=await generate(s,{...o,progress:p=>{o.progress?.(p);if(p.chunk%30===0)console.log('[demo-bake]',JSON.stringify(p));}});measured={entries:result.entries,leaves:result.leaves,cells:result.cells,ms:performance.now()-started};return result;};
 await loadFromURL(DEMO_SCENE_URL,DEMO_SCENE_LABEL);
 await _walkPrepareCollision();
 const sources=layers.filter(L=>L.type==='splat'&&L.visible).map(L=>({url:L.mesh.paged?.rootUrl||L._streamUrl,identity:_wholeIdentityCache.get(L.mesh)?.identity,matrix:[...L.mesh.matrixWorld.elements],pos:L.pos,rot:L.rot,scale:L.scale}));
 return {whole:walkSetup.settings.whole,cellSize:walkSetup.wholeIndex?.cellSize,tiles:walkSetup.wholeIndex?.tiles.size,boxes:walkSetup.wholeIndex?.total,sources,measured,status:walkSetup.status};
}};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});let heads=0,radGets=0;const servedAssets={};
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('console',m=>{if(m.text().startsWith('[demo-bake]')||m.type()==='error')console.log(m.text());});
 page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url().split('?')[0],r.failure()?.errorText));
 page.on('pageerror',e=>console.log('PAGE',e.message));
 await page.route('https://viewer.locahun3d.com/vendor/**',async r=>{
  const relative=new URL(r.request().url()).pathname.slice(1),file=new URL('../'+relative,import.meta.url);
  if(!relative.includes('heap319-v1')||!fs.existsSync(file))return r.continue();
  const body=fs.readFileSync(file);servedAssets[relative]={bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};
  await r.fulfill({contentType:relative.endsWith('.wasm')?'application/wasm':'text/javascript',headers:{'access-control-allow-origin':'*'},body});
 });
 await page.route('http://127.0.0.1:18997/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route(resource,async r=>{
  if(r.request().method()!=='HEAD'){radGets++;return r.continue();}
  heads++;await r.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-expose-headers':'ETag,Content-Length','etag':metadata.httpEtag,'content-length':String(metadata.size)},body:''});
 });
 await page.goto('http://127.0.0.1:18997/');await page.waitForFunction(()=>window.demoBakeTest,null,{timeout:60000});
 const result=await page.evaluate(()=>demoBakeTest.run());
 assert.equal(result.sources.length,1);assert.equal(result.sources[0].url,resource);
 assert.deepEqual(result.sources[0].pos,{x:0,y:1.5,z:0});assert.deepEqual(result.sources[0].rot,{x:0,y:-168,z:0});
 assert.deepEqual(result.sources[0].scale,{x:1,y:1,z:1});assert(heads>0);assert(result.measured,'must actually bake, not use stale cache');
 const bytes=Buffer.from(result.whole.data,'base64');const sha256=createHash('sha256').update(bytes).digest('hex');
 const report={...result,whole:{key:result.whole.key},bytes:bytes.length,sha256,metadata,sourceSha256,completedAt:new Date().toISOString(),radHeadSimulated:true,realRadGets:radGets,servedAssets};
 fs.writeFileSync(path.join(out,'demo.lct'),bytes);fs.writeFileSync(path.join(out,'runtime-report.json'),JSON.stringify(report,null,2)+'\n');
 await page.screenshot({path:path.join(out,'runtime-demo.png')});
 console.log('STAGED ONLY; requires matching AFTER R2 metadata before manifest publication',JSON.stringify(report));
}finally{await browser.close();}
