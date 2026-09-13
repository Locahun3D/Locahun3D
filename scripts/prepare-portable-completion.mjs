import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {prepareLocalProject} from './prepare-local-project.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const modules=['completed-project-server.mjs','completed-export-job.mjs','export-local-project.mjs','prepare-local-project.mjs','local-project-server.mjs','local-viewer-cache.mjs','viewer-update-core.cjs','collision-source-identity.mjs','prepare-project-navigation.mjs','validate-navigation-bundle.mjs','navigation-region-contract.mjs','navigation-transition-graph.mjs','upload-completed-project.mjs','verify-uploaded-export.mjs'];
const codecs=['216_walk_settings','216b_whole_collision','403_navigation_cache','403n_navigation_transition_graph'];

async function copyRegular(source,target){
 const stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Non-regular bundle input: '+source);
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target,fs.constants.COPYFILE_EXCL);
}
async function copyPackage(source,target,ancestors=[]){
 const real=await fs.realpath(source);if(real!==path.resolve(source)||ancestors.includes(real))throw Error('Unsafe or cyclic dependency: '+source);
 const metadata=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
 async function walk(from,to){
  await fs.mkdir(to,{recursive:true});
  for(const entry of await fs.readdir(from,{withFileTypes:true})){
   if(entry.name==='node_modules')continue;
   const a=path.join(from,entry.name),b=path.join(to,entry.name);
   if(entry.isSymbolicLink())throw Error('Linked dependency input: '+a);
   if(entry.isDirectory())await walk(a,b);else await copyRegular(a,b);
  }
 }
 await walk(source,target);
 const require=createRequire(path.join(source,'package.json'));
 for(const name of Object.keys(metadata.dependencies||{})){
  if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)||name.includes('..'))throw Error('Invalid dependency name');
  await copyPackage(path.dirname(require.resolve(name+'/package.json')),path.join(target,'node_modules',name),[...ancestors,real]);
 }
}

export async function preparePortableCompletion({zip,out}){
 if(!zip||!out)throw Error('Required --zip and --out');
 if(process.platform!=='win32'||process.arch!=='x64'||Number(process.versions.node.split('.')[0])<24)throw Error('Build requires Windows x64 Node 24 or newer');
 out=path.resolve(out);
 const parent=path.dirname(out);if(await fs.realpath(parent)!==parent)throw Error('Output parent must be a real existing directory');
 const require=createRequire(import.meta.url);let zipPackage;
 try{zipPackage=require.resolve('jszip/package.json');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;zipPackage=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/jszip/package.json');}
 const nodeLicense=path.join(path.dirname(process.execPath),'LICENSE');await fs.access(nodeLicense);
 await fs.mkdir(out); // Never overwrite an existing bundle, including incomplete ones.
 await prepareLocalProject({zip,out:path.join(out,'Project')});
 await copyRegular(nodeLicense,path.join(out,'Project/runtime/LICENSE'));
 await fs.mkdir(path.join(out,'Exports'));
 for(const name of modules)await copyRegular(path.join(here,name),path.join(out,'tools/scripts',name));
 for(const name of codecs)await copyRegular(path.join(here,'../src/js',name+'.js'),path.join(out,'tools/src/js',name+'.js'));
 await copyRegular(path.join(here,'../Locahun3D_OfflineViewer.html'),path.join(out,'tools/Locahun3D_OfflineViewer.html'));
 await copyPackage(path.dirname(zipPackage),path.join(out,'tools/node_modules/jszip'));
 const launch='@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "LOCAHUN_PACKAGE_ROOT=%~dp0"\r\npowershell.exe -NoProfile -Command "$r=$env:LOCAHUN_PACKAGE_ROOT; $q=[char]34; $n=Join-Path $r \'Project/runtime/node.exe\'; $s=Join-Path $r \'tools/scripts/completed-project-server.mjs\'; $p=Join-Path $r \'Project\'; $j=Join-Path $r \'Exports\'; $a=$q+$s+$q+\' --root \'+$q+$p+$q+\' --jobs \'+$q+$j+$q; if($env:LOCAHUN_NO_OPEN -eq \'1\'){$a+=\' --no-open\'}; Start-Process -FilePath $n -ArgumentList $a -WindowStyle Hidden -RedirectStandardOutput (Join-Path $r \'server.log\') -RedirectStandardError (Join-Path $r \'server-error.log\')"\r\n';
 await fs.writeFile(path.join(out,'Start_AutoExport.cmd'),launch,{flag:'wx'});
 await fs.writeFile(path.join(out,'README.txt'),'Start_AutoExport.cmd opens Project with automatic verified export on Editing Complete.\r\nKeep this entire folder together when moving PCs. Close an existing project server first.\r\nExports are stored outside Project in Exports. Editing Complete does not upload, publish or share.\r\nThe original Project launcher remains available but does not enable automatic export.\r\nWindows x64 Node runtime and dependency licenses are included. Viewer online dependencies remain.\r\nIf packaging fails, the incomplete NEW output is retained; do not use it as a finished package.\r\n',{flag:'wx'});
 return {out,project:path.join(out,'Project'),jobs:path.join(out,'Exports'),portableCompletion:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){const key=args[i].slice(2);if(!['--zip','--out'].includes(args[i])||!args[i+1]||options[key])throw Error('Usage: --zip SOURCE --out NEW_DIRECTORY');options[key]=args[i+1];}
 console.log(JSON.stringify(await preparePortableCompletion(options)));
}
