// ══════════════════════════════════════════════════
//  FIGURE (humanoid wooden mannequin with rig)
// ══════════════════════════════════════════════════
const FIGURE_BONE_ORDER = [
  'pelvis','spine','chest','neck','head',
  'shoulderL','upperArmL','lowerArmL','handL',
  'shoulderR','upperArmR','lowerArmR','handR',
  'hipL','upperLegL','lowerLegL','footL',
  'hipR','upperLegR','lowerLegR','footR',
];
const FIGURE_BONE_LABELS = {
  pelvis:'腰', spine:'背骨', chest:'胸', neck:'首', head:'頭',
  shoulderL:'左肩', upperArmL:'左上腕', lowerArmL:'左前腕', handL:'左手',
  shoulderR:'右肩', upperArmR:'右上腕', lowerArmR:'右前腕', handR:'右手',
  hipL:'左股関節', upperLegL:'左太もも', lowerLegL:'左ふくらはぎ', footL:'左足',
  hipR:'右股関節', upperLegR:'右太もも', lowerLegR:'右ふくらはぎ', footR:'右足',
};
// Pose deltas applied as local rotations on top of Mixamo T-pose.
// User-tuned values (captured via "📋 現在のポーズを書き出し" workflow) baked in here.
const _ARMS_RELAXED = {
  upperArmL:{x:75}, upperArmR:{x:75},
  lowerArmL:{x:10}, lowerArmR:{x:10},
};
const FIGURE_POSES = {
  // 基本 — neutral standing pose, slight forward lean, arms relaxed at sides
  basic: {
    spine: {x:4.3},
    head:  {x:1.4},
    upperArmL: {x:75},
    lowerArmL: {x:10},
    upperArmR: {x:75},
    lowerArmR: {x:10},
  },
  // T-pose — native Mixamo rest pose
  tpose: {},
  // 歩く — natural walking stride, opposing leg+arm swing
  walk: {
    head:      {x:10},
    upperArmL: {x:78, y:-1.4, z:-26.1},
    lowerArmL: {x:6.8, y:-8.9, z:14.2},
    handL:     {x:10.8},
    shoulderR: {y:12.4},
    upperArmR: {x:74.4, y:-6.9, z:7.7},
    lowerArmR: {x:9.6, y:-2.7, z:-15.7},
    handR:     {z:6.3},
    upperLegL: {x:28, y:0.6, z:-6.6},
    lowerLegL: {x:-30.2},
    footL:     {x:-1.6},
    upperLegR: {x:-14},
    lowerLegR: {x:-15.5},
    footR:     {x:-10.1},
  },
  // 走る — full running stride, body forward-leaning, arms cocked
  run: {
    pelvis:    {x:10.7},
    spine:     {x:9.7},
    chest:     {x:22.2},
    neck:      {x:-32.8},
    head:      {x:15.2},
    upperArmL: {x:66.3, y:6.7, z:-16.2},
    lowerArmL: {x:12.8, y:-7.3, z:15.1},
    handL:     {x:-10.6, y:0.4, z:-1.9},
    shoulderR: {y:12.4},
    upperArmR: {x:67.7, y:4, z:-41.8},
    lowerArmR: {z:-65.8},
    handR:     {x:-1.5, y:-1.5, z:-14.4},
    upperLegL: {x:54.1, y:-2.4, z:-6.1},
    lowerLegL: {x:-39.7},
    footL:     {x:-6.5},
    upperLegR: {x:-15.2},
    lowerLegR: {x:-40.7},
    footR:     {x:-5.9},
  },
  // 座る — thighs forward 90°, knees folded back, arms resting on lap
  sit: {
    upperArmL: {x:77.8},
    lowerArmL: {x:7.2, z:7},
    upperArmR: {x:75},
    lowerArmR: {x:8, z:-12.9},
    upperLegL: {x:90},
    lowerLegL: {x:-90},
    upperLegR: {x:90},
    lowerLegR: {x:-90},
  },
  // 見上げる — head/neck tilted up, body slightly arched, arms closed
  look_up: {
    spine: {x:-4.3},
    chest: {x:-4.7},
    head:  {x:2.2},
    upperArmL: {x:70, z:-11.4},
    lowerArmL: {x:12.3},
    handL:     {x:10.4, y:-0.3, z:-5.5},
    upperArmR: {x:68.5, y:-0.3, z:10.2},
    lowerArmR: {x:12.4},
    handR:     {x:15.9, z:11.3},
  },
  // ダンス — twisted upper body, dynamic arm/leg pose
  dance: {
    pelvis:    {x:18.8},
    spine:     {y:32.7},
    chest:     {x:-25.1},
    head:      {x:-1, y:-41.5, z:-12.9},
    upperArmL: {x:-46.5},
    lowerArmL: {x:-11.6},
    handL:     {x:-32.5},
    upperArmR: {x:17.7, y:4.8, z:14.7},
    upperLegL: {x:13.1},
    footL:     {x:-21.3},
    upperLegR: {x:-38.5},
  },
};

