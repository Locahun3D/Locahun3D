const walkSetup = {
  settings: LocahunWalkSettings.parse(null), core: null, busy: false,
  preview: null, epoch: 0, checkedAt: 0, status: '', entering: false,
  pending: null, job: null, autoTimer: null, autoEnabled: false,
  viewAnchor: null, spawnCandidate: null, failedKey: '',
  spawnYawCandidate: null, residentAtBuild: '', importPending: null, importDone: null,
  wholeIndex: null, wholeSpawnDeferred: false, deferredSignature: '', cameraReadiness: 'unavailable',
};
function _walkStatus(message) {
  walkSetup.status = message;
  _walkUpdateCameraReadiness();
  const el = document.getElementById('walk-status');
  if (el) el.textContent = message;
  const button=document.getElementById('btnAvatarWalk'), label=document.getElementById('lbl-walk');
  if(button) {
    const busy=walkSetup.busy || !!walkSetup.importPending;
    button.setAttribute('aria-busy',String(busy));
    button.title=busy?'歩行判定を生成中です。クリックすると完了後に歩行を開始します。':message;
    if(label) {
      if(busy && !button.dataset.walkLabel)button.dataset.walkLabel=label.textContent;
      if(busy)label.textContent='判定生成中…';
      else if(button.dataset.walkLabel){label.textContent=button.dataset.walkLabel;delete button.dataset.walkLabel;}
    }
  }
}
const _walkSourceObjects=new WeakMap();
let _walkSourceSerial=0;
function _walkSourceObjectId(mesh){
  if(!mesh||typeof mesh!=='object')return null;
  if(!_walkSourceObjects.has(mesh))_walkSourceObjects.set(mesh,++_walkSourceSerial);
  return _walkSourceObjects.get(mesh);
}
function _walkSourceSignature() {
  return JSON.stringify([...(walkSetup.settings.meshOnly?[]:['walk-stair-detail-v3']),walkSetup.settings.meshOnly,walkSetup.settings.meshIds,walkSetup.settings.excludeIds,layers.filter(L => L.mesh &&
    (L.type === 'splat' || walkSetup.settings.meshIds.includes(L.id) || walkSetup.settings.excludeIds.includes(L.id))).map(L => {
    L.mesh.updateWorldMatrix(true, false);
    return [L.id, L.type, !!L.visible, L.size, L.scale, _walkSourceObjectId(L.mesh),
      _walkSourceObjectId(L._rawBuffer), L._streamUrl || null,
      ...L.mesh.matrixWorld.elements.map(v => +v.toFixed(6))];
  })]);
}
function _walkClearPreview() {
  const mesh = walkSetup.preview;
  if (!mesh) return;
  scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
  walkSetup.preview = null;
}
function _walkShowPreview(enabled) {
  _walkClearPreview();
  const boxes = enabled?_walkPreviewBoxes():[];
  if (enabled && boxes.length) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),
      new THREE.MeshBasicMaterial({color:0x24c7d7,wireframe:true,transparent:true,opacity:.45,depthWrite:false}),boxes.length);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    boxes.forEach((b,i) => {
      matrix.compose(new THREE.Vector3(...b.center),q,new THREE.Vector3(...b.half).multiplyScalar(2));
      mesh.setMatrixAt(i,matrix);
    });
    mesh.computeBoundingSphere();
    walkSetup.preview = mesh; scene.add(mesh);
  }
  markDirty(3);
}
function _walkPreviewBoxes(){
  const index=walkSetup.wholeIndex;
  if(!index)return walkSetup.settings.boxes;
  const p=walkMode.active&&walkMode.avatar?walkMode.avatar.position:camPos;
  const tiles=index.query({min:[p.x-3,p.y-3,p.z-3],max:[p.x+3,p.y+3,p.z+3]}),boxes=[];
  for(const tile of tiles){boxes.push(...index.boxes(tile));if(boxes.length>=30000)break;}
  return boxes.slice(0,30000);
}
function _walkMeshGeometry() {
  const meshes = [];
  let total = 0;
  for (const L of layers) {
    if (!L.mesh || !L.visible || !walkSetup.settings.meshIds.includes(L.id)) continue;
    L.mesh.updateWorldMatrix(true,true);
    L.mesh.traverseVisible(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry || o.userData.isBoneMarker) return;
      const p = o.geometry.getAttribute('position');
      if (!p) return;
      total += p.count;
      if (total > 1000000) throw new Error('判定用メッシュが大きすぎます。軽量メッシュを使用してください。');
      const vertices = new Float32Array(p.count*3), vec = new THREE.Vector3();
      for (let i=0;i<p.count;i++) {
        vec.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
        if (![vec.x,vec.y,vec.z].every(Number.isFinite)) throw new Error('メッシュ座標が無効です。');
        vertices.set([vec.x,vec.y,vec.z],i*3);
      }
      const index = o.geometry.getIndex();
      const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({length:p.count},(_,i)=>i);
      meshes.push({vertices,indices});
    });
  }
  return meshes;
}
async function _walkInstallCore(boxes, job=null) {
  const epoch = walkSetup.epoch;
  const creating = LocahunWalkCollision.create();
  if(job) creating.then(core=>{if(job!==walkSetup.job || job.epoch!==walkSetup.epoch)core.dispose();},()=>{});
  const core = job ? await _walkAwait(creating,job) : await creating;
  let settled=null;
  try {
    if (epoch !== walkSetup.epoch) throw new Error('生成をキャンセルしました。');
    if(job) _walkCheckJob(job);
    const meshes = _walkMeshGeometry();
    if (!boxes.length && !meshes.length) throw new Error('判定形状がありません。3DGSか判定用メッシュを指定してください。');
    core.rebuild({boxes,meshes});
    if(walkMode.active && walkMode.avatar) {
      const p=walkMode.avatar.position;
      let feet={x:p.x,y:p.y+walkMode.groundOffset,z:p.z};
      if(!_walkFeetClear(core,feet,!walkMode.airborne)) {
        settled=core.reconcileFeet?.(feet,walkMode.height,walkMode.bodyRadius,!walkMode.airborne);
        if(!settled)throw new Error('追加判定では現在位置の床・空きを確認できません。歩行を停止し、開始位置を確認してください。');
        feet=settled;
      }
      core.setCharacter(feet,walkMode.height,walkMode.bodyRadius);
    }
  } catch(e) { core.dispose(); throw e; }
  if (walkSetup.core) walkSetup.core.dispose();
  walkSetup.core = core;
  walkSetup.wholeIndex = null;
  walkSetup.wholeSpawnDeferred = false;
  if(settled)walkMode.avatar.position.y=settled.y-walkMode.groundOffset;
}
function _walkExcludeBoxes(boxes) {
  const volumes=[];
  for(const L of layers) {
    if(!L.mesh||!L.visible||!walkSetup.settings.excludeIds.includes(L.id))continue;
    L.mesh.updateWorldMatrix(true,true);
    L.mesh.traverseVisible(o=>{
      if(!o.isMesh||!o.geometry)return;
      o.geometry.computeBoundingBox();
      if(o.geometry.boundingBox)volumes.push({bounds:o.geometry.boundingBox.clone(),inverse:o.matrixWorld.clone().invert()});
    });
  }
  const p=new THREE.Vector3();
  return boxes.filter(b=>!volumes.some(v=>v.bounds.containsPoint(p.fromArray(b.center).applyMatrix4(v.inverse))));
}
function _walkCheckJob(job) {
  if(job.epoch!==walkSetup.epoch || walkSetup.job!==job)throw new Error('生成をキャンセルしました。');
  if(job.sources?.some(s=>!layers.some(L=>L.id===s.id&&L.mesh===s.mesh)))throw new Error('点群が置換されました。判定形状を再生成します。');
  if(job.signature!==_walkSourceSignature())throw new Error('レイヤーが変更されました。判定形状を再生成します。');
}
async function _walkAwait(promise,job) {
  let timer;
  try {
    return await Promise.race([promise,job.cancelled.then(()=>{throw new Error('生成をキャンセルしました。');}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('点群の読込または判定生成がタイムアウトしました。歩行ボタンで再試行できます。')),60000);})]);
  } finally {clearTimeout(timer);}
}
function _walkPoint(p) {return {x:p.x,y:p.y,z:p.z};}
function _walkAutoTarget() {
  if(walkMode.active && walkMode.avatar) return _walkPoint(walkMode.avatar.position);
  return _walkPoint(camPos);
}
function _walkNeedsRegion(point,margin=0,includeDetail=true) {
  if(walkSetup.wholeIndex && walkSetup.settings.signature===_walkSourceSignature())return false;
  const region=walkSetup.settings.region;
  if(!region || walkSetup.settings.meshOnly)return false;
  const detail=includeDetail && walkSetup.settings.detailRegion;
  if(detail && (Math.hypot(point.x-detail.center.x,point.z-detail.center.z)>detail.radius-Math.min(.65,margin) ||
    point.y+2.2>detail.center.y+(detail.halfHeight||detail.radius) ||
    point.y-.5<detail.center.y-(detail.halfHeight||detail.radius)))return true;
  const r=Math.max(.1,region.radius-margin), c=region.center;
  return Math.hypot(point.x-c.x,point.z-c.z)>r || Math.abs(point.y-c.y)>r;
}
function _walkRequestKey() {
  const p=_walkAutoTarget();
  return _walkSourceSignature()+'|'+_walkResidentSignature()+'|'+[p.x,p.y,p.z].map(v=>Math.round(v*2)).join(',');
}
function _walkResidentSignature() {
  return layers.filter(L=>L.type==='splat'&&L.mesh&&L.visible).map(L=>
    L.id+':'+(L.mesh.uuid||'')+':'+Math.floor(Math.log2(1+(L.mesh.paged?.numSplats||L.mesh.packedSplats?.numSplats||0)))).join('|');
}
function _walkGenerateCollision(options={}) {
  if(walkSetup.pending)return walkSetup.pending;
  if(options===null || typeof options!=='object')options={};
  if(options.automatic&&!options.allowBake&&walkSetup.deferredSignature===_walkSourceSignature())return Promise.resolve(false);
  const job={epoch:walkSetup.epoch,options,center:_walkPoint(options.center||camPos),view:_walkPoint(camPos)};
  job.abortController=typeof AbortController==='function'?new AbortController():null;
  job.cancelled=new Promise(resolve=>{job.cancel=()=>{job.abortController?.abort();resolve();};});
  walkSetup.job=job;
  walkSetup.busy = true;
  walkSetup.pending=_walkRunGeneration(job);
  return walkSetup.pending;
}
async function _walkRunGeneration(job) {
  const {epoch,options}=job;
  const button = document.getElementById('walk-generate');
  if (button) button.disabled = true;
  if (walkMode.active && !options.automatic) _avatarWalkExit();
  try {
    const sizeInput = document.getElementById('walk-cell');
    if (sizeInput && !options.automatic) walkSetup.settings.cellSize = LocahunWalkSettings.parse({cellSize:+sizeInput.value}).cellSize;
    const radiusInput=document.getElementById('walk-radius');
    if(radiusInput && !options.automatic)walkSetup.settings.radius=LocahunWalkSettings.parse({radius:+radiusInput.value}).radius;
    const signature = _walkSourceSignature();
    job.signature=signature;
    job.sources=layers.filter(L=>L.mesh).map(L=>({id:L.id,mesh:L.mesh}));
    const center=job.center;
    const splats = walkSetup.settings.meshOnly ? [] : layers.filter(L => L.type==='splat' && L.visible && L.mesh);
    _walkStatus(options.automatic&&!options.allowBake?'保存済みの当たり判定を確認中…':'3DGS読込待ち・近似判定を生成中…');
    await _walkAwait(Promise.all(splats.map(L=>L.mesh.initialized)),job);
    _walkCheckJob(job);
    await _walkAwait(new Promise(resolve=>setTimeout(resolve,0)),job);
    if(splats.length && typeof _walkRunWholeGeneration==='function')return await _walkRunWholeGeneration(job,splats);
    if(options.reuse && signature===walkSetup.settings.signature &&
      splats.every(L=>L.mesh.isInitialized || L.mesh.initialized)) {
      await _walkInstallCore(walkSetup.settings.boxes,job);
      _walkCheckJob(job);
      walkSetup.viewAnchor=_walkPoint(job.view);
      walkSetup.residentAtBuild=_walkResidentSignature();
      walkSetup.failedKey='';
      _walkStatus('保存済みの歩行判定を復元しました。');
      return true;
    }
    let sampled;
    const deadline=performance.now()+60000;
    let resident='',stableSince=performance.now();
    const paged=splats.filter(L=>L.mesh.paged);
    do {
      _walkCheckJob(job);
      const current=paged.map(L=>L.mesh.paged.numSplats||0).join(',');
      if(current!==resident){resident=current;stableSince=performance.now();}
      const rootsOnly=splats.some(L=>L.mesh.paged && (L.mesh.paged.numSplats||0)<128);
      const settled=!paged.length || performance.now()-stableSince>=1500;
      if(!rootsOnly && settled) {
        sampled=splats.length?_acCollectSplatPoints(2000000):{points:null,count:0,meshes:0};
        if(sampled.meshes===splats.length && (!splats.length||sampled.count))break;
      }
      if(performance.now()>deadline)throw new Error('点群の座標を取得できません。読込形式・ストリーミング状態を確認し、歩行ボタンで再試行してください。');
      if(typeof bumpSplatActive==='function')bumpSplatActive(1000);
      markDirty(3);
      await _walkAwait(new Promise(resolve=>setTimeout(resolve,250)),job);
    } while(true);
    if(options.findSpawn && splats.length && !walkSetup.settings.spawn && typeof window.computeAutoInitialView==='function') {
      const candidate=window.computeAutoInitialView({targetCount:200000});
      if(candidate && !candidate.failed && candidate.position && ['x','y','z'].every(k=>Number.isFinite(candidate.position[k]))) {
        walkSetup.spawnCandidate=_walkPoint(candidate.position);
        walkSetup.spawnYawCandidate=Number.isFinite(candidate.yaw)?candidate.yaw:null;
        Object.assign(center,candidate.position);
      }
    } else if(options.findSpawn && walkSetup.settings.spawn)Object.assign(center,walkSetup.settings.spawn);
    const output=new Float32Array(sampled.count*3),radius=walkSetup.settings.radius;
    let total=0;
    for(let i=0;i<sampled.count;i++) {
      const x=sampled.points[i*3],y=sampled.points[i*3+1],z=sampled.points[i*3+2];
      if((x-center.x)**2+(z-center.z)**2<=radius**2 && Math.abs(y-center.y)<=radius) {
        output.set([x,y,z],total*3);total++;
      }
      if(i%100000===0){
        await new Promise(resolve=>setTimeout(resolve,0));
        _walkCheckJob(job);
      }
    }
    const combined=output.subarray(0,total*3);
    let boxes=[],cellSize=walkSetup.settings.cellSize;
    if(splats.length && !total)throw new Error('開始位置の周辺に点群がありません。床のある場所へ視点を移してください。');
    while(total) {
      _walkCheckJob(job);
      try {
        boxes=_walkExcludeBoxes(LocahunWalkCollision.voxelize(combined,
          {cellSize,minPoints:2,maxCells:30000,maxCandidates:120000,fitHorizontalSurfaces:true}));
        break;
      } catch(e) {
        if(!/maxCells|(?:maxCandidates|candidate).*exceed/i.test(e.message))throw e;
        if(cellSize>=1)throw new Error('1 mセルでも判定形状の上限を超えました。生成範囲を小さくするか、判定用メッシュを指定してください。');
        cellSize=Math.min(1,Math.round(cellSize*1.5*1000)/1000);
        _walkStatus('判定形状の密度を自動調整中… '+cellSize+' m');
        await _walkAwait(new Promise(resolve=>setTimeout(resolve,0)),job);
      }
    }
    _walkCheckJob(job);
    const detailed=total?LocahunWalkCollision.refineLocal(combined,boxes,center):{boxes,region:null};
    boxes=_walkExcludeBoxes(detailed.boxes);
    await _walkInstallCore(boxes,job);
    _walkCheckJob(job);
    walkSetup.settings.boxes = boxes;
    walkSetup.settings.signature = signature;
    walkSetup.settings.region = splats.length ? {center:_walkPoint(center),radius} : null;
    walkSetup.settings.effectiveCellSize=cellSize;
    walkSetup.settings.detailRegion=detailed.region;
    if(options.findSpawn && !walkSetup.settings.spawn && walkSetup.spawnCandidate) {
      const spawn=_walkSpawnPosition();
      walkSetup.settings.spawn=_walkPoint(spawn);
      walkSetup.settings.spawnYaw=Number.isFinite(spawn.yaw)?spawn.yaw:null;
    }
    walkSetup.viewAnchor=_walkPoint(job.view);
    walkSetup.residentAtBuild=_walkResidentSignature();
    walkSetup.failedKey='';
    _walkShowPreview(!!document.getElementById('walk-preview')?.checked);
    _walkStatus('近似判定: '+boxes.length.toLocaleString()+'セル / '+cellSize+' m / 半径 '+radius+' m'+(detailed.region?' / 足元 0.1 m':'')+'（範囲端で追加生成）');
    return true;
  } catch(e) {
    if(epoch === walkSetup.epoch && walkSetup.job===job) {
      if(job.wholeCacheOnly)walkSetup.deferredSignature=job.signature;
      if(!walkSetup.core || walkSetup.settings.signature!==_walkSourceSignature())walkSetup.settings.signature='';
      walkSetup.failedKey=job.signature===_walkSourceSignature()?_walkRequestKey():'';
      _walkStatus(e.message); showUndoToast(e.message);
    }
    return false;
  } finally {
    job.abortController?.abort();
    if(walkSetup.job===job) {
      walkSetup.busy=false;walkSetup.pending=null;walkSetup.job=null;
      if(button) button.disabled=false;
      _walkStatus(walkSetup.status);
    }
  }
}
async function _walkPrepareCollision() {
  const epoch=walkSetup.epoch;
  if(walkSetup.importPending && !await walkSetup.importPending)throw new Error(walkSetup.status||'3DGS読込を中止しました。');
  if(walkSetup.pending)await walkSetup.pending;
  if(epoch!==walkSetup.epoch)throw new Error('シーンが変更されました。');
  if(!walkMode.active && walkSetup.settings.spawn && _walkNeedsRegion(walkSetup.settings.spawn,.5)) {
    if(!await _walkGenerateCollision({automatic:true,allowBake:true,center:walkSetup.settings.spawn,preserveSpawn:true}))throw new Error(walkSetup.status);
  }
  if(walkSetup.settings.signature !== _walkSourceSignature() || !walkSetup.core) {
    if(walkSetup.settings.signature && walkSetup.settings.signature === _walkSourceSignature())
      await _walkInstallCore(walkSetup.settings.boxes);
    else if(!await _walkGenerateCollision({automatic:true,allowBake:true,findSpawn:true,preserveSpawn:true})) throw new Error(walkSetup.status);
  }
  _walkPrepareDeferredSpawn(epoch);
}
function _walkPrepareDeferredSpawn(epoch) {
  if(!walkSetup.wholeSpawnDeferred||walkMode.active||walkSetup.settings.spawn)return;
  const core=walkSetup.core,signature=_walkSourceSignature();
  const check=()=>{
    if(epoch!==walkSetup.epoch||!core||core!==walkSetup.core||!walkSetup.wholeIndex||
      signature!==_walkSourceSignature()||walkSetup.settings.signature!==signature)
      throw new Error('シーンが変更されたため開始位置の準備を中止しました。');
  };
  check();
  walkSetup.spawnCandidate=null;walkSetup.spawnYawCandidate=null;
  const candidate=typeof window.computeAutoInitialView==='function'?window.computeAutoInitialView({targetCount:200000}):null;
  check();
  if(candidate&&!candidate.failed&&candidate.position&&['x','y','z'].every(k=>Number.isFinite(candidate.position[k]))){
    walkSetup.spawnCandidate=_walkPoint(candidate.position);
    walkSetup.spawnYawCandidate=Number.isFinite(candidate.yaw)?candidate.yaw:null;
  }
  // The existing floor/capsule checks use the ready core and load only nearby tiles.
  const spawn=_walkSpawnPosition();
  check();
  walkSetup.settings.spawn=_walkPoint(spawn);
  walkSetup.settings.spawnYaw=Number.isFinite(spawn.yaw)?spawn.yaw:null;
  walkSetup.wholeSpawnDeferred=false;
}
function _walkBeginImport() {
  _walkCancelPending();
  walkSetup.importPending=new Promise(resolve=>{walkSetup.importDone=resolve;});
  _walkStatus('3DGS読込待ち・保存済みの当たり判定を確認します。');
  return walkSetup.epoch;
}
function _walkFailImport(epoch,error) {
  if(epoch!==walkSetup.epoch)return;
  _walkStatus('3DGS読込失敗: '+error.message);
  if(walkSetup.importDone)walkSetup.importDone(false);
  walkSetup.importPending=null;walkSetup.importDone=null;
  _walkStatus(walkSetup.status);
}
function _walkAutoImport(epoch=walkSetup.epoch,mesh=null) {
  if(epoch!==walkSetup.epoch || (mesh && !layers.some(L=>L.mesh===mesh)))return Promise.resolve(false);
  if(walkSetup.importDone)walkSetup.importDone(true);
  walkSetup.importPending=null;walkSetup.importDone=null;
  if(!layers.some(L=>L.mesh&&L.visible&&(L.type==='splat'||walkSetup.settings.meshIds.includes(L.id)))) {
    _walkStatus('判定対象の3DGSまたはメッシュがありません。');
    return Promise.resolve(false);
  }
  walkSetup.autoEnabled=true;walkSetup.failedKey='';walkSetup.deferredSignature='';
  if(!walkSetup.autoTimer && typeof setInterval==='function')walkSetup.autoTimer=setInterval(()=>{_walkAutoTick().catch(e=>{_walkStatus(e.message);showUndoToast(e.message);});},750);
  return _walkGenerateCollision({automatic:true,findSpawn:true,preserveSpawn:true,reuse:true});
}
async function _walkAutoTick() {
  if(!walkSetup.autoEnabled || walkSetup.pending || walkSetup.importPending || document.hidden)return;
  if(!layers.some(L=>L.mesh&&L.visible&&(L.type==='splat'||walkSetup.settings.meshIds.includes(L.id))))return;
  const target=_walkAutoTarget(), anchor=walkSetup.viewAnchor;
  const moved=walkMode.active || !anchor || Math.hypot(target.x-anchor.x,target.y-anchor.y,target.z-anchor.z)>1;
  const stale=walkSetup.settings.signature!==_walkSourceSignature();
  if(walkSetup.wholeIndex&&!stale&&walkSetup.core)return;
  const outside=moved && _walkNeedsRegion(target,walkSetup.settings.radius*.5);
  const residentChanged=walkSetup.residentAtBuild!==_walkResidentSignature();
  if((stale||outside||!walkSetup.core||residentChanged) && walkSetup.failedKey!==_walkRequestKey())
    return _walkGenerateCollision({automatic:true,center:(!moved&&walkSetup.settings.region)?walkSetup.settings.region.center:target,
      findSpawn:!walkSetup.settings.region,preserveSpawn:true});
}
// Ground support is sampled separately; body clearance uses the physical capsule.
function _walkFeetClear(core,feet,requireSupport=true) {
  const radius=walkMode.bodyRadius||.22,height=walkMode.height||1.7;
  let supports=0;
  for(const [dx,dz] of [[0,0],[radius*.7,0],[-radius*.7,0],[0,radius*.7],[0,-radius*.7]]) {
    const p={x:feet.x+dx,y:feet.y+.25,z:feet.z+dz};
    const hit=core.raycast(p,{x:0,y:-1,z:0},.6);
    if(hit!==null && hit>0 && Math.abs(p.y-hit-(feet.y-.05))<.16)supports++;
  }
  if(requireSupport && supports<3)return false;
  return core.isCapsuleClear(feet,height,radius);
}
function _walkSpawnPosition(useSaved=true) {
  const saved = useSaved && walkSetup.settings.spawn;
  if(walkSetup.wholeIndex&&_walkWholeCoverage(saved||camPos,saved||camPos,{drop:22})===false)throw new Error(walkSetup.status);
  if(saved && _walkFeetClear(walkSetup.core,saved)) {
    const result=_walkPoint(saved);
    if(Number.isFinite(walkSetup.settings.spawnYaw))result.yaw=walkSetup.settings.spawnYaw;
    return result;
  }
  const candidates = saved ? [saved] : [walkSetup.spawnCandidate,
    {x:camPos.x+Math.sin(yaw)*2.5,y:camPos.y,z:camPos.z+Math.cos(yaw)*2.5},
    {x:camPos.x,y:camPos.y,z:camPos.z}].filter(Boolean);
  if(!saved && walkSetup.spawnCandidate) {
    const p=walkSetup.spawnCandidate;
    for(const r of [.5,1,2])for(let i=0;i<8;i++)candidates.push({x:p.x+Math.sin(i*Math.PI/4)*r,y:p.y,z:p.z+Math.cos(i*Math.PI/4)*r,auto:true});
  }
  for(const point of candidates) {
    if(walkSetup.wholeIndex&&_walkWholeCoverage(point,point,{drop:22})===false)continue;
    const origin={x:point.x,y:point.y+.6,z:point.z};
    const dist=walkSetup.core.raycast(origin,{x:0,y:-1,z:0},20);
    if(dist !== null && dist>0 && Number.isFinite(dist)) {
      const result={x:point.x,y:origin.y-dist+.05,z:point.z};
      if(!_walkFeetClear(walkSetup.core,result))continue;
      const facing=saved?walkSetup.settings.spawnYaw:((point===walkSetup.spawnCandidate||point.auto)?walkSetup.spawnYawCandidate:null);
      if(Number.isFinite(facing))result.yaw=facing;
      return result;
    }
  }
  throw new Error('十分な床と身体周囲の空きがある開始位置を確認できません。読込完了を待つか、床の近くへ視点を移してください。');
}
function _walkCollisionAdvance(av,dt,dx,dz,jump) {
  if(!walkMode.airborne)walkMode.jumpFlightSeconds=undefined;
  const core=walkSetup.core;
  if(!core) return false;
  // A replacement job may use the same scene. Keep its valid physics alive,
  // but never advance against geometry invalidated by an edit/import.
  if(walkSetup.importPending||!walkSetup.settings.signature||walkSetup.settings.signature!==_walkSourceSignature()){
    walkMode.actualSpeed=0;
    if(walkMode.active){_avatarWalkExit();_walkStatus('シーンの変更により歩行を終了しました。判定の準備後に再開できます。');}
    return false;
  }
  const next={x:av.position.x+dx*dt,y:av.position.y,z:av.position.z+dz*dt};
  if(_walkNeedsRegion(next,Math.min(2,walkSetup.settings.radius*.3),false)) {
    walkMode.actualSpeed=0;
    if(!walkSetup.pending&&walkSetup.failedKey!==_walkRequestKey())_walkGenerateCollision({automatic:true,center:_walkPoint(av.position),preserveSpawn:true});
    if(!walkMode.airborne || _walkNeedsRegion(av.position,0,false))return false;
    dx=0;dz=0;jump=false;
  }
  if(performance.now()-walkSetup.checkedAt>250) {
    walkSetup.checkedAt=performance.now();
    if(walkSetup.settings.signature!==_walkSourceSignature()) {
      walkMode.actualSpeed=0;
      if(walkSetup.autoEnabled)_walkAutoTick();
      else {_avatarWalkExit();_walkStatus('レイヤー変更後は判定形状を再生成してください。');}
      return false;
    }
  }
  const oldX=av.position.x,oldZ=av.position.z;
  if(walkSetup.wholeIndex&&_walkWholeCoverage(av.position,{x:av.position.x+dx*dt,y:av.position.y+walkMode.velocity.y*dt,z:av.position.z+dz*dt})===false){
    walkMode.actualSpeed=0;if(walkMode.active)_avatarWalkExit();return false;
  }
  const n=Math.max(1,Math.ceil(dt/(1/90))),step=dt/n,gravity=9.8;
  if(jump && !walkMode.airborne){
    walkMode.velocity.y=walkMode.jumpVel;
    walkMode.jumpFlightSeconds=2*walkMode.jumpVel/gravity;
  }
  for(let i=0;i<n;i++) {
    walkMode.velocity.y=Math.max(-25,walkMode.velocity.y-gravity*step);
    const result=core.move({x:dx*step,y:walkMode.velocity.y*step,z:dz*step},{requireSupport:walkMode.airborne});
    av.position.set(result.feet.x,result.feet.y-walkMode.groundOffset,result.feet.z);
    walkMode.airborne=!result.grounded;
    if(result.grounded && walkMode.velocity.y<0) walkMode.velocity.y=0;
  }
  if(!walkMode.airborne)walkMode.jumpFlightSeconds=undefined;
  walkMode.groundY=av.position.y+walkMode.groundOffset;
  if(walkMode.groundY < (walkSetup.settings.spawn?.y ?? 0)-30) {
    _avatarWalkExit(); _walkStatus('判定範囲の外に落下しました。開始位置を再設定してください。'); return false;
  }
  walkMode.actualSpeed=Math.hypot(av.position.x-oldX,av.position.z-oldZ)/Math.max(dt,.0001);
  return walkMode.actualSpeed>.03;
}
let cameraCollisionEnabled=true;
function _walkCameraReadiness(){
  const ready=!!walkSetup.core&&!walkSetup.importPending&&walkSetup.settings.signature===_walkSourceSignature();
  return !cameraCollisionEnabled?'off':ready?'ready':walkSetup.busy||walkSetup.importPending?'preparing':'unavailable';
}
function _walkUpdateCameraReadiness(){
  const state=_walkCameraReadiness();
  walkSetup.cameraReadiness=state;
  const button=document.getElementById('camera-collision-toggle');
  if(button){
    button.setAttribute('aria-checked',String(cameraCollisionEnabled));
    button.dataset.readiness=state;
    button.textContent=state==='off'?'OFF':state==='ready'?'ON':state==='preparing'?'準備中':'未準備';
    button.title=state==='ready'?'カメラ当たり判定 ON':state==='off'?'カメラ当たり判定 OFF':'当たり判定は未準備です。通常閲覧は続けられます。';
    button.classList.toggle('on',state==='ready');
  }
}
globalThis.setCameraCollision=function(enabled){
  cameraCollisionEnabled=!!enabled;
  _walkUpdateCameraReadiness();
  markDirty(2);
};
globalThis.toggleCameraCollision=()=>globalThis.setCameraCollision(!cameraCollisionEnabled);
globalThis.getCameraCollisionState=()=>{
  const readiness=_walkCameraReadiness();
  return {enabled:cameraCollisionEnabled,ready:readiness==='ready',readiness,status:walkSetup.status};
};
function _applyFreeCameraCollision(start){
  if(!cameraCollisionEnabled)return;
  const delta={x:camPos.x-start.x,y:camPos.y-start.y,z:camPos.z-start.z};
  if(Math.hypot(delta.x,delta.y,delta.z)<1e-8)return;
  const hasTargets=layers.some(L=>L.mesh&&L.visible&&(L.type==='splat'||walkSetup.settings.meshIds.includes(L.id)));
  if(!hasTargets)return;
  const stale=walkSetup.settings.signature!==_walkSourceSignature();
  if(!walkSetup.core||stale||walkSetup.importPending||_walkNeedsRegion(camPos,.2,false)){
    _walkUpdateCameraReadiness();
    if(!walkSetup.pending&&!walkSetup.importPending&&walkSetup.failedKey!==_walkRequestKey())
      _walkGenerateCollision({automatic:true,center:start,preserveSpawn:true});
    return;
  }
  if(walkSetup.wholeIndex&&_walkWholeCoverage(start,camPos)===false){camPos.set(start.x,start.y,start.z);return;}
  const p=walkSetup.core.moveCamera(start,delta);
  camPos.set(p.x,p.y,p.z);
}
function _walkCameraCollision(av) {
  if(!cameraCollisionEnabled)return;
  if(!walkSetup.core) return;
  const origin={x:av.position.x,y:av.position.y+walkMode.groundOffset+walkMode.height*.8,z:av.position.z};
  if(walkSetup.wholeIndex&&_walkWholeCoverage(origin,camPos)===false){camPos.set(origin.x,origin.y,origin.z);return;}
  const dir=new THREE.Vector3(camPos.x-origin.x,camPos.y-origin.y,camPos.z-origin.z);
  const distance=dir.length();
  if(distance<.001) return;
  dir.divideScalar(distance);
  const hit=walkSetup.core.raycast(origin,dir,distance+.15);
  if(hit!==null && hit<distance+.15) camPos.set(origin.x,origin.y,origin.z).addScaledVector(dir,Math.max(.05,hit-.15));
}
function _walkSaveSettings() {
  return LocahunWalkSettings.parse(walkSetup.settings);
}
function _walkCancelPending() {
  if(typeof _clearRegionalNavigationProvider==='function')_clearRegionalNavigationProvider();
  if(typeof _clearNavigationQuery==='function')_clearNavigationQuery();
  walkSetup.epoch++;
  if(walkSetup.job)walkSetup.job.cancel();
  walkSetup.job=null;walkSetup.pending=null;walkSetup.busy=false;
  const generate=document.getElementById('walk-generate');if(generate)generate.disabled=false;
  if(walkSetup.autoTimer)clearInterval(walkSetup.autoTimer);
  walkSetup.autoTimer=null;walkSetup.autoEnabled=false;walkSetup.failedKey='';walkSetup.deferredSignature='';
  if(walkSetup.importDone)walkSetup.importDone(false);
  walkSetup.importPending=null;walkSetup.importDone=null;
}
function _walkRestoreSettings(data) {
  _walkCancelPending();
  walkSetup.wholeIndex=null;
  walkSetup.wholeSpawnDeferred=false;
  walkSetup.viewAnchor=null;walkSetup.spawnCandidate=null;
  walkSetup.spawnYawCandidate=null;walkSetup.residentAtBuild='';
  const generate=document.getElementById('walk-generate');if(generate)generate.disabled=false;
  if(walkMode.active) _avatarWalkExit();
  if(walkSetup.core) {walkSetup.core.dispose();walkSetup.core=null;}
  _walkClearPreview();
  try {walkSetup.settings=LocahunWalkSettings.parse(data);}
  catch(e) {walkSetup.settings=LocahunWalkSettings.parse(null);showUndoToast(e.message);}
  const size=document.getElementById('walk-cell'); if(size) size.value=walkSetup.settings.cellSize;
  const radius=document.getElementById('walk-radius');if(radius)radius.value=walkSetup.settings.radius;
  const meshOnly=document.getElementById('walk-mesh-only');if(meshOnly)meshOnly.checked=walkSetup.settings.meshOnly;
  _walkStatus(data ? '歩行設定を復元しました。' : '判定形状は未生成です。');
}
window.openWalkSetup=function(){document.getElementById('walk-setup').showModal();};
window.generateWalkCollision=_walkGenerateCollision;
window.previewWalkCollision=_walkShowPreview;
window.walkSetMeshOnly=function(value){
  if(walkSetup.busy){document.getElementById('walk-mesh-only').checked=walkSetup.settings.meshOnly;return;}
  if(walkMode.active)_avatarWalkExit();
  walkSetup.settings.meshOnly=!!value;
  walkSetup.settings.signature='';
  _walkStatus('判定方式を変更しました。再生成してください。');
};
window.walkUseSelectedMesh=function(){
  if(walkSetup.busy)return;
  const L=layers.find(L=>L.id===selectedLayerId && ['cube','sphere','obj'].includes(L.type));
  if(!L) {_walkStatus('立方体・球・読込メッシュを選択してください。');return;}
  const ids=walkSetup.settings.meshIds;
  if(ids.includes(L.id)) ids.splice(ids.indexOf(L.id),1); else ids.push(L.id);
  walkSetup.settings.excludeIds=walkSetup.settings.excludeIds.filter(id=>id!==L.id);
  walkSetup.settings.signature='';
  if(walkMode.active) _avatarWalkExit();
  _walkStatus((ids.includes(L.id)?'判定に追加: ':'判定から除外: ')+L.name+' / 再生成してください。');
};
window.walkExcludeSelected=function(){
  if(walkSetup.busy)return;
  const L=layers.find(L=>L.id===selectedLayerId&&L.type==='cube');
  if(!L){_walkStatus('除外範囲にする立方体を選択してください。');return;}
  const ids=walkSetup.settings.excludeIds;
  if(ids.includes(L.id))ids.splice(ids.indexOf(L.id),1);else ids.push(L.id);
  walkSetup.settings.meshIds=walkSetup.settings.meshIds.filter(id=>id!==L.id);
  if(walkMode.active)_avatarWalkExit();
  walkSetup.settings.signature='';
  _walkStatus((ids.includes(L.id)?'除外範囲に追加: ':'除外範囲を解除: ')+L.name+' / 再生成してください。');
};
window.walkSaveSpawn=function(){
  if(!walkMode.active) {_walkStatus('歩行中に開始位置を保存してください。');return;}
  const av=walkMode.avatar;
  walkSetup.settings.spawn={x:av.position.x,y:av.position.y+walkMode.groundOffset,z:av.position.z};
  walkSetup.settings.spawnYaw=yaw;
  _walkStatus('現在位置を歩行開始位置に保存しました。');
};

