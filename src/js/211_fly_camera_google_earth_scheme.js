  // ── Google Earth (desktop) keyboard scheme ─────────────────────────────
  //   Arrows (no modifier) / W A S D : pan position (glide over the scene)
  //   Ctrl + Arrows                  : rotate & tilt in place (yaw / pitch)
  //   Page Up / +(=)                 : zoom in  (dolly along the view)
  //   Page Down / -                  : zoom out
  //   Q / E  &  R / F  (+ touch ▲▼)  : vertical up / down (E,R = up · Q,F = down)
  //   Shift                          : 5× translate / 3× look sprint
  // Holding Ctrl re-routes the arrow keys from pan to rotate, so the same four
  // keys cover both — exactly like Google Earth desktop.
  const ctrlHeld = !!(keys.ControlLeft||keys.ControlRight||keys.MetaLeft||keys.MetaRight);
  const aFw = (keys.ArrowUp?1:0)    - (keys.ArrowDown?1:0);
  const aRt = (keys.ArrowRight?1:0) - (keys.ArrowLeft?1:0);
  const fwKb=(keys.KeyW?1:0)-(keys.KeyS?1:0) + (ctrlHeld?0:aFw);
  const rtKb=(keys.KeyD?1:0)-(keys.KeyA?1:0) + (ctrlHeld?0:aRt);
  const up  =(keys.KeyE?1:0)-(keys.KeyQ?1:0)
            +(keys.KeyR?1:0)-(keys.KeyF?1:0)
            +(touchUpHeld?1:0)-(touchDnHeld?1:0);
  // Zoom = dolly along the true (pitched) view direction.
  const zoomIn = (keys.PageUp?1:0)+(keys.Equal?1:0)+(keys.NumpadAdd?1:0)
               - (keys.PageDown?1:0)-(keys.Minus?1:0)-(keys.NumpadSubtract?1:0);
  if(fwKb!==0)   camPos.addScaledVector(_fwdHoriz, fwKb*kbSpd*dt);
  if(rtKb!==0)   camPos.addScaledVector(_rgtVec,  rtKb*kbSpd*dt);
  if(up!==0)     camPos.y += Math.sign(up)*kbSpd*dt;
  if(zoomIn!==0) camPos.addScaledVector(_fwdVec, Math.sign(zoomIn)*kbSpd*dt);

  // ── Rotate / tilt in place: Ctrl + Arrow keys (Google Earth) ───────────
  // Bumps the same _yawTarget / _pitchTarget the mouse pointer-lock pipeline
  // drives, so motion lerps in identically to a drag look. 0.9 rad/s ≈ 52 °/s
  // is slow enough that a quick tap nudges a few degrees; Shift triples it.
  const yawIn   = ctrlHeld ? ((keys.ArrowLeft?1:0) - (keys.ArrowRight?1:0)) : 0;
  const pitchIn = ctrlHeld ? ((keys.ArrowDown?1:0) - (keys.ArrowUp?1:0))    : 0;
  if(yawIn !== 0 || pitchIn !== 0){
    const baseRate = 0.9;
    const sprint   = (keys.ShiftLeft || keys.ShiftRight) ? 3.0 : 1.0;
    const LOOK_RATE = baseRate * sprint;
    _yawTarget   += yawIn   * LOOK_RATE * dt;
    _pitchTarget  = Math.max(-1.55,
                    Math.min( 1.55,
                      _pitchTarget + pitchIn * LOOK_RATE * dt));
  }

  // Joystick contribution — two-zone speed:
  //   inner 0.5 of the deflection range (|joy| ≤ 0.5)  → analog up to camSpeed
  //                                                       (linear from 0 to camSpeed)
  //   outer range          (|joy| > 0.5)               → camSpeed × 5 (= PC Shift sprint)
  // Direction is taken from the unit-vector of the joystick so movement
  // follows where the user is pointing the knob, decoupled from speed.
  const joyMag = Math.sqrt(joyDX*joyDX + joyDY*joyDY);
  if(joyMag > 1e-3){
    const dirFw = -joyDY / joyMag;
    const dirRt =  joyDX / joyMag;
    const speed = (joyMag <= 0.5) ? (joyMag / 0.5) * camSpeed : (camSpeed * 5);
    // Joystick pans on the HORIZONTAL ground plane only (Google-Earth style):
    // use _fwdHoriz (pitch dropped + normalized), NOT _fwdVec, so tilting the
    // view down/up no longer makes the stick climb or descend. Altitude is
    // changed exclusively by the on-screen ▲▼ pad (touchUpHeld/touchDnHeld →
    // camPos.y, applied in the keyboard block above). Strafe already used the
    // horizontal _rgtVec.
    camPos.addScaledVector(_fwdHoriz, dirFw * speed * dt);
    camPos.addScaledVector(_rgtVec,   dirRt * speed * dt);
  }

  // ── Gamepad contribution (Xbox / PS USB controller, PC only) ────────────
  // Left stick → forward/back/strafe (analog up to gpSpd, sprint with L3).
  // Right stick → yaw / pitch (look around, FPS-style).
  // Right trigger (RT/R2) → up,  Left trigger (LT/L2) → down,
  // all analog so half-press = half-speed. Movement axes respect sprint.
  const gp = _readGamepadInput();
  if(gp){
    const gpSpd = gp.sprint ? (camSpeed * 5) : camSpeed;
    // Left stick: ly is +ve when pushed DOWN, so forward = -ly.
    if(gp.lx !== 0) camPos.addScaledVector(_rgtVec, gp.lx * gpSpd * dt);
    if(gp.ly !== 0) camPos.addScaledVector(_fwdVec, -gp.ly * gpSpd * dt);
    if(gp.rt !== 0) camPos.y += gp.rt * gpSpd * dt;
    if(gp.lt !== 0) camPos.y -= gp.lt * gpSpd * dt;
    // Right stick: yaw/pitch via the same _yawTarget/_pitchTarget the mouse
    // drag uses, so the in-loop lerp + Spark sort-active bump kick in for
    // free. rx +ve = look right → yaw decreases (matches mouse-drag sign);
    // ry +ve (stick down) = look down → pitch decreases. Pitch clamped to
    // ±~89° so the camera can't flip.
    if(gp.rx !== 0 || gp.ry !== 0){
      _yawTarget   -= gp.rx * _GP_LOOK_SPEED * dt;
      _pitchTarget  = Math.max(-1.55, Math.min(1.55, _pitchTarget - gp.ry * _GP_LOOK_SPEED * dt));
    }
    markDirty(2);
    if(layers.some(L=>L.type==='splat')) bumpSplatActive(800);
  }
}

