import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='C:/Users/askgg/Dropbox/KWI/Products/Locahun3D';
const source=new URL('../Locahun3D_OfflineViewer.html',import.meta.url);
const known='7cb737e005bf97c92e82811b472c840e21f270c1023a5e42884eb934ca397f08';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await fs.readFile(source),expected=hash(bytes);
const response=await fetch('https://viewer.locahun3d.com/releases/stable.json',{cache:'no-store'});assert(response.ok);
const manifest=await response.json();assert.equal(manifest.viewer.sha256,expected,'Publish and verify before distribution');
const inventory=async()=>{
 const result=[];
 async function visit(dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name),stat=await fs.lstat(file);assert(!stat.isSymbolicLink(),'Link not allowed: '+file);
   if(stat.isDirectory())await visit(file);else result.push({file,size:stat.size,mtime:stat.mtimeMs});
  }
 }
 await visit(root);return result.sort((a,b)=>a.file.localeCompare(b.file));
};
const before=await inventory(),targets=before.filter(f=>['Locahun3D_OfflineViewer.html','viewer.html'].includes(path.basename(f.file)));
assert.equal(targets.length,10,'Viewer inventory changed; review targets');
for(const target of targets)assert([known,expected].includes(hash(await fs.readFile(target.file))),'Unreviewed changed viewer: '+target.file);
const backup='F:/Codex/locahun-navigation-20260913/distribution-'+Date.now();await fs.mkdir(backup);
const updates=[];
for(const [i,target] of targets.entries()){
 assert(path.resolve(target.file).startsWith(path.resolve(root)+path.sep));
 const previous=await fs.readFile(target.file),old=hash(previous);assert([known,expected].includes(old));
 if(old===expected){updates.push({file:target.file,current:true});continue;}
 await fs.writeFile(path.join(backup,i+'.html'),previous,{flag:'wx'});
 assert.equal(hash(await fs.readFile(target.file)),old);
 await fs.copyFile(source,target.file);assert.equal(hash(await fs.readFile(target.file)),expected);
 updates.push({file:target.file,old,sha256:expected});
}
const names=new Set(targets.map(t=>t.file)),protectedFiles=rows=>rows.filter(f=>!names.has(f.file));
assert.deepEqual(protectedFiles(await inventory()),protectedFiles(before),'Non-viewer file metadata changed');
const report={release:manifest.release,expected,updates,protectedMetadataCount:protectedFiles(before).length};
await fs.writeFile(path.join(backup,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({backup,updated:updates.filter(u=>!u.current).length,protectedMetadataCount:report.protectedMetadataCount}));
