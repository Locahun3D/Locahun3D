// ── JS-authored walk-cycle AnimationClip (world-axis edition) ───────────
// Previous Euler-based version assumed Mixamo bone local axes align with
// world axes — they don't, so X rotation didn't produce front-back swing.
// This version specifies each keyframe pose as rotations around WORLD
// axes (X = side-to-side, Y = vertical, Z = forward-back), then projects
// each rotation into the bone's parent-local frame so the resulting
// quaternion track produces the intended motion regardless of how Mixamo
// twisted the bone's bind orientation.
//
// Math, for each bone at each keyframe:
//   We want the bone's WORLD rotation to be: parent_world × rest × ??
//   such that, relative to bind pose, the bone has rotated by some
//   world-frame R = quat(world_axis, angle).
//
//   bone_world_q (bind) = parent_world × rest
//   bone_world_q (target) = R × bone_world_q (bind) = R × parent_world × rest
//   bone_local_q (target) = parent_world⁻¹ × R × parent_world × rest
//                         = (parent_world⁻¹ × R × parent_world) × rest
//                         = R_in_parent_frame × rest
//   where R_in_parent_frame = quat(parent_world⁻¹ · world_axis, angle)
//
// So we pre-multiply rest by R_in_parent_frame. This is what the
// implementation does.
//
// Stride phases (1-sec cycle, lerp interpolates the rest):
//   t=0.00  L-leg max FORWARD, R-leg max BACK   (R-arm forward, L-arm back)
//   t=0.50  R-leg max FORWARD, L-leg max BACK   (L-arm forward, R-arm back)
//   t=1.00  loop back to t=0.00
function _makeWalkClip(bones, opts){
  opts = opts || {};
  const name     = opts.name     || 'walkAuthored';
  const cycleSec = opts.cycleSec || 1.0;
  const amp      = opts.amp      || 1.0;
  const tD = Math.PI / 180;

  // Per-bone keyframe rotations expressed as a LIST of [world_axis, deg]
  // pairs. Multiple entries on the same keyframe compose left-to-right
  // (first listed = applied LAST in world, so think "post-rotations" in
  // the order of intuitive layering).
  //
  // World frame convention (Mixamo + Three default):
  //   +X right (red),  +Y up (green),  +Z back (blue) — so −Z is the
  //   direction the avatar faces in T-pose. Walking forward = rotating
  //   the foot bone tip from world (0,0,0) toward −Z.
  //
  // A leg "swung forward" means: hip rotates the leg about world +X axis
  // by a positive angle (right-hand rule: +X thumb, fingers curl
  // +Y→+Z → forward swing pushes the foot's −Z component negative). ✓
  //
  // Arms hanging down: the bone tip needs to point from "world ±X (T-pose
  // side)" toward "world −Y (down)". For LeftArm (T-pose toward +X), that
  // is a rotation about world +Z (forward axis) by +90°. For RightArm
  // (toward −X), it is about world +Z by −90° (i.e. world −Z by +90°).
  // Then the swing is around world +X just like legs.
  //
  // We DELIBERATELY don't try to fold the drop into the same rotation
  // (that's where the previous Euler hack broke) — each keyframe gets
  // BOTH the drop and the swing as separate world-axis rotations.

  // Walk cycle — 9 keyframes, ROTATIONS ONLY, each keyframe specified as
  // a bone-LOCAL Euler triple [x_deg, y_deg, z_deg]. The keyframe quat is
  // computed as rest_q × delta_q (delta in bone's bind-local frame) —
  // identical to the path the procedural setBone() code uses, which was
  // visually verified to produce correct walking on the Mixamo skeleton.
  // Hip bob emerges automatically from supporting-leg knee bend (no
  // position tracks — bone-position animation is forbidden on skeletons).
  const SWING_LEG  = 32;   // ± deg, upper-leg X-axis swing
  const ARM_DROP   = 75;   // deg, base arm drop from T-pose horizontal
  const ARM_OUT    = -12;  // ± deg, arm Z-rotation = slight inward/outward at shoulder
  const FOOT_HEEL  =  16;
  const FOOT_PUSH  = -25;

  // 9-keyframe cycle. Each pose entry is a bone-LOCAL Euler triple
  // [x_deg, y_deg, z_deg] applied as rest_q × eulerQuat. This matches the
  // procedural setBone() path exactly — values are copied straight from
  // the visually-verified procedural sine-wave logic.
  //
  //   t=0    CONTACT-A   t=4/8  CONTACT-B (mirror)
  //   t=1/8  DOWN-A      t=5/8  DOWN-B
  //   t=2/8  PASSING-A   t=6/8  PASSING-B
  //   t=3/8  UP-A        t=7/8  UP-B
  //   t=8/8  loop = t=0
  const SL = SWING_LEG;
  const poses = {
    // ── UPPER LEGS ── X = forward/back swing
    // procedural: setBone('upperLegL',  30*sin(2πt), 0, 0)
    upperLegL: [
      [+SL,0,0], [+22,0,0], [  0,0,0], [-12,0,0],
      [-SL,0,0], [-20,0,0], [  0,0,0], [+20,0,0],
      [+SL,0,0],
    ],
    upperLegR: [
      [-SL,0,0], [-20,0,0], [  0,0,0], [+20,0,0],
      [+SL,0,0], [+22,0,0], [  0,0,0], [-12,0,0],
      [-SL,0,0],
    ],
    // ── KNEES ── X = bend. Support-side bent at DOWN (drops hip);
    //                       swing-side bent for foot clearance.
    lowerLegL: [
      [ 0,0,0], [+22,0,0], [ 0,0,0], [ 0,0,0],
      [+40,0,0],[+52,0,0], [+30,0,0],[+8,0,0],
      [ 0,0,0],
    ],
    lowerLegR: [
      [+40,0,0],[+52,0,0], [+30,0,0],[+8,0,0],
      [ 0,0,0], [+22,0,0], [ 0,0,0], [ 0,0,0],
      [+40,0,0],
    ],
    // ── UPPER ARMS ── X = drop + swing combined (procedural verified);
    //                   Z = slight inward tilt to keep arms close to body.
    // procedural: setBone('upperArmL', 75 − 25*sin, 0, -12);
    //             setBone('upperArmR', 75 + 25*sin, 0, +12);
    // Sine schedule (L counter to L-leg): sw = sin(2π·t).
    //  t=0    sw=0      → 75              t=4/8 sw=0      → 75
    //  t=1/8  sw≈+0.71  → 75−18 = 57      t=5/8 sw≈-0.71  → 93
    //  t=2/8  sw=+1     → 50              t=6/8 sw=-1     → 100
    //  t=3/8  sw≈+0.71  → 57              t=7/8 sw≈-0.71  → 93
    upperArmL: [
      [75, 0, ARM_OUT], [55, 0, ARM_OUT], [50, 0, ARM_OUT], [55, 0, ARM_OUT],
      [75, 0, ARM_OUT], [95, 0, ARM_OUT], [100,0, ARM_OUT], [95, 0, ARM_OUT],
      [75, 0, ARM_OUT],
    ],
    upperArmR: [
      [75, 0, -ARM_OUT], [95, 0, -ARM_OUT], [100,0,-ARM_OUT], [95, 0,-ARM_OUT],
      [75, 0, -ARM_OUT], [55, 0, -ARM_OUT], [50, 0, -ARM_OUT], [55, 0,-ARM_OUT],
      [75, 0, -ARM_OUT],
    ],
    // ── FORE-ARMS ── small constant elbow bend
    lowerArmL: Array(9).fill(0).map(()=>[12, 0, 0]),
    lowerArmR: Array(9).fill(0).map(()=>[12, 0, 0]),
    // ── HEAD ── small constant forward tilt
    head:      Array(9).fill(0).map(()=>[ 5, 0, 0]),
  };

  const times5 = [0, 1/8, 2/8, 3/8, 4/8, 5/8, 6/8, 7/8, 1].map(t => t * cycleSec);
  const tracks = [];

  // Reusable temporaries
  const axisV    = new THREE.Vector3();
  const parentWQ = new THREE.Quaternion();
  const parentWQI = new THREE.Quaternion();
  const opQ     = new THREE.Quaternion();
  const accumQ  = new THREE.Quaternion();
  const finalQ  = new THREE.Quaternion();
  const tmpEu   = new THREE.Euler();
  const tmpQ    = new THREE.Quaternion();

  // ── Rotation tracks (bone-LOCAL Euler XYZ × rest) ──────────────────────
  // Each keyframe pose is [x_deg, y_deg, z_deg]. The bone's final local
  // quaternion = rest_q × delta_q (delta from the Euler). This is the
  // same convention the procedural setBone() code uses, which was
  // visually verified on Mixamo bones.
  for(const [logical, eulers] of Object.entries(poses)){
    const bone = bones[logical];
    if(!bone || !bone.userData._restQ) continue;
    const values = new Float32Array(eulers.length * 4);
    for(let i = 0; i < eulers.length; i++){
      const [dx, dy, dz] = eulers[i];
      tmpEu.set(dx * tD * amp, dy * tD * amp, dz * tD * amp, 'XYZ');
      tmpQ.setFromEuler(tmpEu);
      // bone_local = rest × delta  (delta in bind-local frame)
      finalQ.copy(bone.userData._restQ).multiply(tmpQ);
      values[i*4+0] = finalQ.x;
      values[i*4+1] = finalQ.y;
      values[i*4+2] = finalQ.z;
      values[i*4+3] = finalQ.w;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(
      bone.name + '.quaternion', times5.slice(), values));
  }

  // ── Foot rotation tracks (bone-LOCAL Euler X) ───────────────────────────
  // 9-keyframe ankle-hinge timing matched to the limb cycle.
  // Local Euler (rest × delta) so the foot follows the parent leg's rotation.
  const footPoses = {
    // L-foot:  CONTACT-A heel (+) → flat → ... → push off (−) at CONTACT-B
    footL: [
      FOOT_HEEL,   // 0   CONTACT-A: L heel strike (toes up)
       8,          // 1/8 DOWN-A: rolling to flat
       0,          // 2/8 PASSING-A: flat
     -10,          // 3/8 UP-A: heel raising, toes pressing
      FOOT_PUSH,   // 4/8 CONTACT-B: push-off complete (toes down)
      -8,          // 5/8 DOWN-B: lifted, foot returning to neutral
       0,          // 6/8 PASSING-B: mid-swing flat
      10,          // 7/8 UP-B: ankle dorsi-flex (toes up for landing)
      FOOT_HEEL,   // loop
    ],
    // R-foot is the half-cycle mirror
    footR: [
      FOOT_PUSH,
      -8,
       0,
      10,
      FOOT_HEEL,
       8,
       0,
     -10,
      FOOT_PUSH,
    ],
  };
  for(const [logical, degs] of Object.entries(footPoses)){
    const bone = bones[logical];
    if(!bone || !bone.userData._restQ) continue;
    const values = new Float32Array(degs.length * 4);
    for(let i = 0; i < degs.length; i++){
      tmpEu.set(degs[i] * tD * amp, 0, 0, 'XYZ');
      tmpQ.setFromEuler(tmpEu);
      // bone_local = rest × delta  (delta in bone's bind-local frame)
      finalQ.copy(bone.userData._restQ).multiply(tmpQ);
      values[i*4+0] = finalQ.x;
      values[i*4+1] = finalQ.y;
      values[i*4+2] = finalQ.z;
      values[i*4+3] = finalQ.w;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(
      bone.name + '.quaternion', times5.slice(), values));
  }

  // (No position tracks — hip bob comes from supporting-leg knee bend.)
  return new THREE.AnimationClip(name, cycleSec, tracks);
}

