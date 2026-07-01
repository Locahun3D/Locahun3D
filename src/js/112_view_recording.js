// ══════════════════════════════════════════════════
//  VIEW RECORDING (MediaRecorder → MP4 / WebM)
//
//  Captures the live GL canvas into an MP4 (when the browser supports
//  H.264 in MediaRecorder — Chrome/Edge on desktop, Safari) or a WebM
//  fallback (Firefox, older Chrome). The output filename keeps the
//  scene-time stamp + the project name so multi-take exports don't
//  collide.
//
//  UI hook: two buttons (#btnViewRec on desktop/tablet, #btnViewRecPhone
//  on phones) both call toggleViewRecording(). A red pulsing badge with
//  the elapsed timer renders bottom-center while recording.
// ══════════════════════════════════════════════════
let _viewRec = {
  active: false,
  recorder: null,
  chunks: [],
  startedAt: 0,
  timerEl: null,
  intervalId: 0,
  mime: '',
  ext: 'webm',
};

// While true, the per-frame editing chrome that shouldn't appear in a
// recording (3-D pivot gizmo, saved-camera marker cones, cam-anim path
// markers) is force-hidden. Set by _setCaptureUIHidden() around any
// MediaRecorder capture so the exported video is clean.
let _captureHideUI = false;

// Hide / restore the in-viewport editing aids during a recording. Camera
// markers + cam-anim visuals + the pivot gizmo are editing chrome, not
// part of the final shot, so the user asked for them to disappear while
// recording. The pivot gizmo's per-frame updateLayerPivot() is gated on
// _captureHideUI so it won't re-show itself mid-capture.
function _setCaptureUIHidden(hide){
  _captureHideUI = !!hide;
  // 3-D pivot gizmo group.
  if(typeof lpv !== 'undefined' && lpv && lpv.group){
    if(hide) lpv.group.visible = false;
  }
  // Pivot gizmo DOM panel (#gizmo).
  const _g = document.getElementById('gizmo');
  if(_g){
    if(hide){
      if(_g.dataset._capPrev === undefined) _g.dataset._capPrev = _g.style.display || '';
      _g.style.display = 'none';
    } else if(_g.dataset._capPrev !== undefined){
      _g.style.display = _g.dataset._capPrev;
      delete _g.dataset._capPrev;
    }
  }
  // Saved-camera marker cones (type==='camera' layer meshes).
  if(typeof layers !== 'undefined' && Array.isArray(layers)){
    for(const L of layers){
      if(L && L.type === 'camera' && L.mesh){
        if(hide){
          if(L.mesh.userData._capPrevVis === undefined){
            L.mesh.userData._capPrevVis = L.mesh.visible;
          }
          L.mesh.visible = false;
        } else if(L.mesh.userData._capPrevVis !== undefined){
          L.mesh.visible = L.mesh.userData._capPrevVis;
          delete L.mesh.userData._capPrevVis;
        }
      }
    }
  }
  // Camera-animation path + key markers.
  if(typeof _camAnimSetVisualsVisible === 'function'){
    if(hide) _camAnimSetVisualsVisible(false);
    else if(typeof camAnim !== 'undefined' && camAnim.open) _camAnimSetVisualsVisible(true);
  }
  // 日照モードの3D可視化(方位コンパス + 一日の太陽軌道)。previz補助なので
  // キャプチャ(撮影/録画)には写り込ませない。空ドーム/太陽ディスク(実ライティング)
  // は env.mesh 側なので影響しない。
  if(typeof sunViz !== 'undefined' && sunViz.group){
    if(hide){
      if(sunViz.group.userData._capPrevVis === undefined) sunViz.group.userData._capPrevVis = sunViz.group.visible;
      sunViz.group.visible = false;
    } else if(sunViz.group.userData._capPrevVis !== undefined){
      sunViz.group.visible = sunViz.group.userData._capPrevVis;
      delete sunViz.group.userData._capPrevVis;
    }
  }
  // 区画パス・イベントアイコン — チェックON時のみ非表示にする
  const _hideOverlays = !!(document.getElementById('cm-hide-overlays') ||{}).checked
                     || !!(document.getElementById('ca-hide-overlays') ||{}).checked;
  if(_hideOverlays && typeof layers !== 'undefined' && Array.isArray(layers)){
    for(const L of layers){
      if(!L || !L.mesh) continue;
      if(L.type === 'path' || L.type === 'event'){
        if(hide){
          if(L.mesh.userData._capPrevVis === undefined) L.mesh.userData._capPrevVis = L.mesh.visible;
          L.mesh.visible = false;
          if(L.labelMesh){
            if(L.labelMesh.userData._capPrevVis === undefined) L.labelMesh.userData._capPrevVis = L.labelMesh.visible;
            L.labelMesh.visible = false;
          }
          if(L.eventGuide){
            if(L.eventGuide.userData._capPrevVis === undefined) L.eventGuide.userData._capPrevVis = L.eventGuide.visible;
            L.eventGuide.visible = false;
          }
        } else {
          if(L.mesh.userData._capPrevVis !== undefined){ L.mesh.visible = L.mesh.userData._capPrevVis; delete L.mesh.userData._capPrevVis; }
          if(L.labelMesh && L.labelMesh.userData._capPrevVis !== undefined){ L.labelMesh.visible = L.labelMesh.userData._capPrevVis; delete L.labelMesh.userData._capPrevVis; }
          if(L.eventGuide && L.eventGuide.userData._capPrevVis !== undefined){ L.eventGuide.visible = L.eventGuide.userData._capPrevVis; delete L.eventGuide.userData._capPrevVis; }
        }
      }
    }
  }
  if(typeof markDirty === 'function') markDirty(8);
}

