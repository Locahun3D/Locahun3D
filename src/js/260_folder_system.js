// ══════════════════════════════════════════════════
//  FOLDER SYSTEM
// ══════════════════════════════════════════════════
window.addFolder = function() {
  const id = _layerNextId++;
  const L = {
    id, name:`Folder ${_nextLayerNameNumber('folder')}`, type:'folder',
    mesh:null, visible:true, expanded:true, parentId:null,
    pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0}, size:{x:1,y:1,z:1},
    wireframe:false, wireMesh:null,
  };
  layers.push(L);
  renderLayerList();
  showUndoToast(T('folder-added'));
  return L;
};

window.toggleFolder = function(id, ev) {
  if(ev) ev.stopPropagation();
  const L = findLayer(id);
  if(!L || L.type !== 'folder') return;
  L.expanded = !L.expanded;
  renderLayerList();
};

window.startRenameLayer = function(id, ev) {
  if(ev){ ev.stopPropagation(); ev.preventDefault(); }
  const L = findLayer(id);
  if(!L) return;
  const nameEl = document.querySelector(`#lr-${id} .lr-name`);
  if(!nameEl) return;
  const inp = document.createElement('input');
  inp.className = 'lr-name-input';
  inp.value = L.name;
  inp.style.flex='1'; inp.style.minWidth='0';
  inp.onclick = e => e.stopPropagation();
  inp.ondblclick = e => e.stopPropagation();
  inp.ondragstart = e => e.stopPropagation();
  inp.onkeydown = e => {
    e.stopPropagation();
    if(e.key==='Enter'||e.key==='Escape'){
      if(e.key==='Enter') L.name = inp.value.trim() || L.name;
      renderLayerList();
    }
  };
  inp.onblur = () => { L.name = inp.value.trim() || L.name; renderLayerList(); };
  nameEl.replaceWith(inp);
  // iOS Safari only raises the on-screen keyboard when focus() runs
  // SYNCHRONOUSLY inside the tap gesture — a deferred (rAF-only) focus is
  // ignored, which is why layer names couldn't be edited on iPad. Focus now,
  // and retry next frame for engines that need layout first.
  try { inp.focus(); inp.select(); } catch(_){}
  requestAnimationFrame(()=>{ try { inp.focus(); inp.select(); } catch(_){} });
};

function buildLayerTree() {
  const childMap = {};
  for (const L of layers) {
    const pid = L.parentId || null;
    if(pid){ if(!childMap[pid]) childMap[pid]=[]; childMap[pid].push(L); }
  }
  const result = [];
  function walk(items, depth) {
    for (const L of items) {
      result.push({layer:L, depth});
      if(L.type==='folder' && L.expanded && childMap[L.id]) walk(childMap[L.id], depth+1);
    }
  }
  walk(layers.filter(L=>!L.parentId), 0);
  return result;
}

let _dragLayerId=null, _dragOverId=null, _dragPos='after';

window.onLayerDragStart = function(ev, id) {
  _dragLayerId=id;
  ev.dataTransfer.effectAllowed='move';
  ev.dataTransfer.setData('text/plain',String(id));
  setTimeout(()=>{ const el=document.getElementById(`lr-${id}`); if(el) el.style.opacity='0.35'; },0);
};
window.onLayerDragOver = function(ev, id) {
  ev.preventDefault();
  if(_dragLayerId===id) return;
  ev.dataTransfer.dropEffect='move';
  const targetL=findLayer(id);
  const rect=ev.currentTarget.getBoundingClientRect();
  const y=ev.clientY-rect.top;
  _dragOverId=id;
  const el=ev.currentTarget;
  el.classList.remove('drag-before','drag-after','drag-inside');
  if(targetL&&targetL.type==='folder'&&y>=rect.height*.25&&y<=rect.height*.75){
    _dragPos='inside'; el.classList.add('drag-inside');
  } else if(y<rect.height/2){
    _dragPos='before'; el.classList.add('drag-before');
  } else {
    _dragPos='after'; el.classList.add('drag-after');
  }
};
window.onLayerDragLeave = function(ev) {
  ev.currentTarget.classList.remove('drag-before','drag-after','drag-inside');
};
window.onLayerDrop = function(ev, targetId) {
  ev.preventDefault();
  document.querySelectorAll('.lr').forEach(e=>e.classList.remove('drag-before','drag-after','drag-inside'));
  const srcEl=document.getElementById(`lr-${_dragLayerId}`); if(srcEl) srcEl.style.opacity='';
  if(!_dragLayerId||_dragLayerId===targetId){ _dragLayerId=null; return; }
  const dragL=findLayer(_dragLayerId), targetL=findLayer(targetId);
  if(!dragL||!targetL){ _dragLayerId=null; return; }
  // Prevent dropping folder into its own subtree
  if(dragL.type==='folder'){
    let cur=targetL;
    while(cur&&cur.parentId){ if(cur.parentId===dragL.id){ _dragLayerId=null; return; } cur=findLayer(cur.parentId); }
  }
  const srcIdx=layers.indexOf(dragL); if(srcIdx>=0) layers.splice(srcIdx,1);
  if(_dragPos==='inside'&&targetL.type==='folder'){
    dragL.parentId=targetId;
    let ins=layers.indexOf(targetL)+1;
    for(let i=ins;i<layers.length;i++){ if(layers[i].parentId===targetId) ins=i+1; else break; }
    layers.splice(ins,0,dragL);
  } else {
    dragL.parentId=targetL.parentId||null;
    const tIdx=layers.indexOf(targetL);
    layers.splice(_dragPos==='before'?tIdx:tIdx+1,0,dragL);
  }
  _dragLayerId=null; _dragOverId=null;
  renderLayerList();
};
window.onLayerDragEnd = function(ev, id) {
  document.querySelectorAll('.lr').forEach(e=>e.classList.remove('drag-before','drag-after','drag-inside'));
  const el=document.getElementById(`lr-${id}`); if(el) el.style.opacity='';
  _dragLayerId=null;
};