// Reference height the geometry is built at. Height changes scale the rig.
const FIGURE_REF_HEIGHT_CM = 170;

function _buildFigureMannequin(heightCm){
  const root = new THREE.Group();
  root.name = 'figureRoot';
  // Inner group that scales with height (so pose rotations are unaffected)
  const rig = new THREE.Group();
  rig.name = 'figureRig';
  rig.userData.isHeightScale = true;
  // Procedural mannequin is built at exactly 1.70 m natural — record so the
  // height-scaling formula matches the Mixamo path.
  rig.userData.naturalMeters = FIGURE_REF_HEIGHT_CM / 100;
  const sFactor = (heightCm||FIGURE_REF_HEIGHT_CM) / FIGURE_REF_HEIGHT_CM;
  rig.scale.setScalar(sFactor);
  root.add(rig);

  const skinMat  = new THREE.MeshBasicMaterial({color:0xdcd8d2, transparent:true, opacity:1});
  const jointMat = new THREE.MeshBasicMaterial({color:0x888888, transparent:true, opacity:.9});

  // ── Geometry helpers ──
  function joint(name){
    const g = new THREE.Group();
    g.name = name;
    g.userData.isBone = true;
    return g;
  }
  function addJointMarker(_g, _r){ /* removed: no joint markers */ }
  function addLimb(g, geo, y, rot){
    const m = new THREE.Mesh(geo, skinMat);
    m.position.y = y;
    if(rot){ m.rotation.set(rot.x||0, rot.y||0, rot.z||0); }
    m.userData.figureLimb = true;
    g.add(m);
    return m;
  }
  // Tapered cylinder hanging DOWN from joint origin (top y=0 → bottom y=-length)
  function taperedDown(rTop, rBot, length, segs){
    const geo = new THREE.CylinderGeometry(rTop, rBot, length, segs||16, 1, false);
    return { geo, y:-length/2 };
  }
  // Tapered cylinder extending UP from joint origin (bottom y=0 → top y=+length)
  function taperedUp(rBot, rTop, length, segs){
    const geo = new THREE.CylinderGeometry(rTop, rBot, length, segs||16, 1, false);
    return { geo, y:+length/2 };
  }
  // Ellipsoid (scaled sphere) — used for head, pelvis, hands
  function ellipsoid(rx, ry, rz, segs){
    const geo = new THREE.SphereGeometry(1, segs||20, segs||16);
    geo.scale(rx, ry, rz);
    return geo;
  }

  // ── Proportions (meters, total ≈1.70m at scale 1.0) ──
  const FOOT_H = 0.06;
  const LOWER_LEG = 0.42;
  const UPPER_LEG = 0.45;
  const pelvisY = FOOT_H + LOWER_LEG + UPPER_LEG; // 0.93

  // ── Pelvis: ellipsoid hip block ──
  const pelvis = joint('pelvis');
  pelvis.position.y = pelvisY;
  rig.add(pelvis);
  addLimb(pelvis, ellipsoid(0.16, 0.10, 0.13, 20), 0);
  addJointMarker(pelvis, 0.05);

  // ── Spine: short tapered cylinder, slightly narrower at top ──
  const spine = joint('spine');
  spine.position.y = 0.10; // above pelvis center
  pelvis.add(spine);
  { const u = taperedUp(0.10, 0.11, 0.12); addLimb(spine, u.geo, u.y); }
  addJointMarker(spine, 0.04);

  // ── Chest: V-shaped torso, wider at top (shoulders), narrow at waist ──
  const chest = joint('chest');
  chest.position.y = 0.12; // top of spine
  spine.add(chest);
  // Main torso: tapered cylinder narrower at bottom
  { const u = taperedUp(0.13, 0.18, 0.30, 20); addLimb(chest, u.geo, u.y); }
  // Subtle "shoulder yoke" capsule across the top (gives wider deltoid hint)
  {
    const yoke = new THREE.Mesh(
      ellipsoid(0.22, 0.06, 0.13, 20),
      skinMat
    );
    yoke.position.y = 0.30;
    yoke.userData.figureLimb = true;
    chest.add(yoke);
  }
  addJointMarker(chest, 0.045);

  // ── Neck: thin cylinder ──
  const neck = joint('neck');
  neck.position.y = 0.30; // top of chest
  chest.add(neck);
  { const u = taperedUp(0.045, 0.05, 0.08); addLimb(neck, u.geo, u.y); }
  addJointMarker(neck, 0.035);

  // ── Head: elongated ellipsoid ──
  const head = joint('head');
  head.position.y = 0.08; // top of neck
  neck.add(head);
  addLimb(head, ellipsoid(0.085, 0.105, 0.095, 22), 0.10);
  addJointMarker(head, 0.04);

  // ── Arms ──
  function buildArm(side){
    const sx = side==='L' ? 1 : -1;
    // Shoulder pivot — at the outer top of the chest
    const shoulder = joint('shoulder'+side);
    shoulder.position.set(sx*0.20, 0.27, 0);
    chest.add(shoulder);
    addJointMarker(shoulder, 0.045);

    // Upper arm: hangs down, slightly tapered
    const upper = joint('upperArm'+side);
    shoulder.add(upper);
    { const d = taperedDown(0.055, 0.045, 0.30); addLimb(upper, d.geo, d.y); }
    addJointMarker(upper, 0.04);

    // Forearm
    const lower = joint('lowerArm'+side);
    lower.position.y = -0.30;
    upper.add(lower);
    { const d = taperedDown(0.045, 0.038, 0.27); addLimb(lower, d.geo, d.y); }
    addJointMarker(lower, 0.035);

    // Hand: flattened ellipsoid (mitten-like)
    const hand = joint('hand'+side);
    hand.position.y = -0.27;
    lower.add(hand);
    addLimb(hand, ellipsoid(0.045, 0.085, 0.025, 16), -0.07);
    addJointMarker(hand, 0.03);
  }
  buildArm('L'); buildArm('R');

  // ── Legs ──
  function buildLeg(side){
    const sx = side==='L' ? 1 : -1;
    const hip = joint('hip'+side);
    hip.position.set(sx*0.09, -0.05, 0);
    pelvis.add(hip);
    addJointMarker(hip, 0.05);

    // Thigh
    const upper = joint('upperLeg'+side);
    hip.add(upper);
    { const d = taperedDown(0.085, 0.06, UPPER_LEG); addLimb(upper, d.geo, d.y); }
    addJointMarker(upper, 0.05);

    // Calf
    const lower = joint('lowerLeg'+side);
    lower.position.y = -UPPER_LEG;
    upper.add(lower);
    { const d = taperedDown(0.06, 0.045, LOWER_LEG); addLimb(lower, d.geo, d.y); }
    addJointMarker(lower, 0.04);

    // Foot: elongated rounded shoe shape
    const foot = joint('foot'+side);
    foot.position.set(0, -LOWER_LEG, 0);
    lower.add(foot);
    addLimb(foot, ellipsoid(0.05, 0.04, 0.13, 16), -FOOT_H/2 + 0.005);
    // Shift the foot ellipsoid forward
    foot.children.forEach(ch=>{
      if(ch.userData && ch.userData.figureLimb) ch.position.z = 0.06;
    });
    addJointMarker(foot, 0.035);
  }
  buildLeg('L'); buildLeg('R');

  // Index bones; capture rest quaternion (procedural is identity but keep API uniform)
  const bones = {};
  root.traverse(o=>{
    if(o.userData && o.userData.isBone){
      bones[o.name] = o;
      o.userData._restQ = o.quaternion.clone();
    }
  });
  return { root, rig, bones };
}

