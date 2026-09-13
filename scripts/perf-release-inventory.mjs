// Read-only target inspection. Writes evidence only under the performance workspace.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root='F:/Htlml/3DGS/Locahun3D',staging='F:/Codex/locahun-viewer-release-20260909';
const audit='F:/Codex/viewer-distribution-backups-20260910';
const name='spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const historical=JSON.parse(fs.readFileSync(audit+'/before.json')).candidates;
const targets=[root+'/Locahun3D_OfflineViewer.html',root+'/Locahun3D_OfflineViewer.online.html',root+'/viewer-dist/Locahun3D_OfflineViewer.html',staging+'/public/viewer/offline-viewer.html',staging+'/.open-next/assets/viewer/offline-viewer.html',...historical.map(c=>c.path)];
const inspect=file=>{
 try{const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile())return {file,refused:'not a regular file'};
 const bytes=fs.readFileSync(file),text=file.endsWith('.html')?bytes.toString('utf8'):null;
 return {file,bytes:bytes.length,mtimeMs:stat.mtimeMs,sha256:hash(bytes),...(text?{release:text.match(/window\.__locahunBuildRelease="([a-f0-9]{64})"/)?.[1],spark:text.match(/"@sparkjsdev\/spark"\s*:\s*"([^"]+)"/)?.[1]}:{})};
 }catch(e){if(e.code==='ENOENT')return {file,missing:true};throw e;}
};
const report={checkedAt:new Date().toISOString(),scope:'Known owned HTML targets from historical inventory plus canonical/staging outputs; not a new exhaustive Dropbox scan; no target writes',html:targets.map(inspect),assets:[root+'/vendor/'+name,root+'/viewer-dist/vendor/'+name,staging+'/public/viewer/vendor/'+name,staging+'/.open-next/assets/viewer/vendor/'+name].map(inspect),releaseInputs:[staging+'/scripts/deploy-viewer-verified.mjs',staging+'/scripts/deploy-verified.mjs',root+'/worker.js',root+'/src/js/216a_collision_manifest.js',root+'/src/assets/importmap.json',root+'/src/assets/importmap.online.json'].map(inspect)};
fs.writeFileSync('F:/Codex/locahun-performance-20260911/release-readonly-inventory.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({html:report.html.length,missingNewVendor:report.assets.filter(x=>x.missing).map(x=>x.file),sparkReferences:[...new Set(report.html.map(x=>x.spark))]},null,2));
