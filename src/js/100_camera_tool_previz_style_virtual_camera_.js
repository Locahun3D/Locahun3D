// ══════════════════════════════════════════════════
//  CAMERA TOOL  (previz-style virtual camera + capture)
// ══════════════════════════════════════════════════
// Sensor presets in millimeters (width × height), real-world spec sheet values.
// Sources cross-checked against vendor PDFs:
//   ARRI Alexa 35  : arri.com/resource/blob/296424/.../alexa-35-recording-format-poster-data.pdf
//   ARRI Alexa 65  : arri.com (Alexa 65 sensor 54.12 × 25.58 mm)
//   RED V-Raptor   : docs.red.com/955-0199 (8K VV = 40.96 × 21.60 mm)
//   Sony Venice 2  : pro.sony product page (8.6K full-frame 35.9 × 24.0 mm)
//   Blackmagic URSA Cine 12K LF: blackmagicdesign.com tech-specs (35.63 × 23.32 mm)
//   Canon EOS C70  : canon-europe.com (Super 35 26.2 × 13.8 mm)
//   BMPCC 6K       : blackmagicdesign.com (23.10 × 12.99 mm)
// Photo/mirrorless dimensions are standard ISO format references.
const SENSOR_PRESETS = {
  // ── Photo / mirrorless ────────────────────────────────────────────
  ff:   { w:36.0,  h:24.0,  group:'photo' },  // Full-frame (3:2)
  apsc: { w:23.6,  h:15.7,  group:'photo' },  // APS-C (Sony / Nikon, 3:2)
  apsh: { w:28.7,  h:19.0,  group:'photo' },  // APS-H (Canon 1D, 3:2)
  mft:  { w:17.3,  h:13.0,  group:'photo' },  // Micro Four Thirds (4:3)
  // ── Compact / Phone ──────────────────────────────────────────────
  // "型" (the 1/x.x "inch type") is the legacy imaging-circle diameter; the mm
  // below are the ACTUAL photosensitive area (smaller than the nominal type).
  // The aspect picker crops these exactly like any sensor — e.g. 1-inch
  // 13.2×8.8 at 16:9 → 13.2×7.42, 1/2.3" 6.17×4.55 at 16:9 → 6.17×3.47.
  oneinch: { w:13.2, h:8.8,  group:'compact' }, // 1型 (RX100 等, 3:2)
  phone13: { w:9.8,  h:7.3,  group:'compact' }, // 1/1.3型 フラッグシップ機 (4:3)
  phone17: { w:7.6,  h:5.7,  group:'compact' }, // 1/1.7型 (4:3)
  phone23: { w:6.17, h:4.55, group:'compact' }, // 1/2.3型 (4:3)
  // ── Cinema ────────────────────────────────────────────────────────
  ax35og:{ w:27.99, h:19.22, group:'cine' }, // ARRI Alexa 35 — 4.6K Open Gate
  ax35:  { w:24.89, h:14.00, group:'cine' }, // ARRI Alexa 35 — 4K 16:9
  ax65:  { w:54.12, h:25.58, group:'cine' }, // ARRI Alexa 65
  vraptor8k:{ w:40.96, h:21.60, group:'cine' }, // RED V-Raptor 8K VV
  venice2: { w:35.90, h:24.00, group:'cine' }, // Sony Venice 2 — 8.6K Full Frame
  ursa12k: { w:35.63, h:23.32, group:'cine' }, // Blackmagic URSA Cine 12K LF
  c70:    { w:26.20, h:13.80, group:'cine' }, // Canon EOS C70 — Super 35
  bmpcc6k:{ w:23.10, h:12.99, group:'cine' }, // BMPCC 6K
  // ── Legacy keys (kept so existing saved projects + capture metadata
  //    still resolve to the matching modern preset) ─────────────────
  m65:   { w:54.12, h:25.58, group:'cine', alias:'ax65' },
  s35:   { w:24.89, h:14.00, group:'cine', alias:'ax35' },
  bm46k: { w:23.10, h:12.99, group:'cine', alias:'bmpcc6k' },
};
const cam = {
  active: false,
  sensor: 'ff',
  sw: 36, sh: 24,
  focal: 35,
  wb: 5600,         // Kelvin; 5600 = no tint (daylight reference)
  rig: '',
  shot: '',
  env:  '',         // ショット環境 (時間帯/天候 等)
  note: '',         // 備考 (動き / 演出メモ 等)
  aspect: 16/9,     // default delivery aspect (FHD 16:9). null = use sensor.
  margin: 5,
  // grids: SET of active grid types — multi-select. Each toggles independently.
  // Members: thirds | golden | cross | diag | safe-action | safe-title | center-mark | custom
  grids: new Set(['thirds']),
  gridOpacity: 0.85,
  gridCols: 3,
  gridRows: 3,
  jpegQ: 0.92,
  // Default OFF so 撮影 yields a CLEAN delivery-resolution frame that is pixel-
  // identical to the live safe-frame preview (16:9 → exactly 1920×1080). When ON,
  // composeBurnInFrame wraps the shot in a metadata BORDER, which necessarily makes
  // the file larger than 1920×1080 and insets the image — i.e. capture no longer
  // matches the preview 1:1. The user can still enable the metadata sheet via the
  // メタデータをバーンイン checkbox when they want it.
  burnin: false,
  includeGrid: false,   // burn the grid/safe rect into the captured JPEG
  export4K: false,      // when true, capture at 2× the standard resolution
  prevFOV: 90,
};