// Click-on-header collapse / expand for the scene layer panel. Default state
// (set on the #layer-panel element) is collapsed, so first-time users see
// just the header strip + the bottom 読み込み/書き出し footer without the
// (initially empty) layer list eating vertical space.
window.toggleLayerPanelCollapse = function(e){
  if(e && e.stopPropagation) e.stopPropagation();
  const panel = document.getElementById('layer-panel');
  if(!panel) return;
  panel.classList.toggle('collapsed');
  if(typeof _updateLpWidthVar === 'function') _updateLpWidthVar();
  // The camera composition frame uses the layer panel's right edge as its
  // left bound — when the panel collapses to just its header, the frame
  // should expand into the freed canvas band. Re-layout if in camera mode.
  if(typeof cam !== 'undefined' && cam && cam.active){
    if(typeof layoutCamFrame === 'function') layoutCamFrame();
    if(typeof drawCamGrid    === 'function') drawCamGrid();
  }
};

function renderLayerList(){
  const el=document.getElementById('layer-list'); if(!el) return;
  const tree=buildLayerTree();
  const noSceneTxt = window._lang==='en' ? 'No scene yet' : 'まだシーンがありません';
  if(!tree.length){
    el.innerHTML=`<div style="font-size:.72em;color:#404040;padding:10px;text-align:center">${noSceneTxt}</div>`;
    return;
  }
  el.innerHTML=tree.map(({layer:L,depth})=>{
    const isFolder=L.type==='folder';
    const _fClr='';  // v26: folder color now applied via SVG icon fill
    const _fc=isFolder?(L.folderColor||'#e8a838'):'';
    const _evtClr=L.type==='event'?(L.eventColor||'#ff8800'):'';
    const icon=isFolder?`<svg width="14" height="11" viewBox="0 0 14 11" style="vertical-align:middle"><path d="M0 1.5C0 .67.67 0 1.5 0H4.8L6.2 1.5H12.5C13.33 1.5 14 2.17 14 3V9.5C14 10.33 13.33 11 12.5 11H1.5C.67 11 0 10.33 0 9.5Z" fill="${_fc}"/></svg>`:(L.type==='event'?`<svg width="14" height="14" viewBox="0 0 14 14" style="vertical-align:middle"><circle cx="7" cy="7" r="6" fill="${_evtClr}" opacity="0.85"/><circle cx="7" cy="7" r="2" fill="white"/></svg>`:(LAYER_ICONS[L.type]||'📄'));
    const childCount=isFolder?layers.filter(l=>l.parentId===L.id).length:0;
    const badge=isFolder&&childCount?`<span style="font-size:.72em;color:#605840"> (${childCount})</span>`:'';
    // Chevron for folders: ▼ expanded, ▶ collapsed (explicit button only)
    const chevron=isFolder
      ?`<span class="lr-chevron" onclick="event.stopPropagation();toggleFolder(${L.id},event)" title="${L.expanded?T('folder-collapse'):T('folder-expand')}">${L.expanded?'▼':'▶'}</span>`
      :'';
    const renameTip=T('rename-tip');
    const isSel = (window.selectedLayerIds && window.selectedLayerIds.has(L.id)) || selectedLayerId===L.id;
    // Camera-layer-specific row controls: 🔒/🔓 (lock toggle) + 🎬 (jump
    // to this camera's saved pose). Lock semantics: when ON, the live
    // viewport snaps back to the saved pose every frame WHILE this
    // camera is the selected layer — so accidental WASD / drag input
    // bounces back. OFF lets the user move freely after teleporting.
    // 🎬 explicitly re-applies the saved pose + framing without needing
    // to deselect / re-select the row (useful after wandering with the
    // camera unlocked).
    const _camCtl = (L.type === 'camera') ? `
      <span class="lr-cam-lock" onclick="event.stopPropagation();toggleCameraLayerLock(${L.id})"
            title="${L.locked ? (window._lang==='en'?'Locked — click to unlock':'ロック中（クリックで解除）') : (window._lang==='en'?'Unlocked — click to lock':'ロック解除（クリックでロック）')}"
            style="cursor:pointer;opacity:${L.locked?1:.55};margin-right:2px">${L.locked?'🔒':'🔓'}</span>
      <span class="lr-cam-goto" onclick="event.stopPropagation();viewCameraLayer(${L.id})"
            title="${window._lang==='en'?'Jump to this camera (load pose + framing)':'このカメラに移動（画角・設定を読込）'}"
            style="cursor:pointer;margin-right:2px">🎬</span>` : '';
    return `<div class="lr${isSel?' selected':''}${isFolder?' lr-folder':''}"
      style="padding-left:${7+depth*14}px" id="lr-${L.id}" draggable="true"
      onclick="selectLayer(${L.id}, event)"
      ondblclick="startRenameLayer(${L.id},event)"
      ondragstart="onLayerDragStart(event,${L.id})"
      ondragover="onLayerDragOver(event,${L.id})"
      ondragleave="onLayerDragLeave(event)"
      ondrop="onLayerDrop(event,${L.id})"
      ondragend="onLayerDragEnd(event,${L.id})">
      ${chevron}
      <span class="lr-eye" onclick="event.stopPropagation();setLayerVisible(${L.id},${!L.visible})">${L.visible?'👁':'🚫'}</span>
      <span class="lr-icon" ${isFolder?'ondblclick="event.stopPropagation();openFolderColorPicker('+L.id+',event)" title="'+T('folder-color')+'" style="cursor:pointer;'+_fClr+'"':(L.type==='event'?'ondblclick="event.stopPropagation();openEventColorPicker('+L.id+',event)" title="Change event color" style="cursor:pointer"':'')}>${icon}</span>
      <span class="lr-name" title="${L.name} ［${renameTip}］">${L.name}${badge}</span>
      ${_camCtl}
      ${isFolder?`<span class="lr-lock" onclick="event.stopPropagation();toggleFolderLock(${L.id})" title="${L.locked?(window._lang==='en'?'Unlock (enable editing)':'ロック解除（編集可に）'):(window._lang==='en'?'Lock folder (disable editing of its contents)':'フォルダーをロック（中身の編集を無効化）')}" style="font-size:.8em;cursor:pointer;flex-shrink:0;opacity:${L.locked?'1':'.4'};user-select:none;margin-left:2px">${L.locked?'🔒':'🔓'}</span>`:''}
      <span class="lr-edit" onclick="event.stopPropagation();startRenameLayer(${L.id},event)" title="${renameTip}" style="font-size:.82em;cursor:pointer;flex-shrink:0;opacity:.5;user-select:none;margin-left:2px">✏️</span>
      <span class="lr-del" onclick="event.stopPropagation();removeLayer(${L.id})">🗑</span>
    </div>`;
  }).join('');
}


