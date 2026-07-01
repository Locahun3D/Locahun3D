import * as THREE from 'three';
import { SplatMesh, SplatFileType, SplatLoader, SparkRenderer, PagedSplats } from '@sparkjsdev/spark';
// OBJLoader / GLTFLoader / FBXLoader are now LAZY-loaded on first use so
// the splat viewer boots fully offline even when the addon CDN is down.
// _addonLoader('OBJLoader') etc. resolves to the constructor or null on
// network failure — the OBJ/GLB import paths handle a null result with a
// user-visible toast rather than crashing the module.
let OBJLoader = null, GLTFLoader = null;   // populated on demand
const _addonModuleCache = new Map();
async function _addonLoader(name){
  // Returns the named loader constructor, fetching once and caching. Returns
  // null if the addon CDN is unreachable (offline mode).
  if(name === 'OBJLoader' && OBJLoader) return OBJLoader;
  if(name === 'GLTFLoader' && GLTFLoader) return GLTFLoader;
  const path = (name === 'FBXLoader')
    ? 'three/addons/loaders/FBXLoader.js'
    : `three/addons/loaders/${name}.js`;
  if(_addonModuleCache.has(path)) return _addonModuleCache.get(path)?.[name] || null;
  try {
    const mod = await import(path);
    _addonModuleCache.set(path, mod);
    if(name === 'OBJLoader')  OBJLoader  = mod.OBJLoader;
    if(name === 'GLTFLoader') GLTFLoader = mod.GLTFLoader;
    return mod[name] || null;
  } catch(e){
    console.warn('[addon] '+name+' load failed (offline?):', e.message);
    _addonModuleCache.set(path, null);
    return null;
  }
}

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
const canvas = document.getElementById('c');
let renderer, scene, camera;
let splatMesh = null, splatFlipped = false;

let yaw = 0, pitch = 0;
// Roll = rotation around the camera's lens axis (dutch angle). Most of the app keeps
// roll = 0; the camera tool can dial it in for stylized framings.
let roll = 0;
// Target yaw/pitch — input handlers update these. The animate loop lerps yaw/pitch
// toward target each frame so a single fast mouse flick is spread across a few frames,
// giving Spark's depth-sort time to keep up and avoiding black unrendered edges.
let _yawTarget = 0, _pitchTarget = 0;
function setCamRotImmediate(y, p){
  yaw = _yawTarget = y;
  pitch = _pitchTarget = p;
}
const camPos  = new THREE.Vector3(0, 1.7, 4);
const _fwdVec = new THREE.Vector3();
const _rgtVec = new THREE.Vector3();
// Forward direction projected onto the ground plane (pitch removed) — used by
// the Google-Earth-style arrow/WASD "pan" so the camera glides over the scene
// horizontally regardless of how far up or down it's currently tilted.
const _fwdHoriz = new THREE.Vector3();

// ── Initial camera state (saved on file load, restored by reset button) ──
let _initCamPos = new THREE.Vector3(0, 1.7, 4);
let _initYaw = 0, _initPitch = 0;

const keys = {};
let joyDX = 0, joyDY = 0;
// Touch-device elevation pad state. These flip true while the ▲/▼ button
// is held (pointerdown→pointerup/cancel/leave) and the per-frame
// fly-camera compositor adds them like keyboard Q/E.
let touchUpHeld = false, touchDnHeld = false;
let _jvUpPtrId = -1, _jvDnPtrId = -1;
let dragOn = false, dragX = 0, dragY = 0;
let _clickStartX = 0, _clickStartY = 0;

// ── Click-to-select: raycast against all layer meshes ──
const _clickRay = new THREE.Raycaster();
const _clickV2  = new THREE.Vector2();