function _camGetEl(id){ return document.getElementById(id); }
function _camPullFields(){
  // Guarded reads — Camera Angle / White Balance sections were removed; the
  // related inputs (cm-pan/tilt/roll/wb/wb-slider) may not exist in the DOM.
  const _v = (id, parser, fallback) => {
    const e = _camGetEl(id); if(!e) return fallback;
    const p = parser ? parser(e.value) : e.value;
    return (p == null || Number.isNaN(p)) ? fallback : p;
  };
  cam.sw       = _v('cm-sw',    parseFloat, cam.sw);
  cam.sh       = _v('cm-sh',    parseFloat, cam.sh);
  cam.focal    = _v('cm-focal', parseFloat, cam.focal);
  cam.wb       = _v('cm-wb',    parseFloat, cam.wb);
  cam.rig      = _v('cm-rig',   null, cam.rig);
  cam.shot     = _v('cm-shot',  null, cam.shot);
  cam.env      = _v('cm-env',   null, cam.env);
  cam.note     = _v('cm-note',  null, cam.note);
  cam.margin   = _v('cm-margin', parseFloat, cam.margin);
  cam.gridCols = Math.max(1, _v('cm-grid-cols', parseInt, cam.gridCols||3));
  cam.gridRows = Math.max(1, _v('cm-grid-rows', parseInt, cam.gridRows||3));
  const gOpEl  = _camGetEl('cm-grid-opacity');
  if(gOpEl){
    cam.gridOpacity = (parseFloat(gOpEl.value)||0) / 100;
    const gOpVal = _camGetEl('cm-grid-opacity-val');
    if(gOpVal) gOpVal.textContent = Math.round(cam.gridOpacity*100) + '%';
  }
  drawCamGrid();
  const _bn = _camGetEl('cm-burnin'); if(_bn) cam.burnin = _bn.checked;
  const _gEl = _camGetEl('cm-burnin-grid'); if(_gEl) cam.includeGrid = _gEl.checked;
  const _marginVal = _camGetEl('cm-margin-val');
  if(_marginVal) _marginVal.textContent = cam.margin + '%';
  const _focalSlider = _camGetEl('cm-focal-slider');
  if(_focalSlider) _focalSlider.value = cam.focal;
  const _wbSlider = _camGetEl('cm-wb-slider');
  if(_wbSlider) _wbSlider.value = cam.wb;
}
function _camPushFields(){
  // Same null-guards as _camPullFields above.
  const _set = (id, v) => { const e = _camGetEl(id); if(e) e.value = v; };
  const _setText = (id, v) => { const e = _camGetEl(id); if(e) e.textContent = v; };
  _set('cm-sw',           cam.sw);
  _set('cm-sh',           cam.sh);
  _set('cm-focal',        cam.focal);
  _set('cm-focal-slider', cam.focal);
  _set('cm-wb',           cam.wb);
  _set('cm-wb-slider',    cam.wb);
  _set('cm-margin',       cam.margin);
  _setText('cm-margin-val', cam.margin + '%');
  _set('cm-grid-cols',    cam.gridCols);
  _set('cm-grid-rows',    cam.gridRows);
  const gOpEl2 = _camGetEl('cm-grid-opacity');
  if(gOpEl2){
    gOpEl2.value = Math.round(cam.gridOpacity * 100);
    _camGetEl('cm-grid-opacity-val').textContent = Math.round(cam.gridOpacity * 100) + '%';
  }
  const _bn2 = _camGetEl('cm-burnin'); if(_bn2) _bn2.checked = cam.burnin;
  const _gEl3 = _camGetEl('cm-burnin-grid');
  if(_gEl3) _gEl3.checked = !!cam.includeGrid;
  // Camera angle inputs were removed; guarded reads keep this push a no-op
  // when those elements are absent (which is the new default).
  const panEl  = _camGetEl('cm-pan');
  const tiltEl = _camGetEl('cm-tilt');
  const rollEl = _camGetEl('cm-roll');
  const rollSlider = _camGetEl('cm-roll-slider');
  if(panEl)  panEl.value  = _normYawDeg(yaw).toFixed(1);
  if(tiltEl) tiltEl.value = (pitch * 180 / Math.PI).toFixed(1);
  const rollDeg = (roll * 180 / Math.PI).toFixed(1);
  if(rollEl)  rollEl.value  = rollDeg;
  if(rollSlider) rollSlider.value = rollDeg;
}

