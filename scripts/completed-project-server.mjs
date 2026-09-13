import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLocalProjectServer,openBrowser} from './local-project-server.mjs';
import {runCompletedExportJob} from './completed-export-job.mjs';
import {uploadCompletedProject} from './upload-completed-project.mjs';

export async function startCompletedProjectServer({root,jobs,port=0,autoUpdate=true,upload,onProgress=()=>{}}){
 root=path.resolve(root);jobs=path.resolve(jobs);
 if(jobs===root||jobs.startsWith(root+path.sep)||await fs.realpath(jobs)!==jobs||(await fs.lstat(jobs)).isSymbolicLink()||!(await fs.stat(jobs)).isDirectory())throw Error('Jobs must be an existing directory outside the source');
 return startLocalProjectServer({root,port,autoUpdate,onCompleted:async()=>{
  const result=upload?await uploadCompletedProject({...upload,root,jobs,onProgress}):await runCompletedExportJob({root,jobs,onProgress});
  if(result.status==='waiting_for_edit')throw Error('Project returned to draft');
 }});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!['--root','--jobs','--port'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Usage: --root PROJECT --jobs EXPORT_DIRECTORY [--port PORT]');options[args[i]]=args[i+1];}
 if(!options['--root']||!options['--jobs'])throw Error('Required --root and --jobs');
 const running=await startCompletedProjectServer({root:options['--root'],jobs:options['--jobs'],port:Number(options['--port']||0),onProgress:phase=>console.error(phase)});
 console.log(running.url);
 openBrowser(running.url);
 const stop=()=>running.close().catch(()=>{process.exitCode=1;});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
