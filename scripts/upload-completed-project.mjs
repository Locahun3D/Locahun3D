import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {runCompletedExportJob} from './completed-export-job.mjs';
import {verifyUploadedExport} from './verify-uploaded-export.mjs';
import {hashProtectedFile} from './collision-source-identity.mjs';

async function stableTarget(directory,origin,ids,resolve){
 const binding={origin,propertyId:ids.propertyId,sceneId:ids.sceneId};
 const file='target-'+createHash('sha256').update(JSON.stringify(binding)).digest('hex')+'.json';
 const validate=snapshot=>{
  if(!snapshot||snapshot.propertyId!==ids.propertyId||snapshot.sceneId!==ids.sceneId||typeof snapshot.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(snapshot.expectedUpdatedAt))||typeof snapshot.previousUrl!=='string'||snapshot.previousUrl.length>2048)throw Error('Target resolution mismatch');
  return {propertyId:snapshot.propertyId,sceneId:snapshot.sceneId,expectedUpdatedAt:snapshot.expectedUpdatedAt,previousUrl:snapshot.previousUrl};
 };
 const read=async()=>{
  if((await fs.lstat(path.join(directory,file))).size>8192)throw Error('Target snapshot too large');
  const identity=await hashProtectedFile({root:directory,file});
  const data=await fs.readFile(path.join(directory,file));
  if(createHash('sha256').update(data).digest('hex')!==identity.sha256)throw Error('Target snapshot changed');
  const saved=JSON.parse(data);
  if(saved.schema!==1||JSON.stringify(saved.binding)!==JSON.stringify(binding))throw Error('Target snapshot binding mismatch');
  return validate(saved.snapshot);
 };
 try{return await read();}catch(e){if(e.code!=='ENOENT')throw e;}
 const snapshot=validate(await resolve());
 const temporary=path.join(directory,'.target-'+randomUUID()+'.tmp');
 await fs.writeFile(temporary,JSON.stringify({schema:1,binding,snapshot})+'\n',{flag:'wx'});
 try{
  // Publish once so concurrent retries converge on the first resolved snapshot.
  try{await fs.link(temporary,path.join(directory,file));}catch(e){if(e.code!=='EEXIST')throw e;}
 }finally{await fs.unlink(temporary);}
 return read();
}

function trustedUrl(value,origins){
 const url=new URL(value);
 if(!origins.includes(url.origin)||url.username||url.password||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Unapproved origin');
 return url.href;
}
async function boundedJson(response){
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Workflow request failed: '+response.status);
 const reader=response.body.getReader();let length=0;const chunks=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>65536)throw Error('Workflow response too large');chunks.push(value);}return JSON.parse(Buffer.concat(chunks));}
 finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}