function _trySelectByClick(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  _clickV2.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  _clickRay.setFromCamera(_clickV2, _useOrtho ? _orthoCamera : camera);

  // ── Bone hit-zone pick first (figure layers): clicking a bone selects it for posing ──
  const boneHitMap = new Map(); // mesh → {layerId, logical}
  for(const L of layers){
    if(L.type !== 'figure' || !L.mesh || !L.visible) continue;
    if(L.figureMarkers){
      for(const mk of L.figureMarkers){
        if(mk.visible) boneHitMap.set(mk, {layerId: L.id, logical: mk.userData.figureBoneLogical});
      }
    }
  }
  if(boneHitMap.size > 0){
    const boneMeshes = [...boneHitMap.keys()];
    const boneHits = _clickRay.intersectObjects(boneMeshes, false);
    if(boneHits.length > 0){
      const info = boneHitMap.get(boneHits[0].object);
      if(info){
        // Switch selected layer if needed, then select the bone within it
        if(selectedLayerId !== info.layerId) window.selectLayer(info.layerId);
        const L = findLayer(info.layerId);
        if(L) L.figureSelectedBone = info.logical;
        if(window.setFigureSelectedBone) window.setFigureSelectedBone(info.layerId, info.logical);
        markDirty(8);
        return;
      }
    }
  }

  // Build mesh → layerId map for all selectable layers
  const meshToLayer = new Map();
  for(const L of layers){
    if(L.type === 'folder' || L.type === 'splat' || !L.mesh || !L.visible) continue;
    L.mesh.traverse(child => {
      if(child.isMesh) meshToLayer.set(child, L.id);
    });
  }
  if(meshToLayer.size === 0) return;

  const allMeshes = [...meshToLayer.keys()];
  const hits = _clickRay.intersectObjects(allMeshes, true);
  if(hits.length > 0){
    const hitLayerId = meshToLayer.get(hits[0].object);
    if(hitLayerId != null){
      window.selectLayer(hitLayerId);
    }
  } else {
    // Clicked on empty space — deselect so the pivot/handles disappear.
    if(selectedLayerId != null){
      selectedLayerId = null;
      if(window.selectedLayerIds) window.selectedLayerIds.clear();
      renderLayerList(); renderTransformPanel();
      if(typeof _pathSyncHandles==='function') _pathSyncHandles();
      markDirty(6);
    }
  }
}
let fpsT = 0, fpsN = 0;

// "Mobile" = touch-only device. A touchscreen laptop reports
// (pointer:coarse) when the user last interacted via touch, but it also
// has a mouse/trackpad so (any-hover:hover) is true. Requiring
// (any-hover:none) means we only treat *true phone/tablet* hardware as
// mobile, and notebook PCs always get the desktop UI even when their
// touch panel was the most recent input.
const isMobile = window.matchMedia('(pointer:coarse) and (any-hover:none)').matches;
// Auto-detect Mac (incl. iPad) + Retina-class displays. Spark's splat sort+draw cost
// scales with rendered pixels, and Mac WebGL is markedly slower than Win+dGPU at this
// workload. On a 2× DPR display, renderer.setPixelRatio(2.0) means ~4× the work per
// frame vs viewport — enough to drop to a few FPS on big scenes. Default such users
// to "中" (75 %); they can bump up via the 画質 panel.
const _ua = (navigator.userAgent || '');
const _platform = (navigator.platform || '');
const _isApple = /Mac|iPhone|iPad|iPod/.test(_platform) || /Mac OS X|iPhone|iPad/.test(_ua);
const _isRetinaClass = (window.devicePixelRatio || 1) >= 1.75;
// Explicit "is this an iPhone (or iPod) — i.e. a phone-sized iOS device,
// NOT an iPad". Important because viewport-based detection (e.g. the
// _splatPerfTier 'phone' classification, which keys off shortEdge < 700)
// can mis-classify an iPad in Split View / Slide Over as a phone and
// then apply phone-only memory-saving heuristics (auto stride 4 on
// >300 MB files) to a device that doesn't need them. UA check is
// reliable: iPad NEVER includes "iPhone"/"iPod" in its UA string.
const _isIPhoneOrIPod = /iPhone|iPod/.test(_ua);
// iPad detection. iPadOS 13+ identifies as MacIntel with maxTouchPoints
// > 1, so a UA-only regex misses it. Combine the UA check with the
// "Mac" + multi-touch fallback. Used so we can branch behaviour
// distinct from desktop AND from iPhone:
//   • iPad has enough tab memory to load big PLY at full quality, so
//     we skip the localStorage seed + the stride-4 runtime escalation
//     and instead just show an explanatory popup the first time the
//     user opens a heavy file.
const _isIPad = /iPad/.test(_ua) ||
                (_platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

// ── GPU capability detection ──
// Probes WebGL for the underlying GPU string and classifies into:
//   "strong" = Apple Silicon / discrete NVIDIA / AMD pro-class
//   "ok"     = unknown mid-tier (default)
//   "weak"   = old/integrated/mobile/software
// Plus Mac-specific sub-detection so Intel Macs (slow iGPU at Retina 4×) get their own
// tightened CAP, separate from Apple Silicon Macs (fast Metal-backed GPU, can handle 2×).
const _isMac = /Mac|Macintosh/.test(_platform) && !isMobile;
const _isSafari = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(_ua);
function _probeGpu(){
  let renderer='', vendor='';
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
            || document.createElement('canvas').getContext('webgl');
    if(gl){
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if(ext){
        renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
        vendor   = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   || '';
      }
    }
  } catch(_){}
  const s = (renderer + ' ' + vendor).toLowerCase();
  // Mac sub-classification
  let macKind = 'none';
  if(_isMac){
    if(/intel/.test(s)) macKind = 'intel';
    else if(/apple|metal|angle/.test(s) || (window.devicePixelRatio||1) >= 2) macKind = 'silicon';
    else macKind = 'unknown'; // Safari may hide UNMASKED entirely
  }
  // Tier
  let tier = 'ok';
  if(/apple m\d|m1|m2|m3|m4/.test(s))                                  tier = 'strong';
  else if(/(rtx|radeon (rx|pro)|geforce (gtx|rtx)|nvidia.*ti|quadro)/.test(s)) tier = 'strong';
  else if(macKind === 'silicon')                                       tier = 'strong'; // Safari-blocked Apple Silicon
  else if(macKind === 'intel')                                         tier = 'weak';   // Intel iGPU on Retina = struggles
  else if(/(intel.*(hd|uhd|iris).*(graphics )?(3\d{3}|4\d{3}|5\d{3}|6[0-3]\d|p530|p580|615|620|630|640|650|655))/.test(s)) tier = 'weak';
  else if(/(mali|adreno [3-5]\d{2}|powervr)/.test(s))                  tier = 'weak';
  else if(/swiftshader|software/.test(s))                              tier = 'weak';
  return { renderer, vendor, tier, macKind };
}
const _gpu = _probeGpu();
const _gpuTier = _gpu.tier;
const _macKind = _gpu.macKind;     // 'none' | 'silicon' | 'intel' | 'unknown'

