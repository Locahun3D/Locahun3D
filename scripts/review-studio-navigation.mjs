import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json'),{chromium}=require('playwright');
const out='F:/Codex/locahun-navigation-20260913';
const context=vm.createContext({Uint8Array,DataView,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream});
vm.runInContext(fs.readFileSync(new URL('../src/js/216b_whole_collision.js',import.meta.url),'utf8'),context);
const meta=JSON.parse(fs.readFileSync(out+'/studio-full.json'));
const index=await context.LocahunWholeCollision.decodeTiles(new Uint8Array(fs.readFileSync(out+'/studio-full.lct')),meta.source);
const boxes=[...index.tiles.values()].flatMap(tile=>index.boxes(tile)).filter(b=>b.center[0]+b.half[0]>5&&b.center[0]-b.half[0]<10&&b.center[1]>-1&&b.center[1]<4&&b.center[2]>0&&b.center[2]<3);
const nav=JSON.parse(gunzipSync(fs.readFileSync(out+'/full-studio.navmesh.json.gz')));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}});
 await page.route('http://nav.test/',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}</style>'}));
 await page.route('http://nav.test/three.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(new URL('avatar-assets/node_modules/three/build/three.module.js',import.meta.url))}));
 await page.route('http://nav.test/three.core.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(new URL('avatar-assets/node_modules/three/build/three.core.js',import.meta.url))}));
 await page.goto('http://nav.test/');
 await page.evaluate(async({boxes,nav})=>{
  const T=await import('/three.js'),scene=new T.Scene();scene.background=new T.Color(0xe4e6e8);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,700);document.body.append(renderer.domElement);
  for(const b of boxes){const g=new T.BoxGeometry(...b.half.map(v=>v*2)),m=new T.Mesh(g,new T.MeshBasicMaterial({color:0x777777,transparent:true,opacity:.16,depthWrite:false}));m.position.set(...b.center);scene.add(m);}
  const positions=[];for(let i=0;i<nav.triangles.length;i+=3){const t=nav.triangles.slice(i,i+3).map(j=>nav.vertices.slice(j*3,j*3+3));if(t.every(p=>p[0]>5&&p[0]<10&&p[1]>-1&&p[1]<4&&p[2]>0&&p[2]<3))positions.push(...t.flat());}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));scene.add(new T.Mesh(geo,new T.MeshBasicMaterial({color:0x008b72,side:T.DoubleSide})));
  const c=new T.PerspectiveCamera(45,1000/700,.01,100);c.position.set(7.6,3.6,8);c.lookAt(7.6,1,1.6);renderer.render(scene,c);
 },{boxes,nav});
 await page.screenshot({path:out+'/stairs-proxy-nav.png'});
 console.log('Rendered actual collision and candidate navmesh.');
}finally{await browser.close();}
