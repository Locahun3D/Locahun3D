// ══════════════════════════════════════════════════
//  PATH OBJECT (4-point closed region + center label)
// ══════════════════════════════════════════════════
// オブジェクト追加 → 🛣パス で配置モードに入り、左クリックで4点を順に置く。
// 4点目で四角形が閉じ、半透明の塗り＋輪郭の区画になる（駐車スペース等）。
// 中央のビルボード文字（オブジェクト情報で入力）に「来客用」等を表示できる。
let _pathMode=false, _pathPts=[], _pathMarkers=[], _pathPreviewLine=null;
let _pathClickX=0, _pathClickY=0;

function _makePathLabelSprite(text, color){
  // Multi-line + auto-sizing label box (v0.0.41). The text may contain explicit
  // line breaks (\n from the textarea) AND any single line that runs too long is
  // wrapped character-by-character (works for CJK, which has no spaces). The
  // canvas, border box and world sprite scale all grow to fit the content so
  // nothing is clipped and paragraphs stay separated.
  const FONT_PX=60, LINE_H=76, PAD_X=26, PAD_Y=18, MAX_LINE_W=900;
  const MPP=0.6/128; // metres per canvas pixel — keeps glyph size == legacy 60px box
  text=(text==null?'':String(text));
  const meas=document.createElement('canvas').getContext('2d');
  meas.font='bold '+FONT_PX+'px sans-serif';
  // Wrap each explicit paragraph to MAX_LINE_W (char-based; handles Japanese).
  let lines=[];
  const paras=text.split(/\r?\n/);
  for(const para of paras){
    if(para===''){ lines.push(''); continue; }
    let cur='';
    for(const ch of para){
      const t=cur+ch;
      if(cur && meas.measureText(t).width>MAX_LINE_W){ lines.push(cur); cur=ch; }
      else cur=t;
    }
    lines.push(cur);
  }
  if(lines.length===0) lines=[''];
  let maxW=0; for(const l of lines){ maxW=Math.max(maxW, meas.measureText(l).width); }
  const boxW=Math.max(120, Math.ceil(maxW)+PAD_X*2);
  const boxH=Math.ceil(lines.length*LINE_H)+PAD_Y*2;
  const cv=document.createElement('canvas'); cv.width=boxW; cv.height=boxH;
  const x=cv.getContext('2d');
  const hasText=!!text.trim();
  if(hasText){
    x.font='bold '+FONT_PX+'px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
    x.fillStyle='rgba(0,0,0,.55)'; x.fillRect(0,0,boxW,boxH);
    x.lineWidth=4; x.strokeStyle=color||'#00d0ff'; x.strokeRect(2,2,boxW-4,boxH-4);
    x.fillStyle='#ffffff';
    const startY=PAD_Y+LINE_H/2;
    for(let i=0;i<lines.length;i++){ x.fillText(lines[i], boxW/2, startY+i*LINE_H); }
  }
  const tex=new THREE.CanvasTexture(cv);
  // Box dimensions are non-power-of-two → disable mipmaps / use linear filtering
  // so WebGL1 doesn't render the sprite black.
  tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter;
  tex.generateMipmaps=false; tex.needsUpdate=true;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false, depthWrite:false, transparent:true}));
  sp.renderOrder=9006; sp.scale.set(boxW*MPP, boxH*MPP, 1);
  sp.userData.isPathLabel=true; sp.visible=hasText;
  return sp;
}

