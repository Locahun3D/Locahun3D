// Find the highest "floor" Y at world (x,z) by ray-casting down against the
// scene. Falls back to the world grid (y=0) if nothing is hit.
//
// Constraints:
//   • Ground hits no more than `STEP_UP` ABOVE currentFeetY are accepted —
//     anything higher is a ceiling/overhead point cloud, NOT a step we can
//     climb (this fixes "avatar climbs onto invisible stairs above the floor"
//     when there are splat points overhead).
//   • Hits below currentFeetY are accepted up to a wide drop limit so the
//     avatar can fall off ledges naturally.
//   • Pass currentFeetY = null/undefined for spawn / reposition where we want
//     to find ground from anywhere.
function _avatarGroundY(x, z, currentFeetY){
  // Start as "no ground found yet" so a real floor at NEGATIVE Y wins.
  // (Mobile 3DGS scans often place the actual ground at y ≈ -1.5 ~ -2.5
  //  because the capture origin is the device, not the floor.)
  // We fall back to y = 0 (the world grid) ONLY if nothing else hits.
  let bestY = -Infinity;
  const STEP_UP = 0.6;        // 60cm step-up tolerance
  // DROP tightened from 100 → 2.0 m. The previous 100 m search depth caused
  // the avatar to "teleport down" onto subsurface scan noise or onto a
  // different splat layer's ground plane sitting metres below the visible
  // surface. 2 m is enough for stairs / kerbs / small ledges; for genuine
  // long falls the avatar simply stays airborne for an extra frame and the
  // standard gravity loop catches the next-frame search.
  const DROP    = 2.0;
  const useCap = (typeof currentFeetY === 'number') && isFinite(currentFeetY);
  const minY = useCap ? (currentFeetY - DROP)    : -1e3;
  const maxY = useCap ? (currentFeetY + STEP_UP) :  1e3;
  const startY = useCap ? (currentFeetY + STEP_UP) : 1e3;
  // Build candidate mesh list: cubes, spheres, OBJ/GLB models, figures.
  // Skip the avatar itself and any non-visible layers.
  const meshes = [];
  for(const L of layers){
    if(!L || !L.mesh || !L.visible) continue;
    if(L.mesh === walkMode.avatar) continue;
    if(L.type==='cube' || L.type==='sphere' || L.type==='obj' || L.type==='figure'){
      meshes.push(L.mesh);
    }
  }
  if(meshes.length){
    _wmTmpV.set(x, startY, z);
    _wmRay.set(_wmTmpV, _wmDown);
    _wmRay.far = startY - minY;
    const hits = _wmRay.intersectObjects(meshes, true);
    // First hit is the closest from above; only accept if it lies in our band
    if(hits.length){
      const hy = hits[0].point.y;
      if(isFinite(hy) && hy >= minY && hy <= maxY && hy > bestY) bestY = hy;
    }
  }
  // Splat point cache: find the most-likely-ground Y near (x,z) using a
  // histogram-mode approach. The previous "highest Y in radius" picked up
  // vegetation / signs / utility wires that happened to be in the 0.4 m
  // search radius and the avatar would FLOAT on top of them. Instead we:
  //   1. Collect all Y values within the search cylinder & valid band.
  //   2. Bin them at 0.15 m granularity.
  //   3. Pick the densest bin (the actual continuous surface), and tie-break
  //      toward bins CLOSEST to currentFeetY so we don't snap onto a
  //      far-but-denser surface like a roof when the avatar is at street
  //      level. This isolates the real floor / pavement plane from sparse
  //      noise above and below.
  for(const L of layers){
    if(L.type !== 'splat' || !L._splatCache || !L.visible) continue;
    if(L.mesh === walkMode.avatar) continue;
    const cache = L._splatCache, n = L._splatCacheCount|0;
    if(!n) continue;
    L.mesh.updateMatrixWorld();
    const m = L.mesh.matrixWorld;
    const e = m.elements;
    const RADIUS_SQ = 0.16; // 0.4m search radius
    const STEP = Math.max(1, Math.floor(n / 50000));
    // Bin Y values at 0.15m. Map<binKey, {count, sum}>.
    const BIN = 0.15;
    const bins = new Map();
    for(let i=0; i<n; i+=STEP){
      const px = cache[i*3], py = cache[i*3+1], pz = cache[i*3+2];
      const wx = e[0]*px + e[4]*py + e[8]*pz  + e[12];
      const wz = e[2]*px + e[6]*py + e[10]*pz + e[14];
      const dx = wx - x, dz = wz - z;
      if(dx*dx + dz*dz >= RADIUS_SQ) continue;
      const wy = e[1]*px + e[5]*py + e[9]*pz + e[13];
      if(!isFinite(wy) || wy < minY || wy > maxY) continue;
      const key = Math.round(wy / BIN);
      const ent = bins.get(key);
      if(ent){ ent.count++; ent.sum += wy; }
      else bins.set(key, { count:1, sum:wy });
    }
    if(bins.size){
      // Find best bin: count weighted by an exponential proximity factor to
      // the avatar's current feet Y. The previous linear penalty (×2) was
      // way too soft — a far-but-dense bin (subsurface noise, or a different
      // layer's surface 1.5 m below) won, causing the avatar to teleport
      // down 1.6 m repeatedly while walking. exp(-d×4) means a bin 0.5 m
      // away keeps only 14 % of its weight, 1 m away 1.8 %, so only nearby
      // surfaces dominate when the avatar is already roughly grounded.
      const refY = useCap ? currentFeetY : 0;
      let bestKey = null, bestScore = -Infinity, bestSum = 0, bestCount = 0;
      for(const [k, v] of bins){
        const meanY = v.sum / v.count;
        const score = v.count * Math.exp(-Math.abs(meanY - refY) * 4);
        if(score > bestScore){
          bestScore = score; bestKey = k; bestSum = v.sum; bestCount = v.count;
        }
      }
      if(bestKey !== null && bestCount >= 3){  // require minimum density
        const bestSplatY = bestSum / bestCount;
        if(bestSplatY > bestY) bestY = bestSplatY;
      }
    }
  }
  // ── Anchor clamp ───────────────────────────────────────────────────────
  // The detection above is density-driven; when the user has loaded multiple
  // splat layers or the cloud has subsurface noise, the densest cluster can
  // sit several metres below the visible road. Without an anchor the avatar
  // creeps downward over time as each new detection finds a slightly lower
  // bin (the user-reported "7 m sink" after 5 s of forward walking).
  //
  // walkMode._anchorY is set in _avatarWalkEnter / アバター再配置 when the
  // user explicitly places the avatar. From there we restrict the detected
  // ground band:
  //   • ±1.5 m UP    (step-up tolerance — bounded so we can't climb walls)
  //   • UP TO 5 m DOWN (cliff fall tolerance — accommodates the case where
  //                     the spawn search hit the y=0 grid fallback because
  //                     no splat density was found at the spawn x,z, and
  //                     the real splat road sits at e.g. y=-1.6 below)
  //
  // walkMode._anchorIsFallback flags the spawn-grid-fallback case so we
  // can re-anchor to the first real splat detection that comes in, locking
  // the band tight from then on.
  if(typeof walkMode._anchorY === 'number'){
    if(isFinite(bestY)){
      const delta = bestY - walkMode._anchorY;
      if(delta > 1.5 || delta < -5.0){
        // Out-of-band detection — ignore this frame, fall through to sticky.
        bestY = -Infinity;
      } else if(walkMode._anchorIsFallback && Math.abs(delta) > 0.05){
        // First real surface detection after a grid-fallback spawn — promote
        // it to be the new authoritative anchor and tighten the band.
        walkMode._anchorY = bestY;
        walkMode._anchorIsFallback = false;
      }
    }
  }

  // ── Sticky ground tracking ─────────────────────────────────────────────
  // Prevents the "splat radius missed for one frame" flip between the real
  // surface and the grid fallback:
  //   • If we found ANY in-band surface this frame → trust it, remember it.
  //   • If we found NOTHING this frame → keep returning the last remembered
  //     surface for up to ~30 frames (~0.5 s @60 fps). Only after a
  //     sustained miss do we fall back to the anchor (or world grid).
  if(isFinite(bestY)){
    walkMode._lastDetectedY = bestY;
    walkMode._missFrames = 0;
    walkMode._lastDetectionWasReal = true;
    return bestY;
  }
  walkMode._missFrames = (walkMode._missFrames|0) + 1;
  if(walkMode._missFrames < 30 && typeof walkMode._lastDetectedY === 'number'){
    return walkMode._lastDetectedY;
  }
  // Sustained miss: prefer the spawn anchor over the world grid so the avatar
  // doesn't sink to y=0 when the user's scene has a non-zero floor.
  if(typeof walkMode._anchorY === 'number'){
    walkMode._lastDetectionWasReal = false;
    return walkMode._anchorY;
  }
  walkMode._lastDetectionWasReal = false;
  return 0;   // World grid (empty scene)
}