function _emptyPoseData(){
  const p={}; for(const n of FIGURE_BONE_ORDER) p[n]={x:0,y:0,z:0}; return p;
}

// ── Mixamo (J-Toastie CC0) T-pose mannequin loader (base64 embedded for true offline use) ──
// Standard mixamorig: bones; T-pose with mostly-identity rest rotations,
// so per-axis sliders behave intuitively (RX = forward swing for arms/legs etc).
const MIXAMO_BONE_ALIASES = {
  pelvis:'mixamorig:Hips',
  spine:'mixamorig:Spine1', chest:'mixamorig:Spine2',
  neck:'mixamorig:Neck', head:'mixamorig:Head',
  shoulderL:'mixamorig:LeftShoulder',  upperArmL:'mixamorig:LeftArm',
  lowerArmL:'mixamorig:LeftForeArm',   handL:'mixamorig:LeftHand',
  shoulderR:'mixamorig:RightShoulder', upperArmR:'mixamorig:RightArm',
  lowerArmR:'mixamorig:RightForeArm',  handR:'mixamorig:RightHand',
  upperLegL:'mixamorig:LeftUpLeg',  lowerLegL:'mixamorig:LeftLeg',  footL:'mixamorig:LeftFoot',
  upperLegR:'mixamorig:RightUpLeg', lowerLegR:'mixamorig:RightLeg', footR:'mixamorig:RightFoot',
};

