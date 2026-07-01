// ══════════════════════════════════════════════════
//  MEASUREMENT TOOL
// ══════════════════════════════════════════════════
const msr = {
  active: false,
  step: 0,          // 0=none, 1=A placed, 2=both placed
  ptA: new THREE.Vector3(),
  ptB: new THREE.Vector3(),
  ptC: new THREE.Vector3(),  // optional height marker (above A by default)
  heightOn: false,           // toggled via "高さを図る (点C追加)" checkbox
  markerA: null,
  markerB: null,
  markerC: null,
  line: null,
  lineAC: null,              // vertical line A↔C shown when heightOn
  previewMarker: null,   // ghost marker for right-hold preview
  rightHold: false,
  placeDepth: 3.0,
  dragging: null,
  dragPlane: new THREE.Plane(),
  axisDragging: null,
  axisHandles: { A: { x:[], y:[], z:[], xz:[] }, B: { x:[], y:[], z:[], xz:[] }, C: { x:[], y:[], z:[], xz:[] } },
  undoStack: [],
  cachedPts: null,
  cachedCount: 0,
};
const _ray = new THREE.Raycaster();
const _v2  = new THREE.Vector2();

// Build a visible marker group: sphere + 3 axis cross rings
function makeMarker(color) {
  const g = new THREE.Group();
  g.renderOrder = 999;

  // Central sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 12),
    new THREE.MeshBasicMaterial({ color, depthTest:false })
  );
  sphere.renderOrder = 999;
  g.add(sphere);

  // Cross arms (3 short lines on each axis)
  const ARM = 0.18;
  const lineMat = new THREE.LineBasicMaterial({ color, depthTest:false });
  for (const [ax, ay, az] of [[ARM,0,0],[0,ARM,0],[0,0,ARM]]) {
    const pts = new Float32Array([-ax,-ay,-az, ax,ay,az]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ln = new THREE.Line(geo, lineMat);
    ln.renderOrder = 999;
    g.add(ln);
  }

  // Circle ring (in XZ plane)
  const SEG = 32;
  const ringPts = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    ringPts.push(Math.cos(a)*0.12, 0, Math.sin(a)*0.12);
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));
  const ring = new THREE.Line(ringGeo, lineMat.clone());
  ring.renderOrder = 999;
  g.add(ring);

  g.visible = false;
  return g;
}

// ── Build coloured XYZ pivot arrows for a marker ──
// ── XZ Horizontal plane handle (UE5-style flat square) ──
function addHorizontalHandle(markerGroup, label) {
  const S = 1.35;
  const Y = -0.1;

  const sqPts = [-S,Y,-S, S,Y,-S, S,Y,S, -S,Y,S, -S,Y,-S];
  const sqGeo = new THREE.BufferGeometry();
  sqGeo.setAttribute('position', new THREE.Float32BufferAttribute(sqPts, 3));
  const sqLine = new THREE.Line(sqGeo,
    new THREE.LineBasicMaterial({ color:0xffeebb, depthTest:false, transparent:true, opacity:0.75 }));
  sqLine.renderOrder = 995;

  const crossPts = [-S,Y,-S, S,Y,S, -S,Y,S, S,Y,-S];
  const crossGeo = new THREE.BufferGeometry();
  crossGeo.setAttribute('position', new THREE.Float32BufferAttribute(crossPts, 3));
  const crossLine = new THREE.LineSegments(crossGeo,
    new THREE.LineBasicMaterial({ color:0xffeebb, depthTest:false, transparent:true, opacity:0.28 }));
  crossLine.renderOrder = 995;

  const g = new THREE.Group();
  g.add(sqLine, crossLine);
  markerGroup.add(g);

  // ── NO mesh for raycasting — use screen-space proximity instead ──
  msr.axisHandles[label]['xz'] = []; // empty: hit detection via checkXZHandle()
  // Store visual refs for hover highlight
  msr.axisHandles[label]['_xzVisual'] = { sqLine, crossLine,
    color:0xffeebb, point:label, axisName:'xz', isXZ:true };
}

