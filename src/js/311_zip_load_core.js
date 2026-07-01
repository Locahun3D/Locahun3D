// ── Core ZIP load logic (callable directly with a File object) ──
async function _loadProjectZipFromFile(file){
  const _en=()=>window._lang==='en';
  showLd(T('zip-loading')); setMsg(T('zip-parsing')); setBar(5);
  try{
    setMsg(T('zip-lib')); setBar(10);
    const fflate=await getFflate();

    setMsg(T('zip-decomp')); setBar(20);
    const zipBuf=new Uint8Array(await file.arrayBuffer());
    let unzipped;
    try{ unzipped=fflate.unzipSync(zipBuf); }
    catch(zipErr){ hideLd(); showUndoToast((_en()?'⚠ ZIP decompress failed: ':'⚠ ZIP解凍失敗: ')+zipErr.message); return; }

    setMsg(T('zip-map')); setBar(35);
    const fileMap={};
    for(const [rawPath, u8] of Object.entries(unzipped)){
      if(!u8||u8.length===0) continue;
      const norm=rawPath.replace(/\\/g,'/');
      const fname=norm.split('/').pop();
      fileMap[norm]=u8;
      if(fname&&!fileMap[fname]) fileMap[fname]=u8;
    }
    console.log('[ZIP] keys:', Object.keys(fileMap));

    setMsg(T('zip-proj')); setBar(45);
    const allKeys=Object.keys(fileMap);
    const jsonU8=fileMap['project.json']
      ||fileMap[allKeys.find(k=>k.endsWith('project.json'))||''];
    if(!jsonU8){
      // Not a Locahun-format project ZIP — but maybe the user just zipped
      // up a raw splat / mesh file (a common way to share large PLYs /
      // RADs by email or via file-size-capped uploaders). Scan the
      // archive for anything we know how to load and route the first
      // splat through loadSplatFile + the rest through
      // loadAdditionalSplat (mirroring dispatchFiles's multi-file logic).
      const SPLAT_EXTS = ['rad','ply','spz','ksplat','splat','sog','pcsogs','pcsogszip'];
      const MESH_EXTS  = ['obj','gltf','glb','fbx'];
      const candidates = [];
      for(const k of allKeys){
        const base = k.split('/').pop();
        const ext  = base.split('.').pop().toLowerCase();
        if(SPLAT_EXTS.includes(ext)) candidates.push({ path:k, base, ext, kind:'splat' });
        else if(MESH_EXTS.includes(ext)) candidates.push({ path:k, base, ext, kind:'mesh' });
      }
      // Sort splats first (so they become the main scene) then by ascending
      // depth so a top-level `scene.rad` wins over `extras/foo.rad`.
      candidates.sort((a,b) => {
        if(a.kind !== b.kind) return a.kind === 'splat' ? -1 : 1;
        const dA = a.path.split('/').length, dB = b.path.split('/').length;
        if(dA !== dB) return dA - dB;
        return a.path.localeCompare(b.path);
      });
      if(candidates.length === 0){
        hideLd();
        showUndoToast((_en()
          ? '⚠ ZIP has no project.json and no recognised splat / mesh file (keys: '
          : '⚠ project.json も読み込める3DGS/メッシュも見つかりません (keys: ')
          + allKeys.slice(0,6).join(', ') + ')');
        return;
      }
      setMsg(_en() ? `${candidates.length} file(s) found, loading…`
                   : `${candidates.length} ファイル検出、読込中…`);
      setBar(55);
      let i = 0;
      for(const c of candidates){
        const u8 = fileMap[c.path];
        const owned = new Uint8Array(u8.length); owned.set(u8);
        const innerFile = new File([owned.buffer], c.base, { type:'application/octet-stream' });
        try {
          if(c.kind === 'splat'){
            if(i === 0 && !layers.find(l => l._isMain)) await loadSplatFile(innerFile);
            else                                       await loadAdditionalSplat(innerFile);
          } else {
            await loadObjFile(innerFile);
          }
        } catch(perFileErr){
          console.warn('[ZIP] failed to load', c.path, perFileErr);
        }
        i++;
      }
      hideLd();
      showUndoToast(_en()
        ? `✅ Loaded ${candidates.length} file(s) from ZIP (${file.name})`
        : `✅ ZIPから ${candidates.length} ファイル読み込み完了 (${file.name})`);
      return;
    }
    let project;
    try{ project=JSON.parse(fflate.strFromU8(jsonU8)); }
    catch(je){ hideLd(); showUndoToast((_en()?'⚠ project.json parse failed: ':'⚠ project.json解析失敗: ')+je.message); return; }
    if(!project.version||!project.layers){ hideLd(); showUndoToast(_en()?'⚠ Invalid project format':'⚠ 無効なプロジェクト形式'); return; }
    // Version compatibility check (current writer is v4; v3 is JSON-only legacy save which the ZIP loader also tolerates)
    const SUPPORTED_VERSIONS=[1,2,3,4];
    if(!SUPPORTED_VERSIONS.includes(project.version)){
      hideLd();
      showUndoToast(_en()?`⚠ Unsupported project version: ${project.version}`:`⚠ 非対応のプロジェクトバージョン: ${project.version}`);
      return;
    }

    setMsg(T('zip-attach')); setBar(60);
    let attached=0, missing=0;
    for(const entry of project.layers){
      if(!entry.file) continue;
      const norm=entry.file.replace(/\\/g,'/');
      const basename=norm.split('/').pop();
      const u8=fileMap[norm]||fileMap[entry.file]||fileMap[basename];
      if(u8&&u8.length>0){
        const owned=new Uint8Array(u8.length);
        owned.set(u8);
        entry._buf=owned.buffer;
        entry._ext=basename.split('.').pop().toLowerCase();
        attached++;
        console.log(`[ZIP] ✓ "${entry.name}" ← ${norm} (${(u8.length/1024).toFixed(1)}KB)`);
      } else {
        missing++;
        console.warn(`[ZIP] ✗ "${entry.name}": ${entry.file}`);
      }
    }
    setMsg(_en()?`${attached} file(s) attached, restoring...`:`${attached}ファイル割り当て完了、復元中...`); setBar(75);
    await restoreProject(project);
    hideLd();
    showUndoToast(missing>0
      ?(_en()?`⚠ Restored (${attached} ok / ${missing} not found)`:`⚠ 復元完了 (${attached}成功/${missing}未発見)`)
      :(_en()?`✅ Restored from ZIP (${attached} file${attached===1?'':'s'})`:`✅ ZIPから完全復元 (${attached}ファイル)`));
  } catch(err){
    console.error('[loadProjectZip]',err);
    hideLd();
    showUndoToast((_en()?'⚠ ZIP load failed: ':'⚠ ZIP読み込み失敗: ')+err.message);
  }
}

