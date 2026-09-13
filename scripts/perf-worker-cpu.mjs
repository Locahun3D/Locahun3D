import fs from 'node:fs';
import vm from 'node:vm';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import * as THREE from 'file:///F:/Htlml/kawaii-motion/node_modules/three/build/three.module.js';
const out='F:/Codex/locahun-performance-20260911';
const baseline=JSON.parse(fs.readFileSync(out+'/final-before.json'));
const bundle=fs.readFileSync(new URL('../vendor/spark-2.0.0-workers16-incrtraverse.module.js',import.meta.url),'utf8');
const a=bundle.indexOf('const jsContent = ');
let workerSource=vm.runInNewContext(bundle.slice(a,bundle.indexOf('\n',a))+'\njsContent');
const candidatePath=process.env.PERF_WASM;
let candidateHash;
if(candidatePath){const replacement=fs.readFileSync(candidatePath);candidateHash=createHash('sha256').update(replacement).digest('hex');workerSource=workerSource.replace(/(data:application\/wasm;base64,)[A-Za-z0-9+/=]+/,'$1'+replacement.toString('base64'));}
workerSource=workerSource.replace('const result = await handler(args, { sendStatus });','const __start=performance.now();globalThis.__wasmMs=null;const result = await handler(args, { sendStatus });');
workerSource=workerSource.replace('self.postMessage({ id, result },','self.postMessage({ id, result, timing:{serviceMs:performance.now()-__start,wasmMs:globalThis.__wasmMs} },');
workerSource=workerSource.replace('const result = traverse_lod_trees(','const __wstart=performance.now();const result = traverse_lod_trees(');
workerSource=workerSource.replace('const { instanceIndices, chunks, pixelLimit, resumed } = result;','globalThis.__wasmMs=performance.now()-__wstart;const { instanceIndices, chunks, pixelLimit, resumed } = result;');
const prefix=`const {parentPort}=require('node:worker_threads');const inspector=require('node:inspector');const session=new inspector.Session();session.connect();session.post('Profiler.enable');const listeners=new Set();globalThis.self={location:{href:'http://127.0.0.1/'},postMessage:(v,o)=>parentPort.postMessage(v,o?.transfer),addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},removeEventListener:(type,fn)=>listeners.delete(fn)};parentPort.on('message',data=>{if(data.name==='__profileStart'||data.name==='__profileStop'){session.post(data.name==='__profileStart'?'Profiler.start':'Profiler.stop',(error,result)=>parentPort.postMessage({id:data.id,result,error}));return;}for(const fn of [...listeners])fn({data});});`;
const worker=new Worker(prefix+workerSource,{eval:true});
const pending=new Map();let nextId=1;
worker.on('message',m=>{if(m.status)return;const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(String(m.error))):p.resolve(m);});
worker.on('error',e=>{for(const p of pending.values())p.reject(e);pending.clear();});
worker.on('exit',code=>{for(const p of pending.values())p.reject(new Error('Worker exited: '+code));pending.clear();});
async function call(name,args,blockMs=0){const id=nextId++,start=performance.now();const p=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));worker.postMessage({id,name,args});if(blockMs){const end=performance.now()+blockMs;while(performance.now()<end){Math.sqrt(performance.now());}}const result=await p;return {...result,roundTripMs:performance.now()-start};}
const profiling=process.env.PERF_WORKER_PROFILE==='1';
const report={sourceHash:createHash('sha256').update(bundle).digest('hex'),wasmHash:createHash('sha256').update(Buffer.from(workerSource.match(/data:application\/wasm;base64,([A-Za-z0-9+/=]+)/)[1],'base64')).digest('hex'),candidatePath,candidateHash,nodeVersion:process.version,scene:baseline.project,kind:'CPU-only Node worker, actual shipped WASM and local RAD; no GPU/no collision',threeRevision:THREE.REVISION,fov:90,pixelHeight:1350,profiling,decode:[],traversals:[]};
const timeout=setTimeout(()=>{worker.terminate();console.error('CPU probe timed out');process.exitCode=1;},100000);
try{
 const {result:{lodId}}=await call('newLodTree',{capacity:16777216});
 const ranges=[...new Map(baseline.transfers.filter(r=>r.start>0).map(r=>[r.start,r])).values()].sort((a,b)=>a.start-b.start);
 const file=baseline.project+ranges[0].file,fd=fs.openSync(file,'r');let codes={},numSplats=0;
 report.radHash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 report.projectStateHash=createHash('sha256').update(fs.readFileSync(baseline.project+'/project-state.json')).digest('hex');
 try{for(let i=0;i<ranges.length;i++){
  const r=ranges[i],bytes=Buffer.alloc(r.end-r.start+1);fs.readSync(fd,bytes,0,bytes.length,r.start);
  const decoded=await call('loadPackedSplats',{fileBytes:new Uint8Array(bytes),pathName:'scene.rad',...codes});
  const d=decoded.result.lodSplats;if(!d?.extra?.lodTree)throw new Error('No decoded hierarchy');
  for(const name of ['sh1Codes','sh2Codes','sh3Codes'])if(d.extra[name])codes[name]=d.extra[name];
  const update=await call('updateLodTrees',{ranges:[{lodId,pageBase:i*65536,chunkBase:i*65536,count:d.numSplats,lodTreeData:d.extra.lodTree}]});
  numSplats+=d.numSplats;report.decode.push({chunk:i,ms:decoded.timing.serviceMs,roundTripMs:decoded.roundTripMs,updateMs:update.timing.serviceMs});
  if(i%32===0)console.log('CPU RAD decoded',i,'/',ranges.length);
 }}finally{fs.closeSync(fd);}
 report.decodedSplats=numSplats;
 const layer=JSON.parse(fs.readFileSync(baseline.project+'/project-state.json')).project.layers[0];
 const objectToWorld=new THREE.Matrix4().compose(new THREE.Vector3(layer.pos.x,layer.pos.y,layer.pos.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(layer.rot.x*Math.PI/180,layer.rot.y*Math.PI/180,layer.rot.z*Math.PI/180)),new THREE.Vector3(1,1,1));
 const inverse=objectToWorld.clone().invert();
 const poses=baseline.data.traversals.filter(x=>x.quat?.length===4);
 let lastPixelLimit=0;
 if(profiling)await call('__profileStart',{});
 for(let i=0;i<Math.min(Number(process.env.PERF_WORKER_VIEWS)||(profiling?2:5),poses.length);i++){
  const recorded=poses[poses.length-1-i],q=new THREE.Quaternion().fromArray(recorded.quat),cameraToWorld=new THREE.Matrix4().compose(new THREE.Vector3(...baseline.initial.pose.position),q,new THREE.Vector3(1,1,1));
  const args={cacheSlot:0,maxSplats:5000000,pixelScaleLimit:2*Math.tan(90*Math.PI/360)/1350,lastPixelLimit,instances:{scene:{lodId,rootPage:0,viewToObjectCols:inverse.clone().multiply(cameraToWorld).elements,lodScale:3,behindFoveate:.2,coneFov0:90,coneFov:120,coneFoveate:.4}}};
  for(const kind of ['changed-view','same-view']){
   const r=await call('traverseLodTrees',args);lastPixelLimit=r.result.pixelLimit;args.lastPixelLimit=lastPixelLimit;
   const indices=r.result.keyIndices.scene.indices;
   const n=r.result.keyIndices.scene.numSplats;
   const rec={i,kind,viewToObjectCols:args.instances.scene.viewToObjectCols,roundTripMs:r.roundTripMs,...r.timing,resumed:r.result.resumed,numSplats:n,indexHash:createHash('sha256').update(indices).digest('hex'),sortedIndexHash:createHash('sha256').update(indices.slice(0,n).sort()).digest('hex')};report.traversals.push(rec);console.log({...rec,viewToObjectCols:undefined});
  }
 }
 if(profiling)report.profile=(await call('__profileStop',{})).result.profile;
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{clearTimeout(timeout);await worker.terminate();fs.writeFileSync(out+'/'+(process.env.PERF_WORKER_LABEL||(profiling?'worker-cpu-profile':'worker-cpu'))+'.json',JSON.stringify(report,null,2));}
