// ══════════════════════════════════════════════════
//  Auto quality probe (runs once after each file load)
// ══════════════════════════════════════════════════
// Samples the rolling render-time average (_ftAvg, maintained by the main
// loop) a few seconds after a file finishes loading, then picks the
// highest quality preset that still leaves enough frame-time headroom.
// This way users land on an "optimal" preset matched to their actual
// device + scene complexity, instead of always starting at the
// device-tier default and discovering things are too slow only after
// scrolling around for a while.
//
// • Skipped entirely if the user already manually picked a quality
//   (window._gpuWatchdog.manualOverride === true). The probe is meant
//   for "first impression" tuning, not to override deliberate choice.
// • Skipped if _ftAvg hasn't yet accumulated meaningful samples
//   (the window is 60 render calls; pre-load it's noisy / zero).
// • Picks based on render-call ms vs frame budget (3-preset system):
//     <  8 ms  → 高 (preset 2, scale 1.5)
//     <  12 ms → 中 (preset 1, scale 1.0)
//     else    → 低 (preset 0, scale 0.75)
//   Headroom values are chosen so 60 fps is sustained even when the
//   scene gets busier (more layers, camera motion → more splat sorting).
// • Does NOT push an undo entry — auto-tuning shouldn't clutter the
//   undo stack. The user's first manual quality click after this still
//   captures the auto-picked value as the "before" state correctly.
let _qualityProbeScheduled = false;
function _probeOptimalQuality(){
  try{
    if(!_ftAvg || _ftAvg <= 0) return; // not enough samples yet — bail
    const ms = _ftAvg;
    let targetIdx;
    if      (ms < 8)  targetIdx = 2;
    else if (ms < 12) targetIdx = 1;
    else              targetIdx = 0;
    if(targetIdx === qualIdx) return; // already optimal — no-op
    const SCALES = [0.75, 1.0, 1.5];
    qualIdx   = targetIdx;
    qualScale = SCALES[targetIdx];
    // Also raise the watchdog's up-step ceiling to match: the probe just
    // determined this preset is sustainable, so the continuous watchdog
    // can use it as the "preferred" target after any temporary downstep.
    _qualPreferred = qualScale;
    _pendingPixelRatio = null;
    renderer.setPixelRatio(Math.min(devicePixelRatio, _PR_CAP) * qualScale);
    document.querySelectorAll('#quality-panel #qbtns button')
      .forEach((b,i)=>b.classList.toggle('on', i === targetIdx));
    _updateQiBadgeLabel(targetIdx);
    markDirty(8);
    console.info('[Locahun][AutoQuality] probe →', ['低','中','高'][targetIdx],
                 `(scale ${qualScale}, render ~${ms.toFixed(1)} ms, new ceiling)`);
  } catch(e){
    console.warn('[Locahun][AutoQuality] probe failed:', e);
  }
}
// Schedule the probe ~3.5 s after the splat finishes loading. The delay
// gives Spark's progressive sort time to stabilise so _ftAvg samples a
// representative steady-state render cost, not the heavy first frames.
// Safe to call multiple times — only the first scheduling per file
// actually runs.
window._scheduleQualityProbe = function(){
  if(_qualityProbeScheduled) return;
  _qualityProbeScheduled = true;
  setTimeout(()=>{
    _probeOptimalQuality();
    _qualityProbeScheduled = false; // allow re-probe on next file load
  }, 3500);
};

window.setFOV=function(degrees,idx){
  // Camera-tool mode owns camera.fov — its applyCamSettings() locks the
  // projection to the sensor's true vertical FOV. If we let setFOV()
  // overwrite camera.fov while cam.active, the safe-frame view ends up
  // with the wrong projection (user-reported "カメラ画角がFOVで変更され
  // てしまう"). Refuse the change in that mode and surface a toast so
  // the user knows to leave camera mode first.
  if(typeof cam !== 'undefined' && cam && cam.active){
    if(typeof showUndoToast === 'function'){
      showUndoToast('📷 カメラ撮影モード中は FOV を変更できません');
    }
    // Visual: keep the FOV button highlight in sync with the locked fov
    // (which is sensorVFov, not necessarily one of the 50/70/90/110
    // presets), so re-render the button state as 'none on'.
    document.querySelectorAll('#fovbtns button').forEach(b => b.classList.remove('on'));
    return;
  }
  const before = fov;
  fov=degrees; camera.fov=fov; camera.updateProjectionMatrix();
  const _fl = document.getElementById('fovLabel'); if(_fl) _fl.textContent = degrees+'°';
  document.querySelectorAll('#fovbtns button').forEach((b,i)=>b.classList.toggle('on',i===idx));
  markDirty(6);
  pushGenericUndo('fov', before, degrees, v=>{
    fov = v; camera.fov = v; camera.updateProjectionMatrix();
    const lbl=document.getElementById('fovLabel'); if(lbl) lbl.textContent = v+'°';
    const presets=[50,70,90,110]; const pi = presets.indexOf(v);
    document.querySelectorAll('#fovbtns button').forEach((b,i)=>b.classList.toggle('on',i===pi));
    markDirty(6);
  });
};
window.onSpeedSlider=function(v){
  const before = camSpeed;
  const after  = parseFloat(v);
  pushGenericUndo('move-speed', before, after, val=>{
    camSpeed = parseFloat(val) || 5;
    const lbl1=document.getElementById('spdLabel'); if(lbl1) lbl1.textContent = camSpeed;
    const lbl2=document.getElementById('spdVal');   if(lbl2) lbl2.textContent = camSpeed;
    const sl  =document.getElementById('spdSlider');if(sl)  sl.value = camSpeed;
  });
  camSpeed=after;
  const _spd2 = document.getElementById('spdLabel'); if(_spd2) _spd2.textContent = camSpeed;
  const _spv2 = document.getElementById('spdVal');   if(_spv2) _spv2.textContent = camSpeed;
};