function updateAvatarWalk(dt){
  const av = walkMode.avatar; if(!av) return;
  // 1) Read input
  // Combine keyboard (digital, WASD + Shift) with on-screen joystick (analog,
  // two-zone: inner 0.5 = walk speed, outer = run speed) AND USB gamepad
  // (left stick analog, same two-zone curve). All three contribute additively
  // and are clamped to a unit direction in step 2 so simultaneous keyboard +
  // pad input doesn't double the speed.
  const fwKb = (keys.KeyW?1:0) - (keys.KeyS?1:0);
  const rtKb = (keys.KeyD?1:0) - (keys.KeyA?1:0);
  const joyMag = Math.sqrt(joyDX*joyDX + joyDY*joyDY);
  let fwJoy = 0, rtJoy = 0, joyRun = false;
  if(joyMag > 1e-3){
    const dirFw = -joyDY / joyMag;
    const dirRt =  joyDX / joyMag;
    if(joyMag > 0.5){
      // Outer zone → sprint (Shift-equivalent), full directional magnitude.
      fwJoy = dirFw;
      rtJoy = dirRt;
      joyRun = true;
    } else {
      // Inner zone → analog walk: linear 0→1 across the inner half.
      const k = joyMag / 0.5;
      fwJoy = dirFw * k;
      rtJoy = dirRt * k;
    }
  }
  // Gamepad (Xbox / PlayStation USB). Left stick → avatar move (same
  // two-zone curve as the touch joystick). Right stick → orbit camera
  // around avatar via the standard _yawTarget / _pitchTarget channel —
  // updateFlyCamera early-returns in walk mode, so we have to apply look
  // here too. South face button (A / cross) → jump.
  let fwGp = 0, rtGp = 0, gpRun = false, gpJump = false;
  const gp = _readGamepadInput();
  if(gp){
    const gMag = Math.sqrt(gp.lx*gp.lx + gp.ly*gp.ly);
    if(gMag > 1e-3){
      const dirFw = -gp.ly / gMag;
      const dirRt =  gp.lx / gMag;
      if(gMag > 0.5){
        fwGp = dirFw; rtGp = dirRt; gpRun = true;
      } else {
        const k = gMag / 0.5;
        fwGp = dirFw * k; rtGp = dirRt * k;
      }
    }
    if(gp.sprint) gpRun = true;
    if(gp.rx !== 0 || gp.ry !== 0){
      _yawTarget   -= gp.rx * _GP_LOOK_SPEED * dt;
      _pitchTarget  = Math.max(-1.55, Math.min(1.55, _pitchTarget - gp.ry * _GP_LOOK_SPEED * dt));
    }
    if(gp.aJustPressed) gpJump = true;
  }
  const fw = fwKb + fwJoy + fwGp;
  const rt = rtKb + rtJoy + rtGp;
  const running = !!(keys.ShiftLeft||keys.ShiftRight) || joyRun || gpRun;
  const speed = walkMode.speed * (running ? walkMode.runMul : 1);
  const moving = (Math.abs(fw) > 1e-4 || Math.abs(rt) > 1e-4);
  // 2) Move avatar in camera-yaw frame (XZ plane).
  // Camera world forward (after camera.rotation.y = yaw + π) is (sin yaw, 0, cos yaw),
  // so W = forward = +(sin yaw, cos yaw); D = right = (-cos yaw, +sin yaw).
  if(moving){
    const fwx =  Math.sin(yaw), fwz =  Math.cos(yaw);
    const rtx = -Math.cos(yaw), rtz =  Math.sin(yaw);
    let dx = fwx*fw + rtx*rt;
    let dz = fwz*fw + rtz*rt;
    const len = Math.hypot(dx, dz);
    if(len > 0){ dx /= len; dz /= len; }
    av.position.x += dx * speed * dt;
    av.position.z += dz * speed * dt;
    // Rotate avatar to face movement direction (smoothly)
    const targetYaw = Math.atan2(dx, dz);
    let dy = targetYaw - av.rotation.y;
    while(dy >  Math.PI) dy -= 2*Math.PI;
    while(dy < -Math.PI) dy += 2*Math.PI;
    av.rotation.y += dy * Math.min(1, dt*10);
  }
  // 3) Gravity + ground collision (treats avatar as a point at av.position;
  //    we offset by groundOffset so the FEET sit on the detected groundY).
  // Pass current feet Y so overhead splat points / ceilings aren't picked
  // as ground (avatar would otherwise teleport up onto invisible stairs).
  const currentFeetY = av.position.y + walkMode.groundOffset;
  walkMode.groundY = _avatarGroundY(av.position.x, av.position.z, currentFeetY);
  const detectedTarget = walkMode.groundY - walkMode.groundOffset;
  // Rate-limit upward target changes so a sudden detection switch (e.g.,
  // crossing into another splat layer's denser cluster, or returning from
  // a noisy frame) doesn't teleport the avatar 1+ metre vertically. We
  // cap upward motion at 4 m/s — a step-up hop of 0.6 m takes 0.15 s, fast
  // enough to feel responsive but slow enough that any erratic detection
  // is hidden behind a smooth slide. Downward changes stay unlimited so
  // gravity still feels natural when stepping off a kerb.
  if(typeof walkMode._smoothTargetY !== 'number') walkMode._smoothTargetY = detectedTarget;
  const tgtDelta = detectedTarget - walkMode._smoothTargetY;
  if(tgtDelta > 0){
    walkMode._smoothTargetY += Math.min(tgtDelta, 4 * dt);
  } else {
    walkMode._smoothTargetY = detectedTarget;   // free-fall down
  }
  const targetY = walkMode._smoothTargetY;
  walkMode.velocity.y -= 9.8 * dt;
  av.position.y += walkMode.velocity.y * dt;
  if(av.position.y <= targetY){
    av.position.y = targetY;
    walkMode.velocity.y = 0;
    walkMode.airborne = false;
  } else {
    walkMode.airborne = true;
  }
  // 3b) Jump trigger — Space key OR gamepad south face button.
  // Only while grounded so we don't double-jump. gpJump is edge-detected
  // inside _readGamepadInput so a single press = a single jump.
  if((keys.Space || gpJump) && !walkMode.airborne){
    walkMode.velocity.y = walkMode.jumpVel;
    walkMode.airborne = true;
  }
  // 4) Walk / idle animation. Suspended while airborne so legs don't pump in mid-air.
  _avatarUpdateAnimation(dt, moving && !walkMode.airborne, running ? walkMode.runMul : 1);
  // 5) Camera follows BEHIND avatar (opposite of forward) + above.
  //    camera_pos = avatar - forward * dist. Forward = (sin yaw, cos yaw).
  const camOffX = -Math.sin(yaw) * walkMode.cameraDist;
  const camOffZ = -Math.cos(yaw) * walkMode.cameraDist;
  camPos.set(av.position.x + camOffX, av.position.y + walkMode.cameraHeight, av.position.z + camOffZ);
  // 6) Visual ground indicator: parks at the detected groundY directly
  //    under the avatar. Lifts 1cm above the floor to avoid z-fighting.
  if(walkMode.groundDisc){
    walkMode.groundDisc.position.set(
      av.position.x,
      walkMode.groundY + 0.01,
      av.position.z
    );
  }
  // Only request a frame if SOMETHING actually changed this tick. Previously
  // we called markDirty(2) unconditionally → the dirty timer was always > 0
  // → animate() never went idle even when the user wasn't touching keys, mouse
  // or pad. This pegged 1 CPU core + GPU at full draw load on a static
  // standing avatar. Now we only re-render when there's real motion or
  // pending physics state to advance.
  const settling =
    Math.abs(walkMode.velocity.y) > 1e-3 ||
    walkMode.airborne ||
    Math.abs((walkMode._smoothTargetY||0) - (walkMode.groundY - walkMode.groundOffset)) > 1e-3 ||
    Math.abs(_yawTarget - yaw)   > 1e-4 ||
    Math.abs(_pitchTarget - pitch) > 1e-4;
  if(moving || settling){
    markDirty(2);
  }
}