// These loaders bypass loadSplatFile (RAD URL and in-place quality reload).
// Keep their decoding/camera behavior intact and observe only completed imports.
function _walkObserveImport(importer) {
  return async function(...args) {
    const epoch=_walkBeginImport(), before=new Set(layers.map(L=>L.mesh));
    try {
      const result=await importer.apply(this,args);
      if(epoch===walkSetup.epoch) {
        if(layers.some(L=>L.type==='splat'&&L.mesh&&!before.has(L.mesh)))_walkAutoImport(epoch);
        else _walkFailImport(epoch,new Error('新しい3DGSは読み込まれていません。'));
      }
      return result;
    } catch(e) {_walkFailImport(epoch,e);throw e;}
  };
}
if(typeof loadFromURL==='function')loadFromURL=_walkObserveImport(loadFromURL);
if(typeof reloadAllSplatLayers==='function')reloadAllSplatLayers=_walkObserveImport(reloadAllSplatLayers);
if(typeof _fetchBinaryChunked==='function') {
  const fetchImportBytes=_fetchBinaryChunked;
  _fetchBinaryChunked=async function(...args) {
    const epoch=walkSetup.epoch;
    const bytes=await fetchImportBytes.apply(this,args);
    if(epoch!==walkSetup.epoch)throw new Error('古いURL読込を中止しました。');
    return bytes;
  };
}
