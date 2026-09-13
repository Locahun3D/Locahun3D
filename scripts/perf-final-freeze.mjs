// One-shot CPU/build evidence. Only canonical generated outputs and evidence are writable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {REGRESSION_TESTS,OWNED_FILES} from './sync-online-viewer.mjs';
const root='F:/Htlml/3DGS/Locahun3D',online='F:/Htlml/3DGS/locahun3d_online';
const staging='F:/Codex/locahun-viewer-release-20260909',out='F:/Codex/locahun-performance-20260911/final-freeze-r2';
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(out,{recursive:true});
async function inspect(file,content=true){
 try{const s=await fs.lstat(file);assert(!s.isSymbolicLink(),'Symlink: '+file);assert(s.isFile());return {file,bytes:s.size,mtimeMs:s.mtimeMs,...(content?{sha256:hash(await fs.readFile(file))}:{})};}
 catch(e){if(e.code==='ENOENT')return {file,missing:true};throw e;}
}
async function source(){
 const files=[];
 async function visit(relative){const file=path.join(root,relative),s=await fs.lstat(file);assert(!s.isSymbolicLink());if(s.isDirectory()){for(const n of (await fs.readdir(file)).sort())if(n!=='node_modules')await visit(relative+'/'+n);}else files.push(await inspect(file));}
 for(const p of ['src','scripts','vendor','collision','figures','worker.js','wrangler.toml','build.mjs','deploy-viewer.sh','sync-online-viewer.sh'])await visit(p);
 for(const p of ['demo-asset/[...path]/route.ts','viewer-stream/[...path]/route.ts','r2/[...path]/route.ts','viewer-asset/route.ts'])for(const r of [online,staging])files.push(await inspect(r+'/src/app/api/'+p));
 for(const p of ['wrangler.jsonc','scripts/deploy-verified.mjs','scripts/deploy-viewer-verified.mjs'])files.push(await inspect(staging+'/'+p));
 return {count:files.length,sha256:hash(JSON.stringify(files)),files};
}
const historical=JSON.parse(await fs.readFile('F:/Codex/viewer-distribution-backups-20260910/before.json'));
async function targets(){
 const names=[...OWNED_FILES.map(p=>online+'/'+p),online+'/.git/locahun-viewer-sync-state.json',online+'/.git/locahun-viewer-sync.lock',root+'/viewer-dist/Locahun3D_OfflineViewer.html',staging+'/public/viewer/offline-viewer.html',staging+'/.open-next/assets/viewer/offline-viewer.html',...historical.candidates.map(p=>p.path)];
 for(const r of [root+'/viewer-dist',staging+'/public/viewer',staging+'/.open-next/assets/viewer'])for(const p of ['vendor/spark-2.0.0-workers16-incrtraverse.module.js','vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js','collision/f2ba008e5632deb2bd81b8f86de0dac93a4c4b977ec6c24e07e76ec785fb1b49.lct'])names.push(r+'/'+p);
 const files=[];for(const n of [...new Set(names)].sort())files.push(await inspect(n));
 const protectedMetadata=[];for(const p of historical.protectedFiles)protectedMetadata.push(await inspect(p.path,false));
 return {scope:'Fresh hashes of known owned targets; fresh metadata of historical protected inventory. Not exhaustive Dropbox discovery.',count:files.length,sha256:hash(JSON.stringify(files)),files,protectedCount:protectedMetadata.length,protectedMetadataSha256:hash(JSON.stringify(protectedMetadata)),protectedMetadata};
}
const report={startedAt:new Date().toISOString(),before:await source(),targetsBefore:await targets(),commands:[]};
await fs.writeFile(out+'/before.json',JSON.stringify(report,null,2));
async function run(name,cwd,args){
 let output='';const code=await new Promise((resolve,reject)=>{const c=spawn(process.execPath,args,{cwd,windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',CAMERA_NEAR_REAL:'0'}});for(const s of [c.stdout,c.stderr])s.on('data',b=>{output+=b;});c.on('error',reject);c.on('close',resolve);});
 await fs.writeFile(out+'/'+name+'.log',output);report.commands.push({name,cwd,args,code});console.log(name+': '+code+'\n'+output.slice(-750));return code;
}
const extra=['test-sync-online-viewer','test-collision-cache-bridge','test-local-project-server','test-viewer-figure-cors','test-viewer-update','test-viewer-release','test-local-viewer-cache','test-prepare-local-project','test-equipment-roundtrip','test-equipment-undo'];
try{
 assert.equal(await run('cpu',root,['--test',...new Set([...REGRESSION_TESTS,...extra.map(n=>'scripts/'+n+'.mjs'),'scripts/perf-release-wrappers.test.mjs'])]),0,'CPU gates failed');
 assert.equal(await run('online-cpu',online,['node_modules/vitest/vitest.mjs','run']),0,'Online CPU gates failed');
 assert.equal((await source()).sha256,report.before.sha256,'Frozen source changed before build');
 assert.equal(await run('build-offline',root,['build.mjs']),0,'Offline build failed');
 assert.equal(await run('build-online',root,['build.mjs','--online']),0,'Online build failed');
 report.outputs=await Promise.all(['Locahun3D_OfflineViewer.html','Locahun3D_OfflineViewer.online.html'].map(p=>inspect(root+'/'+p)));
 report.dryRunExit=await run('sync-dry-run',root,['scripts/sync-online-viewer.mjs','--dry-run']);
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{
 report.after=await source();report.targetsAfter=await targets();report.finishedAt=new Date().toISOString();
 report.sourceUnchanged=report.before.sha256===report.after.sha256;
 report.targetsUnchanged=report.targetsBefore.sha256===report.targetsAfter.sha256&&report.targetsBefore.protectedMetadataSha256===report.targetsAfter.protectedMetadataSha256;
 if(!report.sourceUnchanged||!report.targetsUnchanged||report.dryRunExit!==0)process.exitCode=1;
 await fs.writeFile(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({sourceUnchanged:report.sourceUnchanged,targetsUnchanged:report.targetsUnchanged,dryRunExit:report.dryRunExit,error:report.error}));
}