function _pickRecorderMime(){
  const candidates = [
    // Prefer MP4 when supported — broadest device playback compat.
    'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01F',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for(const m of candidates){
    try {
      if(window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    } catch(e){}
  }
  return '';
}

function _setRecButtonState(active){
  for(const id of ['btnViewRec','btnViewRecPhone']){
    const el = document.getElementById(id);
    if(!el) continue;
    if(active){
      el.style.background    = 'rgba(255,60,60,.92)';
      el.style.borderColor   = 'rgba(255,140,140,.65)';
      el.style.color         = '#fff';
      el.dataset._recOn      = '1';
    } else {
      el.style.background    = 'rgba(20,20,22,.88)';
      el.style.borderColor   = 'rgba(255,255,255,.18)';
      el.style.color         = 'rgba(200,200,200,.85)';
      delete el.dataset._recOn;
    }
  }
  const lblPair = [['lbl-view-rec'],['lbl-view-rec-phone']];
  for(const [id] of lblPair){
    const el = document.getElementById(id);
    if(el) el.textContent = active
      ? ((window._lang === 'en') ? 'Stop' : '停止')
      : ((window._lang === 'en') ? 'Rec'  : '録画');
  }
}

function _ensureRecTimerEl(){
  let el = document.getElementById('view-rec-timer');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'view-rec-timer';
  // The recording timer sits ABOVE the cbar (📷/🌅/📐/⏺/🗺/❓) so it
  // never collides with the ⏺ 録画 button that now lives down there.
  // The cbar top-edge is ≈ 50 px above the viewport bottom on desktop
  // (cbar `bottom:14px` + ~36 px button height) and ≈ 100 px on touch
  // (`bottom:64px` for iPad / phone). 110 px clears both comfortably.
  el.style.cssText = [
    'position:fixed','left:50%','transform:translateX(-50%)',
    'bottom:110px','background:rgba(200,30,30,.92)','color:#fff',
    'padding:4px 12px','border-radius:14px','font-size:.75em',
    'letter-spacing:.06em','font-family:ui-monospace,monospace',
    'z-index:5000','pointer-events:none','user-select:none',
    'box-shadow:0 4px 14px rgba(0,0,0,.55)',
    'display:flex','align-items:center','gap:6px'
  ].join(';');
  el.innerHTML = '<span style="display:inline-block;width:8px;height:8px;background:#fff;border-radius:50%;animation:rec-pulse 1.2s ease-in-out infinite"></span><span id="view-rec-time">00:00</span>';
  document.body.appendChild(el);
  if(!document.getElementById('rec-pulse-anim')){
    const s = document.createElement('style');
    s.id = 'rec-pulse-anim';
    s.textContent = '@keyframes rec-pulse{0%,100%{opacity:1}50%{opacity:.25}}';
    document.head.appendChild(s);
  }
  return el;
}

function _hideRecTimer(){
  const el = document.getElementById('view-rec-timer');
  if(el) el.remove();
}

function _fmtRecSeconds(s){
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), ss = s % 60;
  return String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
}

window.startViewRecording = function(){
  if(_viewRec.active) return;
  const mime = _pickRecorderMime();
  if(!mime){
    showUndoToast((window._lang === 'en')
      ? 'Recording not supported on this browser'
      : 'このブラウザでは録画非対応');
    return;
  }
  let stream;
  try {
    // 60 fps cap so the recorder doesn't tear up Spark's variable-rate
    // submit. 0 = "draw frame whenever canvas updates" which on mobile
    // Chrome sometimes drops below 24 fps.
    stream = canvas.captureStream(60);
  } catch(e){
    showUndoToast((window._lang === 'en')
      ? 'Canvas capture failed' : 'キャプチャ失敗');
    return;
  }
  let rec;
  try {
    rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12_000_000,    // ~12 Mb/s @ 1080p — visibly clean
    });
  } catch(e){
    showUndoToast((window._lang === 'en')
      ? 'Recorder init failed' : '録画開始に失敗');
    return;
  }
  _viewRec.chunks = [];
  _viewRec.mime   = mime;
  _viewRec.ext    = mime.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
  rec.ondataavailable = (e) => {
    if(e.data && e.data.size > 0) _viewRec.chunks.push(e.data);
  };
  rec.onstop = () => {
    const blob = new Blob(_viewRec.chunks, { type: _viewRec.mime });
    _viewRec.chunks = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = ts.getFullYear() + pad(ts.getMonth()+1) + pad(ts.getDate())
                + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
    const projectEl = document.getElementById('tb-project-name');
    const proj = (projectEl && projectEl.textContent.trim()) || 'Untitled';
    a.href = url;
    a.download = `${proj}_${stamp}.${_viewRec.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showUndoToast((window._lang === 'en')
      ? `Saved ${a.download}` : `保存しました: ${a.download}`);
  };
  _viewRec.recorder  = rec;
  _viewRec.active    = true;
  _viewRec.startedAt = performance.now();
  rec.start(1000);  // emit a chunk every second so we don't pile a huge tail
  _setRecButtonState(true);
  // Hide editing chrome (pivot gizmo, saved-camera markers, cam-anim path)
  // so it doesn't appear in the captured video.
  _setCaptureUIHidden(true);
  const el = _ensureRecTimerEl();
  const tick = () => {
    const sec = (performance.now() - _viewRec.startedAt) / 1000;
    const t = document.getElementById('view-rec-time');
    if(t) t.textContent = _fmtRecSeconds(sec);
  };
  tick();
  _viewRec.intervalId = setInterval(tick, 250);
};

window.stopViewRecording = function(){
  if(!_viewRec.active) return;
  try { _viewRec.recorder.stop(); } catch(e){}
  if(_viewRec.intervalId){
    clearInterval(_viewRec.intervalId);
    _viewRec.intervalId = 0;
  }
  _viewRec.active = false;
  _viewRec.recorder = null;
  _setRecButtonState(false);
  _hideRecTimer();
  // Restore the editing chrome hidden when recording started.
  _setCaptureUIHidden(false);
};

window.toggleViewRecording = function(){
  if(_viewRec.active) window.stopViewRecording();
  else                window.startViewRecording();
};