// グループの中身（塗り＋輪郭＋中央ラベル）を local 点群から再構築。作成時/編集時に共用。
function _pathPopulateGroup(g, local, color, opacity, labelText){
  for(let i=g.children.length-1;i>=0;i--){ const o=g.children[i]; g.remove(o); if(o.geometry)o.geometry.dispose(); if(o.material){ if(o.material.map)o.material.map.dispose(); o.material.dispose(); } }
  const verts=(local||[]).map(p=>new THREE.Vector3(p.x,p.y,p.z));
  const col=new THREE.Color(color||'#00d0ff');
  const op=(opacity!=null?opacity:0.95);
  // 塗りつぶし無し。輪郭は「太さ20cmの3Dチューブ（各辺＝円柱、角＝球）」で描く。
  // 平らな帯だと地面に伏せて浅い角度から見えないため、立体にして常に見えるようにする。
  // depthTest:false で手前に重畳（地面に埋もれても確実に視認）。
  const R=0.1; // 直径20cm → 半径0.1m
  if(verts.length>=2){
    const mat=new THREE.MeshBasicMaterial({color:col, transparent:op<1, opacity:op, depthTest:false, depthWrite:false});
    const yUp=new THREE.Vector3(0,1,0);
    const n=verts.length;
    for(let i=0;i<n;i++){
      const A=verts[i], B=verts[(i+1)%n]; // 閉ループ（最後→最初も結ぶ）
      const dir=new THREE.Vector3().subVectors(B,A); const len=dir.length();
      if(len>1e-6){
        const cg=new THREE.CylinderGeometry(R,R,len,8,1,true);
        const cm=new THREE.Mesh(cg,mat);
        cm.position.copy(A).addScaledVector(dir,0.5);
        cm.quaternion.setFromUnitVectors(yUp, dir.clone().normalize());
        cm.userData.pathOutline=true; cm.renderOrder=9004; g.add(cm);
      }
      const sg=new THREE.SphereGeometry(R,10,10); // 角の継ぎ目を埋める球
      const sm=new THREE.Mesh(sg,mat);
      sm.position.copy(A); sm.userData.pathOutline=true; sm.renderOrder=9004; g.add(sm);
    }
  }
  // ラベルは local 重心に配置（点を動かすと中央に追従）
  let cx=0,cy=0,cz=0; const n=(local&&local.length)||1;
  if(local) for(const p of local){ cx+=p.x; cy+=p.y; cz+=p.z; }
  const sp=_makePathLabelSprite(labelText||'', color);
  sp.position.set(cx/n, cy/n+0.2, cz/n); g.add(sp); g.userData.pathLabelSprite=sp;
  return sp;
}
function _buildPathMesh(local, color, opacity, labelText){
  const g=new THREE.Group(); g.userData.isPath=true;
  _pathPopulateGroup(g, local, color, opacity, labelText);
  return g;
}
function _pathRebuild(L){
  if(!L||!L.mesh) return;
  _pathPopulateGroup(L.mesh, L.pathPoints, L.pathColor, L.pathOpacity, L.pathLabel||'');
  L.pathLabelSprite=L.mesh.userData.pathLabelSprite;
  _pathRefreshHandles();
}

// ── パス4点の編集ハンドル（ピボット）。選択中のパスに黄色い球を表示、左ドラッグで各点を移動 ──
let _pathEditId=null, _pathHandles=[], _pathDragH=-1;
function _pathClearHandles(){
  _pathHandles.forEach(h=>{ scene.remove(h); h.geometry.dispose(); h.material.dispose(); });
  _pathHandles=[]; _pathEditId=null; _pathDragH=-1;
}
function _pathBuildHandles(L){
  _pathClearHandles();
  if(!L || L.type!=='path' || !L.mesh || !L.pathPoints) return;
  _pathEditId=L.id;
  L.pathPoints.forEach((p,i)=>{
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.13,16,16), new THREE.MeshBasicMaterial({color:0xffd24a, depthTest:false}));
    m.renderOrder=9008; m.userData.pathHandle=i; scene.add(m); _pathHandles.push(m);
  });
  _pathRefreshHandles();
}
function _pathRefreshHandles(){
  const L=findLayer(_pathEditId);
  if(!L||!L.mesh){ if(_pathEditId!=null && !L) _pathClearHandles(); return; }
  L.mesh.updateMatrixWorld(true);
  (L.pathPoints||[]).forEach((p,i)=>{
    if(_pathHandles[i]){ const w=new THREE.Vector3(p.x,p.y,p.z); L.mesh.localToWorld(w); _pathHandles[i].position.copy(w); }
  });
}
function _pathSyncHandles(){
  const L=(typeof selectedLayerId!=='undefined')?findLayer(selectedLayerId):null;
  if(L && L.type==='path') _pathBuildHandles(L);
  else _pathClearHandles();
}
function _pathHandleAt(clientX, clientY){
  if(_pathEditId==null || !_pathHandles.length) return -1;
  const rect=canvas.getBoundingClientRect();
  let best=-1, bestD=24;
  for(let i=0;i<_pathHandles.length;i++){
    const v=_pathHandles[i].position.clone().project(camera);
    if(v.z>1) continue;
    const sx=rect.left+(v.x*0.5+0.5)*rect.width;
    const sy=rect.top+(-v.y*0.5+0.5)*rect.height;
    const d=Math.hypot(clientX-sx, clientY-sy);
    if(d<bestD){ bestD=d; best=i; }
  }
  return best;
}
function _pathUpdateHandleDrag(clientX, clientY){
  const L=findLayer(_pathEditId); if(!L||_pathDragH<0||!L.mesh) return;
  const p=pickWorldPos(clientX, clientY); if(!p) return;
  L.mesh.updateMatrixWorld(true);
  const lp=L.mesh.worldToLocal(p.clone());
  L.pathPoints[_pathDragH]={x:lp.x, y:lp.y, z:lp.z};
  _pathRebuild(L);
  if(typeof markDirty==='function') markDirty(6);
}

