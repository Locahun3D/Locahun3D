import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const rootPath=r=>r instanceof URL?fileURLToPath(r):path.resolve(r);
const allowed=p=>/^vendor\/spark-[a-zA-Z0-9.-]+\.module\.js$/.test(p)||/^collision\/[a-f0-9]{64}\.lct$/.test(p);
async function safe(root,relative,create=false){
 assert(allowed(relative),'Invalid release asset path');let current=rootPath(root);
 const parts=relative.split('/');
 for(const part of ['',...parts.slice(0,-1)]){current=path.join(current,part);if(create)await fs.mkdir(current,{recursive:true});const s=await fs.lstat(current);assert(s.isDirectory()&&!s.isSymbolicLink(),'Unsafe asset directory');}
 const target=path.join(current,parts.at(-1));const s=await fs.lstat(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
 if(s)assert(s.isFile()&&!s.isSymbolicLink(),'Unsafe asset file');return target;
}
export async function readReleaseAssets(root){
 root=rootPath(root);const read=relative=>fs.readFile(path.join(root,relative));
 const map=JSON.parse(await read('src/assets/importmap.json'));
 const name=new URL(map.imports['@sparkjsdev/spark']).pathname.split('/').at(-1);
 const provenance=JSON.parse(await read('vendor/spark-heap319-v1/provenance.json'));
 const source=(await read('src/js/216a_collision_manifest.js')).toString();
 const match=source.match(/Object\.freeze\((\{[\s\S]*\})\);/);assert(match,'Missing collision manifest');
 const manifest=JSON.parse(match[1]),plan=[];
 const demo=JSON.parse(await read('collision/demo-source.json'));
 assert.equal(demo.sources?.length,1);assert.equal(demo.sources[0].url,'https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad','Only approved public demo may be distributed');
 assert.deepEqual(Object.keys(manifest),[demo.whole.key],'Unexpected collision manifest entries');
 assert.equal(manifest[demo.whole.key].sha256,demo.sha256);assert.equal(manifest[demo.whole.key].bytes,demo.bytes);
 assert.equal(name,'spark-2.0.0-workers16-incrtraverse.module.js','Rollback must select the original renderer');
 const entries=[['vendor/'+name,{sha256:provenance.originalBundleSha256}],['vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js',{sha256:provenance.candidateBundleSha256}],...Object.entries(manifest).map(([key,v])=>['collision/'+key+'.lct',v])];
 for(const [relative,expected] of entries){assert(allowed(relative));assert(/^[a-f0-9]{64}$/.test(expected.sha256));const body=await fs.readFile(await safe(root,relative));assert.equal(sha(body),expected.sha256,'Release asset digest mismatch: '+relative);if(relative.startsWith('collision/'))assert.equal(body.length,expected.bytes,'Collision size mismatch');plan.push({relative,body,sha256:sha(body),bytes:body.length});}
 return plan;
}
export async function copyReleaseAssets(plan,destination){
 // Validate the whole destination set before adding any file; never overwrite old URLs.
 for(const p of plan){assert.equal(sha(p.body),p.sha256);assert.equal(p.body.length,p.bytes);const file=await safe(destination,p.relative,true);const prior=await fs.readFile(file).catch(e=>{if(e.code!=='ENOENT')throw e;});if(prior)assert(prior.equals(p.body),'Immutable asset mismatch: '+p.relative);}
 for(const p of plan){const file=await safe(destination,p.relative,true);try{await fs.writeFile(file,p.body,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}assert((await fs.readFile(file)).equals(p.body),'Immutable asset mismatch: '+p.relative);}
}
export async function verifyReleaseAssets(plan,origin,fetcher=fetch,{cors=true}={}){
 for(const p of plan)for(const method of ['HEAD','GET']){
  const r=await fetcher(new URL('/'+p.relative,origin),{method,redirect:'error',cache:'no-store',headers:{Origin:'null'}});
  assert.equal(r.status,200,p.relative);
  const length=r.headers.get('content-length');
  // Compressed static modules can omit length; the following GET still verifies exact bytes/SHA.
  if(length!==null||p.relative.startsWith('collision/'))assert.equal(Number(length),p.bytes,'Asset length mismatch');
  if(cors){assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.match(r.headers.get('access-control-expose-headers')||'',/Content-Length/i);}
  assert.match(r.headers.get('content-type')||'',p.relative.startsWith('collision/')?/^application\/octet-stream/:/javascript/);
  if(method==='GET'){const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,p.bytes,'Asset body length mismatch');assert.equal(sha(bytes),p.sha256,'Asset digest mismatch');}
 }
}
export async function snapshotReleaseInputs(root){
 root=rootPath(root);const h=createHash('sha256');
 async function visit(relative){const f=path.join(root,relative),s=await fs.lstat(f);assert(!s.isSymbolicLink(),'Symlink release input');if(s.isDirectory()){for(const name of (await fs.readdir(f)).sort())await visit(relative+'/'+name);}else{h.update(relative+'\0');h.update(await fs.readFile(f));}}
 for(const p of ['src','worker.js','wrangler.toml','build.mjs','scripts/prepare-viewer-release.mjs','scripts/viewer-update-core.cjs','scripts/local-viewer-cache.mjs','scripts/local-project-server.mjs','scripts/perf-release-assets.mjs','vendor/spark-heap319-v1','collision'])await visit(p);
 for(const p of await readReleaseAssets(root))h.update(p.relative+'\0'+p.sha256);
 return h.digest('hex');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,root,destination]=process.argv.slice(2);assert.equal(mode,'--copy');assert(root&&destination&&process.argv.length===5);await copyReleaseAssets(await readReleaseAssets(root),destination);
}