window.setCubeColor=function(id,hex){
  const L=findLayer(id); if(!L||(L.type!=='cube'&&L.type!=='sphere')) return;
  L.cubeColor=hex;
  const mesh=L.mesh.children[0];
  if(mesh&&mesh.material) mesh.material.color.set(hex);
  markDirty(4);
};
window.setCubeOpacity=function(id,v){
  const L=findLayer(id); if(!L||(L.type!=='cube'&&L.type!=='sphere')) return;
  L.cubeOpacity=parseFloat(v);
  const mesh=L.mesh.children[0];
  if(mesh&&mesh.material){ mesh.material.opacity=L.cubeOpacity; mesh.material.transparent=true; }
  const lbl=document.getElementById('lt-op-val');
  if(lbl) lbl.textContent=Math.round(L.cubeOpacity*100)+'%';
  markDirty(4);
};

window.setObjColor=function(id,hex){
  const L=findLayer(id); if(!L||L.type!=='obj') return;
  L.objColor=hex;
  L.mesh.traverse(o=>{
    if(!o.isMesh) return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    mats.forEach(m=>{ if(m&&m.color) m.color.set(hex); });
  });
  markDirty(4);
};
window.setObjOpacity=function(id,v){
  const L=findLayer(id); if(!L||L.type!=='obj') return;
  L.objOpacity=parseFloat(v);
  L.mesh.traverse(o=>{
    if(!o.isMesh) return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    mats.forEach(m=>{ if(m){ m.opacity=L.objOpacity; m.transparent=true; } });
  });
  const lbl=document.getElementById('lt-op-val'); if(lbl) lbl.textContent=Math.round(L.objOpacity*100)+'%';
  markDirty(4);
};
window.toggleObjWireframe=function(id){
  const L=findLayer(id); if(!L||L.type!=='obj') return;
  L.objWireframe=!L.objWireframe;
  L.mesh.traverse(o=>{
    if(!o.isMesh) return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    mats.forEach(m=>{ if(m) m.wireframe=L.objWireframe; });
  });
  const cb=document.getElementById('lt-obj-wire'); if(cb) cb.checked=L.objWireframe;
  markDirty(4);
};
window.setObjUpAxis=function(id,axis){
  const L=findLayer(id); if(!L||L.type!=='obj') return;
  L.upAxis=axis;
  // Adjust mesh rotation to compensate for axis convention
  if(axis==='z'){
    L.mesh.rotation.x=-Math.PI/2;
  } else {
    L.mesh.rotation.x=0;
  }
  applyLayerTransform(id);
  renderTransformPanel();
};
// ── ピボット座標系の切替 (全レイヤータイプ共通) ──
window.setLayerPivotSpace=function(id,space){
  const L=findLayer(id); if(!L) return;
  L.pivotSpace=space;
  renderTransformPanel();
};
// 後方互換エイリアス
window.setObjPivotSpace=window.setLayerPivotSpace;
function renderTransformPanel(){
  const el=document.getElementById('layer-transform'); if(!el) return;
  const L=findLayer(selectedLayerId);
  // Reset any leftover height override on the layer list — let the default flex:1 share apply
  const _list = document.getElementById('layer-list');
  if(_list && _list.style.flex === 'none'){
    _list.style.flex='';
    _list.style.height='';
  }
  if(!L||L.type==='folder'){ el.style.display='none'; el.innerHTML=''; return; }
  // Locked (inside a locked folder): show a read-only notice instead of the
  // editable transform controls.
  if(typeof _isLayerLocked==='function' && _isLayerLocked(selectedLayerId)){
    el.style.display='block';
    el.innerHTML='<div style="padding:10px;text-align:center;color:#c9a23a;font-size:.8em;line-height:1.5;background:rgba(255,200,80,.06);border:1px solid rgba(255,200,80,.18);border-radius:6px">🔒 '
      +(window._lang==='en'
        ? 'This layer is in a <b>locked folder</b>.<br>Unlock the folder (🔓) to edit.'
        : 'このレイヤーは<b>ロック中のフォルダー</b>内です。<br>編集するにはフォルダーのロックを解除（🔓）してください。')
      +'</div>';
    return;
  }
  el.style.display='block';
  const {pos:p,rot:r,size:s}=L;
  const sc=L.scale||{x:1,y:1,z:1};
  const pivSp=L.pivotSpace||'world';

  // ── ローカル / ワールド座標切替 ──
  const coordToggle=`
  <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;padding:4px 5px;background:rgba(255,255,255,.03);border-radius:5px;border:1px solid rgba(255,255,255,.07)">
    <span style="font-size:.65em;color:#505050;white-space:nowrap;flex-shrink:0">${T('lt-coord')}</span>
    <button onclick="setLayerPivotSpace(${L.id},'world')"
      style="flex:1;background:${pivSp==='world'?'rgba(255,180,84,.18)':'#1a1a1a'};border:1px solid ${pivSp==='world'?'rgba(255,180,84,.6)':'rgba(255,255,255,.1)'};color:${pivSp==='world'?'#ffd49a':'#404040'};border-radius:4px;padding:3px 0;font-size:.68em;cursor:pointer;transition:all .15s">${T('lt-world')}</button>
    <button onclick="setLayerPivotSpace(${L.id},'local')"
      style="flex:1;background:${pivSp==='local'?'rgba(100,255,150,.18)':'#1a1a1a'};border:1px solid ${pivSp==='local'?'rgba(100,255,150,.6)':'rgba(255,255,255,.1)'};color:${pivSp==='local'?'#88ffaa':'#404040'};border-radius:4px;padding:3px 0;font-size:.68em;cursor:pointer;transition:all .15s">${T('lt-local')}</button>
  </div>`;

  let html=`<div class="lt-title">${LAYER_ICONS[L.type]} ${L.name}</div>
  ${coordToggle}
  <div class="lt-section">${T('lt-pos')} (${pivSp==='local'?T('lt-pos-local'):T('lt-pos-world')})</div>
  <div class="lt-row">
    <span class="la" style="color:#ff5566">X</span><input type="number" id="lt-px" step="0.01" value="${p.x.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#55ee66">Y</span><input type="number" id="lt-py" step="0.01" value="${p.y.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#5599ff">Z</span><input type="number" id="lt-pz" step="0.01" value="${p.z.toFixed(2)}" oninput="readTransformInputs(${L.id})">
  </div>
  <div class="lt-section">${T('lt-rot')}</div>
  <div class="lt-row">
    <span class="la" style="color:#ff5566">X</span><input type="number" id="lt-rx" step="1" value="${r.x.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#55ee66">Y</span><input type="number" id="lt-ry" step="1" value="${r.y.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#5599ff">Z</span><input type="number" id="lt-rz" step="1" value="${r.z.toFixed(2)}" oninput="readTransformInputs(${L.id})">
  </div>
  <div class="lt-section">${T('lt-scale')}</div>
  <div class="lt-row">
    <span class="la" style="color:#ff6677">X</span><input type="number" id="lt-scx" step="0.01" min="0.01" value="${sc.x.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#66ee88">Y</span><input type="number" id="lt-scy" step="0.01" min="0.01" value="${sc.y.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#77aaff">Z</span><input type="number" id="lt-scz" step="0.01" min="0.01" value="${sc.z.toFixed(2)}" oninput="readTransformInputs(${L.id})">
  </div>`;
  // ── Event: position-only panel (no rotation/scale) ──
  if(L.type==='event'){
    html=`<div class="lt-title">${LAYER_ICONS[L.type]} ${L.name}</div>
  <div class="lt-section">${T('lt-pos')}</div>
  <div class="lt-row">
    <span class="la" style="color:#ff5566">X</span><input type="number" id="lt-px" step="0.01" value="${p.x.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#55ee66">Y</span><input type="number" id="lt-py" step="0.01" value="${p.y.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#5599ff">Z</span><input type="number" id="lt-pz" step="0.01" value="${p.z.toFixed(2)}" oninput="readTransformInputs(${L.id})">
  </div>`;
  }
  // ── Splat: 軸反転ボタン (X / Y / Z 180°回転) ──
  if(L.type==='splat'){
    const fa = L._flipAxes || {x: !!L._flipped, y:false, z:false};
    const mkBtn=(ax,label)=>{
      const on=!!fa[ax];
      return `<button onclick="flipLayerOrientation(${L.id},'${ax}')"
        style="flex:1;background:${on?'rgba(255,120,0,.18)':'#1a1a1a'};border:1px solid ${on?'rgba(255,120,0,.6)':'rgba(255,255,255,.1)'};color:${on?'#ffaa55':'#888'};border-radius:4px;padding:4px 0;font-size:.72em;cursor:pointer">
        🔄 <span>${label}</span>
      </button>`;
    };
    html+=`<div class="lt-section">${T('lt-viewadj')}</div>
  <div class="lt-row" style="gap:6px">
    ${mkBtn('x',T('lt-flip-x'))}
    ${mkBtn('y',T('lt-flip-y'))}
    ${mkBtn('z',T('lt-flip-z'))}
  </div>`;
  }
  // ── Light: intensity/color ──
  if(L.type==='light'){
    const lc=L.lightColor||'#ffffff';
    const li=L.lightIntensity!=null?L.lightIntensity:1.5;
    html+=`<div class="lt-section">${T('lt-light')}</div>
  <div class="lt-row" style="align-items:center;gap:6px">
    <span class="la" style="color:#ffee88;width:auto;font-size:.68em">${T('lt-light-color')}</span>
    <input type="color" value="${lc}" oninput="setLightColor(${L.id},this.value)"
      style="width:36px;height:22px;padding:1px;border:1px solid rgba(255,255,255,.2);background:#1a1a00;border-radius:3px;cursor:pointer">
    <span class="la" style="color:#ffee88;width:auto;font-size:.68em">${T('lt-light-int')}</span>
    <input type="range" min="0" max="5" step="0.1" value="${li.toFixed(1)}"
      oninput="setLightIntensity(${L.id},parseFloat(this.value))" style="flex:1;height:4px;accent-color:#ffee88">
    <span style="font-size:.68em;color:#ffee8877;min-width:28px">${li.toFixed(1)}</span>
  </div>`;
  }
  if(L.type==='obj'){
    const col=L.objColor||'#aaaaaa';
    const op=(L.objOpacity!=null?L.objOpacity:1.0);
    const upAx=L.upAxis||'y';
    html+=`<div class="lt-section">${T('lt-upaxis')}</div>
  <div class="lt-row" style="gap:6px">
    <button onclick="setObjUpAxis(${L.id},'y')" style="flex:1;background:${upAx==='y'?'rgba(255,255,255,.13)':'#1a1a1a'};border:1px solid ${upAx==='y'?'#D8D8D8':'rgba(255,255,255,.1)'};color:${upAx==='y'?'#D8D8D8':'#404040'};border-radius:4px;padding:3px 0;font-size:.68em;cursor:pointer">${T('lt-yup')}</button>
    <button onclick="setObjUpAxis(${L.id},'z')" style="flex:1;background:${upAx==='z'?'rgba(255,255,255,.13)':'#1a1a1a'};border:1px solid ${upAx==='z'?'#D8D8D8':'rgba(255,255,255,.1)'};color:${upAx==='z'?'#D8D8D8':'#404040'};border-radius:4px;padding:3px 0;font-size:.68em;cursor:pointer">${T('lt-zup')}</button>
  </div>
  <div class="lt-section">${T('lt-appear')}</div>
  <div class="lt-row" style="align-items:center;gap:6px">
    <span class="la" style="color:#D8D8D8;width:auto;font-size:.68em">${T('lt-color')}</span>
    <input type="color" value="${col}" oninput="setObjColor(${L.id},this.value)"
      style="width:36px;height:22px;padding:1px;border:1px solid rgba(255,255,255,.2);background:#1a1a00;border-radius:3px;cursor:pointer">
    <span class="la" style="color:#D8D8D8;width:auto;font-size:.68em">${T('lt-opacity')}</span>
    <input type="range" min="0" max="1" step="0.05" value="${op.toFixed(2)}"
      oninput="setObjOpacity(${L.id},this.value)" style="flex:1;height:4px;accent-color:#D8D8D8">
    <span id="lt-op-val" style="font-size:.68em;color:#D8D8D877;min-width:24px">${Math.round(op*100)}%</span>
  </div>
  <label class="lt-wire"><input type="checkbox" id="lt-obj-wire" ${L.objWireframe?'checked':''} onchange="toggleObjWireframe(${L.id})"> ${T('lt-wire')}</label>`;
  }
  if(L.type==='figure'){
    const sel  = L.figureSelectedBone || 'pelvis';
    const skin = L.figureSkinColor  || '#dcd8d2';
    const jclr = L.figureJointColor || '#888888';
    const bonePose = (L.figurePose && L.figurePose[sel]) || {x:0,y:0,z:0};
    const fh = L.figureHeight || FIGURE_REF_HEIGHT_CM;
    const lastPose = L.figureLastPose || '';
    html+=`<div class="lt-section">${T('lt-fig-height')}</div>
  <div class="lt-row" style="align-items:center;gap:6px">
    <input type="number" id="lt-fig-h-num" min="10" max="10000" step="1" value="${fh.toFixed(0)}" oninput="setFigureHeight(${L.id},this.value)" style="flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,.15);color:#D8D8D8;border-radius:4px;padding:3px 6px;font-size:.78em;text-align:right">
    <span id="lt-fig-h-val" style="font-size:.66em;color:#88ccff77;min-width:24px">cm</span>
  </div>`;
    const _hasBones = L.figureBones && Object.keys(L.figureBones).length > 0;
    const opts = (_hasBones ? FIGURE_BONE_ORDER.filter(n => L.figureBones[n]) : FIGURE_BONE_ORDER)
      .map(n=>{
        const lab = (window._lang==='en' ? n : (FIGURE_BONE_LABELS[n] || n));
        return `<option value="${n}" ${n===sel?'selected':''}>${lab}</option>`;
      }).join('');
    if(!_hasBones){
      console.warn('[figure] Layer has no bones mapped — pose controls will not affect mesh', L);
    }
    const axisRow = (axis, color, val) => `
  <div class="lt-row" style="align-items:center;gap:6px;margin-top:3px">
    <span style="color:${color};font-size:.7em;width:14px;text-align:center;font-weight:600">${axis.toUpperCase()}</span>
    <input type="range" id="lt-bone-r${axis}-rng" min="-180" max="180" step="1" value="${val}" oninput="setFigureBoneRotation(${L.id},'${sel}','${axis}',this.value);document.getElementById('lt-bone-r${axis}').value=parseFloat(this.value).toFixed(0)" style="flex:1;height:4px;accent-color:${color}">
    <input type="number" id="lt-bone-r${axis}" step="5" value="${val.toFixed(0)}" oninput="setFigureBoneRotation(${L.id},'${sel}','${axis}',this.value);document.getElementById('lt-bone-r${axis}-rng').value=parseFloat(this.value)" style="width:54px;background:#1a1a1a;border:1px solid rgba(255,255,255,.15);color:#D8D8D8;border-radius:4px;padding:2px 4px;font-size:.7em;text-align:right">
    <span style="font-size:.6em;color:#666">°</span>
  </div>`;
    const poseBtn=(key,label,clr)=>{
      const isOn = lastPose===key;
      return `<button onclick="applyFigurePose(${L.id},'${key}')" style="flex:1;background:${isOn?clr:clr+'22'};border:1px solid ${isOn?clr:clr+'55'};color:${isOn?'#111':clr};border-radius:4px;padding:4px 0;font-size:.7em;cursor:pointer;font-weight:${isOn?'600':'400'}">${label}</button>`;
    };
    html+=`<div class="lt-section">${T('lt-fig-rig')}</div>
  <div class="lt-row" style="align-items:center;gap:6px;margin-bottom:4px">
    <span class="la" style="color:#ff8844;width:auto;font-size:.68em">${T('lt-fig-bone')}</span>
    <select onchange="setFigureSelectedBone(${L.id},this.value)" style="flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,.15);color:#D8D8D8;border-radius:4px;padding:3px 4px;font-size:.72em;cursor:pointer">${opts}</select>
  </div>
  ${axisRow('x','#ff5566', bonePose.x||0)}
  ${axisRow('y','#55ee66', bonePose.y||0)}
  ${axisRow('z','#5599ff', bonePose.z||0)}
  <div class="lt-section">${T('lt-fig-poses')}</div>
  <div class="lt-row" style="gap:4px;flex-wrap:wrap">
    ${poseBtn('basic',  T('lt-pose-basic'),   '#88ccff')}
    ${poseBtn('tpose',  T('lt-pose-tpose'),   '#88ddaa')}
    ${poseBtn('sit',    T('lt-pose-sit'),     '#ffaa66')}
  </div>
  <div class="lt-row" style="gap:4px;margin-top:4px;flex-wrap:wrap">
    ${poseBtn('walk',   T('lt-pose-walk'),    '#cc99ff')}
    ${poseBtn('run',    T('lt-pose-run'),     '#ff8844')}
    ${poseBtn('look_up',T('lt-pose-look-up'), '#ffcc44')}
    ${poseBtn('dance',  T('lt-pose-dance'),   '#ff66bb')}
  </div>
  <!-- Skin-color picker removed (figure 外観 color change feature dropped).
       setFigureSkinColor() remains exported so any saved-project restore
       path that previously stored figureSkinColor still resolves without
       throwing; the function still recolors limbs if called externally. -->
  <div class="lt-row" style="align-items:center;gap:6px">
    <button onclick="toggleFigureBones(${L.id})" style="flex:1;background:${L.figureShowBones!==false?'rgba(255,136,68,.25)':'#1a1a1a'};border:1px solid ${L.figureShowBones!==false?'#ff8844':'rgba(255,255,255,.1)'};color:${L.figureShowBones!==false?'#ffaa77':'#666'};border-radius:4px;padding:4px 6px;font-size:.7em;cursor:pointer">🦴 ${T('lt-fig-show-bones')}</button>
  </div>
  <!-- 🔄 ポーズリセット and 📋 現在のポーズを書き出し buttons removed.
       resetFigurePose / exportFigurePose remain exported on window so any
       hotkey / saved-project / scripted caller still resolves cleanly. -->`;
  }
  if(L.type==='cube'||L.type==='sphere'){
    // サイズ(W/H/D)は球のみ表示。立方体は冗長なので非表示（拡縮=スケールで調整）。
    if(L.type==='sphere'){
    html+=`<div class="lt-section">${T('lt-size')}</div>
  <div class="lt-row">
    <span class="la" style="color:#ff5566">W</span><input type="number" id="lt-sw" step="0.01" min="0.01" value="${s.x.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#55ee66">H</span><input type="number" id="lt-sh" step="0.01" min="0.01" value="${s.y.toFixed(2)}" oninput="readTransformInputs(${L.id})">
    <span class="la" style="color:#5599ff">D</span><input type="number" id="lt-sd" step="0.01" min="0.01" value="${s.z.toFixed(2)}" oninput="readTransformInputs(${L.id})">
  </div>`;
    }
    html+=`<div class="lt-section">${T('lt-appear')}</div>
  <div class="lt-row" style="align-items:center;gap:6px">
    <span class="la" style="color:#D8D8D8;width:auto;font-size:.68em">${T('lt-color')}</span>
    <input type="color" value="${L.cubeColor||'#ffffff'}" oninput="setCubeColor(${L.id},this.value)"
      style="width:36px;height:22px;padding:1px;border:1px solid rgba(255,255,255,.2);background:#1a1a00;border-radius:3px;cursor:pointer">
    <span class="la" style="color:#D8D8D8;width:auto;font-size:.68em">${T('lt-opacity')}</span>
    <input type="range" min="0" max="1" step="0.05" value="${(L.cubeOpacity!=null?L.cubeOpacity:0.85).toFixed(2)}"
      oninput="setCubeOpacity(${L.id},this.value)"
      style="flex:1;height:4px;accent-color:#D8D8D8">
    <span id="lt-op-val" style="font-size:.68em;color:#D8D8D877;min-width:24px">${((L.cubeOpacity||0.85)*100).toFixed(0)}%</span>
  </div>
  <label class="lt-wire"><input type="checkbox" id="lt-wire" ${L.wireframe?'checked':''} onchange="toggleCubeWireframe(${L.id})"> ${T('lt-wire')}</label>`;
  }
  el.innerHTML=html;
  // ── Event: image import panel ──
  if(L.type==='event'){
    let evH = '<div style="margin-top:8px;padding:6px 5px;background:rgba(255,255,255,.03);border-radius:5px;border:1px solid rgba(255,255,255,.07)">';
    evH += '<div style="font-size:.7em;color:#606060;margin-bottom:4px">'+T('lt-event')+'</div>';
    if(L.eventImage){
      evH += '<div style="font-size:.68em;color:#909090;margin-bottom:4px">'+(L.eventImageName||'')+'</div>';
      evH += '<img src="'+L.eventImage+'" onclick="showEventImage('+L.id+')" style="width:100%;max-height:160px;object-fit:contain;border-radius:4px;border:1px solid rgba(255,255,255,.1);cursor:pointer;margin-bottom:4px;display:block" title="クリックで拡大">';
      evH += '<div style="display:flex;gap:4px">';
      evH += '<button onclick="showEventImage('+L.id+')" style="flex:1;background:#2A2A2C;border:1px solid rgba(255,255,255,.1);color:#ffd49a;border-radius:4px;padding:3px 6px;font-size:.7em;cursor:pointer">'+T('lt-ev-show')+'</button>';
      evH += '<button onclick="clearEventImage('+L.id+')" style="flex:1;background:#2A2A2C;border:1px solid rgba(255,255,255,.1);color:#ff8888;border-radius:4px;padding:3px 6px;font-size:.7em;cursor:pointer">'+T('lt-ev-clr')+'</button>';
      evH += '</div>';
    } else {
      evH += '<button onclick="importEventImage('+L.id+')" style="width:100%;background:#2A2A2C;border:1px solid rgba(255,255,255,.1);color:#ffaa44;border-radius:4px;padding:4px 8px;font-size:.72em;cursor:pointer">'+T('lt-ev-img')+'</button>';
    }
    // Event guide text field
    evH += '<div style="margin-top:6px">';
    evH += '<div style="font-size:.7em;color:#606060;margin-bottom:3px">🗒 イベントガイド</div>';
    evH += '<textarea rows="2" style="width:100%;background:#2A2A2C;border:1px solid rgba(255,255,255,.1);color:#C0C0C0;border-radius:4px;padding:4px 6px;font-size:.72em;resize:vertical;box-sizing:border-box;outline:none;font-family:inherit" oninput="window.setEventGuide('+L.id+',this.value)" placeholder="ガイドテキスト...">'+(L.eventGuide||'')+'</textarea>';
    evH += '</div>';
    evH += '</div>';
    el.innerHTML += evH;
  }
  // ── Path: color / opacity / center label ──
  if(L.type==='path'){
    let ph='<div style="margin-top:8px;padding:6px 5px;background:rgba(255,255,255,.03);border-radius:5px;border:1px solid rgba(255,255,255,.07)">';
    ph+='<div style="font-size:.7em;color:#606060;margin-bottom:4px">🛣 パス情報</div>';
    ph+='<div style="font-size:.66em;color:#7a8aa0;margin-bottom:6px">黄色い4点をドラッグで形を調整できます</div>';
    ph+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">';
    ph+='<input type="color" value="'+(L.pathColor||'#00d0ff')+'" oninput="setPathColor('+L.id+',this.value)" style="width:36px;height:22px;padding:1px;border:1px solid rgba(255,255,255,.2);background:#1a1a00;border-radius:3px;cursor:pointer">';
    ph+='<span style="font-size:.68em;color:#909090;width:auto">不透明度</span>';
    ph+='<input type="range" min="0" max="1" step="0.05" value="'+(L.pathOpacity!=null?L.pathOpacity:0.28)+'" oninput="setPathOpacity('+L.id+',this.value)" style="flex:1;height:4px;accent-color:#D8D8D8">';
    ph+='</div>';
    ph+='<div style="font-size:.7em;color:#606060;margin-bottom:3px">🅿 中央テキスト</div>';
    ph+='<textarea rows="2" style="width:100%;background:#2A2A2C;border:1px solid rgba(255,255,255,.1);color:#C0C0C0;border-radius:4px;padding:4px 6px;font-size:.72em;resize:vertical;box-sizing:border-box;outline:none;font-family:inherit" oninput="window.setPathLabel('+L.id+',this.value)" placeholder="例: 来客用 P1 / 搬入車両 ...">'+(L.pathLabel||'')+'</textarea>';
    ph+='</div>';
    el.innerHTML += ph;
  }
  // ── 変換パネルの数値入力: 右クリック → 0 リセット ──
  el.querySelectorAll('input[type=number]').forEach(inp=>{
    inp.addEventListener('contextmenu',e=>{
      e.preventDefault(); e.stopPropagation();
      const L2=findLayer(selectedLayerId); if(!L2) return;
      if(!L2._undoPending){
        L2._undoPending=true;
        pushGlobalUndo({type:'layer-transform',id:L2.id,pos:{...L2.pos},rot:{...L2.rot},size:{...L2.size},scale:{...(L2.scale||{x:1,y:1,z:1})}});
        setTimeout(()=>{ if(L2) L2._undoPending=false; },800);
      }
      inp.value=0;
      window.readTransformInputs(L2.id);
    });
  });
}

