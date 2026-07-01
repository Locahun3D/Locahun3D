// ══════════════════════════════════════════════════
//  AR MODE — WebGL-integrated camera passthrough
// ══════════════════════════════════════════════════
// Pragmatic AR for iPad / iPhone (and Android tablets / phones). WebXR
// `immersive-ar` is Android-Chrome-only; iOS Safari has no WebXR. So we
// implement a manual passthrough: rear camera → THREE.VideoTexture
// rendered as a fullscreen quad INSIDE the WebGL scene, with the canvas
// kept OPAQUE. One compositor layer to blend, plus we own the visual
// integration (color, orientation, fit). This is the integrated approach
// promoted from the experimental V2 path in earlier versions; the older
// translucent-canvas + <video> overlay variant was retired after iPad
// testing showed it never escaped iOS Safari's compositor rAF throttle.
//
// Trade-off: every frame we pay `texImage2D(HTMLVideoElement)` upload
// cost, which iOS Safari sometimes does synchronously. Mitigated by
// hard-capping the camera stream to 640×360 / 15 fps in the
// getUserMedia() constraint below.
//
// User can still walk via the on-screen joystick AND drag-to-recenter
// the view by touching the right-half of the canvas — the touch handler
// (search "Touch look") detects AR mode and shifts arMode.baselineYaw /
// baselinePitch so the gyro keeps tracking but with a user offset.

// Re-used scratch primitives so the 60 Hz orientation handler doesn't
// thrash GC.
const _arEulerScratch = new THREE.Euler();
const _arQuatScratch  = new THREE.Quaternion();
const _arQuatScreenAdjust = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const _arQuatOrient   = new THREE.Quaternion();
const _arForwardScratch = new THREE.Vector3();
const _arZAxis = new THREE.Vector3(0, 0, 1);

window.toggleARMode = function(){
  if(arMode.active){ _arExit(); return; }
  // iOS 13+: DeviceOrientationEvent.requestPermission() only shows its dialog
  // when called with a *transient user activation*. Calling it deeper inside the
  // async _arEnter() — even as that function's first await — can make iOS fail
  // the activation check and resolve 'denied' WITHOUT ever showing the prompt
  // (the exact symptom reported: the "permission required" toast appears but no
  // iOS dialog). So FIRE the request right here, synchronously in the tap
  // handler, and hand the pending promise to _arEnter(). Also request
  // DeviceMotionEvent — some iOS builds gate the 'deviceorientation' data stream
  // behind the motion permission as well.
  let orientPermP = null;
  try {
    if(typeof DeviceOrientationEvent !== 'undefined' &&
       typeof DeviceOrientationEvent.requestPermission === 'function'){
      orientPermP = DeviceOrientationEvent.requestPermission();
    }
  } catch(_){ orientPermP = null; }
  try {
    if(typeof DeviceMotionEvent !== 'undefined' &&
       typeof DeviceMotionEvent.requestPermission === 'function'){
      DeviceMotionEvent.requestPermission().catch(()=>{});
    }
  } catch(_){}
  _arEnter(orientPermP).catch(e=>{
    console.error('[AR] enter failed', e);
    if(typeof showUndoToast==='function') showUndoToast(T('ar-permission-denied'));
    _arExit();
  });
};

const arMode = {
  active: false,
  video: null,           // off-screen <video> (not in visual DOM)
  stream: null,
  videoTexture: null,
  bgMesh: null,
  bgMat: null,
  bgGeom: null,
  orientHandler: null,
  baseYaw: 0,
  baselineYaw: 0,
  baselinePitch: 0,
  baselineCaptured: false,
  _savedPixelRatio: null,
  _updateUniforms: null,
  _onMetadata: null,
};

