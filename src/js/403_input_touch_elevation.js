// ── Touch elevation pad (▲ / ▼ right of the joystick) ──────────────────
// Pointer events instead of touch events so the same wiring covers Apple
// Pencil + stylus on iPad, plus mouse + touch in Chrome devtools mobile
// emulation. Each button captures its own pointerId so a second finger
// (e.g. simultaneous up + look-around drag) can't steal control.
(()=>{
  const up = document.getElementById('jv-up');
  const dn = document.getElementById('jv-down');
  if(!up || !dn) return;
  const wireBtn = (btn, holdSet, clearSet, ptrIdGet, ptrIdSet) => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch(_){}
      ptrIdSet(e.pointerId);
      holdSet(true);
      btn.classList.add('jv-held');
      // Wake the splat sort window so the motion is smooth from frame 1.
      if(typeof bumpSplatActive === 'function' &&
         typeof layers !== 'undefined' && layers.some(L => L.type === 'splat')){
        bumpSplatActive(2000);
      }
      markDirty(6);
    });
    const release = e => {
      if(e.pointerId !== ptrIdGet()) return;
      try { btn.releasePointerCapture(e.pointerId); } catch(_){}
      ptrIdSet(-1);
      clearSet(false);
      btn.classList.remove('jv-held');
      markDirty(2);
    };
    btn.addEventListener('pointerup',     release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave',  release);
    // Stop the canvas from interpreting the touch as look-around.
    btn.addEventListener('contextmenu', e => e.preventDefault());
  };
  wireBtn(up,
    v => touchUpHeld = v,
    v => touchUpHeld = v,
    () => _jvUpPtrId,
    id => _jvUpPtrId = id);
  wireBtn(dn,
    v => touchDnHeld = v,
    v => touchDnHeld = v,
    () => _jvDnPtrId,
    id => _jvDnPtrId = id);
})();

