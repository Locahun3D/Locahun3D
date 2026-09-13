import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright'),{PNG}=require('pngjs');
const online=process.argv.includes('--online');
const dir='F:/Codex/locahun-walk/verification/path-occlusion'+(online?'-online':'');
fs.mkdirSync(dir,{recursive:true});
const hook=`
window.__occlusionTest=async()=>{
 const cv=document.createElement('canvas');cv.id='occlusion-test';document.body.append(cv);
 cv.style.cssText='position:fixed;inset:0;z-index:99999;width:640px;height:480px';
 const rr=new THREE.WebGLRenderer({canvas:cv,preserveDrawingBuffer:true,antialias:false});rr.setSize(640,480);rr.setPixelRatio(1);
 const ss=new THREE.Scene();ss.background=new THREE.Color('#141820');ss.add(new THREE.AmbientLight(0xffffff,2));
 const cc=new THREE.PerspectiveCamera(48,640/480,.1,100);
 const sr=new SparkRenderer({renderer:rr});sr.renderOrder=sparkRenderer.renderOrder;ss.add(sr);
 const wall=new SplatMesh({constructSplats:s=>{for(let x=-4;x<=4;x+=.12)for(let y=-2;y<=4;y+=.12)s.pushSplat(new THREE.Vector3(x,y,0),new THREE.Vector3(.1,.1,.015),new THREE.Quaternion(),1,new THREE.Color('#387eae'));}});
 await wall.initialized;ss.add(wall);
 const avatar=await _buildKawaiiWalkAvatar(1.7);ss.add(avatar);
 const objId=987654;layers.push({id:objId,type:'obj',mesh:avatar});
 const path=_buildPathMesh([{x:-1,y:.3,z:0},{x:1,y:.3,z:0},{x:1,y:1.5,z:0},{x:-1,y:1.5,z:0}],'#ff22aa',.95,'P1',.2);ss.add(path);
 const frames=async()=>{for(let i=0;i<20;i++){rr.render(ss,cc);await new Promise(r=>setTimeout(r,20));}rr.render(ss,cc);return cv.toDataURL('image/png');};
 window.__occlusionCapture=async(kind,front,x,visible)=>{
  const offset=kind==='restored-opacity'?20:0;
  cc.position.set(x,1.2,5+offset);cc.lookAt(0,.9,offset);wall.position.z=offset;
  avatar.visible=kind!=='path'&&visible;path.visible=kind==='path'&&visible;
  avatar.position.z=(front?1:-1)+offset;path.position.z=(front?1:-1)+offset;
  if(kind==='restored-opacity'){setObjOpacity(objId,.5);setObjOpacity(objId,1);}
  return await frames();
 };
 return {avatarMaterials:avatar.children.flatMap(()=>{const a=[];avatar.traverse(o=>{if(o.isMesh)a.push({transparent:o.material.transparent,depthWrite:o.material.depthWrite,depthTest:o.material.depthTest})});return a;}),sparkOrder:sr.renderOrder};
};`;
const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/occlusion-test',route=>{
 let html=fs.readFileSync(online?'F:/Htlml/3DGS/locahun3d_online/public/viewer/offline-viewer.html':new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');
 const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
 return route.fulfill({contentType:'text/html',body:html});
});
if(online)await page.route('**/vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('F:/Htlml/3DGS/locahun3d_online/public/viewer/vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js')}));
const decode=u=>Buffer.from(u.split(',')[1],'base64');
const diff=(a,b)=>{a=PNG.sync.read(a).data;b=PNG.sync.read(b).data;let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>45)n++;return n;};
const results={};
try{
 await page.goto('http://127.0.0.1:8193/occlusion-test',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__occlusionTest,{timeout:60000});
 results.materials=await page.evaluate(()=>__occlusionTest());
 for(const kind of ['avatar','path','restored-opacity'])for(const front of [false,true])for(const x of [-2,0,2]){
  const key=kind+'-'+(front?'front':'behind')+'-'+x;
  const base=decode(await page.evaluate(([k,f,x])=>__occlusionCapture(k,f,x,false),[kind,front,x]));
  const shown=decode(await page.evaluate(([k,f,x])=>__occlusionCapture(k,f,x,true),[kind,front,x]));
  fs.writeFileSync(dir+'/'+key+'.png',shown);results[key]=diff(base,shown);
 }
 fs.writeFileSync(dir+'/results.json',JSON.stringify({...results,errors},null,2));console.log(results);
 assert.deepEqual(errors,[]);
 for(const [key,n] of Object.entries(results)){if(key==='materials')continue;if(key.includes('behind'))assert(n<100,key+' leaked '+n+' pixels');else assert(n>500,key+' missing: '+n+' pixels');}
}finally{await browser.close();}
