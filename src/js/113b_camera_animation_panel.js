function _camAnimRenderPanel(){
  const p = document.getElementById('cam-anim-panel');
  if(!p) return;
  const lang = (window._lang === 'en') ? 'en' : 'ja';
  const t = (en, ja) => (lang === 'en' ? en : ja);
  const nKeys = camAnim.keys.length;
  const ready = nKeys >= 2;
  const nextLabel = `${t('Add Camera', 'カメラ')} ${nKeys + 1} ${t('position', '位置を保存')}`;
  let listHtml = '';
  for(let i = 0; i < nKeys; i++){
    const k = camAnim.keys[i];
    listHtml += `
      <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin:2px 0;
                  background:rgba(160,120,255,.08);border:1px solid rgba(180,140,255,.18);
                  border-radius:5px;font-size:.78em">
        <span style="color:#cbb6ff;flex:0 0 auto">📌 ${t('Cam', 'カメラ')} ${i+1}</span>
        <span style="color:#888;flex:1;font-family:ui-monospace,monospace;font-size:.85em">
          X${k.pos.x.toFixed(1)} Y${k.pos.y.toFixed(1)} Z${k.pos.z.toFixed(1)}
        </span>
        <button onclick="window.camAnimGotoKey(${i})"
          style="background:rgba(160,120,255,.18);border:1px solid rgba(180,140,255,.35);
                 color:#e0ccff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:.85em">
          ${t('Go', '移動')}
        </button>
        <button onclick="window.camAnimRemoveKey(${i})"
          style="background:rgba(255,80,80,.15);border:1px solid rgba(255,120,120,.3);
                 color:#ffb0b0;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:.85em">
          ×
        </button>
      </div>`;
  }
  p.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <strong style="flex:1;color:#cbb6ff;letter-spacing:.04em">🎞 ${t('Camera Animation', 'カメラアニメーション')}</strong>
      <button onclick="window.toggleCamAnimPanel()"
        style="background:transparent;border:1px solid rgba(255,255,255,.18);
               color:#aaa;width:24px;height:24px;border-radius:4px;cursor:pointer">×</button>
    </div>
    <button onclick="window.camAnimAddKey()" style="width:100%;padding:8px;margin-bottom:8px;
      background:rgba(160,120,255,.18);border:1px solid rgba(180,140,255,.4);
      color:#e0ccff;border-radius:6px;cursor:pointer;font-weight:600">
      ➕ ${nextLabel}
    </button>
    <div style="max-height:38vh;overflow-y:auto;margin-bottom:8px">${listHtml}</div>
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px">
      <label style="font-size:.72em;color:#bbb;white-space:nowrap">
        ${t('Speed', '速度')}
      </label>
      <input type="range" id="cam-anim-speed-slider" min="0.1" max="10" step="0.1"
        value="${camAnim.speed}"
        oninput="window.camAnimSetSpeed(parseFloat(this.value))"
        style="flex:1;min-width:0;accent-color:#b594ff">
      <input type="number" id="cam-anim-speed" min="0.1" max="60" step="0.1"
        value="${camAnim.speed}"
        oninput="window.camAnimSetSpeed(parseFloat(this.value))"
        style="width:42px;background:#1a1a1f;color:#fff;border:1px solid rgba(255,255,255,.18);
               border-radius:4px;padding:2px 3px;font-size:.78em">
      <span style="font-size:.65em;color:#888">m/s</span>
    </div>
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px">
      <label style="font-size:.72em;color:#bbb;white-space:nowrap">
        ${t('Motion', '動き')}
      </label>
      <div style="flex:1;display:flex;gap:4px">
        <button id="cam-anim-ease-on" onclick="window.camAnimSetEasing(true)"
          style="flex:1;padding:5px;border-radius:5px;cursor:pointer;font-size:.78em;
                 border:1px solid ${camAnim.easing?'rgba(180,140,255,.6)':'rgba(255,255,255,.14)'};
                 background:${camAnim.easing?'rgba(160,120,255,.22)':'rgba(255,255,255,.04)'};
                 color:${camAnim.easing?'#e0ccff':'#999'}">
          ${t('Ease in/out','イージング')}
        </button>
        <button id="cam-anim-ease-off" onclick="window.camAnimSetEasing(false)"
          style="flex:1;padding:5px;border-radius:5px;cursor:pointer;font-size:.78em;
                 border:1px solid ${!camAnim.easing?'rgba(180,140,255,.6)':'rgba(255,255,255,.14)'};
                 background:${!camAnim.easing?'rgba(160,120,255,.22)':'rgba(255,255,255,.04)'};
                 color:${!camAnim.easing?'#e0ccff':'#999'}">
          ${t('Linear','リニア')}
        </button>
      </div>
    </div>
    <div style="font-size:.72em;color:#777;margin-bottom:8px">
      ${t('Total duration', '総再生時間')}: <span id="cam-anim-total">${camAnim.totalSec.toFixed(2)}</span> s
    </div>
    <div style="margin-bottom:6px">
      <label style="display:flex;align-items:center;gap:6px;font-size:.82em;cursor:pointer">
        <input type="checkbox" id="ca-hide-overlays"
          style="accent-color:#b594ff;cursor:pointer"> ${t('Hide paths & events','区画パス・イベントを非表示')}
      </label>
    </div>
    <div style="margin-bottom:6px">
      <label style="display:flex;align-items:center;gap:6px;font-size:.82em;cursor:pointer">
        <input type="checkbox" id="ca-burnin-grid"
          style="accent-color:#b594ff;cursor:pointer"> ${t('Burn in grid / safe zone','グリッド/セーフ枠を焼き込み')}
      </label>
    </div>
    <div style="display:flex;gap:4px">
      <button onclick="window.camAnimPreview()" ${ready ? '' : 'disabled'}
        style="flex:1;padding:5px 6px;background:rgba(120,200,255,.18);
               border:1px solid rgba(140,210,255,.4);color:#cce8ff;
               border-radius:5px;cursor:${ready?'pointer':'not-allowed'};
               opacity:${ready?1:.4};font-size:.85em">
        ▶ ${camAnim.playing ? t('Stop','停止') : t('Preview','プレビュー')}
      </button>
      <button onclick="window.camAnimRecordExport()" ${ready ? '' : 'disabled'}
        style="flex:1;padding:5px 6px;background:rgba(255,80,80,.18);
               border:1px solid rgba(255,140,140,.4);color:#ffd6d6;
               border-radius:5px;cursor:${ready?'pointer':'not-allowed'};
               opacity:${ready?1:.4};font-size:.85em">
        ⏺ ${t('Record','録画')}
      </button>
    </div>`;
}

// Keep the カメラアニメ panel clear of the カメラ tool panel when both are open
// (they coexist now). Sit just to the LEFT of the camera panel (which hugs the
// right edge, full-height); otherwise return to the default right:14 corner.
function _camAnimReposition(){
  const p = document.getElementById('cam-anim-panel');
  if(!p) return;
  const camPan = document.getElementById('cam-panel');
  if(typeof cam !== 'undefined' && cam && cam.active &&
     camPan && getComputedStyle(camPan).display !== 'none'){
    const cpr = camPan.getBoundingClientRect();
    p.style.right = Math.max(14, Math.round(window.innerWidth - cpr.left + 12)) + 'px';
  } else {
    p.style.right = '14px';
  }
}
window.toggleCamAnimPanel = function(){
  let p = document.getElementById('cam-anim-panel');
  if(!p){
    p = document.createElement('div');
    p.id = 'cam-anim-panel';
    p.style.cssText = [
      'position:fixed','top:90px','right:14px','width:300px',
      'background:rgba(20,20,22,.97)','border:1px solid rgba(180,140,255,.25)',
      'border-radius:10px','padding:14px','z-index:300',
      'box-shadow:0 8px 26px rgba(0,0,0,.6)',
      'font-family:ui-sans-serif,system-ui,sans-serif','color:#e8e8e8',
      'max-height:80vh','overflow-y:auto','display:none'
    ].join(';');
    document.body.appendChild(p);
  }
  const _wasOpen = camAnim.open;
  // Opening the panel shuts the OTHER tools, but KEEPS the カメラ tool active so
  // the user can frame each shot with the camera tool and capture its FOV / focal
  // into the keys (user request 2026-06). closeAllPanels also hides this panel
  // (sets open=false), which is fine — we re-open it just below.
  if(!_wasOpen) closeAllPanels({ keepCamTool: true });
  camAnim.open = !_wasOpen;
  p.style.display = camAnim.open ? 'block' : 'none';
  const _cab = document.getElementById('btnCamAnim');
  if(_cab) _cab.classList.toggle('on', camAnim.open);
  if(camAnim.open){
    _camAnimReposition();   // sit left of the camera-tool panel if it's open
    _camAnimRenderPanel();
    // Make the markers + path visible while the panel is open so the
    // user can place / inspect keys in 3-D.
    if(!camAnim.posCurve && camAnim.keys.length >= 2) _camAnimRebuild();
    _camAnimSetVisualsVisible(true);
  } else {
    // Hide visuals when the panel is closed; they're an editing aid,
    // not part of the regular scene.
    _camAnimSetVisualsVisible(false);
  }
};

window.camAnimAddKey = function(){
  camAnim.keys.push(_camAnimKeySnapshot());
  _camAnimRecomputeSegments();
  _camAnimRenderPanel();
};

window.camAnimRemoveKey = function(i){
  camAnim.keys.splice(i, 1);
  _camAnimRecomputeSegments();
  _camAnimRenderPanel();
};

window.camAnimGotoKey = function(i){
  const k = camAnim.keys[i]; if(!k) return;
  _camAnimApplySample(k);
};

window.camAnimSetSpeed = function(v){
  if(!isFinite(v) || v <= 0) return;
  camAnim.speed = Math.max(0.05, Math.min(60, v));
  _camAnimRecomputeSegments();
  // Cheap re-render: just refresh the total seconds text + sync widgets.
  const tEl = document.getElementById('cam-anim-total');
  if(tEl) tEl.textContent = camAnim.totalSec.toFixed(2);
  const s1 = document.getElementById('cam-anim-speed-slider');
  const s2 = document.getElementById('cam-anim-speed');
  if(s1 && parseFloat(s1.value) !== camAnim.speed) s1.value = camAnim.speed;
  if(s2 && parseFloat(s2.value) !== camAnim.speed) s2.value = camAnim.speed;
};

// Motion profile: true = ease in/out (smoothstep), false = linear (constant
// speed). Applied to the normalised progress in _camAnimSampleAt.
window.camAnimSetEasing = function(on){
  camAnim.easing = !!on;
  _camAnimRenderPanel(); // refresh the segmented toggle highlight
};

// Preview tick. Driven by BOTH rAF (smooth visual updates when the page
// is running at vsync) AND a setTimeout backup that re-fires the tick
// even when Chrome's compositor throttles rAF under heavy WebGL submit.
// Without the setTimeout backup a throttled tab would silently stretch
// a 20 s preview to 1+ minute because the rAF tick never gets a chance
// to observe tSec >= totalSec, leaving camAnim.playing stuck at true.
//
// Both paths converge on the same _camAnimTick body — whichever fires
// first cancels the other so we never double-apply a sample.
function _camAnimTickInternal(){
  if(!camAnim.playing) return;
  // Schedule the next tick FIRST so an exception in apply-sample doesn't
  // freeze playback. Drop any previously-scheduled fallback so we don't
  // accumulate setTimeouts on every frame.
  if(camAnim.rafId)     { cancelAnimationFrame(camAnim.rafId); camAnim.rafId = 0; }
  if(camAnim.timeoutId) { clearTimeout(camAnim.timeoutId);     camAnim.timeoutId = 0; }
  const tSec = (performance.now() - camAnim.startedAt) / 1000;
  if(tSec >= camAnim.totalSec){
    _camAnimApplySample(camAnim.keys[camAnim.keys.length - 1]);
    camAnim.playing = false;
    _camAnimRenderPanel();
    return;
  }
  _camAnimApplySample(_camAnimSampleAt(tSec));
  // rAF when the tab is happily painting; setTimeout(33ms ≈ 30 Hz) as a
  // throttle-resistant fallback so wall-clock duration ≈ totalSec even
  // when the compositor is dropping rAFs.
  camAnim.rafId     = requestAnimationFrame(_camAnimTickInternal);
  camAnim.timeoutId = setTimeout(_camAnimTickInternal, 33);
}
function _camAnimTick(){ _camAnimTickInternal(); }

window.camAnimPreview = function(){
  if(camAnim.keys.length < 2) return;
  if(camAnim.playing){
    camAnim.playing = false;
    if(camAnim.rafId)     cancelAnimationFrame(camAnim.rafId);
    if(camAnim.timeoutId) clearTimeout(camAnim.timeoutId);
    camAnim.rafId = 0; camAnim.timeoutId = 0;
    _camAnimRenderPanel();
    return;
  }
  _camAnimRecomputeSegments();
  _camAnimApplySample(camAnim.keys[0]);
  camAnim.playing   = true;
  camAnim.startedAt = performance.now();
  // Hard-deadline watchdog — schedules a force-stop at totalSec + 50 ms
  // so even if BOTH rAF and the setTimeout backup somehow stall (deep
  // background, throttled OS timers), playback ends on time and the
  // panel UI doesn't get stuck in "停止" mode.
  if(camAnim.deadlineId) clearTimeout(camAnim.deadlineId);
  camAnim.deadlineId = setTimeout(() => {
    if(camAnim.playing){
      camAnim.playing = false;
      _camAnimApplySample(camAnim.keys[camAnim.keys.length - 1]);
      if(camAnim.rafId)     cancelAnimationFrame(camAnim.rafId);
      if(camAnim.timeoutId) clearTimeout(camAnim.timeoutId);
      camAnim.rafId = 0; camAnim.timeoutId = 0;
      _camAnimRenderPanel();
    }
  }, Math.max(50, camAnim.totalSec * 1000 + 50));
  _camAnimTickInternal();
  _camAnimRenderPanel();
};

window.camAnimRecordExport = function(){
  if(camAnim.keys.length < 2) return;
  _camAnimRebuild();
  // Hide the side panel during recording so it doesn't appear in the
  // exported video.
  const p = document.getElementById('cam-anim-panel');
  const prevDisplay = p ? p.style.display : '';
  if(p) p.style.display = 'none';
  // Hide the safe-frame border too — capture should be the full
  // rendered view without UI chrome. Save and restore.
  const cf = document.getElementById('cam-frame');
  const prevCf = cf ? cf.style.display : '';
  if(cf) cf.style.display = 'none';
  // Hide the 3D path/marker visuals so they don't appear in the
  // captured MP4 — they're an editing aid, not part of the final shot.
  _camAnimSetVisualsVisible(false);

  // ── Camera-frame cropped recording ─────────────────────────────────────
  // When the camera tool is active, record only the camera frame region
  // (matching the user's chosen aspect ratio) instead of the full viewport.
  // An offscreen canvas at the target delivery resolution receives a copy
  // of the frame rect after every render; the MediaRecorder captures it.
  const _useCamFrame = cam.active;
  const _recBurnGrid = _useCamFrame
    && !!(document.getElementById('ca-burnin-grid') || {}).checked;
  let _recCanvas = null, _recCtx = null, _recFr = null;
  if(_useCamFrame){
    const target = _camTargetResolution();
    _recCanvas = document.createElement('canvas');
    _recCanvas.width  = target.w;
    _recCanvas.height = target.h;
    _recCtx = _recCanvas.getContext('2d');
    _recFr  = _camFrameRect();
  }

  // ── WARM-UP ────────────────────────────────────────────────────────────
  // Snap to key 0 and let Spark settle to full LOD/SH BEFORE the recorder
  // turns on, so the first recorded frame isn't the coarse just-jumped state.
  // The recorder + animation start only after camAnim.warmupMs has elapsed.
  _camAnimApplySample(camAnim.keys[0]);
  camAnim.warming = true;
  const _warmMs = Math.max(0, camAnim.warmupMs || 0);
  // Keep the splat sort / LoD walker running across the whole warm-up so it
  // actually pages in higher detail (a single markDirty would only paint a
  // few frames, not drive continuous refinement).
  bumpSplatActive(_warmMs + 500);
  markDirty(240);
  if(camAnim.warmNudgeId){ clearInterval(camAnim.warmNudgeId); camAnim.warmNudgeId = 0; }
  if(_warmMs > 0){
    camAnim.warmNudgeId = setInterval(() => {
      bumpSplatActive(400);
      markDirty(8);
    }, 150);
    try { if(typeof showUndoToast === 'function') showUndoToast('ウォームアップ中… LOD 読込'); } catch(_){}
  }

  // Everything that actually starts the recording + drives the fly-through,
  // deferred until the warm-up window closes.
  const _beginRecording = () => {
    camAnim.warming = false;
    if(camAnim.warmNudgeId){ clearInterval(camAnim.warmNudgeId); camAnim.warmNudgeId = 0; }

    if(_useCamFrame){
      // ── Cropped recorder on the offscreen canvas ──
      const mime = _pickRecorderMime();
      if(!mime){
        showUndoToast((window._lang === 'en')
          ? 'Recording not supported on this browser'
          : 'このブラウザでは録画非対応');
        return;
      }
      const stream = _recCanvas.captureStream(60);
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 12_000_000,
      });
      const _chunks = [];
      const _ext = mime.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
      rec.ondataavailable = (e) => { if(e.data && e.data.size > 0) _chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(_chunks, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date();
        const pad = n => String(n).padStart(2, '0');
        const stamp = ts.getFullYear() + pad(ts.getMonth()+1) + pad(ts.getDate())
                    + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
        const projectEl = document.getElementById('tb-project-name');
        const proj = (projectEl && projectEl.textContent.trim()) || 'Untitled';
        a.href = url;
        a.download = `${proj}_${stamp}.${_ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showUndoToast((window._lang === 'en')
          ? `Saved ${a.download}` : `保存しました: ${a.download}`);
      };
      rec.start(1000);
      camAnim._recRec = rec;
      // Install the post-render copy hook so every animate-loop frame is
      // mirrored to the offscreen canvas at the camera-frame crop.
      const PR = renderer.getPixelRatio();
      camAnim._recCopyFn = () => {
        try {
          _recCtx.drawImage(canvas,
            Math.round(_recFr.x * PR), Math.round(_recFr.y * PR),
            Math.round(_recFr.w * PR), Math.round(_recFr.h * PR),
            0, 0, _recCanvas.width, _recCanvas.height);
          if(_recBurnGrid) _drawGridOnCanvas(_recCtx, _recCanvas.width, _recCanvas.height);
        } catch(_){}
      };
      _setCaptureUIHidden(true);
      _setRecButtonState(true);
      const el = _ensureRecTimerEl();
      camAnim._recStart = performance.now();
      const rtick = () => {
        const sec = (performance.now() - camAnim._recStart) / 1000;
        const t = document.getElementById('view-rec-time');
        if(t) t.textContent = _fmtRecSeconds(sec);
      };
      rtick();
      camAnim._recInterval = setInterval(rtick, 250);
    } else {
      // Start the existing canvas recorder; it writes a file on stop().
      window.startViewRecording();
    }

    // Re-pin key 0 so frame 0 is exactly the start pose (warm-up nudges only
    // touched the splat sort, not the camera, but be explicit).
    _camAnimApplySample(camAnim.keys[0]);
    camAnim.playing   = true;
    camAnim.startedAt = performance.now();
    // Dual-driver (rAF + setTimeout backup + hard-deadline watchdog) so
    // recording duration matches camAnim.totalSec even if Chrome throttles
    // rAF during the export. Same pattern as window.camAnimPreview.
    let recRafId = 0, recTimeoutId = 0, recDeadlineId = 0;
    const finishRec = () => {
      if(recRafId)     cancelAnimationFrame(recRafId);
      if(recTimeoutId) clearTimeout(recTimeoutId);
      if(recDeadlineId){ clearTimeout(recDeadlineId); recDeadlineId = 0; }
      recRafId = recTimeoutId = 0;
      _camAnimApplySample(camAnim.keys[camAnim.keys.length - 1]);
      camAnim.playing = false;
      setTimeout(() => {
        if(_useCamFrame){
          try { camAnim._recRec.stop(); } catch(_){}
          if(camAnim._recInterval){ clearInterval(camAnim._recInterval); camAnim._recInterval = 0; }
          camAnim._recCopyFn = null;
          camAnim._recRec = null;
          _setRecButtonState(false);
          _hideRecTimer();
          _setCaptureUIHidden(false);
        } else {
          window.stopViewRecording();
        }
        if(p)  p.style.display  = prevDisplay;
        if(cf) cf.style.display = prevCf;
        if(camAnim.open) _camAnimSetVisualsVisible(true);
        _camAnimRenderPanel();
      }, 300);
    };
    const tickRec = () => {
      if(!camAnim.playing) return;
      if(recRafId)     { cancelAnimationFrame(recRafId); recRafId = 0; }
      if(recTimeoutId) { clearTimeout(recTimeoutId);     recTimeoutId = 0; }
      const tSec = (performance.now() - camAnim.startedAt) / 1000;
      if(tSec >= camAnim.totalSec){ finishRec(); return; }
      _camAnimApplySample(_camAnimSampleAt(tSec));
      recRafId     = requestAnimationFrame(tickRec);
      recTimeoutId = setTimeout(tickRec, 33);
    };
    // Watchdog: force-finish at totalSec + 50 ms in case both rAF and
    // setTimeout are throttled deep enough that the tick never observes
    // the deadline.
    recDeadlineId = setTimeout(() => { if(camAnim.playing) finishRec(); },
                               Math.max(50, camAnim.totalSec * 1000 + 50));
    tickRec();
  };

  if(camAnim.warmTimer){ clearTimeout(camAnim.warmTimer); camAnim.warmTimer = 0; }
  if(_warmMs > 0) camAnim.warmTimer = setTimeout(_beginRecording, _warmMs);
  else            _beginRecording();
};