// ── Add Cube Layer ──
// Snap a freshly-spawned primitive onto the nearest grid intersection.
// The scene GridHelper is 200×200 with 1 m cells, so grid lines fall on
// integer world X/Z — Math.round() picks the closest crossing. We also
// rest the object on the grid floor (bottom at y≈0) so "place on the grid"
// reads literally instead of leaving it floating at eye height. restHalf
// is the object's half-height (0.5 for the unit cube, 0.6 for the sphere).
function _snapSpawnToGrid(group, restHalf){
  group.position.x = Math.round(group.position.x);
  group.position.z = Math.round(group.position.z);
  group.position.y = restHalf;
}

window.addCubeLayer = function(posHint){
  const geo=new THREE.BoxGeometry(1,1,1);
  // Use MeshStandardMaterial (PBR) so the cube responds to the scene's
  // ambient + directional lights, matching the shading model used by figure
  // meshes. The previous MeshBasicMaterial was unlit and looked flat
  // compared to figures placed in the same scene.
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.78,metalness:0.0,transparent:true,opacity:.85,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geo,mat);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  const group=new THREE.Group();
  group.add(mesh);
  // Edge wireframe (default hidden)
  const wgeo=new THREE.EdgesGeometry(geo);
  const wmat=new THREE.LineBasicMaterial({color:0xffffff,depthTest:true});
  const wireMesh=new THREE.LineSegments(wgeo,wmat);
  wireMesh.visible=false;
  scene.add(wireMesh);
  if(posHint) group.position.copy(posHint);
  else {
    // Spawn 1 m along the camera's forward vector (not -Z world) so the cube
    // appears directly in front of the user regardless of yaw / pitch.
    const _fwd = new THREE.Vector3(); camera.getWorldDirection(_fwd);
    group.position.copy(camPos).addScaledVector(_fwd, 1);
    _snapSpawnToGrid(group, 0.5); // unit cube → half-height 0.5
  }
  const p=group.position;
  const L=addLayer({name:`Cube ${_nextLayerNameNumber('cube')}`,type:'cube',mesh:group,size:{x:1,y:1,z:1}});
  L.cubeColor='#ffffff'; L.cubeOpacity=0.85;
  L.wireMesh=wireMesh;
  L.pos={x:p.x,y:p.y,z:p.z};
  wireMesh.position.copy(group.position);
  pushGlobalUndo({type:'layer-add', id:L.id});  // Ctrl+Z removes the added cube
  selectLayer(L.id);
};
window.addCubeLayer = window.addCubeLayer;