// ── LENS / SENSOR MATH (DOUBLE-CHECKED against real-camera spec sheets) ──
// A pinhole lens with focal length f and sensor of half-extent (w/2, h/2) projects
// onto a sensor with angular extents:
//   horizontal_FOV = 2 * atan( w / (2*f) )
//   vertical_FOV   = 2 * atan( h / (2*f) )
//   diagonal_FOV   = 2 * atan( sqrt(w² + h²) / (2*f) )
// Three.js PerspectiveCamera takes VERTICAL FOV in degrees and applies the viewport
// aspect to derive horizontal. Therefore — to make the SAFE-FRAME area show exactly
// what a real {sw × sh, focal=f} camera would record — we need the safe-frame's
// VERTICAL angular extent to equal sensor_vertical_FOV. If the safe-frame height is
// less than the viewport height (e.g. wide/anamorphic aspect on a 16:9 screen), we
// must SCALE camera.fov UP so the smaller safe-frame still subtends the same angle:
//   camera.fov = sensor_vertical_FOV * (viewportHeight / safeFrameHeight)
// And for the safe-frame WIDTH, since the safe-frame's aspect equals the sensor's,
// horizontal extent automatically matches sensor_horizontal_FOV — guaranteed by the
// fact that camera.fov × (safe_w / safe_h) ≡ sensor_h_fov × (sw/sh) ≡ sensor_h_fov.
// Verified for FF/35mm: 36×24 mm @ 35mm → 38.6° v / 54.4° h / 63.4° diag (matches DPR).
// Effective sensor extent for the user's chosen aspect: the largest rectangle
// of cam.aspect that fits inside the physical sensor (sw × sh). This matches
// real-camera behaviour where a wider aspect (e.g. 2.39 on a 1.5 sensor) is
// achieved by cropping horizontal-bound, NOT by exposing more vertical area.
function _camEffectiveSensorWH(){
  const userAr = cam.aspect; // null/undefined → use sensor's native aspect (no crop)
  if(userAr == null || !isFinite(userAr) || userAr <= 0){
    return { w: cam.sw, h: cam.sh };
  }
  const sensorAr = cam.sw / cam.sh;
  if(userAr > sensorAr){
    // User aspect is wider than sensor → keep sensor width, shrink height
    return { w: cam.sw, h: cam.sw / userAr };
  } else {
    // User aspect is taller/equal → keep sensor height, shrink width
    return { w: cam.sh * userAr, h: cam.sh };
  }
}
function _camSensorVFovDeg(){
  const eff = _camEffectiveSensorWH();
  return 2 * Math.atan(eff.h / (2 * cam.focal)) * 180 / Math.PI;
}
function _camSensorHFovDeg(){
  const eff = _camEffectiveSensorWH();
  return 2 * Math.atan(eff.w / (2 * cam.focal)) * 180 / Math.PI;
}
// 35mm-equivalent focal length: ratio of FF diagonal to sensor diagonal.
function _camEquiv35(){
  const cropFactor = Math.hypot(36, 24) / Math.hypot(cam.sw, cam.sh);
  return cam.focal * cropFactor;
}
// Compute the safe-frame rectangle (px) inside the viewport for a given sensor aspect
// and user margin (% of viewport). Returns {x,y,w,h,viewportW,viewportH}.
function _camFrameRect(){
  const W = innerWidth, H = innerHeight;
  const margin = Math.max(0, Math.min(40, cam.margin)) / 100;
  // Center the safe-frame horizontally between the LEFT sidebar
  // (#layer-panel, scene-layer) and the RIGHT sidebar (#cam-panel, camera
  // tool). Each panel's right/left edge defines the usable viewport band;
  // when a panel is hidden (touch device, panel collapsed off-screen)
  // OR collapsed to just its header (.collapsed class on #layer-panel),
  // its bound falls back to the viewport edge so the grid expands to use
  // the freed-up canvas area.
  const _panelBound = (el, side) => {
    if(!el) return (side === 'left') ? 0 : W;
    const cs = getComputedStyle(el);
    if(cs.display === 'none' || cs.visibility === 'hidden') return (side === 'left') ? 0 : W;
    // Collapsed panels keep only their header strip visible; the camera
    // composition frame should expand into the freed canvas band beside it.
    if(el.classList && el.classList.contains('collapsed')) return (side === 'left') ? 0 : W;
    const r = el.getBoundingClientRect();
    if(r.width <= 0) return (side === 'left') ? 0 : W;
    return (side === 'left') ? r.right : r.left;
  };
  const leftBound  = _panelBound(document.getElementById('layer-panel'), 'left');
  const rightBound = _panelBound(document.getElementById('cam-panel'),   'right');
  // 12 px breathing room between the frame and each sidebar.
  const usableLeft  = Math.max(0, leftBound  + 12);
  const usableRight = Math.min(W, rightBound - 12);
  const usableW = Math.max(0, usableRight - usableLeft);
  const availW = usableW * (1 - 2*margin);
  const availH = H * (1 - 2*margin);
  const ar = cam.aspect || (cam.sw / cam.sh);
  // Fit (availW, availH) preserving ar
  let h = availH, w = h * ar;
  if(w > availW){ w = availW; h = w / ar; }
  const x = usableLeft + (usableW - w) / 2;
  const y = (H - h) / 2;
  return { x, y, w, h, viewportW:W, viewportH:H };
}

