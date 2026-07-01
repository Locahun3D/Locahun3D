// ══════════════════════════════════════════════════
//  CAMERA ANIMATION  (Minecraft-Camera-Addon-style path export)
//
//  The user adds 2+ key positions (each captures camPos + yaw / pitch /
//  roll + fov / focal / aspect). A linear-time interpolation between
//  adjacent keys produces a fly-through; the user can preview it
//  in-viewport and export an MP4 via the existing view-recorder pipeline.
//  Default speed is 1 m/s (one metre per second along the curve), and
//  HIGHER values play back faster — matches the intuitive "speed" UX.
//  Adjustable via the side-panel slider + number input.
// ══════════════════════════════════════════════════
const camAnim = {
  open: false,
  keys: [],          // each: { pos, yaw, pitch, roll, fov, focal, aspect, sensor, sw, sh, margin }
  speed: 1.0,        // metres per second along the curve — higher = faster.
                     // (Was seconds-per-metre prior to v0.0.4, but that
                     // inverted the user's intuition where a bigger
                     // number ought to mean a faster shot.)
  easing: true,      // true = ease in/out (smoothstep on the 0..1 progress so
                     // the shot accelerates from rest and decelerates to a
                     // stop); false = linear (constant speed). User-selectable.
  playing: false,
  // Warm-up before RECORDING starts. A fresh jump to key 0 leaves Spark at a
  // coarse LOD/SH level; recording immediately bakes those low-detail frames
  // into the MP4. We snap to key 0, keep the splat sort / LoD walker running
  // for this many ms, and only THEN start the recorder + animation so the very
  // first recorded frame is already full-detail. Tunable; 1000 ms per request.
  warmupMs: 1000,
  warming: false,    // true while the pre-record warm-up countdown is running
  warmTimer: 0,      // setTimeout id for the warm-up → start-recording handoff
  warmNudgeId: 0,    // setInterval id that keeps the LoD walker paging in detail
  rafId: 0,
  timeoutId: 0,      // setTimeout fallback that drives the tick when rAF
                     // is throttled by Chrome's compositor under heavy
                     // WebGL submit. Keeps wall-clock playback duration
                     // honest even when rAF stalls.
  deadlineId: 0,     // hard-stop setTimeout that force-ends playback at
                     // totalSec, in case BOTH driver paths get throttled.
  startedAt: 0,
  // Catmull-Rom curve over the key positions. Built once per change in
  // _camAnimRebuild(); sampled via THREE's arc-length parameterised
  // getPointAt(u) for smooth fly-through (no polyline kinks).
  posCurve:     null,
  curveLen:     0,        // arclength in metres
  totalSec:     0,        // = curveLen * speed (clamped to ≥ 0.05)
  _yawUnrolled: null,     // yaw values with 2π wraps removed so the scalar
                          // Catmull-Rom doesn't spin the long way around
  _scalarArr:   null,     // cached per-scalar arrays, indexed by field name
  // Visual helpers — a single THREE.Group containing one cone per key
  // plus a polyline of the smoothed path. Toggled visible based on panel
  // state and hidden entirely during record-export so the 3D markers
  // don't appear in the captured MP4.
  visualGroup:  null,
};