// ── 配置プレビュー（右クリック長押しで位置を探る、測定点と同様） ──
let _pathProbing=false, _pathProbeMarker=null;
function _pathUpdateProbe(clientX, clientY){
  const p=pickWorldPos(clientX, clientY); if(!p) return;
  if(!_pathProbeMarker){
    _pathProbeMarker=new THREE.Mesh(new THREE.SphereGeometry(0.1,16,16),
      new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.85, depthTest:false}));
    _pathProbeMarker.renderOrder=9009; scene.add(_pathProbeMarker);
  }
  _pathProbeMarker.position.copy(p);
  if(typeof markDirty==='function') markDirty(6);
}
function _pathHideProbe(){
  if(_pathProbeMarker){ scene.remove(_pathProbeMarker); _pathProbeMarker.geometry.dispose(); _pathProbeMarker.material.dispose(); _pathProbeMarker=null; }
  _pathProbing=false;
}

function _pathHint(on){
  let el=document.getElementById('path-hint');
  if(on){
    if(!el){ el=document.createElement('div'); el.id='path-hint'; el.className='guide-banner';
      el.style.background='rgba(0,150,205,.94)';
      document.body.appendChild(el); }
    el.textContent='🛣 パス: 4点を左クリック長押しで配置（押して位置を探り、離して確定 / 残り '+(4-_pathPts.length)+'）  ｜  Esc で中止';
    el.style.display='block';
  } else if(el){ el.style.display='none'; }
}

