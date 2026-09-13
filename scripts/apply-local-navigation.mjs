import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {inventoryProject,hashProtectedFile} from './collision-source-identity.mjs';
import {prepareProjectNavigation} from './prepare-project-navigation.mjs';
import {validateNavigationBundle} from './validate-navigation-bundle.mjs';
import {navigationSourceKey} from './navigation-region-contract.mjs';
import {startLocalProjectServer} from './local-project-server.mjs';
export async function applyLocalNavigation({root,prepared}){
 root=path.resolve(root);prepared=path.resolve(prepared);
 const stat=await fs.lstat(prepared);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024**2)throw Error('Invalid prepared file');
 const input=JSON.parse(await fs.readFile(prepared,'utf8')),binding=input._navigationPreparation;
 if(binding?.schema!==1||!Number.isSafeInteger(binding.revision)||!binding.projectSha256||!Array.isArray(binding.assets))throw Error('Missing preparation binding');
 const verify=async()=>{
  const current=await inventoryProject({root});
  if(current.projectSha256!==binding.projectSha256||!isDeepStrictEqual(current.assets,binding.assets))throw Error('Project or source changed after preparation');
 };
 await verify();
 let regional,checked;
 if(input.walk?.navigationRegions){
  regional=await validateNavigationBundle(input.walk.navigationRegions,async(name,bytes)=>{
   const dir=path.dirname(prepared),identity=await hashProtectedFile({root:dir,file:name});
   if(identity.bytes!==bytes)throw Error('Navigation asset size mismatch');
   return fs.readFile(path.join(dir,name));
  });
  if(input.walk.whole){
   const cell=input.walk.cellSize,sources=binding.sources;
   if(!Number.isFinite(cell)||cell<.15||cell>1||navigationSourceKey(sources)!==regional.manifest.source)throw Error('Invalid coarse navigation source');
   const key=createHash('sha256').update(JSON.stringify(['whole-tiles-v1',cell,sources.map(s=>({identity:'sha256:'+s.sha256,matrix:s.matrix}))])).digest('hex');
   if(input.walk.whole.key!==key)throw Error('Coarse collision source mismatch');
   checked=await prepareProjectNavigation(input);
   if(checked.status!=='unsupported-cell-size')throw Error('Expected coarse collision');
  }
 }else{
  if(!input.walk?.navigation||input.walk.navigation.key!==input.walk.whole?.key)throw Error('Missing matching navigation');
  checked=await prepareProjectNavigation(input);if(checked.status!=='reused')throw Error('Invalid prepared navigation');
 }
 const service=await startLocalProjectServer({root});
 try{
  const endpoint=new URL('api/project',service.url),response=await fetch(endpoint);if(!response.ok)throw Error('Project read failed');
  const current=await response.json();if(current.revision!==binding.revision)throw Error('Project revision changed after preparation');
  if(regional){
   const assets=path.join(root,'assets');
   if((await fs.lstat(assets)).isSymbolicLink()||await fs.realpath(assets)!==assets)throw Error('Unsafe assets directory');
   for(const [name,bytes] of regional.files){
    try{await fs.writeFile(path.join(root,name),bytes,{flag:'wx'});}
    catch(error){
     if(error.code!=='EEXIST')throw error;
     await hashProtectedFile({root,file:name});
     if(!Buffer.from(bytes).equals(await fs.readFile(path.join(root,name))))throw Error('Existing navigation asset differs');
    }
   }
  }
  await verify();
  // Preserve every non-navigation project field; use the server's lock/history/revision path.
  const project={...current.project,walk:regional?{...current.project.walk,
   ...(input.walk.whole?{whole:input.walk.whole,cellSize:input.walk.cellSize,signature:input.walk.signature,boxes:[],navigation:null}:{}),
   navigationRegions:regional.manifest}:checked.project.walk};
  const result=await fetch(endpoint,{method:'POST',headers:{Origin:endpoint.origin,'Content-Type':'application/json'},
   body:JSON.stringify({revision:current.revision,status:'draft',project})});
  if(!result.ok)throw Error('Navigation application rejected: '+result.status+' '+await result.text());
  const saved=await result.json();return {revision:saved.revision,key:regional?regional.manifest.source:project.walk.navigation.key};
 }finally{await service.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!['--root','--prepared'].includes(args[i])||!args[i+1]||options[args[i].slice(2)])throw Error('Usage: --root LOCAL_PROJECT --prepared PREPARED_JSON');options[args[i].slice(2)]=args[i+1];}
 if(!options.root||!options.prepared)throw Error('Required --root and --prepared');
 console.log(JSON.stringify(await applyLocalNavigation(options)));
}
