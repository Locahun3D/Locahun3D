import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {inventoryProject,hashProtectedFile} from './collision-source-identity.mjs';
import {exportLocalProject} from './export-local-project.mjs';
import {validateNavigationBundle} from './validate-navigation-bundle.mjs';

export async function runCompletedExportJob({root,jobs,onProgress=()=>{}}){
 root=path.resolve(root);jobs=path.resolve(jobs);
 if(jobs===root||jobs.startsWith(root+path.sep))throw Error('Jobs must be outside the source package');
 if(await fs.realpath(jobs)!==jobs||(await fs.lstat(jobs)).isSymbolicLink())throw Error('Unsafe jobs directory');
 const input=await inventoryProject({root}),bytes=await fs.readFile(path.join(root,'project-state.json'));
 if(createHash('sha256').update(bytes).digest('hex')!==input.projectSha256)throw Error('Source changed during job snapshot');
 const state=JSON.parse(bytes);
 if(state.status==='draft')return {status:'waiting_for_edit',revision:state.revision};
 if(state.status!=='editing_complete'||!Number.isSafeInteger(state.revision)||state.revision<0)throw Error('Invalid completed revision');
 const binding={revision:state.revision,projectSha256:input.projectSha256,sceneIdentity:input.sceneIdentity};
 const key=createHash('sha256').update(JSON.stringify(binding)).digest('hex');
 const directory=path.join(jobs,key),archive=path.join(directory,'project.zip');
 const verifySource=async()=>{
  const current=await inventoryProject({root});
  if(current.projectSha256!==input.projectSha256||current.sceneIdentity!==input.sceneIdentity)throw Error('Source changed during export job');
  if(state.project.walk?.navigationRegions)await validateNavigationBundle(state.project.walk.navigationRegions,async(name,length)=>{
   const identity=await hashProtectedFile({root,file:name});if(identity.bytes!==length)throw Error('Navigation length mismatch');
   return fs.readFile(path.join(root,name));
  });
 };
 const reuse=async()=>{
  const identity=await hashProtectedFile({root:directory,file:'receipt.json'});
  if(identity.bytes>32768)throw Error('Receipt size limit');
  const receiptBytes=await fs.readFile(path.join(directory,'receipt.json'));
  if(createHash('sha256').update(receiptBytes).digest('hex')!==identity.sha256)throw Error('Receipt changed during read');
  const receipt=JSON.parse(receiptBytes);
  if(receipt.schema!==1||receipt.roundtripVerified!==true||!isDeepStrictEqual(receipt.input,binding)||receipt.archive?.file!=='project.zip'||!/^[a-f0-9]{64}$/.test(receipt.archive.sha256)||!Number.isSafeInteger(receipt.archive.bytes)||receipt.archive.bytes<1||receipt.archive.bytes>2*1024**3)throw Error('Receipt binding mismatch');
  const stat=await fs.lstat(archive);if(stat.size!==receipt.archive.bytes)throw Error('Archive size mismatch');
  const actual=await hashProtectedFile({root:directory,file:'project.zip'});
  if(actual.sha256!==receipt.archive.sha256)throw Error('Archive digest mismatch');
  await verifySource();return {status:'reused',key,directory,archive,revision:state.revision,sha256:actual.sha256};
 };
 let exists=false;try{await fs.lstat(directory);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(exists)return reuse();
 const stage=await fs.mkdtemp(path.join(jobs,'.pending-export-'));
 let published=false;
 try{
  const result=await exportLocalProject({root,out:path.join(stage,'project.zip'),onProgress});
  if(result.projectSha256!==binding.projectSha256||result.revision!==binding.revision)throw Error('Export snapshot changed');
  const receipt={schema:1,input:binding,archive:{file:'project.zip',sha256:result.sha256,bytes:result.bytes},roundtripVerified:true};
  await fs.writeFile(path.join(stage,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  await verifySource();
  // Only complete directories become job results. An interrupted private stage can be retried.
  try{await fs.rename(stage,directory);published=true;}
  catch(e){
   if(!['EEXIST','ENOTEMPTY','EPERM'].includes(e.code))throw e;
   return await reuse();
  }
  return {status:'created',key,directory,archive,revision:state.revision,sha256:result.sha256};
 }finally{
  if(!published){
   if(path.dirname(stage)!==jobs||await fs.realpath(stage)!==stage||(await fs.lstat(stage)).isSymbolicLink())throw Error('Unsafe job cleanup path');
   await fs.rm(stage,{recursive:true});
  }
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!['--root','--jobs'].includes(args[i])||!args[i+1]||options[args[i].slice(2)])throw Error('Usage: --root LOCAL_PROJECT --jobs EXISTING_JOB_DIRECTORY');options[args[i].slice(2)]=args[i+1];}
 if(!options.root||!options.jobs)throw Error('Required --root and --jobs');
 console.log(JSON.stringify(await runCompletedExportJob(options)));
}