// Render the active grids onto a 2D canvas of the cropped image. Mirrors the SVG
// drawCamGrid logic so the JPEG matches what the viewport showed (when the user
// has "グリッド/セーフ枠も焼き込み" enabled).
function _drawGridOnCanvas(ctx, W, H){
  if(!cam.grids || cam.grids.size === 0) return;
  ctx.save();
  ctx.globalAlpha = (cam.gridOpacity != null ? cam.gridOpacity : 0.85);
  const stroke = 'rgb(255,255,255)';
  const sw  = Math.max(1.6, W * 0.0015);
  const sw2 = Math.max(2.2, W * 0.0022);
  const Vline = (xPct, color=stroke, width=sw)=>{
    ctx.strokeStyle=color; ctx.lineWidth=width;
    const x = xPct/100*W;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
  };
  const Hline = (yPct, color=stroke, width=sw)=>{
    ctx.strokeStyle=color; ctx.lineWidth=width;
    const y = yPct/100*H;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  };
  const LineXY = (x1,y1,x2,y2, color=stroke, width=sw)=>{
    ctx.strokeStyle=color; ctx.lineWidth=width;
    ctx.beginPath(); ctx.moveTo(x1/100*W, y1/100*H); ctx.lineTo(x2/100*W, y2/100*H); ctx.stroke();
  };
  const Rect = (x,y,w,h, color=stroke, width=sw)=>{
    ctx.strokeStyle=color; ctx.lineWidth=width;
    ctx.strokeRect(x/100*W, y/100*H, w/100*W, h/100*H);
  };
  const Text = (x,y, str, color=stroke, sizePct=2.4)=>{
    ctx.fillStyle=color;
    ctx.font = `${Math.max(11, sizePct/100*H)}px ui-monospace,Consolas,monospace`;
    ctx.textBaseline='top'; ctx.textAlign='left';
    ctx.fillText(str, x/100*W, y/100*H);
  };
  const G = cam.grids;
  if(G.has('thirds')){
    Vline(33.333); Vline(66.667);
    Hline(33.333); Hline(66.667);
  }
  if(G.has('golden')){
    const phi = 0.382, gc = 'rgb(255,200,80)';
    Vline(phi*100, gc); Vline((1-phi)*100, gc);
    Hline(phi*100, gc); Hline((1-phi)*100, gc);
  }
  if(G.has('cross')){ Vline(50); Hline(50); }
  if(G.has('diag')){
    const dc = 'rgb(180,200,255)';
    LineXY(0,0,100,100, dc);
    LineXY(100,0,0,100, dc);
  }
  if(G.has('safe-action')){
    const m=3.5, ac='rgb(255,180,80)';
    Rect(m,m,100-2*m,100-2*m, ac, sw2);
    Text(m+0.4, m+0.6, 'ACTION SAFE', ac, 2.2);
  }
  if(G.has('safe-title')){
    const m=5, tc='rgb(120,200,255)';
    Rect(m,m,100-2*m,100-2*m, tc, sw2);
    Text(m+0.4, 100-m-3, 'TITLE SAFE', tc, 2.2);
  }
  if(G.has('center-mark')){
    const cl = 'rgb(255,255,255)';
    LineXY(46,50,54,50, cl, sw2);
    LineXY(50,46,50,54, cl, sw2);
    LineXY(50,0,50,2, cl, sw2);
    LineXY(50,98,50,100, cl, sw2);
    LineXY(0,50,2,50, cl, sw2);
    LineXY(98,50,100,50, cl, sw2);
  }
  if(G.has('custom')){
    const c=Math.max(1, cam.gridCols), r=Math.max(1, cam.gridRows);
    const xc='rgb(180,255,180)';
    for(let i=1;i<c;i++) Vline(100*i/c, xc);
    for(let i=1;i<r;i++) Hline(100*i/r, xc);
  }
  ctx.restore();
}