function _clearPathTemp(){
  _pathMarkers.forEach(m=>{ scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  _pathMarkers=[];
  if(_pathPreviewLine){ scene.remove(_pathPreviewLine); _pathPreviewLine.geometry.dispose(); _pathPreviewLine.material.dispose(); _pathPreviewLine=null; }
}

function _redrawPathTempLine(){
  if(_pathPreviewLine){ scene.remove(_pathPreviewLine); _pathPreviewLine.geometry.dispose(); _pathPreviewLine.material.dispose(); _pathPreviewLine=null; }
  if(_pathPts.length>=2){
    const g=new THREE.BufferGeometry().setFromPoints(_pathPts);
    _pathPreviewLine=new THREE.Line(g, new THREE.LineBasicMaterial({color:0x00d0ff, depthTest:false, transparent:true, opacity:.95}));
    _pathPreviewLine.renderOrder=9005; scene.add(_pathPreviewLine);
  }
}

function _onPathKey(e){ if(e.key==='Escape'){ e.preventDefault(); _cancelPath(); } }

function _cancelPath(){
  _pathMode=false; _clearPathTemp(); _pathPts=[]; _pathHint(false);
  document.removeEventListener('keydown', _onPathKey, true);
  if(typeof markDirty==='function') markDirty(6);
}

function _placePathPoint(clientX, clientY){
  if(!_pathMode) return;
  const p=pickWorldPos(clientX, clientY); if(!p) return;
  _pathPts.push(p.clone());
  const m=new THREE.Mesh(new THREE.SphereGeometry(0.07,12,12), new THREE.MeshBasicMaterial({color:0x00d0ff, depthTest:false}));
  m.renderOrder=9006; m.position.copy(p); scene.add(m); _pathMarkers.push(m);
  _redrawPathTempLine();
  _pathHint(true);
  if(typeof markDirty==='function') markDirty(6);
  if(_pathPts.length>=4) _finalizePath();
}

function _finalizePath(){
  const world=_pathPts.slice(0,4);
  const C=new THREE.Vector3(); world.forEach(p=>C.add(p)); C.multiplyScalar(1/world.length);
  const local=world.map(p=>({x:p.x-C.x, y:p.y-C.y, z:p.z-C.z}));
  const color='#00d0ff', opacity=0.95;
  const group=_buildPathMesh(local, color, opacity, '');
  group.position.copy(C);
  const L=addLayer({name:'Path '+_nextLayerNameNumber('path'), type:'path', mesh:group, size:{x:1,y:1,z:1}});
  L.pos={x:C.x,y:C.y,z:C.z}; L.rot={x:0,y:0,z:0}; L.scale={x:1,y:1,z:1};
  L.pathPoints=local; L.pathLabel=''; L.pathColor=color; L.pathOpacity=opacity;
  L.pathLabelSprite=group.userData.pathLabelSprite;
  pushGlobalUndo({type:'layer-add', id:L.id});  // Ctrl+Z removes the created path
  _cancelPath();
  selectLayer(L.id);
  showUndoToast('🛣 パスを作成しました — オブジェクト情報でテキストを入力できます');
}

window.addPathLayer=function(){
  if(_pathMode){ _cancelPath(); return; }
  if(_placeMode && typeof _cancelPlace==='function') _cancelPlace();
  if(typeof closeAllPanels==='function') closeAllPanels();
  _pathClearHandles();   // 配置中は既存パスの編集ハンドルを隠す
  _pathMode=true; _pathPts=[]; _clearPathTemp();
  document.addEventListener('keydown', _onPathKey, true);
  _pathHint(true);
};

// ─────────────────────────────────────────────────────────────
//  GENERIC CLICK-PLACEMENT MODE (v0.0.42)
//  Cube / Event / Figure are placed AT the clicked world location, mirroring
//  the path tool: a left-click long-press shows a preview marker that snaps to
//  the splat surface (pickWorldPos); releasing confirms and spawns the object
//  there. Right-drag still rotates the view; Esc cancels. All three add
//  functions already accept a posHint, so we just feed them the probed point.
// ─────────────────────────────────────────────────────────────
let _placeMode=null;          // null | 'cube' | 'event' | 'figure'
let _placeProbing=false, _placeProbeMarker=null;
function _placeUpdateProbe(clientX, clientY){
  const p=pickWorldPos(clientX, clientY); if(!p) return;
  if(!_placeProbeMarker){
    _placeProbeMarker=new THREE.Mesh(new THREE.SphereGeometry(0.12,16,16),
      new THREE.MeshBasicMaterial({color:0xffd400, transparent:true, opacity:.9, depthTest:false}));
    _placeProbeMarker.renderOrder=9009; scene.add(_placeProbeMarker);
  }
  _placeProbeMarker.position.copy(p);
  if(typeof markDirty==='function') markDirty(6);
}
function _placeHideProbe(){
  if(_placeProbeMarker){ scene.remove(_placeProbeMarker); _placeProbeMarker.geometry.dispose(); _placeProbeMarker.material.dispose(); _placeProbeMarker=null; }
  _placeProbing=false;
}
function _placeHint(on){
  let el=document.getElementById('place-hint');
  if(on){
    if(!el){ el=document.createElement('div'); el.id='place-hint'; el.className='guide-banner';
      el.style.background='rgba(200,150,0,.95)';
      document.body.appendChild(el); }
    el.textContent=(window._lang==='en')
      ? '📍 Long-press to place (hold to aim, release to confirm) | Esc to cancel'
      : '📍 配置する場所を左クリック長押し（押して探り、離して確定） ｜ Esc で中止';
    el.style.display='block';
  } else if(el){ el.style.display='none'; }
}
function _onPlaceKey(e){ if(e.key==='Escape'){ e.preventDefault(); _cancelPlace(); } }
function _cancelPlace(){
  _placeMode=null; _placeHideProbe(); _placeHint(false);
  document.removeEventListener('keydown', _onPlaceKey, true);
  if(typeof markDirty==='function') markDirty(6);
}
window._beginPlace=function(kind){
  if(_placeMode===kind){ _cancelPlace(); return; }   // re-select toggles off
  if(_pathMode && typeof _cancelPath==='function') _cancelPath();
  if(typeof closeAllPanels==='function') closeAllPanels();
  _placeMode=kind; _placeHideProbe();
  document.addEventListener('keydown', _onPlaceKey, true);
  _placeHint(true);
};
function _commitPlace(clientX, clientY){
  const p=pickWorldPos(clientX, clientY);
  const kind=_placeMode;
  _cancelPlace();
  if(!p || !kind) return;
  const hint=p.clone();
  if(kind==='cube'   && window.addCubeLayer)   window.addCubeLayer(hint);
  else if(kind==='event'  && window.addEventLayer)  window.addEventLayer(hint);
  else if(kind==='figure' && window.addFigureLayer) window.addFigureLayer(hint);
}

window.setPathLabel=function(id, text){
  const L=findLayer(id); if(!L||L.type!=='path') return;
  L.pathLabel=text;
  const old=L.pathLabelSprite;
  const parent=(old&&old.parent)?old.parent:L.mesh;
  const ns=_makePathLabelSprite(text, L.pathColor||'#00d0ff');
  if(old){ ns.position.copy(old.position); parent.remove(old); if(old.material.map) old.material.map.dispose(); old.material.dispose(); }
  else ns.position.set(0,0.2,0);
  parent.add(ns); L.pathLabelSprite=ns; if(L.mesh) L.mesh.userData.pathLabelSprite=ns;
  if(typeof markDirty==='function') markDirty(6);
};

window.setPathColor=function(id, hex){
  const L=findLayer(id); if(!L||L.type!=='path') return;
  L.pathColor=hex;
  if(L.mesh) L.mesh.traverse(o=>{ if(o.material && o.userData.pathOutline) o.material.color.set(hex); });
  // 中央ラベルの枠色も新しい色で描き直す（テクスチャに焼き込んでいるため再生成）
  if(typeof window.setPathLabel==='function') window.setPathLabel(id, L.pathLabel||'');
  if(typeof markDirty==='function') markDirty(6);
};

window.setPathOpacity=function(id, val){
  const L=findLayer(id); if(!L||L.type!=='path') return;
  const op=parseFloat(val); L.pathOpacity=op;
  if(L.mesh) L.mesh.traverse(o=>{
    if(o.material && o.userData.pathOutline){ o.material.opacity=op; o.material.transparent=op<1; }
  });
  if(typeof markDirty==='function') markDirty(6);
};

window.importEventImage = function(id){
  const L=findLayer(id); if(!L||L.type!=='event') return;
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  inp.onchange=function(e){
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=function(ev){
      L.eventImage=ev.target.result;
      L.eventImageName=file.name;
      renderTransformPanel();
    };
    reader.readAsDataURL(file);
  };
  inp.click();
};

window.showEventImage = function(id){
  const L=findLayer(id); if(!L||L.type!=='event'||!L.eventImage) return;
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  const img=document.createElement('img');
  img.src=L.eventImage;
  img.style.cssText='max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 4px 32px rgba(0,0,0,.6)';
  ov.appendChild(img);
  ov.onclick=function(){ document.body.removeChild(ov); };
  document.body.appendChild(ov);
};

window.clearEventImage = function(id){
  const L=findLayer(id); if(!L||L.type!=='event') return;
  L.eventImage=null; L.eventImageName=null;
  renderTransformPanel();
};

window.setEventGuide = function(id, text){
  const L=findLayer(id); if(!L||L.type!=='event') return;
  L.eventGuide=text;
};