// Administrative credentials stay on the configured application origin, never on R2 requests.
export async function uploadCompletedProject({root,jobs,target,origin='https://locahun3d.com',token,tokenTimeoutMs=30000,allowedOrigins,onProgress=()=>{},fetch:fetcher=globalThis.fetch}){
 const job=await runCompletedExportJob({root,jobs,onProgress});
 if(job.status==='waiting_for_edit')return job;
 if(typeof token!=='function'&&(typeof token!=='string'||!token||/[\r\n]/.test(token)))throw Error('Administrative session token required');
 if(!Number.isSafeInteger(tokenTimeoutMs)||tokenTimeoutMs<1||tokenTimeoutMs>30000)throw Error('Invalid session deadline');
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length)throw Error('Trusted storage origins required');
 const base=new URL(origin);if(base.pathname!=='/'||base.search||base.hash)throw Error('Expected application origin');
 const endpoint=trustedUrl(new URL('/api/admin/workflow',base).href,[base.origin]);
 const receipt=JSON.parse(await fs.readFile(path.join(job.directory,'receipt.json'),'utf8'));
 const md5=createHash('md5'),sha=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(job.archive)){bytes+=chunk.length;if(bytes>receipt.archive.bytes)throw Error('Archive changed');md5.update(chunk);sha.update(chunk);}
 if(bytes!==receipt.archive.bytes||sha.digest('hex')!==job.sha256)throw Error('Archive changed');
 const call=async body=>{
  let session=token;
  if(typeof token==='function'){
   const controller=new AbortController();let timer;
   try{
    session=await Promise.race([
     Promise.resolve().then(()=>token({signal:controller.signal})),
     new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Administrative session deadline exceeded'));},tokenTimeoutMs);}),
    ]);
   }finally{clearTimeout(timer);controller.abort();}
  }
  if(typeof session!=='string'||!session||/[\r\n]/.test(session))throw Error('Administrative session token required');
  return boundedJson(await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session,Origin:base.origin},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)}));
 };
 if(!target||typeof target.propertyId!=='string'||!target.propertyId||typeof target.sceneId!=='string'||!target.sceneId)throw Error('Exact property and scene IDs required');
 if(target.expectedUpdatedAt===undefined&&target.previousUrl===undefined){
  if(Object.keys(target).some(key=>!['propertyId','sceneId'].includes(key)))throw Error('Invalid target');
  onProgress('resolving_target');
  target=await stableTarget(job.directory,base.origin,target,()=>call({action:'target',propertyId:target.propertyId,sceneId:target.sceneId}));
 }
 if(typeof target.expectedUpdatedAt!=='string'||typeof target.previousUrl!=='string')throw Error('Incomplete target snapshot');
 const binding={...target,revision:job.revision,projectSha256:receipt.input.projectSha256,archiveSha256:job.sha256,archiveMd5:md5.digest('hex'),archiveBytes:bytes};
 onProgress('reserving');const reservation=await call({action:'reserve',binding});
 if(!/^[a-f0-9]{64}$/.test(reservation.key)||reservation.id!=='wf_'+reservation.key)throw Error('Invalid reservation');
 if(reservation.status!=='ready'){
  const url=trustedUrl(reservation.putUrl,allowedOrigins);
  const headers={'Content-MD5':Buffer.from(binding.archiveMd5,'hex').toString('base64'),'If-None-Match':'*'};
  if(reservation.headers?.['Content-MD5']!==headers['Content-MD5']||reservation.headers?.['If-None-Match']!=='*')throw Error('Invalid upload binding');
  onProgress('uploading');const stream=createReadStream(job.archive);
  try{
   const response=await fetcher(url,{method:'PUT',headers,body:stream,duplex:'half',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(300000)});
   void response.body?.cancel().catch(()=>{});
   // A lost PUT response can be resumed: the server checks the existing write-once object.
   if(!response.ok&&response.status!==412)throw Error('Upload failed: '+response.status);
  }finally{stream.destroy();}
 }
 onProgress('verifying');const uploaded=await call({action:'verify',key:reservation.key});
 if(uploaded.bytes!==bytes||uploaded.sha256!==job.sha256)throw Error('Verification binding mismatch');
 await verifyUploadedExport({url:uploaded.downloadUrl,allowedOrigins,bytes,sha256:job.sha256,fetch:fetcher,timeoutMs:300000});
 const current=await runCompletedExportJob({root,jobs});
 if(current.key!==job.key||current.sha256!==job.sha256)throw Error('Source changed before attachment');
 onProgress('attaching');const result=await call({action:'attach',key:reservation.key,verifiedSha256:job.sha256});
 if(!['attached','already_attached'].includes(result.status)||result.key!==reservation.key||result.propertyId!==target.propertyId||result.sceneId!==target.sceneId)throw Error('Attachment readback mismatch');
 onProgress('attached');return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!['--root','--jobs','--target','--origin','--storage-origin'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid workflow arguments');options[args[i]]=args[i+1];}
 if(!options['--root']||!options['--jobs']||!options['--target']||!options['--storage-origin'])throw Error('Required: --root --jobs --target --storage-origin');
 const target=JSON.parse(await fs.readFile(options['--target'],'utf8'));
 console.log(JSON.stringify(await uploadCompletedProject({root:options['--root'],jobs:options['--jobs'],target,origin:options['--origin'],allowedOrigins:[options['--storage-origin']],token:process.env.LOCAHUN_ADMIN_SESSION,onProgress:phase=>console.error(phase)})));
}