async function _arEnter(orientPermP){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showUndoToast(T('ar-unsupported'));
    return;
  }
  // The orientation permission was already requested in the tap handler
  // (toggleARMode) so iOS sees a valid user gesture; here we just await its
  // result. Only a hard 'denied' aborts — once denied, iOS never re-prompts, so
  // point the user at Settings. 'error'/undefined means we couldn't determine it
  // (e.g. the call threw); continue anyway so the camera passthrough still runs.
  arMode.noGyro = false;
  if(orientPermP){
    let r = 'granted';
    try { r = await orientPermP; } catch(_){ r = 'error'; }
    if(r === 'denied'){
      // ★ジャイロ拒否でも AR を中止しない。背面カメラ表示は出し、傾き追従なし＝指で見回す。
      //   （設定>Safari>モーションと画面の向きのアクセス OFF でも AR が使えるように）
      arMode.noGyro = true;
      showUndoToast(T('ar-perm-motion-denied'));
    }
  }
  // Same minimum cap as V1: 640×360 / 15 fps. In V2 this matters EVEN
  // MORE because texImage2D(HTMLVideoElement) runs every frame to upload
  // the camera into a WebGL texture — upload cost scales with width ×
  // height × frame rate. 640×360 @ 15 = 9 % of the bandwidth of 1280×720
  // @ 30, so the per-frame upload becomes negligible on iPad.
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 640, max: 640 },
        height: { ideal: 360, max: 360 },
        frameRate: { ideal: 15, max: 15 },
      },
      audio: false,
    });
  } catch(e){
    console.warn('[AR] getUserMedia failed, retrying:', e);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch(e2){
      console.warn('[AR] getUserMedia retry failed:', e2);
      // Distinguish "user/Settings blocked the camera" from other failures so we
      // can point them at the right place. NotAllowedError / SecurityError =
      // permission; once blocked in Settings iOS won't re-prompt.
      const denied = e2 && (e2.name === 'NotAllowedError' || e2.name === 'SecurityError');
      showUndoToast(T(denied ? 'ar-perm-camera-denied' : 'ar-permission-denied'));
      return;
    }
  }
  try {
    const track = stream.getVideoTracks()[0];
    if(track && typeof track.applyConstraints === 'function'){
      const s = track.getSettings ? track.getSettings() : {};
      if((s.width || 0) > 640 || (s.height || 0) > 360 || (s.frameRate || 0) > 15){
        await track.applyConstraints({
          width:  { max: 640 },
          height: { max: 360 },
          frameRate: { max: 15 },
        }).catch(()=>{});
      }
    }
  } catch(_){}

  // ── Off-screen video element ──
  // Kept out of the visual DOM (display:none) but the MediaStream still
  // decodes — Three.js VideoTexture uploads from it each frame.
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);
  video.srcObject = stream;
  try { await video.play(); } catch(_){ /* iOS sometimes throws on programmatic play */ }

  // ── VideoTexture ──
  const tex = new THREE.VideoTexture(video);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;

  // ── Background quad ──
  // Vertex shader writes NDC directly so the quad always covers the full
  // viewport regardless of the main scene's camera. Fragment shader does
  // cover-style aspect-fit (no black bars; centre-crops if AR mismatched)
  // and screen-orientation rotation.
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map:         { value: tex },
      canvasAR:    { value: innerWidth / Math.max(1, innerHeight) },
      videoAR:     { value: 16/9 }, // updated on loadedmetadata
      orientation: { value: 0   }, // 0 / ±PI/2 / PI
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        // Bypass projection/view matrices: place quad at far depth in NDC.
        gl_Position = vec4(position.xy, 0.99999, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D map;
      uniform float canvasAR;
      uniform float videoAR;
      uniform float orientation;
      varying vec2 vUv;
      void main(){
        // Centre origin so rotation + scale operate around (0.5, 0.5).
        vec2 uv = vUv - 0.5;
        // Rotate UVs by negative screen-orientation so the world stays
        // upright when the device is held in landscape vs portrait.
        float c = cos(orientation), s = sin(orientation);
        uv = mat2(c, -s, s, c) * uv;
        // Cover-fit: scale UVs so the video fills the canvas, cropping
        // whichever axis exceeds. Compares orientation-adjusted aspect
        // (canvas) to the video's intrinsic aspect.
        float effCanvasAR = abs(c) > 0.5 ? canvasAR : (1.0 / canvasAR);
        float ratio = effCanvasAR / videoAR;
        if(ratio > 1.0){
          // Canvas wider than video → fit video width, crop video height.
          uv.y /= ratio;
        } else {
          // Canvas taller than video → fit video height, crop video width.
          uv.x *= ratio;
        }
        uv += 0.5;
        // Clamp so wraparound noise at extreme edges doesn't show.
        uv = clamp(uv, 0.0, 1.0);
        gl_FragColor = texture2D(map, uv);
      }
    `,
    depthTest:  false,
    depthWrite: false,
    transparent: false,
  });
  const geom = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geom, mat);
  // Render order MUST be below the env dome's (-10000) so that when the
  // user has an env preset selected the dome paints OVER the camera
  // image and gives them sky-as-background; otherwise the camera quad
  // overwrites the dome's pixels and the user sees the camera no matter
  // what 環境 preset they picked. Use -1e6 to leave generous headroom
  // for any future "draw earlier than env" widgets.
  mesh.renderOrder = -1000000;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  // ── Aspect / orientation uniform updater ──
  const updateUniforms = ()=>{
    if(!arMode.bgMat) return;
    const u = arMode.bgMat.uniforms;
    const vw = video.videoWidth  || 1280;
    const vh = video.videoHeight || 720;
    u.canvasAR.value = innerWidth / Math.max(1, innerHeight);
    u.videoAR.value  = vw / Math.max(1, vh);
    const oDeg = (screen.orientation && screen.orientation.angle != null)
                ? screen.orientation.angle
                : (window.orientation || 0);
    u.orientation.value = oDeg * Math.PI / 180;
  };
  arMode._onMetadata = ()=>updateUniforms();
  video.addEventListener('loadedmetadata', arMode._onMetadata);
  updateUniforms();
  arMode._updateUniforms = updateUniforms;
  window.addEventListener('resize', updateUniforms);
  if(screen.orientation && screen.orientation.addEventListener){
    try { screen.orientation.addEventListener('change', updateUniforms); } catch(_){}
  }

  // ── Pixel ratio: V2 is single-layer so we can afford a higher PR than
  // V1 (which had to cut the compositor cost via PR=1.0). Cap at 1.5 to
  // get sharper splats while still trimming texImage2D upload cost. ──
  try {
    arMode._savedPixelRatio = renderer.getPixelRatio();
    const v2PR = Math.min(arMode._savedPixelRatio, 1.5);
    renderer.setPixelRatio(v2PR);
  } catch(_){}

  // Env dome visibility is NOT touched on AR entry anymore.
  // Rationale: in the integrated V2 path the camera image is a fullscreen
  // quad at the far-plane depth, drawn first; the env dome (a sphere
  // around the camera) renders OVER it normally. So if the user has an
  // env preset selected, they see the sky (and the camera is occluded
  // behind it, which is fine). If they want the camera background
  // visible, they set 環境 to "OFF" — the dome becomes invisible and
  // the camera quad shows through. This puts background composition
  // back under the user's control instead of AR silently overriding it.
  // (Previous auto-hide was a V1 holdover where the transparent canvas
  // made the dome physically block the camera; not needed in V2.)

  document.body.classList.add('ar-active');

  // ── Device-orientation handler (yaw + pitch) — same math as V1 ──
  arMode.baseYaw = yaw;
  arMode.baselineCaptured = false;
  arMode.orientHandler = function(ev){
    if(ev.alpha == null || ev.beta == null) return;
    const orient = (screen.orientation && screen.orientation.angle != null)
                  ? screen.orientation.angle
                  : (window.orientation || 0);
    const orientRad = orient * Math.PI / 180;
    const alpha = ev.alpha * Math.PI / 180;
    const beta  = ev.beta  * Math.PI / 180;
    const gamma = ev.gamma != null ? ev.gamma * Math.PI / 180 : 0;
    _arEulerScratch.set(beta, alpha, -gamma, 'YXZ');
    _arQuatScratch.setFromEuler(_arEulerScratch);
    _arQuatScratch.multiply(_arQuatScreenAdjust);
    _arQuatOrient.setFromAxisAngle(_arZAxis, -orientRad);
    _arQuatScratch.multiply(_arQuatOrient);
    _arForwardScratch.set(0,0,-1).applyQuaternion(_arQuatScratch);
    const yawNew   = Math.atan2(-_arForwardScratch.x, -_arForwardScratch.z);
    const pitchNew = Math.asin(Math.max(-1, Math.min(1, _arForwardScratch.y)));
    if(!arMode.baselineCaptured){
      arMode.baselineYaw = yawNew;
      arMode.baselinePitch = pitchNew;
      arMode.baselineCaptured = true;
      return;
    }
    const newYawTarget   = arMode.baseYaw + (yawNew - arMode.baselineYaw);
    const newPitchTarget = Math.max(-1.55, Math.min(1.55, pitchNew - arMode.baselinePitch));
    const ARGYRO_EPS = 0.0017;
    const dyaw   = Math.abs(newYawTarget   - _yawTarget);
    const dpitch = Math.abs(newPitchTarget - _pitchTarget);
    _yawTarget   = newYawTarget;
    _pitchTarget = newPitchTarget;
    if(dyaw > ARGYRO_EPS || dpitch > ARGYRO_EPS) markDirty(2);
  };
  // ジャイロ権限が拒否されたときは傾き追従を付けない → baselineCaptured が false のまま
  // となり、タッチドラッグが直接 free-look（指で見回し）になる。
  if(!arMode.noGyro) window.addEventListener('deviceorientation', arMode.orientHandler, true);

  // ── Store handles + UI swap ──
  arMode.video = video;
  arMode.stream = stream;
  arMode.videoTexture = tex;
  arMode.bgMesh = mesh;
  arMode.bgMat = mat;
  arMode.bgGeom = geom;
  arMode.active = true;

  const btn = document.getElementById('btnAR');
  if(btn){
    btn.classList.add('on');
    btn.setAttribute('title', T('tt-ar-exit') || 'AR モードを終了');
    btn.blur();
    for(const n of btn.childNodes){
      if(n.nodeType === Node.TEXT_NODE){ n.textContent = '✕ '; break; }
    }
  }
  const lbl = document.getElementById('lbl-ar');
  if(lbl) lbl.textContent = T('lbl-ar-exit');
  showUndoToast('📱 AR (WebGL 統合) ON — 端末を傾けて視点を変えられます');
  markDirty(10);
}

function _arExit(){
  arMode.active = false;
  if(arMode.stream){
    try { arMode.stream.getTracks().forEach(t=>t.stop()); } catch(_){}
    arMode.stream = null;
  }
  if(arMode.video){
    try { arMode.video.pause(); } catch(_){}
    if(arMode._onMetadata){
      try { arMode.video.removeEventListener('loadedmetadata', arMode._onMetadata); } catch(_){}
    }
    arMode.video.srcObject = null;
    if(arMode.video.parentNode) arMode.video.parentNode.removeChild(arMode.video);
    arMode.video = null;
  }
  arMode._onMetadata = null;
  if(arMode.bgMesh){
    try { scene.remove(arMode.bgMesh); } catch(_){}
    arMode.bgMesh = null;
  }
  if(arMode.bgMat){ try { arMode.bgMat.dispose(); } catch(_){} arMode.bgMat = null; }
  if(arMode.bgGeom){ try { arMode.bgGeom.dispose(); } catch(_){} arMode.bgGeom = null; }
  if(arMode.videoTexture){ try { arMode.videoTexture.dispose(); } catch(_){} arMode.videoTexture = null; }
  if(arMode.orientHandler){
    window.removeEventListener('deviceorientation', arMode.orientHandler, true);
    arMode.orientHandler = null;
  }
  if(arMode._updateUniforms){
    try { window.removeEventListener('resize', arMode._updateUniforms); } catch(_){}
    if(screen.orientation && screen.orientation.removeEventListener){
      try { screen.orientation.removeEventListener('change', arMode._updateUniforms); } catch(_){}
    }
    arMode._updateUniforms = null;
  }
  try {
    if(typeof arMode._savedPixelRatio === 'number' && arMode._savedPixelRatio > 0){
      renderer.setPixelRatio(arMode._savedPixelRatio);
    } else if(typeof _PR_CAP === 'number'){
      renderer.setPixelRatio(Math.min(devicePixelRatio, _PR_CAP) * qualScale);
    }
  } catch(_){}
  arMode._savedPixelRatio = null;
  arMode.baselineCaptured = false;
  // (env dome visibility is no longer touched by AR — see entry comment.)
  document.body.classList.remove('ar-active');
  const btn = document.getElementById('btnAR');
  if(btn){
    btn.classList.remove('on');
    btn.setAttribute('title', T('tt-ar') || 'AR モード');
    for(const n of btn.childNodes){
      if(n.nodeType === Node.TEXT_NODE){ n.textContent = '📱 '; break; }
    }
    btn.blur();
  }
  const lbl = document.getElementById('lbl-ar');
  if(lbl) lbl.textContent = T('lbl-ar');
  showUndoToast(T('ar-off'));
  markDirty(10);
}

// V2 keeps the touchstart/touchmove rotation hook from V1 working: the
// existing touch handlers detect arMode.active first and modify its
// baselines. We piggy-back V2 by patching the same handlers — see the
// joystick / touch-look code further down. For correctness, both V1
// and V2 cannot be active simultaneously; the toggle ensures that.

// Reposition avatar to current camera/view position. Called by the reset
// button when walk mode is active.
window.repositionAvatar = function(){
  if(!walkMode.active || !walkMode.avatar) return;
  // Clear the anchor before sampling so this re-spawn search isn't itself
  // clamped to the OLD anchor (we want the user's new chosen location to
  // become the fresh authoritative ground reference).
  walkMode._anchorY = undefined;
  walkMode._lastDetectedY = undefined;
  walkMode._lastDetectionWasReal = false;
  walkMode._missFrames = 0;
  // Forward vector matching camera world forward (W direction).
  const fwx =  Math.sin(yaw), fwz =  Math.cos(yaw);
  const sx = camPos.x + fwx * 2.5;
  const sz = camPos.z + fwz * 2.5;
  const sy = _avatarGroundY(sx, sz);
  walkMode.avatar.position.set(sx, sy - walkMode.groundOffset, sz);
  walkMode.avatar.rotation.set(0, yaw, 0);
  walkMode.velocity.set(0,0,0);
  walkMode.airborne = false;
  // Re-anchor at the new spawn Y. As in _avatarWalkEnter, mark the anchor
  // as a fallback if the search hit the y=0 grid; the next real detection
  // will promote the anchor to the actual splat surface.
  walkMode._anchorY = sy;
  walkMode._anchorIsFallback = !walkMode._lastDetectionWasReal;
  walkMode._lastDetectedY = sy;
  walkMode._smoothTargetY = sy - walkMode.groundOffset;
  showUndoToast(T('walk-repos'));
  markDirty(10);
};

function _refreshResetBtnLabel(){
  const btn = document.getElementById('btn-cam-reset');
  const lbl = document.getElementById('lbl-cam-reset');
  if(!btn || !lbl) return;
  if(walkMode.active){
    btn.setAttribute('onclick','repositionAvatar()');
    btn.title = T('tt-walk-repos');
    lbl.textContent = T('lbl-walk-repos');
    btn.dataset.mode = 'walk';
  } else {
    btn.setAttribute('onclick','resetCameraToInitial()');
    btn.title = T('tt-cam-reset');
    lbl.textContent = T('lbl-cam-reset');
    btn.dataset.mode = 'cam';
  }
}

function updateCamera(){
  camera.position.copy(camPos);
  // YXZ order: yaw (Y) → pitch (X) → roll (Z). Roll is applied LAST so it rotates
  // the image plane around the lens axis, matching real-world dutch-angle behavior.
  camera.rotation.set(pitch, yaw + Math.PI, roll, 'YXZ');
}