// Build the walk-mode avatar by reusing the existing figure system.
// Tries the Mixamo GLB first (matches the look of regular Figures); falls
// back to the procedural mannequin if Mixamo isn't available.
async function _avatarBuild(){
  const g = new THREE.Group();
  g.userData.__avatar = true;
  let fig;
  let usedMixamo = false;
  try{
    fig = await _buildMixamoFigure(walkMode.height * 100, {skinColor:'#dcd8d2'});
    usedMixamo = true;
  } catch(_e){
    fig = _addProceduralFigureToScene(walkMode.height * 100);
  }
  // The figure builder returns its own root group with internal scaling;
  // parent it under the avatar group so we can position/rotate cleanly.
  g.add(fig.root);
  // Cache bones for procedural walk animation. Mixamo bones already have
  // _restQ recorded; the procedural mannequin needs us to capture them now.
  walkMode.bones = fig.bones || null;
  if(walkMode.bones){
    for(const b of Object.values(walkMode.bones)){
      if(b && !b.userData._restQ){
        b.userData._restQ = b.quaternion.clone();
      }
    }
  }
  // ── Set up AnimationMixer with a JS-AUTHORED walk clip ──
  // We deliberately do NOT use any baked clip in the GLB. The Mixamo
  // "WalkLoop" exported from the source rig looked off (rest pose mismatch,
  // overly subtle motion). Instead we author the clip in JS from the bone
  // map's rest quaternions: 4 keyframes per stride, Mixamo-standard pose
  // values that match the procedural fallback (which was visually verified
  // on the mannequin). This makes the animation:
  //   (a) editable in code without re-exporting from Blender
  //   (b) guaranteed to bind correctly (we use each bone's ACTUAL .name)
  //   (c) consistent across procedural and Mixamo figures
  walkMode.mixer = null;
  walkMode.walkAction = null;
  walkMode.animSource = walkMode.bones ? 'procedural' : 'none';
  if(walkMode.bones){
    try{
      const clip = _makeWalkClip(walkMode.bones, {cycleSec: 1.0, amp: 1.0});
      if(clip && clip.tracks.length){
        walkMode.mixer = new THREE.AnimationMixer(fig.root);
        walkMode.walkAction = walkMode.mixer.clipAction(clip);
        walkMode.walkAction.setLoop(THREE.LoopRepeat, Infinity);
        walkMode.walkAction.clampWhenFinished = false;
        walkMode.walkAction.enabled = true;
        walkMode.walkAction.setEffectiveWeight(0);
        walkMode.walkAction.play();
        walkMode.animSource = 'mixer';
        console.info('[avatar] AnimationMixer ready — clip="' + clip.name +
                     '" duration=' + clip.duration.toFixed(2) + 's tracks=' + clip.tracks.length);
      }
    } catch(e){ console.warn('[avatar] _makeWalkClip failed', e); }
  }
  // The walk avatar is NEVER selectable as a layer, so its skeleton helper
  // and any bone markers should stay hidden permanently.
  g.traverse(o=>{
    if(!o.userData) return;
    if(o.userData.isSkeletonHelper) o.visible = false;
    if(o.userData.isBoneMarker)     o.visible = false;
  });
  if(fig.figureMarkers) for(const mk of fig.figureMarkers) mk.visible = false;
  return g;
}