// 1-D Catmull-Rom (uniform, tension 0.5) over a scalar array. The param is
// a global 0..1 across all keys parameterised UNIFORMLY in key index
// (f = param*(n-1)), i.e. the same convention as THREE's getPoint(t) — NOT
// the arc-length getPointAt(u). Callers that also sample an arc-length
// position curve MUST first convert u→t via posCurve.getUtoTmapping(u) and
// pass that t here, otherwise orientation phase-shifts away from position
// on unevenly-spaced keys (see _camAnimSampleAt).
function _catRom1D(arr, u){
  const n = arr.length;
  if(n === 0) return 0;
  if(n === 1) return arr[0];
  if(n === 2){
    const t = Math.max(0, Math.min(1, u));
    return arr[0] + (arr[1] - arr[0]) * t;
  }
  const f = u * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
  const t = f - i;
  const p0 = arr[Math.max(0, i - 1)];
  const p1 = arr[i];
  const p2 = arr[i + 1];
  const p3 = arr[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function _camAnimKeySnapshot(){
  if(cam.active){ _camPullFields(); }
  return {
    pos:   { x: camPos.x, y: camPos.y, z: camPos.z },
    yaw, pitch,
    roll:  (typeof roll === 'number') ? roll : 0,
    fov,
    focal:  cam.focal,
    aspect: cam.aspect,
    sensor: cam.sensor,
    sw:     cam.sw,
    sh:     cam.sh,
    margin: cam.margin,
  };
}

// Rebuild the Catmull-Rom position curve and cached scalar arrays from
// the current key list. Called whenever keys are added/removed/edited
// OR the speed slider changes (so totalSec is consistent).
function _camAnimRebuild(){
  const k = camAnim.keys;
  camAnim.posCurve     = null;
  camAnim.curveLen     = 0;
  camAnim.totalSec     = 0;
  camAnim._yawUnrolled = null;
  camAnim._scalarArr   = null;
  if(k.length === 0){ _camAnimUpdateVisuals(); return; }
  if(k.length === 1){ _camAnimUpdateVisuals(); return; }

  const pts = k.map(p => new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z));
  // centripetal Catmull-Rom (alpha = 0.5) avoids self-intersection bumps
  // when keys are spaced very unevenly. tension=0.5 keeps the path snug
  // around the keys; lower would over-shoot, higher would flatten toward
  // the polyline shape and bring the kink back.
  camAnim.posCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  camAnim.curveLen = camAnim.posCurve.getLength();
  // metres / (metres/second) = seconds. Higher speed → shorter totalSec.
  camAnim.totalSec = Math.max(0.05, camAnim.curveLen / Math.max(1e-3, camAnim.speed));

  // Unroll yaw so consecutive keys never differ by more than ±π — that
  // way the scalar Catmull-Rom always interpolates along the short arc
  // (e.g. 170° → −170° walks through 180°, not back through 0°).
  const yawUnrolled = [k[0].yaw];
  for(let i = 1; i < k.length; i++){
    let d = k[i].yaw - yawUnrolled[i - 1];
    while(d >  Math.PI) d -= 2 * Math.PI;
    while(d < -Math.PI) d += 2 * Math.PI;
    yawUnrolled.push(yawUnrolled[i - 1] + d);
  }
  camAnim._yawUnrolled = yawUnrolled;

  // Pre-extract scalar arrays once so the hot _camAnimSampleAt() path
  // doesn't allocate per-frame mapping callbacks.
  camAnim._scalarArr = {
    pitch:  k.map(x => x.pitch),
    roll:   k.map(x => x.roll),
    fov:    k.map(x => x.fov),
    focal:  k.map(x => x.focal),
    aspect: k.map(x => x.aspect),
    sw:     k.map(x => x.sw),
    sh:     k.map(x => x.sh),
    margin: k.map(x => x.margin),
  };

  _camAnimUpdateVisuals();
}

// Back-compat shim — older callers used _camAnimRecomputeSegments().
function _camAnimRecomputeSegments(){ _camAnimRebuild(); }

function _camAnimSampleAt(t){
  const n = camAnim.keys.length;
  if(n === 0) return null;
  if(n === 1) return camAnim.keys[0];
  if(!camAnim.posCurve) _camAnimRebuild();
  if(!camAnim.posCurve || camAnim.totalSec <= 0) return camAnim.keys[0];
  if(t <= 0)               return camAnim.keys[0];
  if(t >= camAnim.totalSec) return camAnim.keys[n - 1];
  // Arc-length parameter (0..1) so a uniform speed setting feels uniform
  // along the curve even though Catmull-Rom's native parameterisation is
  // not arc-length linear.
  let u     = t / camAnim.totalSec;
  // Ease in/out (user-selectable). Smoothstep on the normalised progress so the
  // shot accelerates from rest and decelerates to a stop; position AND every
  // scalar field derive from the same eased u, so they stay in lockstep.
  // Strength dialed to ~1/3 (user: "イージングが強すぎる") by blending the
  // smoothstep result back toward linear: eased = lerp(u, smoothstep, 1/3).
  if(camAnim.easing){ const _sm = u*u*(3 - 2*u); u = u + (_sm - u) * (1/3); }
  // CRITICAL: getPointAt(u) is ARC-LENGTH parameterised, but _catRom1D()
  // below is parameterised UNIFORMLY in key index (f = param*(n-1)). Passing
  // the arc-length u straight into _catRom1D phase-shifts the ORIENTATION
  // relative to the POSITION whenever keys are unevenly spaced: the camera
  // sits in segment B while still looking with segment A's yaw/pitch, so the
  // fly-through "looks the wrong way" mid-flight even though the positional
  // path is correct. Convert u to the curve's native (uniform-segment)
  // parameter `tc` so position and every scalar field sample in lockstep.
  // getPoint(tc) === getPointAt(u) by definition, so the position the user
  // already likes is unchanged.
  const tc  = camAnim.posCurve.getUtoTmapping(u);
  const p   = camAnim.posCurve.getPoint(tc);
  const sa  = camAnim._scalarArr;
  // sensor key is discrete (a string id), nearest-key wins.
  const nearestIdx = Math.max(0, Math.min(n - 1, Math.round(tc * (n - 1))));
  return {
    pos:    { x: p.x, y: p.y, z: p.z },
    yaw:    _catRom1D(camAnim._yawUnrolled, tc),
    pitch:  _catRom1D(sa.pitch,  tc),
    roll:   _catRom1D(sa.roll,   tc),
    fov:    _catRom1D(sa.fov,    tc),
    focal:  _catRom1D(sa.focal,  tc),
    aspect: _catRom1D(sa.aspect, tc),
    sensor: camAnim.keys[nearestIdx].sensor,
    sw:     _catRom1D(sa.sw,     tc),
    sh:     _catRom1D(sa.sh,     tc),
    margin: _catRom1D(sa.margin, tc),
  };
}

// Lazy-create / fetch the scene-attached Group that holds the key
// markers + the path line. Creating up-front would mean we need scene to
// exist at module body time; doing it on demand survives any ordering.
function _camAnimEnsureVisualGroup(){
  if(camAnim.visualGroup) return camAnim.visualGroup;
  if(typeof scene === 'undefined' || !scene) return null;
  const g = new THREE.Group();
  g.name = 'camAnimVisuals';
  scene.add(g);
  camAnim.visualGroup = g;
  return g;
}

// Rebuild the visible markers + path line. Called from _camAnimRebuild
// so visuals stay in sync with the curve. Cheap (≤ keys-count meshes +
// one Line) so we don't bother with diffing.
function _camAnimUpdateVisuals(){
  const g = _camAnimEnsureVisualGroup();
  if(!g) return;
  // Dispose old children — geometries + materials own GPU buffers.
  while(g.children.length){
    const c = g.children[0];
    g.remove(c);
    if(c.geometry && typeof c.geometry.dispose === 'function') c.geometry.dispose();
    if(c.material && typeof c.material.dispose === 'function') c.material.dispose();
  }
  if(!camAnim.keys.length) return;

  // Path line — sampled from the Catmull-Rom curve at ~8 samples/metre
  // (clamped 32..512 so a 1 m path still gets 32 samples and a 60 m
  // sweep doesn't drop 4800 vertices into a buffer for no benefit).
  if(camAnim.posCurve){
    const segs = Math.max(32, Math.min(512, Math.floor(camAnim.curveLen * 8)));
    const linePts = camAnim.posCurve.getPoints(segs);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xb594ff,
      transparent: true,
      opacity:     0.9,
      depthTest:   true,
      depthWrite:  false,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 998;
    g.add(line);
  }

  // Sync visibility to panel state — markers are an editing aid, only
  // shown while the user has the cam-anim panel open. _ensure...Group()
  // doesn't know about the panel; do it here so every rebuild path
  // (add / remove / speed change) keeps visibility consistent without
  // each caller having to remember.
  g.visible = !!camAnim.open;

  // Key markers: a slim cone pointing along the saved view direction so
  // the user can see WHERE each camera looks, not just where it sits.
  // Color: same purple as the cam-anim panel so it reads as belonging
  // to the animation tool. End-points (start / end) get a slightly
  // larger, brighter marker for easier identification.
  for(let i = 0; i < camAnim.keys.length; i++){
    const k = camAnim.keys[i];
    const isEnd = (i === 0 || i === camAnim.keys.length - 1);
    const size  = isEnd ? 0.18 : 0.13;
    const len   = isEnd ? 0.42 : 0.30;
    const coneGeo = new THREE.ConeGeometry(size, len, 18);
    // Cone defaults to apex+Y; translate so the BASE sits at origin,
    // then rotate so the apex points along −Z (THREE camera-forward).
    coneGeo.translate(0, -len * 0.5, 0);
    coneGeo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: isEnd ? 0xd9c2ff : 0xb594ff,
      transparent: true,
      opacity:     0.88,
      depthTest:   true,
    });
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.position.set(k.pos.x, k.pos.y, k.pos.z);
    // Same YXZ order the live camera uses so the cone's apex matches the
    // user's view direction at that key. Roll deliberately omitted from
    // the marker — the user only cares which way it's pointing.
    cone.rotation.set(k.pitch, k.yaw + Math.PI, 0, 'YXZ');
    cone.renderOrder = 999;
    g.add(cone);
  }

  if(typeof markDirty === 'function') markDirty(8);
}

// Show / hide the visuals atomically (used during record-export so the
// captured MP4 doesn't have purple cones floating in it).
function _camAnimSetVisualsVisible(v){
  if(!camAnim.visualGroup) return;
  camAnim.visualGroup.visible = !!v;
  if(typeof markDirty === 'function') markDirty(8);
}

function _camAnimApplySample(s){
  if(!s) return;
  camPos.set(s.pos.x, s.pos.y, s.pos.z);
  yaw   = _yawTarget   = s.yaw;
  pitch = _pitchTarget = s.pitch;
  if(typeof s.roll === 'number') roll = s.roll;
  if(typeof s.focal  === 'number') cam.focal  = s.focal;
  if(typeof s.aspect === 'number') cam.aspect = s.aspect;
  if(typeof s.sw     === 'number') cam.sw     = s.sw;
  if(typeof s.sh     === 'number') cam.sh     = s.sh;
  if(typeof s.margin === 'number') cam.margin = s.margin;
  if(cam.active){
    try { applyCamSettings(); } catch(e){}
  } else {
    fov = s.fov;
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
  }
  markDirty(4);
}