// Initial qualScale per environment (runtime watchdog can step down further):
//   mobile (touch)  : 0.75
//   anything else   : 1.0
//
// Previously Intel Macs and weak laptops got 0.60 / 0.65 to spare their iGPU.
// That was a defensive guess pre-watchdog. With the continuous-watchdog now
// reliably defending the 30 fps floor by stepping qualScale down on slow
// frames (see animate()'s CONTINUOUS QUALITY WATCHDOG block), starting weak
// laptops at the same 1.0 ceiling as desktop is safe — the watchdog will
// drop them within a few seconds if they actually can't sustain it. This
// brings every non-touch device under one consistent "desktop" experience.
// Three-preset quality system (2026-05 redefinition):
//   低 (idx 0) = scale 0.75
//   中 (idx 1) = scale 1.0
//   高 (idx 2) = scale 1.5
// Mobile starts at 低, desktop at 中 — the old "高" / "最高" were redundant
// in practice after the watchdog took over high-end up-stepping.
// Quality auto-pick uses a BROADER touch test than `isMobile` (which requires
// any-hover:none and so misses phones that report a hover-capable pointer).
// User report: phones sometimes started at 中 instead of 低. Any coarse pointer
// OR a mobile UA now reliably seeds 低 on phones/tablets. Desktop (pointer:fine,
// no mobile UA) is unaffected and stays 中.
const _qualTouchLike = (function(){
  try { if(window.matchMedia('(pointer:coarse)').matches) return true; } catch(_){}
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent || '');
})();
let qualScale = _qualTouchLike ? 0.75 : 1.0;
let qualIdx   = _qualTouchLike ? 0    : 1;
// "Preferred" quality — the ceiling the continuous-watchdog up-steps toward
// after a downgrade. Starts as the device-tier auto pick; setQuality()
// updates it when the user manually picks a level (so the watchdog won't
// quietly raise quality above the user's explicit choice, but WILL still
// drop quality below it whenever frame-time threatens to push below 30 fps).
let _qualPreferred = qualScale;
// Sync the always-visible top-right quality badge to whichever preset we
// just auto-selected. Runs once DOM is ready since the badge element is
// emitted later in the body.
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('qib-lvl');
  const labels = [T('qt-low'),T('qt-mid'),T('qt-high')];
  if(el) el.textContent = labels[qualIdx] || '?';
  // Also reflect the auto-selected preset in the in-panel button row.
  document.querySelectorAll('#quality-panel #qbtns button')
    .forEach((b,i)=>b.classList.toggle('on', i===qualIdx));
  // Sync the move-speed slider + readout to the actual camSpeed default.
  // The markup hardcodes value="5"; on touch devices camSpeed seeds to 3,
  // so without this the slider would lie about the real speed until the
  // user first dragged it.
  {
    const _ss = document.getElementById('spdSlider');
    if(_ss) _ss.value = camSpeed;
    const _sv = document.getElementById('spdVal');
    if(_sv) _sv.textContent = camSpeed;
    const _sl = document.getElementById('spdLabel');
    if(_sl) _sl.textContent = camSpeed;
  }
  // ── iOS / iPadOS file-picker fix ──
  // iOS Files app maps `accept=".splat"`-style extension hints to UTI
  // (Uniform Type Identifier) entries. The OS has no UTI for our domain
  // formats (.splat / .ply / .spz / .ksplat), so files of those types get
  // greyed out / unselectable even when they exist locally. .zip / .glb /
  // .jpg etc. pass because they are registered system UTIs.
  // Fix: on iOS/iPadOS, clear the `accept` attribute on the data-import
  // inputs so all files are selectable. Desktop UX keeps the filter.
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if(isIOS){
    for(const id of ['lfi-any','lfi-splat','lfi-obj','fi']){
      const inp = document.getElementById(id);
      if(inp) inp.removeAttribute('accept');
    }
  }
}, { once:true });

