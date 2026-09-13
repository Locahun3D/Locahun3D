import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Transform,Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {inventoryProject,hashProtectedFile} from './collision-source-identity.mjs';
import {loadZipLibrary,prepareLocalProject} from './prepare-local-project.mjs';
import {validateNavigationBundle} from './validate-navigation-bundle.mjs';

const LIMIT=2*1024**3;
export async function exportLocalProject({root,out,onProgress=()=>{}}) {
 root=path.resolve(root);out=path.resolve(out);
 if(out===root||out.startsWith(root+path.sep))throw Error('Output must be outside, not inside the source package');
 const parent=path.dirname(out);
 if(await fs.realpath(parent)!==parent)throw Error('Output directory must not be a link');
 try{await fs.lstat(out);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 const initial=await inventoryProject({root});
 const stateBytes=await fs.readFile(path.join(root,'project-state.json'));
 if(createHash('sha256').update(stateBytes).digest('hex')!==initial.projectSha256)throw Error('Project changed during read');
 const envelope=JSON.parse(stateBytes.toString('utf8'));
 if(envelope.status!=='editing_complete'||!Number.isSafeInteger(envelope.revision)||envelope.revision<0)throw Error('An editing_complete saved revision is required');
 const project=envelope.project;
 if(!isDeepStrictEqual(project.layers,initial.layers))throw Error('Project changed during read');
 const zip=new (loadZipLibrary())(),inputs=[];
 const metadata=Buffer.from(JSON.stringify(project,null,2)+'\n');
 if(metadata.length>16*1024**2)throw Error('Project metadata size limit');
 zip.file('project.json',metadata);
 let sourceBytes=metadata.length;
 for(const asset of initial.assets){
  sourceBytes+=asset.bytes;
  if(asset.bytes>1024**3||sourceBytes>LIMIT)throw Error('Package input size limit');
  inputs.push(asset);
 }
 let regional;
 if(project.walk?.navigationRegions){
  regional=await validateNavigationBundle(project.walk.navigationRegions,async(name,bytes)=>{
   const identity=await hashProtectedFile({root,file:name});
   if(identity.bytes!==bytes)throw Error('Navigation size mismatch');
   return fs.readFile(path.join(root,name));
  });
  for(const [name,bytes] of regional.files){sourceBytes+=bytes.length;zip.file(name,bytes);}
 }
 if(sourceBytes>LIMIT)throw Error('Package input size limit');
 zip.file('export-info.json',JSON.stringify({schema:'locahun-completed-export-v1',revision:envelope.revision,projectSha256:initial.projectSha256,assets:initial.assets,navigationSource:regional?.manifest.source||null},null,2)+'\n');
 const verify=async()=>{
  const current=await inventoryProject({root});
  if(current.projectSha256!==initial.projectSha256||!isDeepStrictEqual(current.assets,initial.assets))throw Error('Project or source changed during export');
  if(regional)for(const [name,bytes] of regional.files){
   const actual=await hashProtectedFile({root,file:name});
   const expected=createHash('sha256').update(bytes).digest('hex');
   if(actual.sha256!==expected||actual.bytes!==bytes.length)throw Error('Navigation changed during export');
  }
 };
 await verify();await onProgress('packaging');
 const temp=path.join(parent,'.local-export-'+randomUUID()+'.zip');
 const verifiedRoot=path.join(parent,'.local-export-check-'+randomUUID());
 let total=0,ownedTemp=false;const streams=[];
 const cleanupVerified=async()=>{
  try{
   if(path.dirname(verifiedRoot)!==parent||await fs.realpath(verifiedRoot)!==verifiedRoot||(await fs.lstat(verifiedRoot)).isSymbolicLink())throw Error('Unsafe verification cleanup path');
   await fs.rm(verifiedRoot,{recursive:true});
  }catch(e){if(e.code!=='ENOENT')throw e;}
 };
 try{
  // Sources stream one at a time; do not duplicate the complete RAD in memory.
  for(const asset of inputs){
   const stream=Readable.from((async function*(){
    const hash=createHash('sha256');let bytes=0;
    for await(const chunk of createReadStream(path.join(root,asset.file))){bytes+=chunk.length;hash.update(chunk);yield chunk;}
    if(bytes!==asset.bytes||hash.digest('hex')!==asset.sha256)throw Error('Source changed during packaging');
   })());
   streams.push(stream);zip.file(asset.file,stream);
  }
  const bounded=new Transform({transform(chunk,encoding,callback){
   total+=chunk.length;callback(total>LIMIT?Error('ZIP output size limit'):null,chunk);
  }});
  const handle=await fs.open(temp,'wx');ownedTemp=true;
  try{await pipeline(zip.generateNodeStream({streamFiles:true,compression:'STORE',platform:'DOS'}),bounded,handle.createWriteStream({autoClose:true}));}
  finally{await handle.close();}
  await verify();await onProgress('verifying');
  await prepareLocalProject({zip:temp,out:verifiedRoot});
  const identity=await hashProtectedFile({root:parent,file:path.basename(temp)});
  await cleanupVerified();
  await verify();
  // A hard link publishes the finished file atomically without replacing an existing export.
  await fs.link(temp,out);
  return {out,revision:envelope.revision,projectSha256:initial.projectSha256,sha256:identity.sha256,bytes:identity.bytes,assets:inputs.length,navigationFiles:regional?.files.size||0,roundtripVerified:true};
 }finally{
  for(const stream of streams)stream.destroy();
  if(ownedTemp)await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await cleanupVerified();
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={},args=process.argv.slice(2);
 for(let i=0;i<args.length;i+=2){
  if(!['--root','--out'].includes(args[i])||!args[i+1]||options[args[i].slice(2)])throw Error('Usage: --root LOCAL_PROJECT --out NEW_ZIP');
  options[args[i].slice(2)]=args[i+1];
 }
 if(!options.root||!options.out)throw Error('Required --root and --out');
 console.log(JSON.stringify(await exportLocalProject(options)));
}