// Approximate Planckian-locus mapping (kelvin → RGB multiplier, 1.0 = neutral).
// Uses a simplified curve where 5600 K is neutral white. Lower K boosts blue, higher K
// boosts red — the perceptual direction the user expects when twisting a WB knob.
function _camWBMult(kelvin){
  const k = Math.max(2000, Math.min(12000, kelvin));
  // Delta in 100K units from 5600K reference
  const d = (k - 5600) / 100;
  // Each +100K → +0.6% red, -0.6% blue. Tweaked so 3200K and 8000K look perceptually
  // distinct without crushing channels. ~±0.14 at extremes.
  const r = 1 + d * 0.006;
  const g = 1 + d * 0.001;
  const b = 1 - d * 0.006;
  return {
    r: Math.max(0.5, Math.min(1.4, r)),
    g: Math.max(0.7, Math.min(1.2, g)),
    b: Math.max(0.5, Math.min(1.4, b)),
  };
}

// Normalize a yaw value to [-180, 180] degrees for display.
function _normYawDeg(rad){
  let d = (rad * 180 / Math.PI) % 360;
  if(d > 180) d -= 360;
  if(d <= -180) d += 360;
  return d;
}
// Read pan/tilt/roll inputs and apply to the live camera. Each axis is independent so
// the user can freely dial in tilt while leaving pan/roll alone.
window.onCamAngleInput = function(which){
  const panEl  = _camGetEl('cm-pan');
  const tiltEl = _camGetEl('cm-tilt');
  const rollEl = _camGetEl('cm-roll');
  if(which === 'pan' && panEl){
    const v = parseFloat(panEl.value);
    if(!isNaN(v)) _yawTarget = yaw = THREE.MathUtils.degToRad(v);
  }
  if(which === 'tilt' && tiltEl){
    const v = parseFloat(tiltEl.value);
    if(!isNaN(v)){
      const r = Math.max(-1.55, Math.min(1.55, THREE.MathUtils.degToRad(v)));
      _pitchTarget = pitch = r;
    }
  }
  if(which === 'roll' && rollEl){
    const v = parseFloat(rollEl.value);
    if(!isNaN(v)){
      roll = THREE.MathUtils.degToRad(v);
      _camGetEl('cm-roll-slider').value = v;
    }
  }
  markDirty(4);
};
window.resetCamRoll = function(){
  roll = 0;
  _camGetEl('cm-roll').value = 0;
  _camGetEl('cm-roll-slider').value = 0;
  markDirty(4);
};

