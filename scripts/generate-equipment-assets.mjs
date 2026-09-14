// Generates only NEW equipment assets, never the viewer HTML or release files.
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as THREE from '../../../kawaii-motion/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../../kawaii-motion/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
const folder=new URL('../src/assets/equipment/',import.meta.url);
fs.mkdirSync(folder,{recursive:true});
const c=vm.createContext({console,Float32Array});
vm.runInContext(fs.readFileSync(new URL('../src/js/274_equipment_geometry.js',import.meta.url),'utf8'),c);
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:'+blob.type+';base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}
};
if(!process.argv.includes('--pack')) {
  for(const item of c.LocahunEquipment.catalog){
    const mesh=c.LocahunEquipment.build(THREE,item.id);
    const bytes=await new GLTFExporter().parseAsync(mesh,{binary:true});
    fs.writeFileSync(new URL(item.id+'.glb',folder),Buffer.from(bytes));
    console.log(item.id,bytes.byteLength);
    mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
} else {
  const sharp=createRequire(import.meta.url)('../../../kawaii-motion/node_modules/sharp');
  const assets={};
  for(const item of c.LocahunEquipment.catalog){
    const glb=fs.readFileSync(new URL(item.id+'.glb',folder)),pngPath=new URL(item.id+'.png',folder),webpPath=new URL(item.id+'.webp',folder);
    const thumbnail=fs.existsSync(pngPath)?await sharp(fs.readFileSync(pngPath)).webp({quality:85,alphaQuality:95,effort:6}).toBuffer():fs.readFileSync(webpPath);
    if(glb.length>1500000||thumbnail.length>50000)throw new Error('Equipment asset limit');
    fs.writeFileSync(webpPath,thumbnail);
    assets[item.id]={glb:glb.toString('base64'),thumbnail:'data:image/webp;base64,'+thumbnail.toString('base64')};
    if(fs.existsSync(pngPath))fs.unlinkSync(pngPath);
  }
  fs.writeFileSync(new URL('../src/assets/equipment_models.html',import.meta.url),'<script type="application/json" id="equipment-assets">'+JSON.stringify(assets)+'</script>\n');
  console.log('Packed six local equipment assets');
}
