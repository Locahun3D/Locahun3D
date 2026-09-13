import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright'),{PNG}=require('pngjs');
const dir='F:/Codex/locahun-walk/verification/path-label-readability';
fs.mkdirSync(dir,{recursive:true});
const hook=`
window.__labelTest=async()=>{
 const cv=document.createElement('canvas');document.body.append(cv);cv.style.cssText='position:fixed;inset:0;z-index:99999';
 const rr=new THREE.WebGLRenderer({canvas:cv,preserveDrawingBuffer:true});rr.setSize(800,600);rr.setPixelRatio(1);
 const ss=new THREE.Scene();ss.background=new THREE.Color('#141820');
 const cc=new THREE.PerspectiveCamera(48,800/600,.1,100);
 const sr=new SparkRenderer({renderer:rr});ss.add(sr);
 const wall=new SplatMesh({constructSplats:s=>{for(let x=-4;x<=4;x+=.10)for(let y=-3;y<=3;y+=.10)s.pushSplat(new THREE.Vector3(x,y,.7),new THREE.Vector3(.12,.12,.015),new THREE.Quaternion(),1,new THREE.Color('#387eae'));}});
 await wall.initialized;ss.add(wall);
 const make=(id,text,z)=>{const g=_buildPathMesh([],'#00d0ff',.95,text);g.position.set(0,-.2,z);ss.add(g);layers.push({id,type:'path',mesh:g});return g;};
 const front=make(99801,'出入口',0),back=make(99802,'奥のラベル',-.5);
 const tube=new THREE.Mesh(new THREE.BoxGeometry(5,.08,.08),new THREE.MeshBasicMaterial({color:'#00d0ff',transparent:true}));tube.position.set(0,0,1);tube.renderOrder=-10;ss.add(tube);
 const gizmo=new THREE.Group();gizmo.renderOrder=1000;const axis=new THREE.Mesh(new THREE.BoxGeometry(.05,3,.05),new THREE.MeshBasicMaterial({color:'#ff2233',transparent:true,depthTest:false}));axis.position.z=1;axis.renderOrder=1000;gizmo.add(axis);ss.add(gizmo);
 window.__labelCapture=async(z,clutter,label=true)=>{
  cc.position.set(0,0,z);cc.lookAt(0,0,0);cc.updateMatrixWorld(true);
  front.visible=label;back.visible=clutter&&z<=5;tube.visible=clutter&&z<=5;gizmo.visible=clutter&&z<=5;wall.visible=clutter;
  _pathUpdateLabelVisibility(cc);
  for(let i=0;i<20;i++){rr.render(ss,cc);await new Promise(r=>setTimeout(r,20));}
  const sp=front.userData.pathLabelSprite;const w=sp.scale.x*cc.projectionMatrix.elements[0]/z*400,h=sp.scale.y*cc.projectionMatrix.elements[5]/z*300;
  return {png:cv.toDataURL('image/png'),box:{x:Math.ceil(400-w/2+5),y:Math.ceil(300-h/2+5),w:Math.floor(w-10),h:Math.floor(h-10)},depthTest:sp.material.depthTest};
 };
};`;
const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/label-readability-test',route=>{let html=fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');const at=html.lastIndexOf('</script>');return route.fulfill({contentType:'text/html',body:html.slice(0,at)+hook+html.slice(at)});});
 await page.goto('http://127.0.0.1:8193/label-readability-test');await page.waitForFunction(()=>window.__labelTest,{timeout:60000});await page.evaluate(()=>__labelTest());
 const capture=async(name,z,clutter,label=true)=>{const data=await page.evaluate(a=>__labelCapture(...a),[z,clutter,label]);const bytes=Buffer.from(data.png.split(',')[1],'base64');fs.writeFileSync(dir+'/'+name+'.png',bytes);return {...data,image:PNG.sync.read(bytes)};};
 const compare=(a,b,box)=>{let n=0;for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){const i=(y*a.image.width+x)*4;if(Math.abs(a.image.data[i]-b.image.data[i])+Math.abs(a.image.data[i+1]-b.image.data[i+1])+Math.abs(a.image.data[i+2]-b.image.data[i+2])>15)n++;}return n;};
 for(const z of [4,5]){const base=await capture('near-'+z+'-reference',z,false),clutter=await capture('near-'+z+'-overlap',z,true);assert.equal(clutter.depthTest,false);assert.equal(compare(base,clutter,base.box),0,'near label obscured at '+z+'m');}
 const base=await capture('far-reference',6,true,false),far=await capture('far-occluded',6,true,true);assert.equal(far.depthTest,true);assert(compare(base,far,far.box)<10,'far label leaks through wall');
 assert.deepEqual(errors,[]);console.log('PASS: 4m/5m labels cover paths, gizmos, rear labels and splats; 6m wall occlusion restored.');
}finally{await browser.close();}