// ── Central file dispatcher ──
// Handle one or multiple files: ZIP/JSON/OBJ/splat routed by extension; splat-like files
// load the first as the main scene (if no main yet) and the rest as additional layers.
async function dispatchFiles(fileList){
  const files=Array.from(fileList||[]).filter(Boolean);
  if(!files.length) return;
  // Every splat extension the viewer can actually load. `.rad`, `.sog`,
  // `.pcsogs`, `.pcsogszip` were missing here — the file picker `accept`
  // attribute listed them, but the dispatcher silently dropped them on
  // the floor, so the user saw "nothing happens" when dropping a .rad.
  const splatExts=['splat','ply','spz','ksplat','rad','sog','pcsogs','pcsogszip'];
  const hasMain = !!layers.find(l=>l._isMain);
  for(let i=0;i<files.length;i++){
    const f=files[i];
    const ext=f.name.split('.').pop().toLowerCase();
    if(ext==='zip'){ await _loadProjectZipFromFile(f); continue; }
    if(ext==='json'){ await loadProject_fromFile(f); continue; }
    if(['obj','gltf','glb','fbx'].includes(ext)){ await loadObjFile(f); continue; }
    if(splatExts.includes(ext)){
      if(!hasMain && i===0){ await loadSplatFile(f); }
      else { await loadAdditionalSplat(f); }
      continue;
    }
    showUndoToast((window._lang==='en'?'⚠ Unsupported format: ':'⚠ 非対応の形式: ')+'.'+ext);
  }
}

// (URLからダウンロード row and デモデータをダウンロード button both
// removed 2026-05; the home-screen entry point is drag-drop + file
// picker + ?demo=1 autoload only.)

// File input
const dropzone=document.getElementById('dropzone'),fi=document.getElementById('fi');
dropzone.addEventListener('click',()=>fi.click());
fi.addEventListener('change',e=>{
  if(!e.target.files.length) return;
  dispatchFiles(e.target.files);
  e.target.value='';
});
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.classList.add('over');});
dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('over'));
dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.classList.remove('over');
  dispatchFiles(e.dataTransfer.files);
});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{e.preventDefault();
  dispatchFiles(e.dataTransfer.files);
});
document.getElementById('emptyBtn').addEventListener('click',loadEmptyProject);


// ── Additional Layer file inputs ──
// Unified 'インポート' input: routes each picked file through dispatchFiles
// (the same dispatcher the drop zone uses), so it accepts every supported
// extension and the user doesn't need to pre-select 3DGS vs OBJ.
document.getElementById('lfi-any').addEventListener('change', e=>{
  if(e.target.files && e.target.files.length){
    dispatchFiles(e.target.files);
    e.target.value='';
  }
});
document.getElementById('lfi-splat').addEventListener('change',async e=>{
  const fs=Array.from(e.target.files||[]);
  for(const f of fs){ await loadAdditionalSplat(f); }
  e.target.value='';
});
document.getElementById('lfi-obj').addEventListener('change',e=>{
  if(e.target.files[0]){ loadObjFile(e.target.files[0]); e.target.value=''; }
});

// Init quality buttons  
document.querySelectorAll('#quality-panel #qbtns button').forEach((b,i)=>
  b.classList.toggle('on',i===qualIdx));


// ── Gizmo input: right-click → reset to 0; focus → push undo ──
document.querySelectorAll('#gizmo input[type=number]').forEach(inp=>{
  // Right-click anywhere on input (incl. spinner arrows) → set to 0
  inp.addEventListener('contextmenu',e=>{
    e.preventDefault();
    e.stopPropagation();
    pushUndo();
    inp.value = 0;
    window.onGizmo();
  });
  // First edit in a focus session → push undo once
  let _pushed = false;
  inp.addEventListener('focus', ()=>{ _pushed = false; });
  inp.addEventListener('input', ()=>{
    if (!_pushed) { pushUndo(); _pushed = true; }
  });
  inp.addEventListener('blur',  ()=>{ _pushed = false; });
});