// Capture the avatar's vertical extent so updateAvatarWalk can place the
// FEET (lowest point of the bbox) on the detected groundY rather than the
// avatar group's origin. Excludes SkeletonHelper / bone markers / IK handles
// because those objects often have unreliable bounding boxes that extend
// well below or above the actual rendered figure (causing 1m+ floating).
function _avatarMeasureGroundOffset(av){
  try{
    av.updateMatrixWorld(true);
    const bbox = new THREE.Box3();
    const tmp  = new THREE.Box3();
    let counted = 0;
    av.traverse(o=>{
      if(!o.visible) return;
      if(o.userData){
        if(o.userData.isSkeletonHelper) return;
        if(o.userData.isBoneMarker)     return;
        if(o.userData.isIKHandle)       return;
        if(o.userData.isIKHandleCenter) return;
        if(o.userData.isIKAxisHandle)   return;
      }
      // Only solid rendered meshes contribute to ground placement
      if(!(o.isMesh || o.isSkinnedMesh)) return;
      const g = o.geometry;
      if(!g) return;
      if(!g.boundingBox) g.computeBoundingBox && g.computeBoundingBox();
      if(!g.boundingBox) return;
      tmp.copy(g.boundingBox);
      tmp.applyMatrix4(o.matrixWorld);
      bbox.union(tmp);
      counted++;
    });
    if(counted > 0 && isFinite(bbox.min.y)){
      walkMode.groundOffset = bbox.min.y - av.position.y;
    } else {
      walkMode.groundOffset = 0;
    }
  } catch(_e){ walkMode.groundOffset = 0; }
}