function addAxisArrows(markerGroup, label) {
  // Local-space sizes (will be scaled by updateMarkerScale → appears fixed on screen)
  const SL = 3.2, SR = 0.10, HL = 0.85, HR = 0.30;
  const axes = [
    { name:'x', color:0xff3344, rotZ: -Math.PI/2, rotX: 0 },
    { name:'y', color:0x33ee55, rotZ: 0,           rotX: Math.PI/2 },  // 奥行き (world Z)
    { name:'z', color:0x3399ff, rotZ: 0,           rotX: 0 },           // 上方向 (world Y)
  ];
  // Z=up convention: z(blue)→worldY, y(green)→worldZ
  const AXIS_DIRS = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,0,1), z: new THREE.Vector3(0,1,0) };

  for (const { name, color, rotZ, rotX } of axes) {
    const arrowGroup = new THREE.Group();
    if (rotZ !== 0) arrowGroup.rotation.z = rotZ;
    if (rotX !== 0) arrowGroup.rotation.x = rotX;
    arrowGroup.renderOrder = 997;

    const mat = new THREE.MeshBasicMaterial({ color, depthTest:false, transparent:true, opacity:0.92 });
    const matHover = new THREE.MeshBasicMaterial({ color:0xffffff, depthTest:false, transparent:true, opacity:1.0 });

    // Shaft (cylinder along +Y)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(SR, SR, SL, 7),
      mat.clone()
    );
    shaft.position.y = SL / 2;
    shaft.renderOrder = 997;

    // Cone head
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(HR, HL, 9),
      mat.clone()
    );
    head.position.y = SL + HL / 2;
    head.renderOrder = 997;

    arrowGroup.add(shaft, head);

    // Tag both meshes for raycasting / hover
    const meta = { point: label, axisName: name, axisDir: AXIS_DIRS[name].clone(), color, shaft, head };
    shaft.userData.axisHandle = meta;
    head.userData.axisHandle  = meta;

    markerGroup.add(arrowGroup);
    msr.axisHandles[label][name] = [shaft, head];
  }
  // XZ horizontal plane handle
  addHorizontalHandle(markerGroup, label);
}

function buildMeasureObjects() {
  msr.markerA = makeMarker(0xffff44);  // yellow
  msr.markerB = makeMarker(0xff8822);  // orange
  msr.markerC = makeMarker(0x66ddff);  // cyan — height marker

  addAxisArrows(msr.markerA, 'A');
  addAxisArrows(msr.markerB, 'B');
  addAxisArrows(msr.markerC, 'C');

  // Measurement line A↔B
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,0,0,0], 3));
  msr.line = new THREE.Line(lineGeo,
    new THREE.LineBasicMaterial({ color:0xffdd00, depthTest:false, linewidth:2 }));
  msr.line.renderOrder = 998;
  msr.line.visible = false;

  // Vertical line A↔C (height visualization)
  const lineGeoAC = new THREE.BufferGeometry();
  lineGeoAC.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,0,0,0], 3));
  msr.lineAC = new THREE.Line(lineGeoAC,
    new THREE.LineBasicMaterial({ color:0x66ddff, depthTest:false, linewidth:2 }));
  msr.lineAC.renderOrder = 998;
  msr.lineAC.visible = false;
  msr.markerC.visible = false;

  scene.add(msr.markerA, msr.markerB, msr.markerC, msr.line, msr.lineAC);

  // Ghost preview marker (right-hold)
  const pgSph = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 10),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.45, depthTest:false })
  );
  pgSph.renderOrder = 999;
  const pgRing = new THREE.Group();
  const R_preview = 0.32;
  const rPts = [];
  for (let i=0; i<=40; i++) { const a=i/40*Math.PI*2; rPts.push(Math.cos(a)*R_preview,0,Math.sin(a)*R_preview); }
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPts, 3));
  const rLine = new THREE.Line(rGeo,
    new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.6, depthTest:false }));
  rLine.renderOrder = 999;
  pgRing.add(rLine);
  const previewGroup = new THREE.Group();
  previewGroup.add(pgSph, pgRing);
  previewGroup.userData.ringLine = rLine;
  previewGroup.visible = false;
  previewGroup.renderOrder = 999;
  scene.add(previewGroup);
  msr.previewMarker = previewGroup;
}
buildMeasureObjects();

