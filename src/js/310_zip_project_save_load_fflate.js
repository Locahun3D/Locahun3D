// ══════════════════════════════════════════════════
//  ZIP PROJECT SAVE / LOAD  (fflate)
// ══════════════════════════════════════════════════
async function getFflate(){
  // fflate – pure-JS deflate, ESM build. Loaded from a public ESM CDN so
  // this HTML is a single-file distribution; the recipient only needs an
  // internet connection on first launch (the browser caches the module
  // afterwards). Restore './vendor/fflate.js' here if you want the
  // fully-offline build with a companion ./vendor/ folder.
  const mod = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
  return mod;
}

// Web entries omit optional assets. Only the pinned portable release may be
// bundled into a full ZIP; never silently substitute the current slim page.
async function _fetchOfflineViewerForZip(){
  const artifact=window.__locahunOfflineArtifact;
  const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  if(!artifact||!validHash(artifact.release)||!validHash(artifact.sha256)||
    !Number.isSafeInteger(artifact.bytes)||artifact.bytes<=0||artifact.bytes>64*1024**2)
    throw new Error('Offline viewer release is unavailable');
  const url=new URL(artifact.url,location.href),origin=new URL(location.href).origin;
  if((url.origin!==origin&&url.origin!=='https://viewer.locahun3d.com')||
    !['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||
    url.pathname!==`/releases/${artifact.release}/viewer.html`)
    throw new Error('Invalid offline viewer release URL');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(url.href,{cache:'force-cache',credentials:'omit',redirect:'error',signal:controller.signal});
    if(!response.ok)throw new Error('Offline viewer HTTP '+response.status);
    const output=new Uint8Array(artifact.bytes);
    let received=0;
    const reader=response.body?.getReader();
    if(!reader)throw new Error('Offline viewer download requires a readable stream');
    try{
      for(;;){
        const {done,value}=await reader.read();if(done)break;
        if(received+value.byteLength>output.byteLength)throw new Error('Offline viewer size mismatch');
        output.set(value,received);received+=value.byteLength;
      }
    }catch(error){try{await reader.cancel();}catch(_){}throw error;}
    finally{reader.releaseLock();}
    if(received!==output.length)throw new Error('Offline viewer size mismatch');
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(await digest(output)!==artifact.sha256)throw new Error('Offline viewer checksum mismatch');
    const html=new TextDecoder('utf-8',{fatal:true}).decode(output);
    const stamp=`window.__locahunBuildRelease="${artifact.release}"`;
    if(!html.includes(stamp)||!html.includes('id="locahun-app-source"')||/window\.__locahunWeb\s*=\s*true/.test(html))
      throw new Error('Offline viewer is not a portable release');
    const placeholder='{{viewer-'+'release-id}}';
    const unstamped=html.replace(stamp,'window.__locahunBuildRelease="'+placeholder+'"');
    if(await digest(new TextEncoder().encode(unstamped))!==artifact.release)
      throw new Error('Offline viewer release mismatch');
    return output;
  }finally{clearTimeout(timer);}
}

