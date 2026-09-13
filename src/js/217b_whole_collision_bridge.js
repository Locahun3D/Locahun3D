const _wholeIdentityCache=new WeakMap();
const _wholeByteCache=new Map();
function _wholeCacheOnly(job){return !!job.options.automatic&&!job.options.allowBake;}
function _wholeDeferred(){
  const error=new Error('当たり判定は未準備です。通常閲覧は続けられます。歩行時に準備します。');
  error.collisionDeferred=true;return error;
}
async function _wholeSourceFetch(url,method,mesh,job){
  _walkCheckJob(job);
  if(job.abortController?.signal.aborted)throw new Error('生成をキャンセルしました。');
  const controller=typeof AbortController==='function'?new AbortController():null;
  const abort=()=>controller?.abort();
  job.abortController?.signal.addEventListener('abort',abort,{once:true});
  let timer;
  try{
    const request=fetch(url,{method,headers:mesh.paged?.requestHeader,
      credentials:mesh.paged?.withCredentials?'include':'same-origin',
      ...(method==='HEAD'?{cache:'no-cache'}:{}),signal:controller?.signal});
    const response=await _walkAwait(Promise.race([request,new Promise((_,reject)=>{
      timer=setTimeout(()=>{abort();reject(new Error('Source identity request timed out'));},method==='HEAD'?5000:60000);
    })]),job);
    _walkCheckJob(job);
    return response;
  }catch(error){abort();throw error;}
  finally{clearTimeout(timer);if(method==='HEAD')job.abortController?.signal.removeEventListener('abort',abort);}
}
function _wholeLocalDigestIdentity(url,etag){
  if(!globalThis.localProject)return null;
  try{
    const page=new URL(globalThis.location.href),asset=new URL(url,page);
    const digest=/^"sha256-([a-f0-9]{64})"$/.exec(etag||'');
    const prefix=new URL('./assets/',page).pathname;
    if(!digest||page.protocol!=='http:'||page.hostname!=='127.0.0.1'||asset.origin!==page.origin||
      asset.search||asset.hash||asset.username||asset.password||!asset.pathname.startsWith(prefix)||
      asset.pathname.slice(prefix.length).includes('/'))return null;
    // Our local server hashes the bytes, not the filename; its port/token changes per launch.
    return 'sha256:'+digest[1];
  }catch(_){return null;}
}
function _wholeCanonicalSourceUrl(url){
  try{
    const parsed=new URL(url,globalThis.location?.href);
    const demoPath='/api/demo-asset/Kousaten_ForDemo_point_cloud.rad';
    if(['https://locahun3d.com','https://viewer.locahun3d.com'].includes(parsed.origin)&&
      parsed.pathname===demoPath&&!parsed.href.includes('?')&&!parsed.hash&&!parsed.username&&!parsed.password)
      return 'https://viewer.locahun3d.com'+demoPath;
    return parsed.href;
  }catch(_){return url;}
}
async function _wholePersistentCache(method,key,bytes,job){
  _walkCheckJob(job);let timer;
  try{
    const operation=Promise.resolve().then(()=>{
      const cache=globalThis.LocahunCollisionCache;
      return method==='get'?cache?.get?.(key):cache?.put?.(key,bytes);
    }).catch(()=>null);
    const result=await _walkAwait(Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1750);})]),job);
    _walkCheckJob(job);return result;
  }finally{clearTimeout(timer);}
}
async function _wholeHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function _wholeBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function _wholeUnbase64(s){const b=atob(s),bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);return bytes;}
async function _wholeReadResponse(response,maxBytes,job){
  const length=Number(response.headers.get('content-length'));
  if(!Number.isSafeInteger(length)||length<=0||length>maxBytes){await response.body?.cancel();throw new Error('Invalid collision source content length');}
  const reader=response.body?.getReader();
  if(!reader)throw new Error('Missing collision source body');
  const chunks=[];let total=0;
  try{
    while(true){
      const {value,done}=await _walkAwait(reader.read(),job);_walkCheckJob(job);if(done)break;
      total+=value.byteLength;if(total>length||total>maxBytes)throw new Error('Collision source content length exceeded');
      chunks.push(value);
    }
    if(total!==length)throw new Error('Incomplete collision source content length');
    const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return bytes;
  }catch(error){reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
}
async function _wholeSourceIdentity(layer,job){
  const mesh=layer.mesh;
  const url=mesh.paged?.rootUrl||layer._streamUrl;
  const cached=_wholeIdentityCache.get(mesh);
  if(cached?.url===url&&cached?.raw===layer._rawBuffer)return cached.identity;
  let identity;
  const saved=walkSetup.settings.whole;
  // Resident originals may be checked once to recover a saved local proxy, never fetched for this purpose.
  const verifySaved=saved&&/^[a-f0-9]{64}$/.test(saved.key)&&typeof saved.data==='string'&&saved.data.length>0&&saved.data.length<=24*1024*1024;
  if(layer._rawBuffer?.byteLength&&(!_wholeCacheOnly(job)||verifySaved)){identity='sha256:'+await _wholeHash(layer._rawBuffer);}
  else if(url){
    let response;
    if(!url.startsWith('blob:')){
      try{response=await _wholeSourceFetch(url,'HEAD',mesh,job);}
      catch(error){_walkCheckJob(job);}
    }
    _walkCheckJob(job);
    if(response?.status===401||response?.status===403)throw new Error('判定用データの閲覧権限を確認できません。');
    const etag=response?.headers.get('etag'),length=response?.headers.get('content-length');
    if(response?.ok&&etag&&!etag.startsWith('W/')&&/^\d+$/.test(length||''))identity=_wholeLocalDigestIdentity(url,etag)||'etag:'+await _wholeHash(new TextEncoder().encode(_wholeCanonicalSourceUrl(url)))+':'+etag+':'+length;
    else{
      if(_wholeCacheOnly(job))throw _wholeDeferred();
      const fetched=await _wholeSourceFetch(url,'GET',mesh,job);if(!fetched.ok)throw new Error('判定用の元データを確認できません。');
      const size=Number(fetched.headers.get('content-length'));
      if(!Number.isFinite(size)||size<=0||size>512*1024*1024){await fetched.body?.cancel();throw new Error('このデータは内容識別子付きの配信が必要です。');}
      identity='sha256:'+await _wholeHash(await _wholeReadResponse(fetched,512*1024*1024,job));
    }
  }else{
    if(_wholeCacheOnly(job))throw _wholeDeferred();
    const bytes=layer._rawBuffer||mesh.packedSplats?.packedArray;
    if(!bytes)throw new Error('判定用の元データがありません。');identity='sha256:'+await _wholeHash(bytes);
  }
  _walkCheckJob(job);_wholeIdentityCache.set(mesh,{url,raw:layer._rawBuffer,identity});return identity;
}
function _walkWholeCoverage(start,end=start,{drop=3,margin=3}={}){
  const index=walkSetup.wholeIndex,core=walkSetup.core;if(!index||!core)return true;
  const points=[start,end];
  if(walkMode.active&&walkMode.avatar){points.push(walkMode.avatar.position);points.push(camPos);}
  const min=['x','y','z'].map((k,i)=>Math.min(...points.map(p=>p[k]))-(i===1?drop:margin));
  const max=['x','y','z'].map((k,i)=>Math.max(...points.map(p=>p[k]))+(i===1?walkMode.height+1:margin));
  try{core.setTileCoverage(index,{min,max});return true;}
  catch(error){_walkStatus('当たり判定の範囲を確認できません: '+error.message);return false;}
}
function _walkWholeExcludeBoxes(boxes,cellSize){
  if(!walkSetup.settings.excludeIds.length)return boxes;
  // Expand only the active tile to source cells before applying oriented exclusions.
  const cells=[];
  for(const box of boxes){
    const min=box.center.map((c,i)=>Math.round((c-box.half[i])/cellSize));
    const count=box.half.map(h=>Math.round(2*h/cellSize));
    for(let x=0;x<count[0];x++)for(let y=0;y<count[1];y++)for(let z=0;z<count[2];z++){
      cells.push({center:[(min[0]+x+.5)*cellSize,(min[1]+y+.5)*cellSize,(min[2]+z+.5)*cellSize],half:[cellSize/2,cellSize/2,cellSize/2]});
      if(cells.length>32768)throw new Error('Invalid exclusion tile size');
    }
  }
  const accumulator=new LocahunWholeCollision.Accumulator({cellSize,minPoints:1,maxCells:32768});
  for(const box of _walkExcludeBoxes(cells))accumulator.add(...box.center);
  return accumulator.finish();
}
async function _walkRunWholeGeneration(job,splats){
  job.wholeCacheOnly=_wholeCacheOnly(job);
  const cameraOnly=job.wholeCacheOnly&&!walkMode.active;
  const findSpawn=job.options.findSpawn&&!cameraOnly;
  const sources=[],identities=[],cellSize=walkSetup.settings.cellSize;
  for(const layer of splats){
    _walkCheckJob(job);layer.mesh.updateWorldMatrix(true,false);
    const matrix=[...layer.mesh.matrixWorld.elements],identity=await _wholeSourceIdentity(layer,job);
    identities.push({identity,matrix});sources.push({paged:layer.mesh.paged,packed:layer.mesh.packedSplats,raw:layer._rawBuffer,matrix});
  }
  const key=await _wholeHash(new TextEncoder().encode(JSON.stringify(['whole-tiles-v1',cellSize,identities])));
  _walkCheckJob(job);let bytes,index,persistentHit=false;
  const saved=walkSetup.settings.whole;
  if(saved?.key===key){try{bytes=_wholeUnbase64(saved.data);index=await LocahunWholeCollision.decodeTiles(bytes,key);}catch(_){bytes=null;}}
  if(!index&&_wholeByteCache.has(key)){bytes=_wholeByteCache.get(key);try{index=await LocahunWholeCollision.decodeTiles(bytes,key);}catch(_){bytes=null;_wholeByteCache.delete(key);}}
  const manifest=globalThis.LocahunCollisionManifest?.[key];
  if(!index){
    try{
      const cached=await _wholePersistentCache('get',key,null,job);
      if(cached instanceof Uint8Array&&cached.byteLength>0&&cached.byteLength<=16*1024*1024){
        if(manifest&&(cached.byteLength!==manifest.bytes||await _wholeHash(cached)!==manifest.sha256))throw new Error('Cached collision payload digest mismatch');
        const decoded=await _walkAwait(LocahunWholeCollision.decodeTiles(cached,key),job);
        _walkCheckJob(job);
        if(!decoded.total||decoded.cellSize!==cellSize)throw new Error('Invalid cached collision geometry');
        bytes=cached;index=decoded;persistentHit=true;
      }
    }catch(error){_walkCheckJob(job);}
  }
  if(!index&&manifest&&/^[a-f0-9]{64}$/.test(manifest.sha256)&&Number.isSafeInteger(manifest.bytes)&&manifest.bytes>0&&manifest.bytes<=16000000){
    try{
      const response=await _walkAwait(fetch('https://viewer.locahun3d.com/collision/'+key+'.lct',{cache:'no-cache',signal:job.abortController?.signal}),job);
      const size=Number(response.headers.get('content-length'));
      if(response.ok&&size===manifest.bytes){
        bytes=await _wholeReadResponse(response,16000000,job);
        if(await _wholeHash(bytes)!==manifest.sha256)throw new Error('Collision payload digest mismatch');
        index=await LocahunWholeCollision.decodeTiles(bytes,key);
      }
      else await response.body?.cancel();
    }catch(error){_walkCheckJob(job);}
  }
  _walkCheckJob(job);
  if(!index){
    if(_wholeCacheOnly(job))throw _wholeDeferred();
    _walkStatus('全体の当たり判定を準備しています…');
    const decoders=[];let result;
    try{
      const bakeSources=sources.map(source=>{
        if(!source.paged)return source;
        const original=source.paged,raw=source.raw||original.fileBytes;
        const fileBytes=raw?(ArrayBuffer.isView(raw)?new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength):new Uint8Array(raw)):undefined;
        const paged=new PagedSplats({rootUrl:original.rootUrl,fileBytes,fileType:original.fileType,
          requestHeader:original.requestHeader,withCredentials:original.withCredentials,pager:{extSplats:false,maxSh:0}});
        decoders.push(paged);return {...source,paged};
      });
      result=await LocahunCollisionBake.generate(bakeSources,{cellSize,check:()=>_walkCheckJob(job),awaitJob:p=>_walkAwait(p,job),progress:p=>_walkStatus('全体の当たり判定を準備中 '+Math.round(p.chunk/p.chunks*100)+'%')});
    }finally{for(const decoder of decoders)decoder.dispose();}
    bytes=await LocahunWholeCollision.encodeTiles(result.tiles,key,result.cellSize);_walkCheckJob(job);
    index=await LocahunWholeCollision.decodeTiles(bytes,key);
  }
  if(!index.total)throw new Error('全体判定に有効な形状がありません。');
  _walkCheckJob(job);
  // Best-effort persistence is awaited before installing, but cannot hold readiness indefinitely.
  if(!persistentHit)await _wholePersistentCache('put',key,bytes,job);
  _walkCheckJob(job);
  if(findSpawn&&!walkSetup.settings.spawn&&typeof window.computeAutoInitialView==='function'){
    const candidate=window.computeAutoInitialView({targetCount:200000});
    if(candidate&&!candidate.failed&&candidate.position&&['x','y','z'].every(k=>Number.isFinite(candidate.position[k]))){
      walkSetup.spawnCandidate=_walkPoint(candidate.position);
      walkSetup.spawnYawCandidate=Number.isFinite(candidate.yaw)?candidate.yaw:null;
      Object.assign(job.center,candidate.position);
    }
  }else if(findSpawn&&walkSetup.settings.spawn)Object.assign(job.center,walkSetup.settings.spawn);
  // Apply current exclusion volumes only when a precomputed tile is installed.
  const rawIndex=index;index={...rawIndex,boxes:tile=>_walkWholeExcludeBoxes(rawIndex.boxes(tile),rawIndex.cellSize)};
  const creating=LocahunWalkCollision.create();
  creating.then(core=>{if(job!==walkSetup.job||job.epoch!==walkSetup.epoch)core.dispose();},()=>{});
  const core=await _walkAwait(creating,job);
  try{
    _walkCheckJob(job);core.rebuild({meshes:_walkMeshGeometry()});
    const c=walkMode.active&&walkMode.avatar?walkMode.avatar.position:job.center;
    core.setTileCoverage(index,{min:[c.x-3,c.y-22,c.z-3],max:[c.x+3,c.y+4,c.z+3]});
    if(walkMode.active&&walkMode.avatar){
      const p=walkMode.avatar.position,feet={x:p.x,y:p.y+walkMode.groundOffset,z:p.z};
      if(!_walkFeetClear(core,feet,!walkMode.airborne))throw new Error('更新後の判定で現在位置の空きを確認できません。');
      core.setCharacter(feet,walkMode.height,walkMode.bodyRadius);
    }
    _walkCheckJob(job);
  }catch(error){core.dispose();throw error;}
  walkSetup.core?.dispose();walkSetup.core=core;walkSetup.wholeIndex=index;
  walkSetup.settings.signature=job.signature;walkSetup.settings.region=null;walkSetup.settings.detailRegion=null;walkSetup.settings.boxes=[];
  walkSetup.settings.whole={key,data:_wholeBase64(bytes)};
  if(walkSetup.settings.navigation?.key!==key)walkSetup.settings.navigation=null;
  walkSetup.settings.effectiveCellSize=index.cellSize;walkSetup.failedKey='';
  if(findSpawn&&!walkSetup.settings.spawn&&walkSetup.spawnCandidate){
    const spawn=_walkSpawnPosition();walkSetup.settings.spawn=_walkPoint(spawn);
    walkSetup.settings.spawnYaw=Number.isFinite(spawn.yaw)?spawn.yaw:null;
  }
  walkSetup.wholeSpawnDeferred=cameraOnly&&!walkSetup.settings.spawn;
  walkSetup.viewAnchor=_walkPoint(job.view);walkSetup.residentAtBuild=_walkResidentSignature();
  _walkShowPreview(!!document.getElementById('walk-preview')?.checked);
  _wholeByteCache.set(key,bytes);while(_wholeByteCache.size>2)_wholeByteCache.delete(_wholeByteCache.keys().next().value);
  _walkStatus('全体の当たり判定を準備しました。');
  return true;
}