// Decide the standard delivery resolution from the active aspect ratio. The longer
// side is locked to 1920 px so 16:9 → 1920×1080 (FHD). Common cinema/social ratios
// are snapped to widely-used target sizes; everything else falls back to "1920 max
// dimension" with the other side computed from the ratio.
function _camTargetResolution(){
  const ar = cam.aspect || (cam.sw / cam.sh);
  // Snap a few popular ratios to canonical delivery sizes (1920 long side)
  const SNAPS = [
    { ar: 16/9,    w: 1920, h: 1080 },   // FHD landscape
    { ar: 9/16,    w: 1080, h: 1920 },   // FHD portrait
    { ar: 1,       w: 1920, h: 1920 },   // Square
    { ar: 3/2,     w: 1920, h: 1280 },   // 3:2 (FF stills)
    { ar: 2/3,     w: 1280, h: 1920 },
    { ar: 4/5,     w: 1536, h: 1920 },   // IG portrait
    { ar: 5/4,     w: 1920, h: 1536 },
    { ar: 2.0,     w: 1920, h: 960  },   // 18:9-ish
    { ar: 2.39,    w: 1920, h: 803  },   // Anamorphic scope
    { ar: 2.35,    w: 1920, h: 817  },   // CinemaScope (older)
    { ar: 1.85,    w: 1920, h: 1037 },   // Flat / 1.85:1
    { ar: 4/3,     w: 1920, h: 1440 },
    { ar: 17/9,    w: 1920, h: 1016 },
  ];
  let res = null;
  for(const s of SNAPS){
    if(Math.abs(ar - s.ar) < 0.005){ res = { w: s.w, h: s.h }; break; }
  }
  if(!res){
    if(ar >= 1) res = { w: 1920, h: Math.max(1, Math.round(1920 / ar)) };
    else        res = { w: Math.max(1, Math.round(1920 * ar)), h: 1920 };
  }
  // 4K export → 2× the FHD-class snapped size (e.g. 16:9 → 3840×2160)
  if(cam.export4K) return { w: res.w * 2, h: res.h * 2 };
  return res;
}