// ══════════════════════════════════════════════════
//  AVATAR WALK MODE
//   - Spawns a simple humanoid capsule the user can walk around the scene with.
//   - WASD moves the avatar relative to camera yaw; gravity holds it to ground.
//   - Ground = max-Y of (downward raycast hits on cube/sphere/obj/figure mesh
//     layers, splat point caches, and the world grid Y=0).
//   - Camera is placed third-person, behind+above the avatar; mouse-look orbits.
// ══════════════════════════════════════════════════
const walkMode = {
  active:false,
  avatar:null,           // THREE.Group (figure root)
  bones:null,            // bone map for animation (legs/arms)
  groundDisc:null,       // visual ring placed at the detected ground Y
  velocity:new THREE.Vector3(),
  speed:2.8,             // walk speed m/s
  runMul:2.2,            // shift = run
  height:1.7,            // total avatar height in metres
  bodyRadius:0.22,
  groundY:0,
  groundOffset:0,        // bbox.min.y of avatar relative to its origin (negative if origin above feet)
  airborne:false,
  jumpVel:5.0,           // m/s upward impulse → ~1.3m peak
  cameraDist:3.2,        // metres behind
  cameraHeight:2.55,     // metres above feet (+1 m vs the original 1.55 so
                         //   the camera looks slightly down-forward over the
                         //   avatar's head — better view of approach path)
  animTime:0,
  // AnimationMixer-driven clip playback (populated when a rigged GLB with
  // baked animations is loaded — e.g. jtoastie_walk.glb's "WalkLoop").
  // When `mixer` is non-null, _avatarUpdateAnimation() drives the mixer
  // instead of the bone-by-bone sine-wave fallback used for the procedural
  // mannequin.
  mixer:null,            // THREE.AnimationMixer
  walkAction:null,       // primary locomotion action (walk / run)
  animSource:'none',     // 'mixer' | 'procedural' | 'none'
};
const _wmRay = new THREE.Raycaster();
const _wmDown = new THREE.Vector3(0,-1,0);
const _wmTmpV = new THREE.Vector3();

