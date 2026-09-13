// Explicit desktop preparation. This script is never shipped into viewer startup.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {inventoryProject} from './collision-source-identity.mjs';
import {startLocalProjectServer} from './local-project-server.mjs';
import {prepareProjectNavigation} from './prepare-project-navigation.mjs';
import {prepareNavigationRegion} from './prepare-navigation-region.mjs';
import {navigationRegionKey} from './navigation-region-contract.mjs';
import {prepareNavigationTransitions} from './prepare-navigation-transitions.mjs';
export async function prepareLocalNavigation({root,output,regions,onProgress=()=>{}}){
 if(regions){
  if(!Array.isArray(regions)||!regions.length||regions.length>32)throw Error('Expected 1-32 navigation regions');
  const keys=regions.map(bounds=>navigationRegionKey('0'.repeat(64),bounds));
  if(new Set(keys).size!==keys.length)throw Error('Duplicate navigation region');
 }
 root=path.resolve(root);output=path.resolve(output);
 try{await fs.lstat(output);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 const parent=path.dirname(output);if(await fs.realpath(parent)!==parent)throw Error('Output parent must not be a link');
 const before=await inventoryProject({root});
 const state=JSON.parse(await fs.readFile(path.join(root,'project-state.json'),'utf8')),project=state.project,originalWalk=project.walk;
 if(project.walk?.meshOnly||project.walk?.meshIds?.length||project.walk?.excludeIds?.length)throw Error('Custom collision selections need a separate navigation preparation profile');
 if(!project.layers.some(l=>l.type==='splat'&&l.visible!==false))throw Error('No visible splat sources');
 if(before.assets.reduce((sum,a)=>sum+a.bytes,0)>2*1024**3)throw Error('Desktop preparation asset limit exceeded');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nav-prepare-'));let service,browser,timer;
 try{
  for(const asset of before.assets){await fs.mkdir(path.dirname(path.join(temp,asset.file)),{recursive:true});await fs.copyFile(path.join(root,asset.file),path.join(temp,asset.file));}
  await fs.mkdir(path.join(temp,'history'));await fs.copyFile(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),path.join(temp,'viewer.html'));
  await fs.writeFile(path.join(temp,'project-state.json'),JSON.stringify(state));
  service=await startLocalProjectServer({root:temp});
  const require=createRequire(new URL('../../locahun3d_online/package.json',import.meta.url)),{chromium}=require('playwright');
  browser=await chromium.launch({channel:'chrome',headless:true});timer=setTimeout(()=>browser?.close(),180000);
  const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const hook=`window.prepareNavigationSource=async()=>{
   setCameraCollision(false);const original=_walkSaveSettings();_walkRestoreSettings({...walkSetup.settings,cellSize:.1,whole:null,navigation:null,boxes:[],signature:''});
   if(!await _walkGenerateCollision({automatic:true,allowBake:true}))throw Error(walkSetup.status);
   const sources=layers.filter(l=>l.type==='splat'&&l.visible!==false).map(l=>{
    const identity=_wholeIdentityCache.get(l.mesh)?.identity,match=identity?.match(/^sha256:([a-f0-9]{64})$/);
    if(!match)throw Error('Verified source SHA missing');l.mesh.updateMatrixWorld(true);
    return {sha256:match[1],matrix:[...l.mesh.matrixWorld.elements]};
   });
   const walk=_walkSaveSettings();let coarse;
   if(${!!regions}){
    _walkRestoreSettings({...original,cellSize:Math.max(.15,original.cellSize||.25),navigation:null,navigationRegions:undefined});
    if(!await _walkGenerateCollision({automatic:true,allowBake:true}))throw Error(walkSetup.status);
    coarse=_walkSaveSettings();
   }
   return {walk,sources,coarse};
  };`;
  await page.route('**/?localProject=1',async route=>{
   const response=await route.fetch(),html=await response.text(),at=html.lastIndexOf('</script>');
   if(at<0)throw Error('Canonical viewer script missing');await route.fulfill({response,body:html.slice(0,at)+hook+html.slice(at)});
  });
  await page.goto(service.url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.localProject?.ready||window.localProject?.status==='error',null,{timeout:60000});
  if(!await page.evaluate(()=>localProject.ready))throw Error('Project restore failed');
  onProgress('Preparing complete 0.1m collision');const evaluated=await page.evaluate(()=>prepareNavigationSource());project.walk=evaluated.walk;
  if(errors.length)throw Error(errors.join('\n'));
  await browser.close();browser=null;clearTimeout(timer);
  onProgress('Preparing lightweight navigation');let prepared,payloads=[];
  if(regions){
   let manifest;
   for(const bounds of regions){
    const bundle=await prepareNavigationRegion({sources:evaluated.sources,bounds,collision:Buffer.from(project.walk.whole.data,'base64'),collisionSource:project.walk.whole.key});
    if(!manifest)manifest=bundle.manifest;else manifest.regions.push(...bundle.manifest.regions);
    payloads.push(...bundle.payloads);
    if(payloads.reduce((n,p)=>n+p.bytes.length,0)>64*1024**2)throw Error('Navigation bundle size limit');
   }
   if(regions.length>=2&&regions.length<=4){
    onProgress('Verifying region transition clearance');
    const graph=await prepareNavigationTransitions(manifest,payloads);
    if(graph){manifest.graph=graph.entry;payloads.push({name:graph.name,bytes:graph.bytes});}
   }
   if(payloads.reduce((n,p)=>n+p.bytes.length,0)>64*1024**2)throw Error('Navigation bundle size limit');
   prepared={status:'generated',bytes:payloads.reduce((n,p)=>n+p.bytes.length,0),project:{...project,walk:{...originalWalk,...evaluated.coarse,navigationRegions:manifest}}};
  }else prepared=await prepareProjectNavigation(project);
  if(prepared.status!=='generated'&&prepared.status!=='reused')throw Error(prepared.status);
  const after=await inventoryProject({root});if(after.sceneIdentity!==before.sceneIdentity||after.projectSha256!==before.projectSha256)throw Error('Source changed during preparation; output not written');
  prepared.project._navigationPreparation={schema:1,revision:state.revision,projectSha256:before.projectSha256,assets:before.assets,...(regions?{sources:evaluated.sources}:{})};
  const json=JSON.stringify(prepared.project);if(Buffer.byteLength(json)>16*1024**2)throw Error('Prepared metadata limit exceeded');
  if(payloads.length){
   const assets=path.join(parent,'assets');await fs.mkdir(assets,{recursive:true});
   if((await fs.lstat(assets)).isSymbolicLink()||await fs.realpath(assets)!==assets)throw Error('Unsafe output assets directory');
   for(const item of payloads){
    const target=path.join(assets,item.name);
    try{await fs.writeFile(target,item.bytes,{flag:'wx'});}
    catch(error){if(error.code!=='EEXIST')throw error;if((await fs.lstat(target)).isSymbolicLink()||!Buffer.from(item.bytes).equals(await fs.readFile(target)))throw Error('Existing output asset differs');}
   }
  }
  await fs.writeFile(output,json,{flag:'wx'});
  return {output,key:prepared.project.walk.navigationRegions?.source||prepared.project.walk.whole.key,navigationBytes:prepared.bytes,status:prepared.status};
 }finally{
  clearTimeout(timer);await browser?.close();await service?.close();
  if(path.dirname(temp)!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('nav-prepare-'))throw Error('Unsafe cleanup target');
  await fs.rm(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!['--root','--output','--regions'].includes(args[i])||!args[i+1]||options[args[i].slice(2)])throw Error('Usage: --root LOCAL_PROJECT --output NEW_PROJECT_JSON [--regions BOUNDS_JSON]');options[args[i].slice(2)]=args[i+1];}
 if(options.regions)options.regions=JSON.parse(await fs.readFile(options.regions,'utf8'));
 if(!options.root||!options.output)throw Error('Required --root and --output');
 console.log(JSON.stringify(await prepareLocalNavigation({...options,onProgress:console.log})));
}