// Reset all bones to their rest quaternion (used when walking ends so the
// figure doesn't freeze mid-stride if the user re-enables walk mode later).
function _avatarResetBones(){
  if(!walkMode.bones) return;
  for(const b of Object.values(walkMode.bones)){
    if(b && b.userData._restQ){
      b.quaternion.copy(b.userData._restQ);
    }
  }
}

// Walk-loop animation, modeled on the FIGURE_POSES.walk preset.
//   • A persistent BASE posture brings the arms down to the sides so the
//     character isn't stuck in a T-pose between strides.
//   • An oscillating SWING component animates legs + arm counter-swing.
// Run mode increases both frequency and amplitude.
function _avatarUpdateAnimation(dt, walking, runMul){
  // Diagnostic counter — increments every call so we can verify the mixer
  // update path is actually being hit each frame.
  window.__avatarAnimCallCount = (window.__avatarAnimCallCount || 0) + 1;
  window.__avatarAnimLastWalking = walking;
  window.__avatarAnimLastRunMul = runMul;
  window.__avatarAnimLastDt = dt;
  // ── Mixer-driven path (GLB has baked WalkLoop clip) ─────────────────────
  // Crossfade weight 0↔1 by walking state and scale playback rate by run.
  // Mixer is the single source of truth for bone rotations when this path
  // is active; the procedural setBone fallback below is skipped.
  if(walkMode.mixer && walkMode.walkAction){
    const a = walkMode.walkAction;
    // Target weight: 1.0 when walking/running, 0 when idle. Smoothly approach
    // so stopping doesn't snap the figure to its bind pose mid-stride.
    const targetW = walking ? 1.0 : 0.0;
    const cur = a.getEffectiveWeight();
    const k = Math.min(1, dt * 8);   // ~125 ms time constant
    a.setEffectiveWeight(cur + (targetW - cur) * k);
    // Tie animation playback rate to actual locomotion speed. The base clip
    // is designed for "WalkLoop" speed; running uses runMul ≈ 2.2 so the
    // clip speeds up proportionally. Mild dead-zone on idle so the clip
    // doesn't run backwards or stall awkwardly when weight is 0.
    const rate = walking ? (runMul > 1 ? Math.min(2.0, runMul * 0.85) : 1.0) : 0.0;
    a.setEffectiveTimeScale(Math.max(rate, walking ? 0.2 : 0));
    walkMode.mixer.update(dt);
    return;
  }
  // ── Procedural sine-wave path (only used when no AnimationMixer) ────────
  if(!walkMode.bones) return;
  const b = walkMode.bones;
  const rad = Math.PI/180;
  function setBone(name, x, y, z){
    const bo = b[name]; if(!bo || !bo.userData._restQ) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (x||0)*rad, (y||0)*rad, (z||0)*rad, 'XYZ'
    ));
    bo.quaternion.copy(bo.userData._restQ).multiply(q);
  }
  if(!walking){
    // Smoothly damp every animated bone toward its rest quaternion.
    // DON'T reset animTime — the avatar can be briefly airborne for a single
    // frame when stepping over an uneven splat surface; resetting the cycle
    // phase to 0 every time made the limbs snap back to "starting position",
    // producing the user-reported "spasm / convulsion when stumbling" look.
    // Keeping animTime untouched lets the cycle resume from where it paused.
    for(const k of ['head','upperArmL','upperArmR','lowerArmL','lowerArmR',
                    'upperLegL','upperLegR','lowerLegL','lowerLegR','footL','footR']){
      const bo = b[k]; if(!bo || !bo.userData._restQ) continue;
      bo.quaternion.slerp(bo.userData._restQ, Math.min(1, dt*8));
    }
    return;
  }
  const cycleHz = 1.0 * (runMul > 1 ? 1.7 : 1);
  walkMode.animTime += dt * cycleHz;
  const sw = Math.sin(walkMode.animTime * 2 * Math.PI);
  const a  = (runMul > 1 ? 1.3 : 1.0);

  // ── Base posture (always, while walking) — relaxed arms at side ──
  // Slight forward head tilt
  setBone('head', 5, 0, 0);
  // Arms: shoulder rotated ~75° forward+down so they hang near the body,
  // with a small inward Z so they don't intersect the torso.
  // Then add the OPPOSING swing on top of the base.
  setBone('upperArmL', 75 - 25*sw*a, 0, -12);
  setBone('upperArmR', 75 + 25*sw*a, 0,  12);
  // Slight elbow bend
  setBone('lowerArmL', 12, 0, 0);
  setBone('lowerArmR', 12, 0, 0);

  // ── Stride: legs swing forward/back in opposite phases ──
  setBone('upperLegL',  30*sw*a, 0, 0);
  setBone('upperLegR', -30*sw*a, 0, 0);
  // Knees bend during the back-swing of each leg
  setBone('lowerLegL', Math.max(0, -sw) * 35 * a, 0, 0);
  setBone('lowerLegR', Math.max(0,  sw) * 35 * a, 0, 0);
  // Feet stay slightly toed-down
  setBone('footL', -5, 0, 0);
  setBone('footR', -5, 0, 0);
}