// PROJECT NAME
let _projectName = 'Untitled Project';
window.startEditProjectName = function(){
  const el = document.getElementById('tb-project-name');
  if(!el) return;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = _projectName;
  inp.style.cssText = 'font-size:.78em;color:#D8D8D8;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:2px 8px;outline:none;width:220px;letter-spacing:.02em;';
  el.replaceWith(inp); inp.focus(); inp.select();
  function commit(){
    const v = inp.value.trim() || 'Untitled Project';
    _projectName = v;
    const span = document.createElement('span');
    span.id = 'tb-project-name';
    // Re-create with the SAME framed/editable style as the markup (class tb-pn +
    // visible border + bg + ✎ + single-click edit) so the affordance survives a
    // rename — user 2026-06-27.
    span.className = 'tb-pn';
    span.style.cssText = 'font-size:.78em;color:rgba(200,200,200,.9);cursor:text;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;padding:2px 22px 2px 9px;border-radius:5px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05);user-select:none;letter-spacing:.02em;';
    span.onclick = startEditProjectName;
    span.ondblclick = startEditProjectName;
    span.title = T('tt-edit-name');
    span.textContent = v;
    inp.replaceWith(span);
    document.title = v + ' - ' + (window._lang==='en' ? 'LOCAHUN 3D' : 'ロケハン3D');
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); inp.blur(); }
    if(e.key === 'Escape'){ inp.value = _projectName; inp.blur(); }
  });
};

// TOP OBJ-TYPE MENU
window.toggleObjTypeMenuTop = function(btn){
  const menu = document.getElementById('obj-type-menu-top');
  if(!menu) return;
  menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
};
window.closeObjTypeMenuTop = function(){
  const menu = document.getElementById('obj-type-menu-top');
  if(menu) menu.style.display = 'none';
};
document.addEventListener('mousedown', function(e){
  const menu = document.getElementById('obj-type-menu-top');
  const btn = document.getElementById('btnAddCubeTop');
  if(menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) menu.style.display = 'none';
});

// Ctrl key tracking for rotation snapping
document.addEventListener('keydown',e=>{ if(typeof lpv!=='undefined') lpv._ctrlHeld=e.ctrlKey||e.metaKey; });
document.addEventListener('keyup',e=>{ if(typeof lpv!=='undefined') lpv._ctrlHeld=e.ctrlKey||e.metaKey; });

// ── HUD info-box: dbl-click any value to edit ──
(function _wireHudIboxEdit(){
  const ibox = document.querySelector('#hud .ibox');
  if(!ibox) return;
  function commit(key, raw){
    const v = parseFloat(String(raw).replace(/[^\d.\-+eE]/g,''));
    if(!isFinite(v)) return;
    const r = Math.PI/180;
    switch(key){
      case 'px': camPos.x = v; markDirty(6); break;
      case 'py': camPos.y = v; markDirty(6); break;
      case 'pz': camPos.z = v; markDirty(6); break;
      case 'yaw':   setCamRotImmediate(v*r, pitch); markDirty(6); break;
      case 'pitch': setCamRotImmediate(yaw, Math.max(-Math.PI/2+0.001, Math.min(Math.PI/2-0.001, v*r))); markDirty(6); break;
      case 'roll':  roll = v*r; markDirty(6); break;
      case 'fov':
        fov = Math.max(10, Math.min(170, v));
        camera.fov = fov; camera.updateProjectionMatrix();
        // Sync FOV button row
        const fbtns = document.querySelectorAll('#fovbtns button');
        fbtns.forEach(b=>b.classList.remove('on'));
        markDirty(6);
        break;
      case 'speed':
        camSpeed = Math.max(0.1, Math.min(20, v));
        const sl = document.getElementById('spdSlider'); if(sl) sl.value = camSpeed;
        const sv = document.getElementById('spdVal'); if(sv) sv.textContent = camSpeed;
        break;
    }
    if(layers && layers.some(L=>L.type==='splat')) bumpSplatActive(1500);
  }
  ibox.addEventListener('dblclick', e=>{
    const span = e.target.closest('.ibv');
    if(!span || !ibox.contains(span)) return;
    e.preventDefault();
    const key = span.dataset.k;
    const cur = (span.textContent||'').replace(/[^\d.\-+eE]/g,'');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.inputMode = 'decimal';
    inp.className = 'ibv-edit'; inp.value = cur;
    span.replaceWith(inp);
    inp.focus(); inp.select();
    let restored = false;
    function restore(commitVal){
      if(restored) return; restored = true;
      if(commitVal) commit(key, inp.value);
      // Put the original span back; the animate loop will refresh its textContent
      inp.replaceWith(span);
    }
    inp.addEventListener('keydown', ev=>{
      ev.stopPropagation();
      if(ev.key==='Enter'){ ev.preventDefault(); restore(true); }
      else if(ev.key==='Escape'){ ev.preventDefault(); restore(false); }
    });
    inp.addEventListener('blur', ()=>restore(true));
  });
})();

