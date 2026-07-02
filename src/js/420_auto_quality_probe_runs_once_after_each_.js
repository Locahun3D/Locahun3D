// ══════════════════════════════════════════════════
//  Auto-quality CALIBRATION (runs once after each file load)
// ══════════════════════════════════════════════════
// REDESIGN: the old one-shot "probe" read _ftAvg 3.5 s after load and directly
// guessed a preset. That was unsound (RC5): _ftAvg is CPU *submit* time, which
// is ~0.5 ms on big GPUs regardless of scene weight (so it always guessed 高),
// yet spikes to ~49 ms mid-RAD-stream (so it could guess 低 on a monster GPU).
// It also set pixel ratio directly, bypassing the applier (RC3), and never ran
// for URL/demo loads (RC2).
//
// New behavior: we do NOT guess a tier here. Instead, once the scene has
// SETTLED (all paged meshes reached their target splat count AND splat-active
// window elapsed) we simply OPEN A 20 s CALIBRATION WINDOW: reset the watchdog
// streaks and let the vsync-normalized closed-loop watchdog (in 291) climb to
// the true sustainable tier on its own, using a faster UP streak (180 vs 600
// frames) during the window. The watchdog measures real steady-state
// frame-time, so it converges to the correct ceiling without a fragile guess.
//
// • Skipped entirely if the user already pinned quality
//   (window._gpuWatchdog.manualOverride === true) — same as the old probe.
// • Polls every 500 ms up to 30 s waiting for "settled"; if never settled
//   (e.g. an endless stream), it just times out and does nothing.
// • Multiple schedules coalesce via the _qualityProbeScheduled flag.
// • Exported name `window._scheduleQualityProbe` is UNCHANGED so existing
//   callers (200_file_loading.js, and now 292's loadFromURL) keep working.
let _qualityProbeScheduled = false;
// "Settled" predicate — mirrors animate()'s `hasPagedLoading` check, but this
// runs OUTSIDE the animate loop (from a setInterval poller) so it needs its
// own copy of the loop rather than reading the frame-local variable.
function _sceneSettledForCalibration(){
  try{
    if(typeof layers !== 'undefined' && layers && layers.length){
      for(let i=0;i<layers.length;i++){
        const _L = layers[i];
        const _mesh = _L && _L.mesh;
        const _pm = _mesh && _mesh.paged;
        if(!_pm) continue;
        const _target = _mesh._radTargetCount || 0;
        // Still paging (target unknown yet, or below target) → not settled.
        if(_target === 0 || (_pm.numSplats||0) < _target) return false;
      }
    }
    // Also wait out the splat-active window (Spark's progressive re-sort tail).
    if(typeof _splatActiveUntil === 'number' && performance.now() <= _splatActiveUntil) return false;
    return true;
  } catch(_){ return true; } // on any error, don't block calibration forever
}
function _openCalibrationWindow(){
  try{
    if(window._gpuWatchdog && window._gpuWatchdog.manualOverride) return; // pinned
    const wd = (window._gpuWatchdog = window._gpuWatchdog || { slowStreak:0, fastStreak:0, lastStep:0 });
    const now = performance.now();
    // Reset streaks + clear the step lockout so the watchdog can act promptly
    // once the window opens, and give it a clean 20 s window during which the
    // UP requirement is 180 frames instead of 600 (see 291).
    wd.slowStreak = 0;
    wd.fastStreak = 0;
    wd.lastStep = 0;
    wd.calibrationUntil = now + 20000;
    console.info('[Locahun][AutoQuality] calibration window open (20s)');
  } catch(e){
    console.warn('[Locahun][AutoQuality] calibration failed:', e);
  }
}
// Schedule calibration after the splat finishes loading. Polls every 500 ms
// (max 30 s) until the scene is settled, THEN opens the calibration window.
// Safe to call multiple times — only the first scheduling per file runs.
window._scheduleQualityProbe = function(){
  if(_qualityProbeScheduled) return;
  if(window._gpuWatchdog && window._gpuWatchdog.manualOverride) return; // pinned → no-op
  _qualityProbeScheduled = true;
  let _polls = 0;
  const _iv = setInterval(()=>{
    _polls++;
    if(_sceneSettledForCalibration()){
      clearInterval(_iv);
      _qualityProbeScheduled = false; // allow re-schedule on next file load
      _openCalibrationWindow();
    } else if(_polls >= 60){ // 60 × 500 ms = 30 s cap
      clearInterval(_iv);
      _qualityProbeScheduled = false;
    }
  }, 500);
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