let _mixamoCache = null;
function _b64ToArrayBuffer(b64){
  const bin = atob(b64);
  const len = bin.length;
  const buf = new Uint8Array(len);
  for(let i=0;i<len;i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
async function _fetchMixamoGLB(){
  if(_mixamoCache) return _mixamoCache;
  const Cls = await _addonLoader('GLTFLoader');
  if(!Cls) throw new Error('GLTFLoader unavailable (offline addon CDN)');
  if(window.MIXAMO_GLB_B64){
    const buf = _b64ToArrayBuffer(window.MIXAMO_GLB_B64);
    const loader = new Cls();
    _mixamoCache = await new Promise((res,rej)=> loader.parse(buf,'',res,rej));
    return _mixamoCache;
  }
  const loader = new Cls();
  _mixamoCache = await new Promise((res,rej)=>{
    loader.load('figures/jtoastie_walk.glb', res, undefined, rej);
  });
  return _mixamoCache;
}

function _findBoneByName(scene, name){
  // Defensive lookup: GLTFLoader may sanitize ':' → '_' (Mixamo bones), so try variants.
  const variants = new Set([
    name,
    name.replace(/:/g, '_'),
    name.replace(/:/g, ''),
    name.split(':').pop(),  // strip prefix entirely
  ]);
  let r=null;
  scene.traverse(o=>{
    if(r) return;
    if(variants.has(o.name)) r = o;
  });
  return r;
}

// Convert all meshes to MeshStandardMaterial so the figure has roughness shading
// and can cast/receive shadows (a small directional light is added on first use).
function _convertSceneToFigureMat(scene, defaultColor){
  scene.traverse(o=>{
    if(o.isMesh || o.isSkinnedMesh){
      const color = new THREE.Color(defaultColor||0xdcd8d2);
      o.material = new THREE.MeshStandardMaterial({
        color, roughness:0.78, metalness:0.0, side:THREE.FrontSide,
      });
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.figureLimb = true;
      // Skinned meshes need updated bounding sphere for frustum culling on Mac/iGPU
      if(o.isSkinnedMesh && o.skeleton){
        try { o.computeBoundingSphere(); } catch(_){}
      }
    }
  });
}

// Lazily add a single shared directional light for figure shadows
let _figureSunLight = null, _figureAmbient = null;
function _ensureFigureLighting(){
  if(_figureSunLight && _figureSunLight.parent === scene) return;
  if(!_figureAmbient){
    _figureAmbient = new THREE.HemisphereLight(0xffffff, 0x222228, 0.55);
    scene.add(_figureAmbient);
  }
  _figureSunLight = new THREE.DirectionalLight(0xfff4e2, 1.05);
  _figureSunLight.position.set(3, 6, 4);
  _figureSunLight.castShadow = true;
  // Smaller shadow map on heavy displays (Mac/Retina) to claw back GPU time
  const _shadowSz = _heavyDisplay ? 512 : 1024;
  _figureSunLight.shadow.mapSize.set(_shadowSz, _shadowSz);
  const c = _figureSunLight.shadow.camera;
  c.left = -4; c.right = 4; c.top = 4; c.bottom = -4;
  c.near = 0.5; c.far = 25;
  _figureSunLight.shadow.bias = -0.0008;
  scene.add(_figureSunLight);
  if(renderer && !renderer.shadowMap.enabled){
    renderer.shadowMap.enabled = true;
    // Basic shadow map is much cheaper than PCFSoft; use it on heavy displays
    renderer.shadowMap.type = _heavyDisplay ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  }
}

async function _buildMixamoFigure(heightCm, opts){
  opts = opts || {};
  const skinColor = opts.skinColor || '#dcd8d2';
  const jointColor = opts.jointColor || '#888888';
  const gltf = await _fetchMixamoGLB();
  const { clone: skelClone } = await import('three/addons/utils/SkeletonUtils.js');
  const cloned = skelClone(gltf.scene);
  _convertSceneToFigureMat(cloned, skinColor);

  cloned.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(cloned);
  let natural = bbox.max.y - bbox.min.y;
  if(!isFinite(natural) || natural < 0.3 || natural > 1000){
    console.warn('[figure] suspicious bbox height', natural, '→ fallback to 1.70m');
    natural = 1.70;
  }
  const targetMeters = (heightCm||FIGURE_REF_HEIGHT_CM) / 100;
  const sFactor = targetMeters / natural;

  const root = new THREE.Group();
  root.name = 'figureRoot';
  const rig = new THREE.Group();
  rig.name = 'figureRig';
  rig.userData.isHeightScale = true;
  // Persist the natural (unscaled) height in metres so setFigureHeight() can
  // compute the correct scale factor for ANY underlying mesh size — Mixamo GLBs
  // are rarely exactly 1.70m natural.
  rig.userData.naturalMeters = natural;
  rig.scale.setScalar(sFactor);
  rig.add(cloned);
  root.add(rig);

  cloned.position.y = -bbox.min.y;
  console.log(`[figure] Mixamo loaded: natural=${natural.toFixed(3)}m  scale=${sFactor.toFixed(4)}  → ${(natural*sFactor).toFixed(3)}m`);

  const bones = {};
  const missing = [];
  for(const [logical, boneName] of Object.entries(MIXAMO_BONE_ALIASES)){
    const b = _findBoneByName(cloned, boneName);
    if(b){
      b.userData._restQ = b.quaternion.clone();
      b.userData.isBone = true;
      b.userData.figureBoneLogical = logical;
      bones[logical] = b;
    } else {
      missing.push(`${logical}→${boneName}`);
    }
  }
  console.log(`[figure] Bones mapped: ${Object.keys(bones).length}/${Object.keys(MIXAMO_BONE_ALIASES).length}`);
  if(missing.length) console.warn('[figure] Missing bones:', missing);
  if(Object.keys(bones).length === 0){
    throw new Error('Mixamo bone mapping returned 0 bones — falling back to procedural');
  }
  // Visible bone wireframe (THREE.SkeletonHelper picks up bone matrices automatically)
  let skinned = null;
  cloned.traverse(o=>{ if(!skinned && o.isSkinnedMesh) skinned = o; });
  if(skinned){
    const helper = new THREE.SkeletonHelper(skinned);
    helper.material.color.setHex(0xff8844);
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.material.opacity = 0.95;
    helper.renderOrder = 999;
    helper.userData.isSkeletonHelper = true;
    root.add(helper);
  }
  // Bone joint markers — placed in SCENE ROOT (not as bone children) so they're
  // unaffected by the figure's nested scale chain. Each frame we sync the marker's
  // world position to its bone's world position. World-space radius (~3 cm) so
  // markers always look the same regardless of figure height.
  const figureMarkers = [];
  for(const [logical, b] of Object.entries(bones)){
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8844, depthTest: false, depthWrite: false, transparent: true, opacity: 1,
    });
    const mk = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mat);
    mk.userData.figureBoneHit = true;
    mk.userData.figureBoneLogical = logical;
    mk.userData.isBoneHitZone = true;
    mk.userData.isBoneMarker = true;
    mk.userData._baseColor = 0xff8844;
    mk.userData._linkedBone = b;
    mk.renderOrder = 9999;
    figureMarkers.push(mk);
  }
  _ensureFigureLighting();
  return { root, rig, bones, source:'mixamo', figureMarkers };
}