// ── Full-offline embed of a URL-streamed scene ────────────────────────────
// A scene loaded via ?demo=1 / ?autoload=URL never pulls its bytes into
// memory — Spark streams .RAD chunks lazily over HTTP Range, so L._rawBuffer
// is empty and only L._streamUrl exists. To produce a TRULY offline ZIP we
// must fetch the entire file here and embed it (the restore path already
// rebuilds a RAD SplatMesh straight from embedded bytes via
// `new PagedSplats({fileBytes})` — see restoreProject ≈17796).
//
// Returns a Uint8Array on success, or null on failure (caller falls back to
// the Option-A streamUrl reference). Streams the body so we can show a
// running MB-downloaded toast for the (often 300+ MB) download.
//
// MAX_EMBED_BYTES guard: a capable device (iPad/PC) still has finite tab
// memory. Peak during save = downloaded bytes + ZIP output buffer (~same
// size, store-level 0) + Blob copy ≈ 3× the file. iPadOS Safari caps a tab
// near ~3 GB, desktop Chrome much higher but the user's RAM is the real
// ceiling. 1 GB of RAD → ~3 GB peak is the comfortable iPad limit, so we
// refuse to embed beyond that and fall back to URL reference. Desktop could
// go higher but we keep one conservative threshold rather than guess the
// platform's true ceiling.
const MAX_EMBED_BYTES = 1024 * 1024 * 1024; // 1 GB
async function _fetchStreamUrlToBytes(url, label){
  try{
    const _en = window._lang === 'en';
    const resp = await fetch(url, { cache: 'no-store' });
    if(!resp.ok) throw new Error('HTTP ' + resp.status);
    // Content-Length lets us (a) pre-flight the size guard before downloading
    // the whole thing and (b) show a percentage. It may be absent on some
    // servers/CORS configs — then we stream blind and enforce the cap as we go.
    const clHeader = resp.headers.get('content-length');
    const total = clHeader ? parseInt(clHeader, 10) : 0;
    if(total > 0 && total > MAX_EMBED_BYTES){
      console.warn(`[saveZIP] streamUrl ${Math.round(total/1048576)}MB exceeds embed cap ${Math.round(MAX_EMBED_BYTES/1048576)}MB — keeping URL reference`);
      return { tooBig: true };
    }
    if(!resp.body || typeof resp.body.getReader !== 'function'){
      // No streaming reader (very old browser / opaque response): fall back to
      // a single arrayBuffer() read, still honouring the post-hoc size cap.
      const buf = await resp.arrayBuffer();
      if(buf.byteLength > MAX_EMBED_BYTES) return { tooBig: true };
      return { bytes: new Uint8Array(buf) };
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    let _lastToast = 0;
    for(;;){
      const { done, value } = await reader.read();
      if(done) break;
      received += value.length;
      // Enforce the cap even without Content-Length: abort once we blow past
      // it so a mislabelled huge file can't OOM the tab mid-download.
      if(received > MAX_EMBED_BYTES){
        try{ await reader.cancel(); }catch(_){}
        console.warn('[saveZIP] streamUrl exceeded embed cap mid-download — keeping URL reference');
        return { tooBig: true };
      }
      chunks.push(value);
      // Throttle toast updates to ~4/s. Re-calling showUndoToast resets its
      // 1.6 s auto-hide timer, so periodic calls keep the progress visible.
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if(now - _lastToast > 250){
        _lastToast = now;
        const mb = (received / 1048576).toFixed(0);
        const pct = total > 0 ? ` (${Math.round(received / total * 100)}%)` : '';
        showUndoToast(_en
          ? `⬇ Embedding "${label}": ${mb} MB${pct}…`
          : `⬇ "${label}" を埋め込み中: ${mb} MB${pct}…`);
      }
    }
    // Coalesce chunks into one contiguous buffer.
    const out = new Uint8Array(received);
    let off = 0;
    for(const c of chunks){ out.set(c, off); off += c.length; }
    return { bytes: out };
  }catch(e){
    console.warn('[saveZIP] _fetchStreamUrlToBytes failed for', url, e);
    return { error: e };
  }
}

async function _getZipExporter(){
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  return new GLTFExporter();
}
function _validateOnlineModelBytes(bytes,extension){
  const ext=String(extension||'').toLowerCase();
  if(ext!=='gltf' && ext!=='glb')return;
  let jsonBytes=bytes;
  if(ext==='glb'){
    if(bytes.byteLength<20)throw new Error('Incomplete GLB');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==bytes.byteLength || view.getUint32(16,true)!==0x4e4f534a)throw new Error('Incomplete GLB');
    const end=20+view.getUint32(12,true);if(end>bytes.byteLength)throw new Error('Incomplete GLB');
    jsonBytes=bytes.subarray(20,end);
  }
  const json=JSON.parse(new TextDecoder().decode(jsonBytes));
  for(const resource of [...(json.buffers||[]),...(json.images||[])]){
    if(resource.uri && !/^data:/i.test(resource.uri))throw new Error('Incomplete model: external dependency');
  }
}
let _zipSaving = false;
// forceLite: user-triggered "軽量保存" (export modal) — same code path the
// phone-memory auto-guard below already used, just opt-in on any device
// instead of gated behind the phone-viewport heuristic. Skips embedding
// splat/model raw bytes; project.json still lists filenames so the load
// path can prompt the user to re-select the original 3DGS file (see
// _promptFilesForReattach in 311_zip_load_core.js).
// opts.returnBlob: ダウンロード(Aタグclick)と完了トーストを行わず、生成した
// ZIP の Blob をそのまま返す。?autoinit=1 のバッチ経路（299）が親ウィンドウへ
// postMessage で渡すために使う。通常のUI呼び出し(引数なし)の挙動は不変。
window.saveProjectZip = async function(forceLite, opts){
  opts = opts || {};
  if(opts.strictOnline){
    if(typeof _pathMode!=='undefined' && _pathMode)throw new Error('Finish the active path before saving');
    if(layers.some(L=>!['folder','cube','sphere','obj','splat','light','figure','event','path'].includes(L.type)))throw new Error('Unsupported project layer');
    if(layers.some(L=>L.type==='event' && L.eventImage && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(L.eventImage)))throw new Error('Incomplete event image');
  }
  if(opts.localProject){
    const unsupported=layers.find(L=>!['folder','cube','sphere','obj','splat','light','figure','event','path'].includes(L.type));
    if(unsupported)throw new Error((window._lang==='en'?'This layer type cannot be saved locally: ':'ローカル保存未対応のレイヤーです: ')+unsupported.type+' ('+unsupported.name+')');
  }
  if(_zipSaving){
    if(opts.localProject || opts.strictOnline) throw new Error('Save already in progress');
    showUndoToast(T('zip-saving')); return;
  }
  _zipSaving = true;
  if(!opts.localProject) showUndoToast(T('zip-saving'));
  try {
    const fflate = opts.localProject ? null : await getFflate();

    async function meshToGLBBuf(mesh){
      const exporter = await _getZipExporter();
      const prepared=_cloneObjForExport(mesh);
      try {
        const g=new THREE.Group(); g.add(prepared.clone);
        const result=await new Promise((res,rej)=>exporter.parse(g,res,rej,{binary:true}));
        return new Uint8Array(result);
      } finally { prepared.dispose(); }
    }

    // ── Mobile memory budget for ZIP creation ──────────────────────────────
    // Chrome on Android phones (and Safari on iPhone) sandboxes each tab to
    // roughly 1.5 GB of resident memory. The current ZIP path holds the
    // splat bytes in L._rawBuffer AND allocates an entire ~same-sized
    // output buffer inside fflate.zipSync, then a Blob copy on top. For a
    // 357 MB .rad scene that's well over 1 GB peak — the tab gets killed
    // (the "このページを開けません" sad-tab page the user reported).
    //
    // Detection: viewport short-edge < 700 px catches iPhone, most Android
    // phones, and excludes iPad / Mac / desktop. We deliberately use the
    // viewport metric instead of UA so a phone in landscape isn't missed.
    //
    // Budget: 200 MB of total splat bytes. Below that we keep the existing
    // full save path (works fine on phones for small scenes). At or above
    // we drop the splat data from the ZIP — project.json still lists the
    // original filenames so the user can re-attach the .rad / .ply by
    // dragging it onto the viewer after extracting the ZIP.
    const _shortEdge = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    const _isPhoneClass = isMobile && _shortEdge > 0 && _shortEdge < 700;
    const PHONE_SPLAT_BUDGET = 200 * 1024 * 1024;
    let _totalSplatBytes = 0;
    for(const L of layers){
      if(L && L.type === 'splat' && L._rawBuffer && L._rawBuffer.byteLength){
        _totalSplatBytes += L._rawBuffer.byteLength;
      }
    }
    const _skipSplatData = !!forceLite || (_isPhoneClass && _totalSplatBytes > PHONE_SPLAT_BUDGET);
    if(opts.strictOnline && (_skipSplatData || (_isPhoneClass && layers.some(L=>L.type==='splat' && !L._rawBuffer && L._streamRef!=='source'))))throw new Error('Device capacity insufficient for complete archive');
    if(_skipSplatData){
      const mb = Math.round(_totalSplatBytes / 1024 / 1024);
      console.warn(`[saveZIP] lite save (${forceLite?'user-requested':'phone-class device'}) — ${mb} MB splat data excluded`);
    }

    // Build file map and layer entries
    const files = {};   // path → Uint8Array
    const serialized = [];
    let fileIdx = 0;
    let _skippedSplatCount = 0;

    for(const L of layers){
      const entry = {
        id:L.id, name:L.name, type:L.type,
        parentId:L.parentId||null, visible:L.visible,
        pos:{...L.pos}, rot:{...L.rot}, size:{...L.size}, scale:{...(L.scale||{x:1,y:1,z:1})},
        pivotSpace:L.pivotSpace||'world',
        file:null,
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
        let buf;
        const safeName=L.name.replace(/[^a-zA-Z0-9_-]/g,'_');
        if(opts.localProject){
          entry.file=await opts.localProject.resolveAsset(L,()=>meshToGLBBuf(L.mesh));
          entry.rawExt=entry.file.split('.').pop();
        } else if(L._rawBuffer){
          buf=new Uint8Array(L._rawBuffer);
          const ext=L._rawExt||'glb';
          const fname=`models/${fileIdx++}_${safeName}.${ext}`;
          files[fname]=buf; entry.file=fname; entry.rawExt=ext;
          console.log(`[saveZIP] obj "${L.name}" → ${fname} (${(buf.length/1024).toFixed(1)}KB)`);
        } else {
          console.warn(`[saveZIP] obj "${L.name}": _rawBufferなし → GLTFExporter試行...`);
          try{
            buf=await meshToGLBBuf(L.mesh);
            const fname=`models/${fileIdx++}_${safeName}.glb`;
            files[fname]=buf; entry.file=fname; entry.rawExt='glb';
            console.log(`[saveZIP] obj "${L.name}" → GLTFExporter → ${fname} (${(buf.length/1024).toFixed(1)}KB)`);
          } catch(e){ if(opts.strictOnline)throw e; console.error(`[saveZIP] GLTFExporter失敗 "${L.name}":`,e); }
        }
      } else if(L.type==='splat'){
        if(opts.localProject){
          entry.file=await opts.localProject.resolveAsset(L);
          entry.rawExt=entry.file.split('.').pop();
          entry.isMain=L._isMain||false;
        } else if(L._rawBuffer){
          const ext=L._rawExt||'splat';
          const fname=`splat/${fileIdx++}_${L.name.replace(/[^a-zA-Z0-9_-]/g,'_')}.${ext}`;
          // Phone-class device with oversized payload: record the metadata
          // (filename, ext, isMain) but DON'T copy the raw bytes into the
          // ZIP. The loader will see entry.file pointing at a missing
          // archive member and surface it as a "re-attach this file"
          // warning rather than crashing the save.
          if(_skipSplatData){
            entry.file=fname;
            entry.rawExt=ext;
            entry.isMain=L._isMain||false;
            entry.missing=true;
            _skippedSplatCount++;
          } else {
            files[fname]=new Uint8Array(L._rawBuffer);
            entry.file=fname;
            entry.rawExt=ext;
            entry.isMain=L._isMain||false;
          }
        } else if(L._streamUrl && L._streamRef==='source' && opts.strictOnline){
          // オンライン編集の保存: 本体は元のRADを参照するだけにする（URLは書かない）。
          // 数百MBを取り直して埋め込むのをやめたので、保存は数秒で終わり、保存後も段階読み込みのまま。
          entry.streamRef='source';
          entry.rawExt=L._rawExt||'rad';
          entry.isMain=L._isMain||false;
        } else if(L._streamUrl){
          // Streaming RAD (?demo=1 / ?autoload=URL): the bytes were never
          // pulled into memory — Spark fetches chunks lazily over HTTP Range.
          //
          // TRUE-OFFLINE embed (capable devices only): fetch the whole file
          // from the source URL and embed it just like a locally-loaded splat.
          // The restore path already rebuilds RAD straight from these embedded
          // bytes (restoreProject ≈17796: new PagedSplats({fileBytes})), so no
          // restore-side change is needed — the round-trip is symmetric with a
          // drag-and-dropped .rad.
          //
          // Gate: only on NON-phone-class devices (same _isPhoneClass test as
          // _skipSplatData). On phones the 300 MB+ download + ZIP buffers OOM
          // the tab, so we keep the lightweight Option-A URL reference there.
          // _fetchStreamUrlToBytes additionally enforces MAX_EMBED_BYTES (1 GB)
          // so an extreme iPad scene still falls back to URL reference.
          const ext=L._rawExt||'rad';
          const fname=`splat/${fileIdx++}_${L.name.replace(/[^a-zA-Z0-9_-]/g,'_')}.${ext}`;
          let _embedded=false;
          if(!_isPhoneClass&&!_skipSplatData){
            console.warn('saveProjectZip: URL-streamed splat — fetching for full-offline embed:',L.name,'←',L._streamUrl);
            const r=await _fetchStreamUrlToBytes(L._streamUrl, L.name);
            if(r && r.bytes && r.bytes.length>0){
              files[fname]=r.bytes;
              entry.file=fname;
              entry.rawExt=ext;
              entry.isMain=L._isMain||false;
              // Keep the source URL alongside the embedded bytes as a recovery
              // fallback (restore prefers embedded bytes; streamUrl is only used
              // when entry._buf is absent). Also lets a future re-save re-fetch
              // if the bytes were somehow dropped.
              if(!opts.strictOnline)entry.streamUrl=L._streamUrl;
              _embedded=true;
              console.log(`[saveZIP] splat "${L.name}" embedded from URL → ${fname} (${(r.bytes.length/1048576).toFixed(1)}MB)`);
            } else if(r && r.tooBig){
              showUndoToast(window._lang==='en'
                ? `⚠ "${L.name}" too large to embed — saved as URL reference (online required)`
                : `⚠ "${L.name}" は大きすぎて埋め込み不可 — URL参照で保存（再生にネット必要）`);
            } else {
              // Network/CORS error: fall through to Option-A below.
              showUndoToast(window._lang==='en'
                ? `⚠ Couldn't fetch "${L.name}" — saved as URL reference (online required)`
                : `⚠ "${L.name}" 取得失敗 — URL参照で保存（再生にネット必要）`);
            }
          }
          if(!_embedded){
            if(opts.strictOnline)throw new Error('Incomplete streamed asset: '+L.name);
            // Option-A fallback: phone-class device, oversized file, or fetch
            // failure. Persist the source URL and let restore re-stream it. NOT
            // a fully-offline archive, but reconstructable while the URL is up.
            entry.streamUrl=L._streamUrl;
            entry.rawExt=ext;
            entry.isMain=L._isMain||false;
            console.warn('saveProjectZip: persisting streamUrl (Option-A) for',L.name,'→',L._streamUrl);
          }
        } else {
          entry.missing=true;
          console.warn('saveProjectZip: splat buffer not cached for',L.name);
        }
        // Persist orientation flags so loadProjectZip can restore the correct flip
        entry._loadFlipped   = !!L._loadFlipped;
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
      }
      if(L.type==='event'){
        entry.eventImage=L.eventImage||null;
        entry.eventImageName=L.eventImageName||null;
        entry.eventGuide=L.eventGuide||null;
        entry.eventColor=L.eventColor||'#ff8800';
      }
      if(L.type==='path'){
        entry.pathPoints=L.pathPoints?L.pathPoints.map(p=>({...p})):[];
        entry.pathLabel=L.pathLabel||'';
        entry.name=_pathLayerName(entry.pathLabel,L.id);
        entry.pathColor=L.pathColor||'#00d0ff';
        entry.pathWidth=_pathWidth(L.pathWidth);
        entry.pathOpacity=L.pathOpacity!=null?L.pathOpacity:0.28;
      }
      serialized.push(entry);
    }

    const project={
      version:4, savedAt:new Date().toISOString(),
      appName:'ロケハン3D',
      projectName:_projectName||'Untitled Project',
      camera:{pos:{x:camPos.x,y:camPos.y,z:camPos.z},yaw,pitch},
      // 「現在の視点を初期位置にする」で確定した初期視点。camera は保存時の
      // 現在視点なので、確定後にうっかり動かしてから保存しても初期位置が
      // 失われないよう別枠で持つ。旧ZIP(このキーが無い)は camera へフォールバック。
      cameraInit:{pos:{x:_initCamPos.x,y:_initCamPos.y,z:_initCamPos.z},yaw:_initYaw,pitch:_initPitch},
      layerNextId:_layerNextId,
      layers:serialized,
      walk: _walkSaveSettings(),
      // 日照シミュの都道府県のみ保存（天気・日時・ON状態は流動的なので保存しない）。
      // 新潟のスキャンを新潟に合わせて保存→受け渡し先で場所が再現される。
      sun:{ city:sun.city },
    };
    if(opts.localProject) return project;
    if(project.walk.navigationRegions){
      const regional=await _collectRegionalNavigationFiles(project.walk.navigationRegions);
      for(const [name,bytes] of regional.files)files[name]=bytes;
    }
    if(opts.strictOnline){
      for(const entry of serialized){
        if(entry.type==='splat' && entry.streamRef==='source' && !entry.missing && !entry.streamUrl)continue; // 元のRADを参照する保存（本体は埋め込まない）
        if(entry.missing || (['splat','obj'].includes(entry.type) && (!entry.file || !files[entry.file]?.byteLength)))throw new Error('Incomplete asset: '+entry.name);
        if(entry.type==='obj')_validateOnlineModelBytes(files[entry.file],entry.rawExt);
      }
      const bytes=Object.values(files).reduce((sum,value)=>sum+value.byteLength,0);
      if(bytes>MAX_EMBED_BYTES || (_isPhoneClass && bytes>PHONE_SPLAT_BUDGET))throw new Error('Device capacity insufficient for complete archive');
    }
    files['project.json']=fflate.strToU8(JSON.stringify(project,null,2));

    // ── Bundle the viewer HTML itself for fully-offline playback ──
    // The saved ZIP becomes a self-contained archive: extract it on
    // any machine, open Locahun3D_OfflineViewer.html in a browser, and
    // the scene is viewable without any network. Best-effort fetch —
    // if the request fails (e.g. file:// origin + strict CORS) we just
    // skip the HTML inclusion and the rest of the save still succeeds.
    let _bundledHtml = false;
    // Skip for lite saves: without the splat payload the bundled HTML can't
    // play anything standalone anyway, and re-fetching+re-zipping the whole
    // viewer on every checkpoint save is exactly the "why is this so slow"
    // cost a lite save exists to avoid.
    if(!_skipSplatData) if(!opts.strictOnline) try {
      if(window.__locahunWeb){
        files['Locahun3D_OfflineViewer.html']=await _fetchOfflineViewerForZip();
        _bundledHtml=true;
      }else{
        const res = await fetch(location.href, { cache: 'no-store' });
        if(res.ok){
          const htmlText = await res.text();
          files['Locahun3D_OfflineViewer.html'] = fflate.strToU8(htmlText);
          _bundledHtml = true;
        } else {
          console.warn('[saveZIP] viewer HTML fetch returned', res.status, '— skipping bundle');
        }
      }
    } catch(e){
      if(window.__locahunWeb) throw e;
      console.warn('[saveZIP] viewer HTML fetch threw — skipping bundle:', e);
    }

    // Create ZIP
    const zipEntries={};
    for(const [path,data] of Object.entries(files)){
      // Compress text-y files (JSON, HTML) at level 6; raw splat / GLB /
      // model binaries are usually already incompressible so stay at 0
      // (store) to keep zipSync fast on large scenes.
      const isCompressible = path.endsWith('.json') || path.endsWith('.html');
      zipEntries[path]=[data,{level:isCompressible?6:0}];
    }
    const zipBuf = fflate.zipSync(zipEntries);
    const blob=new Blob([zipBuf],{type:'application/zip'});
    if(opts.returnBlob) return blob;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    const _liteSuffix=_skipSplatData?'_lite':'';
    a.download=(_projectName||'scene_project').replace(/[^a-zA-Z0-9_\\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g,'_')+_liteSuffix+'.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);

    const missing=serialized.filter(e=>e.missing).length;
    // streamed = splat layers saved as a URL reference (URL-streamed RAD) with
    // no embedded bytes. They restore by re-streaming, so they are NOT counted
    // as "missing", but the ZIP is not fully offline — tell the user. NOTE: a
    // successfully embedded streamed scene also keeps entry.streamUrl as a
    // recovery fallback, so we must additionally require NO embedded file
    // (entry.file) to avoid mis-labelling a full-offline embed as URL-only.
    const streamed=serialized.filter(e=>e.streamUrl && !e.file).length;
    // fileCount = everything except project.json (and the bundled HTML
    // when present — we mention it separately so the user knows their
    // ZIP is offline-playable).
    let fileCount=Object.keys(files).length-1; // exclude project.json
    if(_bundledHtml) fileCount--;              // exclude bundled HTML
    const _en=window._lang==='en';
    const _offlineNote = _bundledHtml
      ? (_en ? ' · offline-playable' : ' · オフライン再生対応')
      : '';
    const _streamNote = streamed>0
      ? (_en ? ` · ${streamed} streamed via URL (online required)` : ` · ${streamed}件はURLストリーミング参照（再生にネット必要）`)
      : '';
    if(_skipSplatData){
      const mb = Math.round(_totalSplatBytes / 1024 / 1024);
      showUndoToast(_en
        ? `📦 Lite save: skipped ${_skippedSplatCount} splat file(s) (${mb} MB). Loading this ZIP later will ask you to re-select the original 3DGS file.`
        : `📦 軽量保存: Splat ${_skippedSplatCount}件 (${mb} MB) を除外して保存しました。次回読込時に元の3DGSファイルの選択が必要です。`);
    } else {
      showUndoToast(missing>0
        ?(_en?`⚠ ZIP save: ${missing} file(s) uncached (reload then save)`
             :`⚠ ZIP保存: ${missing}件はファイル未キャッシュ（再読込後に保存してください）`)
        :(_en?`✅ ZIP saved (${fileCount} file${fileCount===1?'':'s'} + project.json${_offlineNote}${_streamNote})`
             :`✅ ZIP保存完了 (${fileCount}ファイル + project.json${_offlineNote}${_streamNote})`));
    }
  } catch(e){
    if(opts.localProject || opts.strictOnline) throw e;
    console.error(e); showUndoToast(T('zip-fail')+e.message);
  } finally { _zipSaving = false; }
};