// ── Sphere layer ──
window.addSphereLayer = function(posHint){
  const geo=new THREE.SphereGeometry(0.6,24,16);
  const mat=new THREE.MeshBasicMaterial({color:0x44aaff,transparent:true,opacity:.85,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geo,mat);
  mesh.castShadow=true;
  const group=new THREE.Group();
  group.add(mesh);
  // Wireframe
  const wgeo=new THREE.EdgesGeometry(geo);
  const wireMesh=new THREE.LineSegments(wgeo,new THREE.LineBasicMaterial({color:0xffffff,depthTest:true}));
  wireMesh.visible=false;
  scene.add(wireMesh);
  if(posHint) group.position.copy(posHint);
  else {
    group.position.set(camPos.x,camPos.y-0.5,camPos.z-2);
    _snapSpawnToGrid(group, 0.6); // sphere radius 0.6
  }
  const p=group.position;
  const L=addLayer({name:`Sphere ${_nextLayerNameNumber('sphere')}`,type:'sphere',mesh:group,size:{x:1,y:1,z:1}});
  L.cubeColor='#ffb454'; L.cubeOpacity=0.85;
  L.wireMesh=wireMesh;
  L.pos={x:p.x,y:p.y,z:p.z};
  wireMesh.position.copy(group.position);
  selectLayer(L.id);
};

// sphere type mirrors cube behaviour (updateCubeGeometry, renderTransformPanel, etc.)
const SPHERE_ICON='⚽';