function _addProceduralFigureToScene(heightCm){
  const { root, rig, bones } = _buildFigureMannequin(heightCm);
  // Promote procedural meshes to standard material so they shade & cast shadows like Mixamo
  rig.traverse(o=>{
    if((o.isMesh||o.isSkinnedMesh) && o.userData && o.userData.figureLimb){
      const c = (o.material && o.material.color) ? o.material.color.clone() : new THREE.Color(0xdcd8d2);
      o.material = new THREE.MeshStandardMaterial({color:c, roughness:0.78, metalness:0.0});
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  _ensureFigureLighting();
  return { root, rig, bones, source:'procedural' };
}

window.addFigureLayer = async function(posHint){
  let figure;
  const skinDefault  = '#dcd8d2';
  const jointDefault = '#888888';
  try {
    figure = await _buildMixamoFigure(FIGURE_REF_HEIGHT_CM,
      {skinColor:skinDefault, jointColor:jointDefault});
  } catch(e){
    console.warn('[figure] Mixamo GLB load failed, falling back to procedural:', e);
    showUndoToast('Mixamo モデル読込失敗 → 簡易マネキン表示');
    figure = _addProceduralFigureToScene(FIGURE_REF_HEIGHT_CM);
  }
  const { root, bones, source, figureMarkers } = figure;
  if(posHint) root.position.copy(posHint);
  else {
    // Spawn 1 m along the camera's forward direction so the figure appears
    // directly in front of the user. Y is forced to ground (0) regardless
    // of camera pitch — figures should stand on the floor.
    const _fwd = new THREE.Vector3(); camera.getWorldDirection(_fwd);
    const _spawn = camPos.clone().addScaledVector(_fwd, 1);
    root.position.set(_spawn.x, 0, _spawn.z);
    _snapSpawnToGrid(root, 0); // figure already stands on the floor (y=0)
  }
  const p = root.position;
  const L = addLayer({name:`Figure ${_nextLayerNameNumber('figure')}`, type:'figure', mesh:root, size:{x:1,y:1,z:1}});
  L.pos = {x:p.x, y:p.y, z:p.z};
  L.figureBones = bones;
  L.figurePose  = _emptyPoseData();
  L.figureSelectedBone = 'pelvis';
  L.figureSkinColor  = skinDefault;
  L.figureJointColor = jointDefault;
  L.figureShowJoints = true;
  L.figureShowBones  = false; // marker visibility (default OFF — bones hidden until user toggles 🦴)
  L.figureHeight = FIGURE_REF_HEIGHT_CM;
  // Attach world-space bone markers (sync each frame from the bones)
  if(figureMarkers && figureMarkers.length){
    L.figureMarkers = figureMarkers;
    for(const mk of figureMarkers){
      mk.userData.figureLayerId = L.id;
      scene.add(mk);
    }
  }
  // IK chain / handle construction removed: figure IK mode is gone (the
  // visible handles were 4 chains × (1 sphere + 3 cones + group) = 16 scene
  // objects per figure, all sitting in the scene tree costing matrix updates
  // each frame). The existing `if(L.ikChains)` guards elsewhere skip cleanly
  // when L.ikChains is undefined, so leaving it unset is sufficient.
  L.ikEnabled = false;
  L.figureSource = source;
  // Default pose: apply '基本' (basic) so the figure starts in a natural
  // stance instead of the rigid empty/rest T-pose. We apply the preset
  // inline (no pushGlobalUndo) so figure-add doesn't pollute the undo
  // stack with an initial setup entry.
  try {
    const _basicPose = (typeof FIGURE_POSES !== 'undefined') ? FIGURE_POSES.basic : null;
    if(_basicPose){
      for(const [bName, rot] of Object.entries(_basicPose)){
        const b = L.figureBones && L.figureBones[bName]; if(!b) continue;
        L.figurePose[bName] = {x:rot.x||0, y:rot.y||0, z:rot.z||0};
        _applyBonePose(b, L.figurePose[bName]);
      }
      L.figureLastPose = 'basic';
    } else {
      L.figureLastPose = 'rest';
    }
  } catch(_){ L.figureLastPose = 'rest'; }
  pushGlobalUndo({type:'layer-add', id:L.id});  // Ctrl+Z removes the added figure
  selectLayer(L.id);
};

window.setFigureHeight = function(layerId, cm){
  const L = findLayer(layerId); if(!L||L.type!=='figure') return;
  const v = parseFloat(cm); if(!isFinite(v)||v<=0) return;
  // Push undo snapshot once per editing session (debounced) so a rapid drag
  // doesn't flood the stack.
  if(!L._figHeightUndoPending){
    L._figHeightUndoPending = true;
    pushGlobalUndo({type:'figure-height', id:L.id, height:L.figureHeight||FIGURE_REF_HEIGHT_CM});
    setTimeout(()=>{ if(L) L._figHeightUndoPending=false; }, 800);
  }
  L.figureHeight = v;
  if(L.mesh){
    const sg = L.mesh.children.find(c=>c.userData && c.userData.isHeightScale);
    if(sg){
      // Use the rig's recorded "natural" (unscaled) height so the visual size
      // really matches the requested cm — Mixamo meshes vary widely in their
      // pre-scaled size so a fixed v/170 formula was wrong.
      const naturalM = sg.userData.naturalMeters || (FIGURE_REF_HEIGHT_CM / 100);
      sg.scale.setScalar((v / 100) / naturalM);
    }
  }
  markDirty(8);
};

