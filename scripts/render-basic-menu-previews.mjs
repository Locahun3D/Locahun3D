// Capture actual viewer objects offline; no invented product illustrations.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
let html=read('src/template.html').replace(/\{\{include(?:-variant)?:([^}]+)\}\}/g,(_,p)=>read(p));
const hook=`window.captureBasic=async function(kind){
 loadEmptyProject();let object;
 if(kind==='figure')object=(await _buildMixamoFigure(FIGURE_REF_HEIGHT_CM,{preview:true})).root;
 else if(kind==='path')object=_buildPathMesh([{x:-1,y:0,z:-.65},{x:1,y:0,z:-.65},{x:1,y:0,z:.65},{x:-1,y:0,z:.65}],'#00d0ff',1,'PATH',.05);
 else {window[kind==='cube'?'addCubeLayer':'addEventLayer'](new THREE.Vector3());object=layers.at(-1).mesh;}
 const preview=new THREE.Scene();preview.background=new THREE.Color(0xd9dcde);preview.add(object);
 object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3());
 const c=new THREE.PerspectiveCamera(35,400/260,.01,100);
 const direction=new THREE.Vector3(3,2.3,5).normalize();c.position.copy(center).addScaledVector(direction,Math.max(box.getSize(new THREE.Vector3()).length(),.1)*(kind==='path'?1.8:1.3));c.lookAt(center);c.updateMatrixWorld(true);
 preview.add(new THREE.HemisphereLight(0xffffff,0x727982,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,5,4);preview.add(light);
 const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(400,260);r.render(preview,c);
 const image=r.domElement.toDataURL('image/webp',.88);r.dispose();r.forceContextLoss();return image;
};`;
const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hook+html.slice(at);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:18997/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:18997/');await page.waitForFunction(()=>window.captureBasic,null,{timeout:60000});
 const images={};
 for(const kind of ['cube','event','path','figure']){
  images[kind]=await page.evaluate(kind=>captureBasic(kind),kind);
  fs.writeFileSync(new URL('src/assets/equipment/'+kind+'.webp',root),Buffer.from(images[kind].split(',')[1],'base64'));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 fs.writeFileSync(new URL('src/assets/basic_model_previews.html',root),'<script type="application/json" id="basic-model-previews">'+JSON.stringify(images)+'</script>\n');
 console.log('Captured four actual model previews.');
}finally{await browser.close();}