window.toggleAvatarWalk = function(){
  if(walkMode.active){ _avatarWalkExit(); }
  else { _avatarWalkEnter().catch(e=>console.error('[walk] enter failed', e)); }
};

async function _avatarWalkEnter(){
  // Place avatar 2.5m in front of camera, snapped to ground
  if(!walkMode.avatar){
    try {
      walkMode.avatar = await _avatarBuild();
    } catch(e){
      console.error('[walk] avatar build failed', e);
      return;
    }
    scene.add(walkMode.avatar);
    _avatarMeasureGroundOffset(walkMode.avatar);
  }
  // Visual ground indicator — a thin transparent ring at the detected
  // ground Y so the user can see whether the system found a real floor
  // (esp. important for 3DGS scans where the actual ground is at a
  // negative Y, far below the world grid).
  if(!walkMode.groundDisc){
    const ringGeo = new THREE.RingGeometry(0.32, 0.40, 32);
    ringGeo.rotateX(-Math.PI/2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x66ddff, transparent:true, opacity:0.55,
      side: THREE.DoubleSide, depthTest:false, depthWrite:false,
    });
    const disc = new THREE.Mesh(ringGeo, ringMat);
    disc.renderOrder = 991;
    walkMode.groundDisc = disc;
    scene.add(disc);
  }
  walkMode.groundDisc.visible = true;
  // Forward vector matching camera world forward (W direction).
  const fwx =  Math.sin(yaw), fwz =  Math.cos(yaw);
  const sx = camPos.x + fwx * 2.5;
  const sz = camPos.z + fwz * 2.5;
  // Clear stale anchor state so the spawn search runs without a clamp.
  walkMode._anchorY = undefined;
  walkMode._lastDetectedY = undefined;
  walkMode._lastDetectionWasReal = false;
  const sy = _avatarGroundY(sx, sz);
  walkMode.avatar.position.set(sx, sy - walkMode.groundOffset, sz);
  walkMode.avatar.rotation.set(0, yaw, 0);
  walkMode.avatar.visible = true;
  walkMode.velocity.set(0,0,0);
  walkMode.airborne = false;
  walkMode.animTime = 0;
  walkMode.active = true;
  // Anchor the ground search to the spawn Y. From here on, ground detection
  // is clamped to a band around the anchor so the avatar can't creep down
  // through the floor over many frames of slowly-shifting density peaks.
  // _anchorIsFallback is true if the spawn search hit the y=0 grid fallback
  // (no splat density at the spawn x,z); the band stays widened-down (-5 m)
  // until the first real detection comes in, at which point the anchor
  // promotes to that real Y and the band tightens.
  walkMode._anchorY = sy;
  walkMode._anchorIsFallback = !walkMode._lastDetectionWasReal;
  walkMode._lastDetectedY = sy;
  walkMode._missFrames = 0;
  walkMode._smoothTargetY = sy - walkMode.groundOffset;
  // UI: highlight button. CRITICAL: blur the button so subsequent Space
  // presses go to the avatar (jump) instead of re-toggling the button.
  const btn = document.getElementById('btnAvatarWalk');
  if(btn){ btn.classList.add('on'); btn.blur(); }
  _refreshResetBtnLabel();
  showUndoToast(T('walk-on'));
  markDirty(10);
}
function _avatarWalkExit(){
  walkMode.active = false;
  walkMode.airborne = false;
  walkMode.velocity.set(0,0,0);
  if(walkMode.avatar) walkMode.avatar.visible = false;
  if(walkMode.groundDisc) walkMode.groundDisc.visible = false;
  // Reset animated bones so the figure isn't frozen mid-stride next time
  _avatarResetBones();
  const btn = document.getElementById('btnAvatarWalk');
  if(btn){ btn.classList.remove('on'); btn.blur(); }
  _refreshResetBtnLabel();
  showUndoToast(T('walk-off'));
  markDirty(10);
}