// Collapse/expand a camera-tool section group when its header is clicked.
// (Kept for backward compatibility; new code does not call this since the
//  camera-tool sections are always expanded now.)
window.toggleCmGroup = function(headEl){
  const group = headEl && headEl.parentElement;
  if(!group) return;
  group.classList.toggle('collapsed');
};
// Collapse/expand the read-only カメラ情報 block inside the shot-info panel.
// Default collapsed; the chev rotates to give visual feedback. Mirrors the
// rotation style used for cam-shot-chev so both toggles feel consistent.
window.toggleCamInfo = function(){
  const body = document.getElementById('cam-info-body');
  const chev = document.getElementById('cam-info-chev');
  if(!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if(chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
};
// toggleShotPanelCollapse is now a no-op: the former standalone shot panel
// (left-bottom card) has been merged into the camera tool side panel
// (#cam-panel), where its body is always visible whenever the tool is
// open. Stub kept so any old onclick / saved-state references resolve
// cleanly without throwing ReferenceError.
window.toggleShotPanelCollapse = function(){};

window.onCamSensorPreset = function(key){
  const before = {sensor:cam.sensor, sw:cam.sw, sh:cam.sh};
  cam.sensor = key;
  if(key !== 'custom'){
    const p = SENSOR_PRESETS[key];
    if(p){ cam.sw = p.w; cam.sh = p.h; _camPushFields(); }
  }
  // Show the W/H custom inputs only when the user explicitly picks "custom"
  const customRow = document.getElementById('cm-sensor-custom-row');
  if(customRow) customRow.style.display = (key === 'custom') ? 'flex' : 'none';
  applyCamSettings();
  const after = {sensor:cam.sensor, sw:cam.sw, sh:cam.sh};
  pushGenericUndo('cam-sensor', before, after, st=>{
    cam.sensor = st.sensor; cam.sw = st.sw; cam.sh = st.sh;
    const sel=document.getElementById('cm-sensor'); if(sel) sel.value = st.sensor;
    const cr=document.getElementById('cm-sensor-custom-row');
    if(cr) cr.style.display = (st.sensor === 'custom') ? 'flex' : 'none';
    _camPushFields();
    applyCamSettings();
  });
};
window.onCamFieldChange = function(){
  _camPullFields();
  applyCamSettings();
};
window.setCamAspect = function(ar){
  const before = cam.aspect;
  cam.aspect = ar;
  document.querySelectorAll('#cam-panel .cm-aspect').forEach(b=>{
    b.classList.toggle('on', String(b.dataset.ar) === String(ar));
  });
  applyCamSettings();
  pushGenericUndo('cam-aspect', before, ar, v=>{
    cam.aspect = v;
    document.querySelectorAll('#cam-panel .cm-aspect').forEach(b=>{
      b.classList.toggle('on', String(b.dataset.ar) === String(v));
    });
    applyCamSettings();
  });
};
// Multi-select grid toggle. 'off' clears all; any other key flips its membership.
function _applyCamGrids(setVals){
  cam.grids = new Set(setVals || []);
  document.querySelectorAll('#cam-panel .cm-grid-btn').forEach(b=>{
    const k = b.dataset.g;
    if(k === 'off') b.classList.toggle('on', cam.grids.size === 0);
    else            b.classList.toggle('on', cam.grids.has(k));
  });
  document.getElementById('cm-grid-custom-row').style.display =
    cam.grids.has('custom') ? 'flex' : 'none';
  drawCamGrid();
}
window.setCamGrid = function(g){
  if(!cam.grids) cam.grids = new Set();
  const before = Array.from(cam.grids);
  if(g === 'off'){
    cam.grids.clear();
  } else {
    if(cam.grids.has(g)) cam.grids.delete(g);
    else cam.grids.add(g);
  }
  const after = Array.from(cam.grids);
  _applyCamGrids(after);
  pushGenericUndo('cam-grids', before, after, vals=>_applyCamGrids(vals));
};
window.setCamWBPreset = function(k){
  const before = cam.wb;
  cam.wb = k;
  _camPushFields();
  applyCamSettings();
  pushGenericUndo('cam-wb', before, k, v=>{
    cam.wb = v;
    _camPushFields();
    applyCamSettings();
  });
};
// Quick-pick focal length: sets focal directly and refreshes inputs/highlights.
// ── Camera roll (Z-axis tilt) live writer ─────────────────────────────
// Mirrors the slider + number input to the global `roll` (radians) the
// camera matrix consumes (see updateCamera: rotation.set(pitch, yaw+π,
// roll, 'YXZ')). Clamps to [-180°, 180°] before push so wraparound
// doesn't ever flip the horizon by more than the user dialed.
window.onCamRollChange = function(deg){
  if(!Number.isFinite(deg)) return;
  const before = roll;
  const clamped = Math.max(-180, Math.min(180, deg));
  roll = THREE.MathUtils.degToRad(clamped);
  // Keep the OTHER widget in sync (slider ↔ number) without re-emitting
  // events that would recurse into this handler.
  const rs = document.getElementById('cm-roll-slider');
  const rn = document.getElementById('cm-roll');
  if(rs && parseFloat(rs.value) !== clamped) rs.value = clamped;
  if(rn && parseFloat(rn.value) !== clamped) rn.value = clamped;
  markDirty(8);
  pushGenericUndo('cam-roll', before, roll, v => {
    roll = v;
    const _deg = (roll * 180 / Math.PI);
    const _rs = document.getElementById('cm-roll-slider'); if(_rs) _rs.value = _deg;
    const _rn = document.getElementById('cm-roll'); if(_rn) _rn.value = _deg;
    markDirty(8);
  });
};
window.resetCamRoll = function(){ window.onCamRollChange(0); };

window.setCamFocal = function(mm){
  const before = cam.focal;
  cam.focal = mm;
  _camPushFields();
  _camHighlightFocal();
  applyCamSettings();
  pushGenericUndo('cam-focal', before, mm, v=>{
    cam.focal = v;
    _camPushFields();
    _camHighlightFocal();
    applyCamSettings();
  });
};
function _camHighlightFocal(){
  document.querySelectorAll('#cam-panel .cm-focal-btn').forEach(b=>{
    b.classList.toggle('on', Math.abs((+b.dataset.f) - cam.focal) < 0.01);
  });
}

// Custom aspect inputs (W:H). Live preview uses the ratio as soon as it's typed;
// the 適用 button is purely cosmetic / explicit confirmation.
window.onCamCustomAspect = function(){
  const w = parseFloat(_camGetEl('cm-ar-w').value);
  const h = parseFloat(_camGetEl('cm-ar-h').value);
  if(!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
  cam.aspect = w / h;
  // Clear preset .on classes — custom doesn't match any preset
  document.querySelectorAll('#cam-panel .cm-aspect').forEach(b => b.classList.remove('on'));
  applyCamSettings();
};
window.applyCamCustomAspect = function(){ window.onCamCustomAspect(); };

// Refresh the "保存される画像の解像度" readout under the JPEG capture button.
function _camRefreshCaptureRes(){
  const el = document.getElementById('cm-capture-res');
  if(!el) return;
  const t = _camTargetResolution();
  const tag = cam.export4K ? '  (4K)' : '';
  el.textContent = `${t.w} × ${t.h} px${tag}`;
}

function applyCamSettings(){
  if(!cam.active) return;
  _camRefreshCaptureRes();
  // Simulate cropping the chosen aspect OUT OF the fixed physical sensor.
  // A real camera can never see more than its sensor: choosing a WIDER aspect
  // (16:9 / 2.39) crops the sensor's TOP & BOTTOM (less vertical FOV, same
  // horizontal), and a TALLER aspect (4:5 / 9:16) crops the SIDES (less
  // horizontal, same vertical). So the vertical FOV is derived from the
  // EFFECTIVE (cropped) sensor height — _camSensorVFovDeg(), which folds in the
  // aspect crop — NOT the full sensor height. The cam-active render loop sets
  // camera.aspect to that same cropped aspect, so the resulting horizontal FOV
  // equals the cropped sensor's horizontal FOV and NEVER exceeds the full
  // sensor. This is exactly what the JPEG capture path uses (same
  // _camSensorVFovDeg + crop aspect), so the live frame and the saved image are
  // identical. Changing the aspect now correctly re-crops the field of view.
  const vfovDeg = _camSensorVFovDeg();
  fov = vfovDeg;
  camera.fov = vfovDeg;
  // Pin the cropped aspect so a render that lands before the next animate frame
  // (e.g. the capture's pre-roll) is already framed correctly; the cam-active
  // render loop re-applies the safe-frame-rect aspect (same value) each frame.
  const _eff = _camEffectiveSensorWH();
  camera.aspect = _eff.w / Math.max(1e-6, _eff.h);
  camera.updateProjectionMatrix();
  _applyRenderPixelRatio();   // supersample more as the lens zooms in (≥50mm)
  layoutCamFrame();
  drawCamGrid();
  updateCamHud();
  applyWBTint();
  _camHighlightFocal();
  markDirty(4);
}

function layoutCamFrame(){
  const frame = document.getElementById('cam-frame');
  if(!frame || !cam.active){ if(frame) frame.style.display='none'; return; }
  const r = _camFrameRect();
  frame.style.display = 'block';
  frame.style.left   = r.x + 'px';
  frame.style.top    = r.y + 'px';
  frame.style.width  = r.w + 'px';
  frame.style.height = r.h + 'px';
}

let _camLetterbox = null;
function _camUpdateLetterbox(r){
  if(!_camLetterbox){
    _camLetterbox = document.createElement('div');
    _camLetterbox.id = 'cam-letterbox';
    _camLetterbox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:49;';
    document.body.appendChild(_camLetterbox);
  }
  const W = r.viewportW, H = r.viewportH;
  const fx = r.x, fy = r.y, fw = r.w, fh = r.h;
  const pct = (v, total) => (v / total * 100).toFixed(3) + '%';
  _camLetterbox.style.clipPath =
    `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ` +
    `${pct(fx,W)} ${pct(fy,H)}, ${pct(fx,W)} ${pct(fy+fh,H)}, ` +
    `${pct(fx+fw,W)} ${pct(fy+fh,H)}, ${pct(fx+fw,W)} ${pct(fy,H)}, ` +
    `${pct(fx,W)} ${pct(fy,H)})`;
  _camLetterbox.style.background = 'rgba(0,0,0,0.75)';
  _camLetterbox.style.display = 'block';
}
function _camHideLetterbox(){
  if(_camLetterbox) _camLetterbox.style.display = 'none';
}

function applyWBTint(){
  const tint = document.getElementById('cam-wb-tint');
  if(!tint) return;
  if(!cam.active || cam.wb === 5600){
    tint.style.display = 'none';
    return;
  }
  const m = _camWBMult(cam.wb);
  const r = Math.round(m.r * 255);
  const g = Math.round(m.g * 255);
  const b = Math.round(m.b * 255);
  tint.style.display = 'block';
  tint.style.background = `rgb(${Math.min(255,r)}, ${Math.min(255,g)}, ${Math.min(255,b)})`;
}

// SVG grid drawn inside the safe-frame. All paths use percent coords so the SVG
// scales naturally with the frame (preserveAspectRatio="none"). Multiple grid types
// stack on top of each other — each one in cam.grids gets its own draw pass.
function drawCamGrid(){
  const svg = document.getElementById('cam-grid-svg');
  if(!svg) return;
  if(!cam.active || !cam.grids || cam.grids.size === 0){
    svg.innerHTML = '';
    if(svg.parentElement) svg.parentElement.style.opacity = '1';
    return;
  }
  svg.setAttribute('viewBox', '0 0 100 100');
  // Element opacity comes purely from svg.style.opacity (the panel slider).
  // Strokes themselves are FULL alpha so 100 % renders truly white — and we draw
  // them at ≥ 1.4 px (vector-effect="non-scaling-stroke" is in PIXEL units, so
  // values < 1 sub-pixel-AA into a dim gray line).
  svg.style.opacity = String(cam.gridOpacity != null ? cam.gridOpacity : 0.85);
  const stroke = 'rgb(255,255,255)';
  const sw  = '1.6';   // standard guide line — clearly visible white
  const sw2 = '2.2';   // safe-zone rectangles / center mark — slightly bolder
  const lines = [];
  const vline = (x, color=stroke, width=sw)=>
    `<line x1="${x}" y1="0" x2="${x}" y2="100" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
  const hline = (y, color=stroke, width=sw)=>
    `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
  const lineXY = (x1,y1,x2,y2, color=stroke, width=sw)=>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
  const rect = (x,y,w,h, color=stroke, width=sw)=>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
  const text = (x,y, str, color=stroke, size=2.6)=>
    `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="ui-monospace,monospace">${str}</text>`;
  const G = cam.grids;

  if(G.has('thirds')){
    lines.push(vline(33.333), vline(66.667));
    lines.push(hline(33.333), hline(66.667));
  }
  if(G.has('golden')){
    const phi = 0.382;          // 1 - 1/φ
    const gc = 'rgb(255,200,80)';
    lines.push(vline(phi*100, gc));
    lines.push(vline((1-phi)*100, gc));
    lines.push(hline(phi*100, gc));
    lines.push(hline((1-phi)*100, gc));
  }
  if(G.has('cross')){
    lines.push(vline(50));
    lines.push(hline(50));
  }
  if(G.has('diag')){
    // Corner-to-corner diagonals (composition baseline)
    const dc = 'rgb(180,200,255)';
    lines.push(lineXY(0, 0, 100, 100, dc));
    lines.push(lineXY(100, 0, 0, 100, dc));
  }
  // ── After Effects-style action-safe (outer rectangle, 93 % area = 3.5 % margin) ──
  if(G.has('safe-action')){
    const m = 3.5;
    const ac = 'rgb(255,180,80)';
    lines.push(rect(m, m, 100 - 2*m, 100 - 2*m, ac, sw2));
    lines.push(text(m + 0.5, m + 3.5, 'ACTION SAFE', ac, 2.4));
  }
  // ── Title-safe (inner, 90 % area = 5 % margin) ──
  if(G.has('safe-title')){
    const m = 5;
    const tc = 'rgb(120,200,255)';
    lines.push(rect(m, m, 100 - 2*m, 100 - 2*m, tc, sw2));
    lines.push(text(m + 0.5, 100 - m - 1.0, 'TITLE SAFE', tc, 2.4));
  }
  // ── AE-style center mark: small + at exact center with tick marks ──
  if(G.has('center-mark')){
    const cl = 'rgb(255,255,255)';
    // Small cross
    lines.push(lineXY(46, 50, 54, 50, cl, sw2));
    lines.push(lineXY(50, 46, 50, 54, cl, sw2));
    // Frame edge ticks (small marks at the midpoint of each frame edge)
    lines.push(lineXY(50, 0, 50, 2, cl, sw2));
    lines.push(lineXY(50, 98, 50, 100, cl, sw2));
    lines.push(lineXY(0, 50, 2, 50, cl, sw2));
    lines.push(lineXY(98, 50, 100, 50, cl, sw2));
  }
  // ── Custom rows × cols ──
  if(G.has('custom')){
    const c = Math.max(1, cam.gridCols), r = Math.max(1, cam.gridRows);
    const xc = 'rgb(180,255,180)';
    for(let i=1;i<c;i++) lines.push(vline(100 * i / c, xc));
    for(let i=1;i<r;i++) lines.push(hline(100 * i / r, xc));
  }
  svg.innerHTML = lines.join('');
}

function updateCamHud(){
  if(!cam.active) return;
  const lens  = document.getElementById('cam-info-lens');
  const angle = document.getElementById('cam-info-angle');
  const pos   = document.getElementById('cam-info-pos');
  if(!lens) return;

  const eq = _camEquiv35().toFixed(0);
  const hfov = _camSensorHFovDeg().toFixed(1);
  const vfov = _camSensorVFovDeg().toFixed(1);
  const panDeg  = _normYawDeg(yaw).toFixed(1);
  const tiltDeg = (pitch * 180 / Math.PI).toFixed(1);
  const rollDeg = (roll  * 180 / Math.PI).toFixed(1);

  lens.innerHTML =
    `<b>${cam.focal.toFixed(0)}mm</b>  <span style="opacity:.7">(${T('cam-info-equiv')} ${eq}mm)</span><br>` +
    `<span style="opacity:.85">${T('cam-info-aov')} H ${hfov}° / V ${vfov}°</span><br>` +
    `<span style="opacity:.7">${T('cam-info-sensor')} ${cam.sw}×${cam.sh}mm  WB ${cam.wb}K</span>`;
  angle.innerHTML =
    `${T('cam-info-pan')} <b>${panDeg}°</b>　${T('cam-info-tilt')} <b>${tiltDeg}°</b>　${T('cam-info-roll')} <b>${rollDeg}°</b>`;
  pos.innerHTML =
    `📍 X ${camPos.x.toFixed(2)}　Y ${camPos.y.toFixed(2)}　Z ${camPos.z.toFixed(2)}`;

  // Sync angle inputs in the right (setup) panel — skip if user is actively typing
  const panEl = document.getElementById('cm-pan');
  const tiltEl = document.getElementById('cm-tilt');
  if(panEl  && document.activeElement !== panEl)  panEl.value  = panDeg;
  if(tiltEl && document.activeElement !== tiltEl) tiltEl.value = tiltDeg;
}

// One-time wiring of the salvage dropzone (registered the first time the panel opens)
let _salvageWired = false;
function _wireSalvageZone(){
  if(_salvageWired) return;
  const dz = document.getElementById('cm-salvage');
  const inp = document.getElementById('cm-salvage-input');
  if(!dz || !inp) return;
  dz.addEventListener('click', ()=> inp.click());
  inp.addEventListener('change', e=>{
    if(e.target.files && e.target.files[0]) salvageCamFromFile(e.target.files[0]);
    e.target.value = '';
  });
  dz.addEventListener('dragover', e=>{
    e.preventDefault(); e.stopPropagation();
    dz.style.background = 'rgba(255,180,84,.18)';
    dz.style.borderColor = 'rgba(255,180,84,.7)';
  });
  dz.addEventListener('dragleave', ()=>{
    dz.style.background = 'rgba(255,180,84,.04)';
    dz.style.borderColor = 'rgba(255,180,84,.35)';
  });
  dz.addEventListener('drop', e=>{
    e.preventDefault(); e.stopPropagation();
    dz.style.background = 'rgba(255,180,84,.04)';
    dz.style.borderColor = 'rgba(255,180,84,.35)';
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) salvageCamFromFile(f);
  });
  _salvageWired = true;
}

