// ── 共通ヘルパー: 全メッシュを MeshBasicMaterial に変換 ──
function _applyMeshBasicToScene(root){
  if(!root) return;
  root.traverse(o=>{
    if(!o.isMesh) return;
    const conv=(mat)=>{
      if(!mat||mat.type==='MeshBasicMaterial') return mat;
      return new THREE.MeshBasicMaterial({
        color:mat.color?mat.color.clone():new THREE.Color(0xcccccc),
        map:mat.map||null,
        transparent:mat.transparent||false,
        opacity:(mat.opacity!=null)?mat.opacity:1,
        side:THREE.DoubleSide,
        vertexColors:mat.vertexColors||false,
      });
    };
    if(Array.isArray(o.material)) o.material=o.material.map(conv);
    else o.material=conv(o.material);
  });
}

async function restoreProject(project) {
  // Clear scene
  for(const L of [...layers]){
    if(L.mesh) scene.remove(L.mesh);
    if(L.wireMesh) scene.remove(L.wireMesh);
  }
  layers.length=0; selectedLayerId=null;

  // Camera
  if(project.camera){
    const {pos,yaw:py,pitch:pp}=project.camera;
    camPos.set(pos.x,pos.y,pos.z);
    if(typeof py==='number') yaw=py;
    if(typeof pp==='number') pitch=pp;
    // Save as initial camera state for reset button
    _initCamPos.copy(camPos);
    _initYaw=yaw; _initPitch=pitch;
  }
  _layerNextId=project.layerNextId||100;
  if(project.projectName){
    _projectName=project.projectName;
    const pnEl=document.getElementById('tb-project-name');
    if(pnEl) pnEl.textContent=_projectName;
    document.title=_projectName+' - ロケハン3D';
  }

  const { GLTFLoader }=await import('three/addons/loaders/GLTFLoader.js');

  for(const entry of project.layers){
    let mesh=null, wireMesh=null, rawBuffer=null;

    if(entry.type==='folder'){
      // No mesh needed
    } else if(entry.type==='cube'||entry.type==='sphere'){
      const s=entry.size||{x:1,y:1,z:1};
      const geo=entry.type==='sphere'
        ? new THREE.SphereGeometry(s.x*0.5,24,16)
        : new THREE.BoxGeometry(s.x,s.y,s.z);
      const mat=new THREE.MeshStandardMaterial({
        color:entry.cubeColor||'#ffffff', roughness:0.78, metalness:0.0,
        transparent:true,
        opacity:entry.cubeOpacity!=null?entry.cubeOpacity:0.85, side:THREE.DoubleSide,
      });
      const cm=new THREE.Mesh(geo,mat);
      cm.castShadow=true; cm.receiveShadow=true;
      const group=new THREE.Group(); group.add(cm);
      const wgeo=new THREE.EdgesGeometry(geo);
      wireMesh=new THREE.LineSegments(wgeo,new THREE.LineBasicMaterial({color:0xffffff}));
      wireMesh.visible=entry.wireframe||false;
      scene.add(wireMesh);
      mesh=group;
    } else if(entry.type==='obj'){
      const rawBuf=entry._buf
        ||(entry.rawData  ? base64ToBuf(entry.rawData)  : null)
        ||(entry.meshData ? base64ToBuf(entry.meshData) : null);
      const fileExt=(
        entry._ext
        ||entry.rawExt
        ||(entry.file ? entry.file.split('.').pop() : null)
        ||'glb'
      ).toLowerCase();

      if(rawBuf && rawBuf.byteLength > 0){
        try{
          if(fileExt==='obj'){
            const Cls = await _addonLoader('OBJLoader');
            if(!Cls) throw new Error('OBJLoader unavailable');
            const text=new TextDecoder().decode(rawBuf);
            mesh=new Cls().parse(text);
          } else if(fileExt==='fbx'){
            try{
              const Cls = await _addonLoader('FBXLoader');
              if(!Cls) throw new Error('FBXLoader unavailable');
              mesh=new Cls().parse(rawBuf);
            } catch(fe){ console.warn('FBX fail:',entry.name,fe); mesh=new THREE.Group(); }
          } else {
            // GLB/GLTF — ensure we pass a proper ArrayBuffer copy
            const Cls = await _addonLoader('GLTFLoader');
            if(!Cls) throw new Error('GLTFLoader unavailable');
            const loader=new Cls();
            const glbBuf=(rawBuf instanceof ArrayBuffer)
              ? rawBuf.slice(0)
              : new Uint8Array(rawBuf).buffer;
            const gltf=await new Promise((res,rej)=>loader.parse(glbBuf,'',res,rej));
            mesh=gltf.scene;
          }
          _applyMeshBasicToScene(mesh);
          console.log(`[restore] obj ok: ${entry.name} (${fileExt})`);
        } catch(e){
          console.error(`[restore] obj fail: ${entry.name} (${fileExt})`, e);
          mesh=new THREE.Group();
        }
      } else {
        console.warn(`[restore] obj no data: ${entry.name}`);
        mesh=new THREE.Group();
      }

    } else if(entry.type==='splat'){
      const rawBuf=entry._buf
        ||(entry.rawData ? base64ToBuf(entry.rawData) : null);
      if(rawBuf && rawBuf.byteLength > 0){
        try{
          const ext=entry._ext||entry.rawExt
            ||(entry.file ? entry.file.split('.').pop() : null)
            ||'splat';
          // Create owned buffer copy for Blob
          const bufCopy=(rawBuf instanceof ArrayBuffer)
            ? rawBuf.slice(0)
            : new Uint8Array(rawBuf).buffer;
          const blob=new Blob([bufCopy]);
          const blobURL=URL.createObjectURL(blob);
          const opts={url:blobURL, ...SPARK_QUALITY_OPTS};
          // Spark 2.x: explicit fileType required for blob: URLs (auto-detect
          // by extension can't see anything inside the blob URL).
          opts.fileName = entry.file || (entry.name + '.' + ext);
          {
            const _ft = _splatFileTypeFor(ext);
            if(_ft !== undefined) opts.fileType = _ft;
            else if(ext === 'rad'){
              throw new Error('Spark が認識できない形式です');
            }
          }
          // RAD-restored-from-ZIP needs an explicit PagedSplats (same Spark
          // 2.0.0 quirk as loadSplatFile — paged:true alone strands fileBytes).
          // We have the raw buffer right here in `bufCopy`, so feed it in
          // directly instead of going through the blob: URL.
          if(ext === 'rad'){
            opts.paged = new PagedSplats({
              fileBytes: new Uint8Array(bufCopy),
              fileType: _splatFileTypeFor('rad'),
            });
            opts.lod = true;
            opts.enableLod = true;
            opts.lodScale = _radEffectiveLodScale();
            delete opts.url;
            delete opts.fileType;
            delete opts.coneFoveate;
            delete opts.behindFoveate;
            delete opts.coneFov;
            delete opts.coneFov0;
          }
          const _radTargetCount4 = (ext === 'rad') ? _parseRadHeaderCount(new Uint8Array(bufCopy)) : 0;
          mesh=new SplatMesh(opts);
          if(_radTargetCount4 > 0) mesh._radTargetCount = _radTargetCount4;
          if(entry._loadFlipped === undefined) entry._loadFlipped = (ext==='ply'||ext==='spz');
          tuneSplatMesh(mesh);
          console.log(`[restore] splat ok: ${entry.name} (${ext}, ${(rawBuf.byteLength/1024).toFixed(1)}KB)`);
        } catch(e){
          console.error(`[restore] splat fail: ${entry.name}`, e);
          mesh=new THREE.Group();
        }
      } else if(entry.streamUrl){
        // No embedded bytes, but the project recorded a streaming source URL
        // (URL-streamed RAD saved via Option-A). Re-stream from that URL,
        // mirroring loadFromURL's RAD path. Requires the URL to be reachable
        // (i.e. online) — if it 404s/CORS-fails Spark just renders nothing.
        try{
          const surl=entry.streamUrl;
          const sext=(surl.split('?')[0].split('#')[0].split('.').pop()||'rad').toLowerCase();
          const sft=_splatFileTypeFor(sext);
          if(sext==='rad'){
            const opts={url:surl, fileType:sft, ...SPARK_QUALITY_OPTS};
            opts.lod=true; opts.enableLod=true; opts.paged=true;
            opts.lodScale=_radEffectiveLodScale();
            // Same foveation strip as loadFromURL — otherwise the LoD walker
            // never splits and only the root chunk ever loads.
            delete opts.coneFoveate; delete opts.behindFoveate;
            delete opts.coneFov; delete opts.coneFov0;
            mesh=new SplatMesh(opts);
          } else {
            // Non-RAD stream URL: hand the url straight to SplatMesh.
            const opts={url:surl, ...SPARK_QUALITY_OPTS};
            if(sft!==undefined) opts.fileType=sft;
            mesh=new SplatMesh(opts);
          }
          tuneSplatMesh(mesh);
          if(entry._loadFlipped === undefined) entry._loadFlipped=(sext==='ply'||sext==='spz');
          console.log(`[restore] splat re-streaming: ${entry.name} ← ${surl}`);
        }catch(e){
          console.error(`[restore] splat stream-restore fail: ${entry.name}`, e);
          mesh=new THREE.Group();
        }
      } else {
        console.warn(`[restore] splat no data: ${entry.name}`);
        mesh=new THREE.Group();
      }
    } else if(entry.type==='light'){
      // Restore PointLight
      const lc=entry.lightColor||'#ffffff';
      const li=entry.lightIntensity!=null?entry.lightIntensity:1.5;
      const ld=entry.lightDistance!=null?entry.lightDistance:20;
      const light=new THREE.PointLight(new THREE.Color(lc),li,ld);
      light.decay = 1; // softer linear falloff
      const sphere=new THREE.Mesh(
        new THREE.SphereGeometry(0.12,8,8),
        new THREE.MeshBasicMaterial({color:new THREE.Color(lc),depthTest:false})
      );
      sphere.renderOrder=999;
      light.add(sphere);
      scene.add(light);
      mesh=light;
    } else if(entry.type==='figure'){
      const r = await window._restoreFigureFromEntry(entry);
      mesh = r.root;
      mesh.userData.__figureRig = r;
    } else if(entry.type==='event'){
      const evGroup = new THREE.Group();
      const evColor = entry.eventColor || '#ff8800';
      const ringGeo = new THREE.RingGeometry(0.35, 0.45, 32);
      const ringMat = new THREE.MeshBasicMaterial({color:new THREE.Color(evColor), side:THREE.DoubleSide, transparent:true, opacity:0.9});
      evGroup.add(new THREE.Mesh(ringGeo, ringMat));
      const circGeo = new THREE.CircleGeometry(0.34, 32);
      const c3 = new THREE.Color(evColor); c3.lerp(new THREE.Color(1,1,1), 0.3);
      const circMat = new THREE.MeshBasicMaterial({color:c3, side:THREE.DoubleSide, transparent:true, opacity:0.35});
      evGroup.add(new THREE.Mesh(circGeo, circMat));
      const dotGeo = new THREE.CircleGeometry(0.08, 16);
      const dotMat = new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.DoubleSide});
      evGroup.add(new THREE.Mesh(dotGeo, dotMat));
      const hitGeo = new THREE.SphereGeometry(1.2, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({visible:false});
      evGroup.add(new THREE.Mesh(hitGeo, hitMat));
      evGroup.userData.isBillboard = true;
      mesh = evGroup;
    } else if(entry.type==='path'){
      mesh=_buildPathMesh(entry.pathPoints||[], entry.pathColor||'#00d0ff', entry.pathOpacity!=null?entry.pathOpacity:0.28, entry.pathLabel||'');
    }

    const L={
      id:entry.id, name:entry.name, type:entry.type,
      parentId:entry.parentId||null, mesh,
      visible:entry.visible!==false, expanded:entry.expanded!==false, locked:!!entry.locked,
      pos:entry.pos||{x:0,y:0,z:0}, rot:entry.rot||{x:0,y:0,z:0},
      size:entry.size||{x:1,y:1,z:1},
      scale:entry.scale||{x:1,y:1,z:1},
      wireframe:entry.wireframe||false, wireMesh:wireMesh||null,
      pivotSpace:entry.pivotSpace||'world',
    };
    // Determine actual stored extension from file path in ZIP or entry fields
    const storedExt = entry._ext
      || entry.rawExt
      || (entry.file ? entry.file.split('.').pop().toLowerCase() : null)
      || (entry.type==='splat' ? 'splat' : 'glb');
    // Cache raw buffer so re-saving works
    const rb = entry._buf
      || (entry.rawData  ? base64ToBuf(entry.rawData)  : null)
      || (entry.meshData ? base64ToBuf(entry.meshData) : null);
    if(rb){ L._rawBuffer=rb; L._rawExt=storedExt; }
    // Carry the streaming source URL (URL-streamed RAD) onto the restored
    // layer so a subsequent re-save persists it again instead of dropping it.
    if(entry.streamUrl){ L._streamUrl=entry.streamUrl; L._rawExt=entry.rawExt||L._rawExt||'rad'; }
    if(entry.type==='splat'){
      L._isMain=entry.isMain||false;
      if(L._isMain) splatMesh=mesh; // update global splatMesh ref
      // Restore orientation flags. New saves include them explicitly.
      // Legacy saves baked the orient flip into L.rot, so default _loadFlipped
      // to false in that case to avoid double-applying.
      L._loadFlipped   = (entry._loadFlipped   !== undefined) ? !!entry._loadFlipped : false;
      L._flipAxes      = entry._flipAxes ? {...entry._flipAxes}
                       : (entry._flipped ? {x:true,y:false,z:false} : null);
      applyLayerFlipQuat(L);
    }
    if(entry.type==='cube'||entry.type==='sphere'){
      L.cubeColor=entry.cubeColor||'#ffffff';
      L.cubeOpacity=entry.cubeOpacity!=null?entry.cubeOpacity:0.85;
    } else if(entry.type==='light'){
      L.lightColor=entry.lightColor||'#ffffff';
      L.lightIntensity=entry.lightIntensity!=null?entry.lightIntensity:1.5;
      L.lightDistance=entry.lightDistance!=null?entry.lightDistance:20;
    } else if(entry.type==='obj'){
      L.objColor=entry.objColor||null;
      L.objOpacity=entry.objOpacity!=null?entry.objOpacity:1.0;
      L.objWireframe=entry.objWireframe||false;
      L.upAxis=entry.upAxis||'y';
    }
    if(entry.type==='event'){
      L.eventImage=entry.eventImage||null;
      L.eventImageName=entry.eventImageName||null;
      L.eventGuide=entry.eventGuide||null;
      L.eventColor=entry.eventColor||'#ff8800';
    }
    if(entry.type==='path'){
      L.pathPoints=entry.pathPoints?entry.pathPoints.map(p=>({...p})):[];
      L.pathLabel=entry.pathLabel||'';
      L.pathColor=entry.pathColor||'#00d0ff';
      L.pathOpacity=entry.pathOpacity!=null?entry.pathOpacity:0.28;
      L.pathLabelSprite=(mesh&&mesh.userData)?mesh.userData.pathLabelSprite:null;
    }
    if(entry.type==='figure' && mesh && mesh.userData.__figureRig){
      const fr = mesh.userData.__figureRig;
      L.figureBones        = fr.bones;
      L.figurePose         = entry.figurePose || _emptyPoseData();
      L.figureSkinColor    = entry.figureSkinColor || '#c5c0b6';
      L.figureJointColor   = entry.figureJointColor || '#ff8844';
      L.figureShowJoints   = entry.figureShowJoints !== false;
      L.figureSelectedBone = entry.figureSelectedBone || 'pelvis';
      L.figureHeight       = entry.figureHeight || FIGURE_REF_HEIGHT_CM;
      L.figureSource       = entry.figureSource || fr.source || 'procedural';
      if(L.figureShowJoints===false){
        mesh.traverse(o=>{ if(o.userData && o.userData.jointMarker) o.visible=false; });
      }
    }
    if(mesh){ scene.add(mesh); if(!L.visible) mesh.visible=false; }
    layers.push(L);
    if(mesh) applyLayerTransform(L.id);
    if(wireMesh){ wireMesh.position.set(L.pos.x,L.pos.y,L.pos.z); }
  }

  // Restore pushes layers directly (not via addLayer), so the per-frame
  // activity counters (_activeSplatCount / _activeBillboardCount /
  // _activeFigureCount) are never refreshed by the loop above. Without this
  // recount they stay at whatever the PREVIOUS scene left them at — e.g.
  // loading a splat-less project after a splat scene leaves
  // _activeSplatCount=1, so animate() keeps running the splat-sort / active
  // window every frame for a splat that no longer exists (and the inverse
  // skips real work). Recompute from the freshly restored `layers` array.
  if(typeof _recountLayerActivity === 'function') _recountLayerActivity();

  // ── 日照シミュの都道府県のみ復元 ──（天気・日時・ON状態は保存しない＝現状維持）
  if(project.sun && typeof project.sun==='object' && typeof project.sun.city==='string' && SUN_CITIES[project.sun.city]){
    const c=SUN_CITIES[project.sun.city];
    sun.city=project.sun.city; sun.lat=c.lat; sun.lng=c.lng; sun.tz=c.tz;
    if(typeof _sunSyncForm==='function') _sunSyncForm();
  }

  renderLayerList(); renderTransformPanel();

  // Show HUD / hide drop zone (same as normal file load)
  if(layers.filter(L=>L.type!=='folder').length>0){
    showHUD(); hideDZ();
    if(layers.some(L=>L.type==='splat')) _splatActiveUntil = performance.now() + _SPLAT_ACTIVE_MS;
    // btnFlip removed (Y-flip is in layer panel)
  }
}


