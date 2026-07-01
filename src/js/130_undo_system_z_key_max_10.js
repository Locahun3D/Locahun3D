// ══════════════════════════════════════════════════
//  UNDO SYSTEM (Z key, max 10)
// ══════════════════════════════════════════════════
const MAX_UNDO = 20;
function pushUndo() {
  msr.undoStack.push({
    step:msr.step,
    ptA:msr.ptA.clone(), ptB:msr.ptB.clone(), ptC:msr.ptC.clone(),
    heightOn:msr.heightOn,
    markerCVisible: !!(msr.markerC && msr.markerC.visible),
  });
  if (msr.undoStack.length > MAX_UNDO) msr.undoStack.shift();
  updateUndoInfo();
}
function updateUndoInfo() {
  const n = msr.undoStack.length;
  // #undoInfo ("Z: 戻る — n/20") was removed per user request; guard the lookup.
  const _ui = document.getElementById('undoInfo');
  if(_ui) _ui.textContent = `${T('undo-info')} ${n}/${MAX_UNDO}`;
  const _bu = document.getElementById('btnUndo');
  if(_bu) _bu.style.color = n > 0 ? '#ffdd0099' : '#443300';
}
let _undoToastTimer = null;
function showUndoToast(msg) {
  const el = document.getElementById('undo-toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(_undoToastTimer);
  _undoToastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}
window.undoMeasure = function() {
  if (!msr.active || !msr.undoStack.length) {
    if (msr.active) showUndoToast(T('undo-max'));
    return;
  }
  const s = msr.undoStack.pop();
  msr.step = s.step;
  msr.ptA.copy(s.ptA); msr.ptB.copy(s.ptB);
  if(s.ptC) msr.ptC.copy(s.ptC);
  msr.markerA.position.copy(msr.ptA);
  msr.markerB.position.copy(msr.ptB);
  msr.markerA.visible = s.step >= 1;
  msr.markerB.visible = s.step >= 2;
  msr.line.visible    = s.step >= 2;
  // Restore height-mode (Point C) state
  msr.heightOn = !!s.heightOn;
  _applyHeightUI(msr.heightOn);
  if(msr.markerC){
    msr.markerC.visible = !!s.markerCVisible;
    msr.markerC.position.copy(msr.ptC);
  }
  if(msr.lineAC) msr.lineAC.visible = msr.heightOn && msr.step >= 1;
  if (s.step < 2){
    document.getElementById('distComp').style.display = 'none';
    // Clear the stale 距離 readout when we drop below 2 points (it used to keep
    // showing the old value after an undo).
    const _md = document.getElementById('measDist'); if(_md) _md.textContent = '-';
  }
  syncGizmoToMsr();
  // 点B段階(step 1)のヒント(msr-h1)は全端末で非表示（user request 2026-06-19）。
  const hintMap = [T('msr-h0'), T('msr-h1'), T('msr-h2')];
  { const _mh=document.getElementById('msr-hint');
    if(_mh){
      if(s.step === 1){ _mh.style.display='none'; }
      else { _mh.style.display='block'; _mh.textContent = hintMap[s.step]; }
    } }
  updateUndoInfo();
  showUndoToast(T('undo-done-tpl').replace('{n}', msr.undoStack.length));
};