window.loadProjectZip = function(){
  const input=document.createElement('input');
  input.type='file'; input.accept='.zip';
  input.onchange=async(e)=>{
    const f=e.target.files[0]; if(!f) return;
    await _loadProjectZipFromFile(f);
  };
  input.click();
};

let _jsonSaving = false;
window.saveProject = async function() {
  if(_jsonSaving){ showUndoToast(T('save-ing')); return; }
  _jsonSaving = true;
  showUndoToast(T('save-ing'));
  try {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();

    async function meshToGLBBase64(mesh) {
      return new Promise((res,rej)=>{
        const g=new THREE.Group(); g.add(mesh.clone());
        exporter.parse(g,(result)=>{
          res(bufToBase64(result));
        }, rej, {binary:true});
      });
    }

    const serialized = [];
    for(const L of layers){
      const entry = {
        id:L.id, name:L.name, type:L.type,
        parentId:L.parentId||null, visible:L.visible,
        pos:{...L.pos}, rot:{...L.rot}, size:{...L.size}, scale:{...(L.scale||{x:1,y:1,z:1})},
        pivotSpace:L.pivotSpace||'world',
      };
      if(L.type==='folder'){
        entry.expanded=L.expanded!==false;
        entry.locked=!!L.locked;
      } else if(L.type==='cube'||L.type==='sphere'){
        entry.cubeColor=L.cubeColor||'#ffffff';
        entry.cubeOpacity=L.cubeOpacity!=null?L.cubeOpacity:0.85;
        entry.wireframe=L.wireframe||false;
      } else if(L.type==='obj'){
        entry.objColor=L.objColor||null;
        entry.objOpacity=L.objOpacity!=null?L.objOpacity:1.0;
        entry.objWireframe=L.objWireframe||false;
        entry.upAxis=L.upAxis||'y';
        // Prefer cached original file; fallback to re-exporting from mesh
        if(L._rawBuffer){
          entry.rawData=bufToBase64(L._rawBuffer);
          entry.rawExt=L._rawExt||'glb';
        } else {
          try{ entry.meshData=await meshToGLBBase64(L.mesh); }
          catch(e){ console.warn('mesh serialize fail:',L.name,e); }
        }
      } else if(L.type==='splat'){
        // Embed full splat file data if cached
        if(L._rawBuffer){
          entry.rawData=bufToBase64(L._rawBuffer);
          entry.rawExt=L._rawExt||'splat';
        } else if(L._streamUrl){
          entry.streamUrl=L._streamUrl;
          entry.rawExt=L._rawExt||'rad';
        } else {
          entry.missing=true;
        }
        entry._loadFlipped = !!L._loadFlipped;
        if(L._flipAxes) entry._flipAxes = {...L._flipAxes};
      } else if(L.type==='light'){
        entry.lightColor=L.lightColor||'#ffffff';
        entry.lightIntensity=L.lightIntensity!=null?L.lightIntensity:1.5;
        entry.lightDistance=L.lightDistance!=null?L.lightDistance:20;
      } else if(L.type==='figure'){
        entry.figurePose=L.figurePose||_emptyPoseData();
        entry.figureSkinColor=L.figureSkinColor||'#c5c0b6';
        entry.figureJointColor=L.figureJointColor||'#ff8844';
        entry.figureShowJoints=L.figureShowJoints!==false;
        entry.figureSelectedBone=L.figureSelectedBone||'pelvis';
        entry.figureHeight=L.figureHeight||FIGURE_REF_HEIGHT_CM;
        entry.figureSource=L.figureSource||'procedural';
      } else if(L.type==='event'){
        entry.eventImage=L.eventImage||null;
        entry.eventImageName=L.eventImageName||null;
        entry.eventGuide=L.eventGuide||null;
        entry.eventColor=L.eventColor||'#ff8800';
      } else if(L.type==='path'){
        entry.pathPoints=L.pathPoints?L.pathPoints.map(p=>({...p})):[];
        entry.pathLabel=L.pathLabel||'';
        entry.pathColor=L.pathColor||'#00d0ff';
        entry.pathOpacity=L.pathOpacity!=null?L.pathOpacity:0.28;
      }
      serialized.push(entry);
    }

    const project = {
      version:3, savedAt:new Date().toISOString(),
      appName:'ロケハン3D',
      projectName:_projectName||'Untitled Project',
      camera:{ pos:{x:camPos.x,y:camPos.y,z:camPos.z}, yaw, pitch },
      layerNextId:_layerNextId,
      layers:serialized,
      // 日照シミュの都道府県のみ保存（ZIP保存と同様。天気・日時・ON状態は保存しない）。
      sun:{ city:sun.city },
    };

    const jsonStr=JSON.stringify(project);
    const blob=new Blob([jsonStr],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='scene_project.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    const missingCount=serialized.filter(e=>e.missing).length;
    const _en=window._lang==='en';
    if(missingCount>0)
      showUndoToast(_en?`✅ Saved (${missingCount} file(s) uncached)`:`✅ 保存完了 (${missingCount}件はファイル未キャッシュ)`);
    else
      showUndoToast(_en?'✅ Project saved (all data included)':'✅ プロジェクトを保存しました（全データ含む）');
  } catch(e){ console.error(e); showUndoToast((window._lang==='en'?'⚠ Save failed: ':'⚠ 保存失敗: ')+e.message); } finally { _jsonSaving = false; }
};

// ── Project Load ──
window.loadProject = function() {
  const input=document.createElement('input');
  input.type='file'; input.accept='.json';
  input.onchange=async (e)=>{
    const file=e.target.files[0]; if(!file) return;
    const _en=window._lang==='en';
    try{
      const text=await file.text();
      const project=JSON.parse(text);
      if(!project.version||!project.layers){ showUndoToast(_en?'⚠ Invalid project file':'⚠ 無効なプロジェクトファイル'); return; }
      const SUPPORTED_VERSIONS=[1,2,3,4];
      if(!SUPPORTED_VERSIONS.includes(project.version)){
        showUndoToast(_en?`⚠ Unsupported project version: ${project.version}`:`⚠ 非対応のプロジェクトバージョン: ${project.version}`);
        return;
      }
      await restoreProject(project);
      showUndoToast(_en?'✅ Project loaded':'✅ プロジェクトを読み込みました');
    } catch(e){ console.error(e); showUndoToast(T('load-fail')+e.message); }
  };
  input.click();
};

async function loadProject_fromFile(file){
  const _en=window._lang==='en';
  try{
    const text=await file.text();
    const project=JSON.parse(text);
    if(!project.version||!project.layers){ showUndoToast(_en?'⚠ Invalid project file':'⚠ 無効なプロジェクトファイル'); return; }
    const SUPPORTED_VERSIONS=[1,2,3,4];
    if(!SUPPORTED_VERSIONS.includes(project.version)){
      showUndoToast(_en?`⚠ Unsupported project version: ${project.version}`:`⚠ 非対応のプロジェクトバージョン: ${project.version}`);
      return;
    }
    await restoreProject(project);
    showUndoToast(_en?'✅ Project loaded':'✅ プロジェクトを読み込みました');
  } catch(e){ console.error(e); showUndoToast(T('load-fail')+e.message); }
}