// ── iOS / iPadOS pinch + double-tap zoom suppression ──
// Triple-layer defense against the viewport zooming on touch input:
//   1. <meta name="viewport" ... maximum-scale=1, user-scalable=no>
//      (in <head>) — declarative, respected by modern iOS Safari.
//   2. CSS `touch-action: manipulation` on html/body (in <style>) —
//      kills the 300 ms double-tap-to-zoom gesture without breaking
//      legitimate scroll inside modals / layer-panel lists.
//   3. JS preventDefault on `gesturestart` / `gesturechange` / `gestureend`
//      (iOS-only pinch events) and on `dblclick` everywhere — covers the
//      edge cases where (1) and (2) silently fail (older iPadOS, hybrid
//      WebView containers, some Chromium-based iOS browsers).
['gesturestart','gesturechange','gestureend'].forEach(ev=>{
  window.addEventListener(ev, e => { try { e.preventDefault(); } catch(_){} }, { passive:false });
});
document.addEventListener('dblclick', e => {
  // Don't kill double-click on file inputs (some browsers use it to open
  // the picker again). Anywhere else: prevent the default zoom action.
  const t = e.target;
  if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  try { e.preventDefault(); } catch(_){}
}, { passive:false });

// ── Edge-swipe browser-navigation guard (user request 2026-06) ──
// On phones a horizontal swipe from the extreme left/right screen edge fires
// Safari/Chrome back/forward navigation and yanks the user out of the viewer.
// Block it by preventing the default on single-finger touches that START
// within a thin edge band — but only when the touch isn't on an interactive
// control, so buttons / joystick / panel lists near the edge still work.
const _EDGE_SWIPE_PX = 26;
document.addEventListener('touchstart', e => {
  if(!e.touches || e.touches.length !== 1) return;
  const x = e.touches[0].clientX;
  if(x > _EDGE_SWIPE_PX && x < (window.innerWidth - _EDGE_SWIPE_PX)) return;
  const t = e.target;
  if(t && t.closest && t.closest('button,input,textarea,select,a,label,#joy,#layer-panel,.modal,[role="button"],[onclick]')) return;
  try { e.preventDefault(); } catch(_){}
}, { passive:false });
// Safari sometimes zooms when the user double-taps within ~300 ms even
// when touch-action says no. Catch via touchend timing and preventDefault
// the SECOND quick tap if it lands on a non-interactive target.
(function(){
  let lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if(now - lastTap < 320){
      const t = e.target;
      const interactive = t && (
        t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' || t.tagName === 'BUTTON' ||
        t.tagName === 'A' || (t.getAttribute && t.getAttribute('contenteditable'))
      );
      if(!interactive){
        try { e.preventDefault(); } catch(_){}
      }
    }
    lastTap = now;
  }, { passive:false });
})();
// _heavyDisplay drives renderer construction (AA off, PR_CAP tighter, lower
// shadow-map resolution). Was previously set for weak laptop GPUs and Intel
// Macs, denying them MSAA + crisp shadows. Now all non-touch devices get the
// full desktop experience; the continuous-watchdog still defends 30 fps via
// pixel-ratio downsteps if a particular machine can't sustain it.
const _heavyDisplay = false;