// Toggle the 4K capture flag and refresh the resolution readout.
window.onCamExport4kChange = function(on){
  cam.export4K = !!on;
  if(typeof _camRefreshCaptureRes === 'function') _camRefreshCaptureRes();
};

// In-session counter map: shot name → next version number to assign on save.
// Lets the user fire off "📸 撮影" multiple times without overwriting filenames.
window._captureVersions = {};
function _nextCaptureFilename(shotName){
  const base = (shotName || 'shot').trim().replace(/[\\/:*?"<>|]/g, '_') || 'shot';
  const n = (window._captureVersions[base] || 0) + 1;
  window._captureVersions[base] = n;
  // First save = bare name; subsequent = name_v2, name_v3, ...
  return n === 1 ? `${base}.jpg` : `${base}_v${n}.jpg`;
}

// Crop the contiguous empty (near-black) rows off the TOP of a captured frame.
// Used so a near-level shot doesn't waste vertical space on the black void
// above the scanned splats when the env sky dome is off. Sampling is cheap (a
// few dozen columns per row) and STOPS at the first row that has any real
// content, so it never eats into the scene. Returns the source canvas unchanged
// when there's nothing to trim (e.g. env-on shots whose top is sky).
function _camTrimEmptyTop(src){
  const W = src.width, H = src.height;
  if(!W || !H) return src;
  let data;
  try { data = src.getContext('2d').getImageData(0, 0, W, H).data; }
  catch(e){ return src; }                 // tainted canvas etc. → skip
  const COLS = 32, THRESH = 30;           // row empty if every sample sums < THRESH
  const rowEmpty = (y) => {
    const base = y * W;
    for(let i = 0; i < COLS; i++){
      const x = ((i + 0.5) / COLS * W) | 0;
      const p = (base + x) * 4;
      if(data[p] + data[p + 1] + data[p + 2] > THRESH) return false;
    }
    return true;
  };
  let top = 0;
  while(top < H && rowEmpty(top)) top++;
  // Nothing meaningful to trim, or the whole frame is empty → leave untouched.
  if(top <= 1 || top >= H - 4) return src;
  const newH = H - top;
  const out = document.createElement('canvas');
  out.width = W; out.height = newH;
  out.getContext('2d').drawImage(src, 0, top, W, newH, 0, 0, W, newH);
  return out;
}

