import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';
import * as THREE from './avatar-assets/node_modules/three/build/three.module.js';
import {GLTFLoader} from './avatar-assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {NATIVE_ASSET} from './embed-male165.mjs';
const source=fs.readFileSync(new URL('../src/js/214_kawaii_walk_avatar.js',import.meta.url),'utf8');
const bytes=fs.readFileSync(new URL('../'+NATIVE_ASSET.relative,import.meta.url));
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const sha=b=>createHash('sha256').update(Buffer.from(b)).digest('hex');
const manifest={delivery:'lazy-glb',url:'/figures/'+NATIVE_ASSET.relative.split('/').at(-1),bytes:bytes.length,sha256:NATIVE_ASSET.sha256};
function fixture({fetcher,info={...manifest},href='https://fixture.invalid/viewer.html',crypto=webcrypto,timer=setTimeout}={}){
 let calls=0,parses=0;const requests=[];
 class Loader extends GLTFLoader{parse(...args){parses++;return super.parse(...args);}}
 const ctx=vm.createContext({THREE,URL,DataView,Uint8Array,ArrayBuffer,crypto,AbortController,setTimeout:timer,clearTimeout,
  window:{location:new URL(href),KAWAII_MALE_ASSET_INFO:info},_addonLoader:async()=>Loader,
  _b64ToArrayBuffer:s=>ab(Buffer.from(s,'base64')),
  fetch:async(url,options)=>{calls++;requests.push({url,options});return fetcher?fetcher(url,options,calls):new Response(bytes);}});
 vm.runInContext(source,ctx);return {ctx,requests,get calls(){return calls;},get parses(){return parses;},resolve:options=>ctx._resolveKawaiiAvatarData(options)};
}
test('loading the runtime with an online manifest performs zero GETs',()=>{const f=fixture();assert.equal(f.calls,0);assert.equal(f.parses,0);});
test('explicit modelData Promise and offline embedded bytes bypass networking',async()=>{
 const f=fixture();assert.equal(await f.resolve({modelData:Promise.resolve(ab(bytes))}).then(sha),NATIVE_ASSET.sha256);assert.equal(f.calls,0);
 const offline=fixture({href:'file:///F:/viewer.html'});offline.ctx.window.KAWAII_MALE_GLB_B64=bytes.toString('base64');assert.equal(sha(await offline.resolve()),NATIVE_ASSET.sha256);assert.equal(offline.calls,0);
});
test('first concurrent use fetches once and parses all six real clips per avatar',async t=>{
 const f=fixture();const avatars=await Promise.all([1,2].map(()=>f.ctx._buildKawaiiWalkAvatar(1.65,{loadIKSolver:async()=>null})));
 for(const avatar of avatars){const api=avatar.userData.kawaiiAnimation;t.after(()=>api.dispose());assert.equal(api.motionMode,'embedded');for(const name of ['idle','walk','run','jump','land','stop'])assert(api.actions[name].getClip().tracks.length>0);}
 assert.equal(f.calls,1);assert.equal(f.parses,2);assert.equal(sha(await f.resolve()),NATIVE_ASSET.sha256);assert.equal(f.calls,1);
 assert.equal(f.requests[0].options.redirect,'error');assert.equal(f.requests[0].options.credentials,'same-origin');
});
test('network and HTTP failures are explicit, uncached, and never fall back to legacy',async()=>{
 for(const mode of ['network','http']){const f=fixture({fetcher:(url,options,n)=>{if(n===1){if(mode==='network')throw new Error('offline');return new Response('missing',{status:404});}return new Response(bytes);}});f.ctx.window.KAWAII_WALK_GLB_B64=bytes.toString('base64');await assert.rejects(f.ctx._buildKawaiiWalkAvatar(1.65),mode==='network'?/download.*offline/i:/HTTP 404/);assert.equal(f.parses,0);assert.equal(sha(await f.resolve()),NATIVE_ASSET.sha256);assert.equal(f.calls,2);}
});
test('wrong SHA, short payload, and malformed GLB cannot reach the parser',async()=>{
 const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
 const malformed=Buffer.from(bytes);malformed.writeUInt32LE(0,0);
 for(const [data,info,error] of [[corrupt,manifest,/SHA-256/],[bytes.subarray(1),manifest,/size/i],[malformed,{...manifest,sha256:sha(malformed)},/GLB/i]]){const f=fixture({info,fetcher:()=>new Response(data)});await assert.rejects(f.ctx._buildKawaiiWalkAvatar(1.65),error);assert.equal(f.parses,0);}
});
test('oversized streamed bodies are cancelled before accumulating beyond the limit',async()=>{
 let cancelled=false;const f=fixture({info:{...manifest,bytes:24},fetcher:()=>({ok:true,body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(25)}),cancel:async()=>{cancelled=true;},releaseLock(){}})}})});
 await assert.rejects(f.resolve(),/size/i);assert(cancelled);
});
test('invalid manifest, cross-origin URL, file manifest and missing SHA support fail before GET',async()=>{
 for(const options of [{info:{...manifest,sha256:'bad'}},{info:{...manifest,bytes:0}},{info:{...manifest,url:'https://other.invalid/avatar.glb'}},{info:{...manifest,url:'data:application/octet-stream,a'}},{href:'file:///F:/viewer.html'},{crypto:{}}]){const f=fixture(options);await assert.rejects(f.resolve(),/manifest|origin|HTTP|SHA|HTTPS|embedded/i);assert.equal(f.calls,0);}
});
test('download timeout rejects and clears the shared request for a retry',async()=>{
 let timers=0;const f=fixture({timer:fn=>{if(++timers===1){queueMicrotask(fn);return 1;}return setTimeout(fn,45000);},fetcher:(url,{signal},n)=>n===1?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))):new Response(bytes)});
 await assert.rejects(f.resolve(),/timeout|aborted/i);assert.equal(sha(await f.resolve()),NATIVE_ASSET.sha256);assert.equal(f.calls,2);
});
test('online descriptors select exact same-origin routes without an embedded payload',async()=>{
 const {renderViewerOnlineDescriptor}=await import('./embed-male165-online.mjs');
 for(const basePath of ['/figures','/viewer/figures']){const html=renderViewerOnlineDescriptor({basePath}),ctx=vm.createContext({window:{}});assert(html.length<1200);assert(!html.includes('KAWAII_MALE_GLB_B64'));vm.runInContext(html.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);const info=ctx.window.KAWAII_MALE_ASSET_INFO;assert.equal(info.url,basePath+'/'+NATIVE_ASSET.relative.split('/').at(-1));assert.equal(info.sha256,NATIVE_ASSET.sha256);assert.equal(info.bytes,bytes.length);assert.equal(info.delivery,'lazy-glb');assert.equal(info.motionRights,'Adobe Mixamo motion, not CC0');}
 assert.throws(()=>renderViewerOnlineDescriptor({basePath:'https://other.invalid'}),/path/i);
});
test('private descriptor CLI leaves both canonical payloads unchanged and rejects repo output',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'male165-online-descriptor-'));
 t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('male165-online-descriptor-'));fs.rmSync(dir,{recursive:true,force:true});});
 const root=fileURLToPath(new URL('../',import.meta.url)),script=fileURLToPath(new URL('./embed-male165-online.mjs',import.meta.url));
 const protectedFiles=['src/assets/male165_glb_b64.html','src/assets/male165_glb_b64.online.html'];
 const before=protectedFiles.map(p=>sha(fs.readFileSync(path.join(root,p)))),output=path.join(dir,'online.html');
 execFileSync(process.execPath,[script,'--base-path','/viewer/figures','--out',output],{stdio:'pipe',windowsHide:true});
 const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(output,'utf8').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,''),ctx);
 assert(ctx.window.KAWAII_MALE_ASSET_INFO.url.startsWith('/viewer/figures/'));
 assert.throws(()=>execFileSync(process.execPath,[script,'--out',path.join(root,protectedFiles[0])],{stdio:'pipe',windowsHide:true}));
 assert.deepEqual(protectedFiles.map(p=>sha(fs.readFileSync(path.join(root,p)))),before);
});
