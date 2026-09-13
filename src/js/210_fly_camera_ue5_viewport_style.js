// ══════════════════════════════════════════════════
//  FLY CAMERA  (UE5 viewport style)
// ══════════════════════════════════════════════════
// ── Gamepad (Xbox / PlayStation USB) ──────────────────────────────────────
// Reads the active gamepad each frame in updateFlyCamera. Standard mapping
// (works for both Xbox Series / DualSense / generic XInput USB controllers):
//   axes[0]  = left stick X  (-1 left  / +1 right)  →  strafe
//   axes[1]  = left stick Y  (-1 up    / +1 down)   →  forward/back
//   axes[2]  = right stick X (-1 left  / +1 right)  →  yaw (look around)
//   axes[3]  = right stick Y (-1 up    / +1 down)   →  pitch (look up/down)
//   buttons[6].value = LT / L2  (analog 0..1)  →  down
//   buttons[7].value = RT / R2  (analog 0..1)  →  up
//   buttons[10].pressed = L3 (left-stick click)  →  sprint (5× speed)
// Dead zone of 0.15 silences resting-stick drift.
const _GP_DEADZONE = 0.15;
// Right-stick look sensitivity (radians per second at full deflection).
// 2.0 rad/s ≈ 115°/s — comfortable for FPS-style turning, matches typical
// console game defaults. User can tune if needed.
const _GP_LOOK_SPEED = 2.0;
// Edge-detect state for the south face button (jump). Module-level so it
// persists across _readGamepadInput() calls. Declared before the function
// so the let-binding is initialised by the time anyone reads it.
const _prevGpA = new Map();
// Toast a friendly notice when a controller is plugged in / unplugged so
// the user knows it was detected (handy for testing on PC). Only first
// connect needs feedback; further plug events are quietly logged.
window.addEventListener('gamepadconnected', e => {
  // Flip the global flag so the animate-loop gamepad poll starts running.
  // Once seen, stays true for the session (cheap one-shot — the per-frame
  // check is `if(window._gpEverConnected)` which is constant-time).
  window._gpEverConnected = true;
  try {
    const id = (e.gamepad && e.gamepad.id) || 'Gamepad';
    if(typeof showUndoToast === 'function') showUndoToast('🎮 ' + id.substring(0, 40) + ' 接続');
    console.info('[gamepad] connected:', id, 'index', e.gamepad.index);
  } catch(_){}
});
window.addEventListener('gamepaddisconnected', e => {
  try {
    console.info('[gamepad] disconnected:', e.gamepad && e.gamepad.id);
  } catch(_){}
});
function _readGamepadInput(){
  if(typeof navigator.getGamepads !== 'function'){_prevGpA.clear();return null;}
  const pads = navigator.getGamepads();
  if(!pads){_prevGpA.clear();return null;}
  let input=null;
  const connected=new Set();
  for(let i=0; i<pads.length; i++){
    const p = pads[i];
    if(!p || !p.connected) continue;
    connected.add(i);
    const ax = p.axes || [];
    const lx = Math.abs(ax[0]||0) > _GP_DEADZONE ? ax[0] : 0;
    const ly = Math.abs(ax[1]||0) > _GP_DEADZONE ? ax[1] : 0;
    const rx = Math.abs(ax[2]||0) > _GP_DEADZONE ? ax[2] : 0;
    const ry = Math.abs(ax[3]||0) > _GP_DEADZONE ? ax[3] : 0;
    const lt = (p.buttons[6] && p.buttons[6].value) || 0;
    const rt = (p.buttons[7] && p.buttons[7].value) || 0;
    const ltD = lt > _GP_DEADZONE ? lt : 0;
    const rtD = rt > _GP_DEADZONE ? rt : 0;
    const sprint = !!(p.buttons[10] && p.buttons[10].pressed);
    // South face button (A on Xbox / cross on PlayStation) → jump.
    // Edge-detect so a single press triggers exactly one jump even though
    // _readGamepadInput() is called every frame.
    const aHeld = !!(p.buttons[0] && p.buttons[0].pressed);
    const aJustPressed = aHeld && !_prevGpA.get(i);
    _prevGpA.set(i,aHeld);
    // Held buttons remain visible to the post-walk release gate. Poll every
    // connected pad so switching the active pad cannot invent a new press.
    if(lx===0 && ly===0 && rx===0 && ry===0 && ltD===0 && rtD===0 && !aHeld && !sprint) continue;
    if(!input)input={ lx, ly, rx, ry, lt:ltD, rt:rtD, sprint, aJustPressed, aHeld };
  }
  for(const index of _prevGpA.keys())if(!connected.has(index))_prevGpA.delete(index);
  return input;
}

function updateFlyCamera(dt){
  // When avatar-walk mode is active, redirect WASD to the avatar instead of
  // flying the camera. The camera is then placed behind the avatar at a fixed
  // offset, and orbits with the existing yaw/pitch (mouse-look unchanged).
  if(walkMode.active && walkMode.avatar){ _updateCollisionAvatarWalk(dt); return; }
  const kbSpd=(keys.ShiftLeft||keys.ShiftRight)?camSpeed*5:camSpeed;
  camera.getWorldDirection(_fwdVec);
  _rgtVec.set(-Math.cos(yaw),0,Math.sin(yaw));
  // Ground-plane heading for "pan": drop the pitch so arrow/WASD movement
  // glides horizontally over the scene the way Google Earth's arrow keys do.
  _fwdHoriz.set(_fwdVec.x, 0, _fwdVec.z);
  if(_fwdHoriz.lengthSq() > 1e-6) _fwdHoriz.normalize();
  else _fwdHoriz.set(Math.sin(yaw), 0, Math.cos(yaw)); // looking straight up/down
