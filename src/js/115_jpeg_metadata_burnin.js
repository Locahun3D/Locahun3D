// ── JPEG metadata embed/extract via COM segment (0xFFFE) ──
// JPEGs are a stream of segments: SOI (FFD8) then a series of FF<marker><len><data>.
// COM is FFFE and its 2-byte length INCLUDES the length bytes themselves. We inject
// our segment immediately after SOI so it survives most viewers/editors that copy
// untouched segments. The payload starts with a fixed magic so we can reliably
// find it on read even if the file has other COM segments.
//
// PRIMARY magic is "LOCAHUN3D\0" — what we write today. The older "DIGIROKE\0"
// magic is accepted on read for backward compatibility with JPEGs saved by
// earlier versions of the app (older project name); we do NOT write it any more.
const _LOCAHUN_MAGIC  = 'LOCAHUN3D\0';
const _LEGACY_MAGICS  = ['DIGIROKE\0'];   // read-only fallbacks
function _strToBytes(s){ return new TextEncoder().encode(s); }
function _bytesToStr(b){ return new TextDecoder('utf-8',{fatal:false}).decode(b); }

async function embedLocahunMetadata(jpegBlob){
  try{
    const buf = new Uint8Array(await jpegBlob.arrayBuffer());
    if(buf[0] !== 0xFF || buf[1] !== 0xD8) return jpegBlob; // not a JPEG SOI
    const meta = {
      v: 1,
      app: 'ロケハン3D',
      savedAt: new Date().toISOString(),
      camPos: [+camPos.x.toFixed(6), +camPos.y.toFixed(6), +camPos.z.toFixed(6)],
      yaw:    +yaw.toFixed(6),
      pitch:  +pitch.toFixed(6),
      roll:   +roll.toFixed(6),
      fov:    +fov.toFixed(4),
      cam: {
        sensor: cam.sensor, sw: cam.sw, sh: cam.sh,
        focal: cam.focal, wb: cam.wb,
        aspect: cam.aspect, margin: cam.margin,
        grids: Array.from(cam.grids || []),
        gridOpacity: cam.gridOpacity,
        gridCols: cam.gridCols, gridRows: cam.gridRows,
        rig: cam.rig, shot: cam.shot, env: cam.env, note: cam.note,
      },
    };
    const payload = _strToBytes(_LOCAHUN_MAGIC + JSON.stringify(meta));
    // COM segment length includes the 2 length bytes (max 65535)
    if(payload.length + 2 > 0xFFFF) return jpegBlob; // too big, give up gracefully
    const segLen = payload.length + 2;
    const out = new Uint8Array(2 + 4 + payload.length + (buf.length - 2));
    let p = 0;
    out[p++] = 0xFF; out[p++] = 0xD8;             // SOI
    out[p++] = 0xFF; out[p++] = 0xFE;             // COM marker
    out[p++] = (segLen >> 8) & 0xFF;
    out[p++] = segLen & 0xFF;
    out.set(payload, p); p += payload.length;
    out.set(buf.subarray(2), p);
    return new Blob([out], { type: 'image/jpeg' });
  }catch(e){
    console.warn('embedLocahunMetadata failed:', e);
    return jpegBlob;
  }
}

async function extractLocahunMetadata(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  if(buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('JPEG ではありません');
  // Try the current magic first, then any legacy magics. _LOCAHUN_MAGIC
  // is what new JPEGs carry; _LEGACY_MAGICS keeps older "DIGIROKE\0"
  // saves loadable.
  const allMagics = [_LOCAHUN_MAGIC, ..._LEGACY_MAGICS].map(_strToBytes);
  let i = 2;
  while(i + 4 < buf.length){
    if(buf[i] !== 0xFF){ i++; continue; }
    const marker = buf[i+1];
    if(marker === 0xD9) break;                    // EOI
    if(marker === 0xD8){ i += 2; continue; }      // SOI again (shouldn't happen)
    // Standalone markers without length: D0..D7, 01
    if((marker >= 0xD0 && marker <= 0xD7) || marker === 0x01){ i += 2; continue; }
    // SOS (FFDA) onward is compressed image data — stop scanning segments.
    if(marker === 0xDA) break;
    const segLen = (buf[i+2] << 8) | buf[i+3];
    if(segLen < 2) break;
    if(marker === 0xFE){
      const data = buf.subarray(i+4, i+2+segLen);
      for(const magicBytes of allMagics){
        let match = data.length >= magicBytes.length;
        for(let j=0; match && j<magicBytes.length; j++){
          if(data[j] !== magicBytes[j]) match = false;
        }
        if(match){
          const json = _bytesToStr(data.subarray(magicBytes.length));
          return JSON.parse(json);
        }
      }
    }
    i += 2 + segLen;
  }
  throw new Error('ロケハン3Dのメタデータが見つかりません');
}

window.salvageCamFromFile = async function(file){
  if(!file){ return; }
  if(!/\.jpe?g$/i.test(file.name) && file.type !== 'image/jpeg'){
    showUndoToast(T('meta-jpeg-only'));
    return;
  }
  let meta;
  try {
    meta = await extractLocahunMetadata(file);
  } catch(e){
    showUndoToast('⚠ ' + e.message);
    return;
  }
  if(!meta || meta.v !== 1){
    showUndoToast(T('meta-incompat'));
    return;
  }
  // Restore camera position / orientation
  if(Array.isArray(meta.camPos) && meta.camPos.length === 3){
    camPos.set(meta.camPos[0], meta.camPos[1], meta.camPos[2]);
  }
  if(typeof meta.yaw === 'number' && typeof meta.pitch === 'number'){
    setCamRotImmediate(meta.yaw, meta.pitch);
  }
  if(typeof meta.roll === 'number'){
    roll = meta.roll;
    const rEl = document.getElementById('cm-roll');
    const rsEl = document.getElementById('cm-roll-slider');
    const rDeg = +(meta.roll * 180 / Math.PI).toFixed(1);
    if(rEl)  rEl.value  = rDeg;
    if(rsEl) rsEl.value = rDeg;
  }
  // Restore camera tool settings
  if(meta.cam){
    if(!cam.active) toggleCamTool();
    Object.assign(cam, {
      sensor:      meta.cam.sensor      || cam.sensor,
      sw:          meta.cam.sw          || cam.sw,
      sh:          meta.cam.sh          || cam.sh,
      focal:       meta.cam.focal       || cam.focal,
      wb:          meta.cam.wb          || cam.wb,
      aspect:      meta.cam.aspect      ?? cam.aspect,
      margin:      meta.cam.margin      ?? cam.margin,
      gridOpacity: meta.cam.gridOpacity ?? cam.gridOpacity,
      gridCols:    meta.cam.gridCols    || cam.gridCols,
      gridRows:    meta.cam.gridRows    || cam.gridRows,
      rig:         meta.cam.rig         || '',
      shot:        meta.cam.shot        || '',
      env:         meta.cam.env         || '',
      note:        meta.cam.note        || '',
    });
    // Migrate grid state: new payload uses an array; older payloads used a single string.
    if(Array.isArray(meta.cam.grids)){
      cam.grids = new Set(meta.cam.grids);
    } else if(typeof meta.cam.grid === 'string'){
      cam.grids = meta.cam.grid === 'off' ? new Set() : new Set([meta.cam.grid]);
    }
    _camPushFields();
    _camGetEl('cm-sensor').value = cam.sensor;
    _camGetEl('cm-rig').value    = cam.rig;
    _camGetEl('cm-shot').value   = cam.shot;
    _camGetEl('cm-env').value    = cam.env;
    _camGetEl('cm-note').value   = cam.note;
    setCamAspect(cam.aspect);
    // Resync the multi-select grid buttons after restoring the set
    document.querySelectorAll('#cam-panel .cm-grid-btn').forEach(b=>{
      const k = b.dataset.g;
      if(k === 'off') b.classList.toggle('on', cam.grids.size === 0);
      else            b.classList.toggle('on', cam.grids.has(k));
    });
    document.getElementById('cm-grid-custom-row').style.display =
      cam.grids.has('custom') ? 'flex' : 'none';
    drawCamGrid();
    applyCamSettings();
  }
  markDirty(20);
  showUndoToast(T('meta-cam-restored') + (meta.cam?.shot || file.name));
};

// Build a final canvas with the source image surrounded by a black border frame,
// and metadata laid out OUTSIDE the image. New layout:
//   • Top strip:    SHOT NUMBER (large, left). No date, no watermark.
//   • Bottom area:  Two columns, divided down the middle.
//       LEFT  = LENS / 画角 / SENSOR
//       RIGHT = RIG  / ENV  / NOTE / POS / ANGLE
//   • Each value is explicitly labelled (X/Y/Z, パン/ティルト/ロール) for clarity.
// Draws the ロケハン3D app-icon mark (camera-frame brackets + amber record-ring)
// into a 2D context, fitted to an s×s box with top-left at (x,y). Pure canvas
// paths (no Image/async) so it can run synchronously inside the burn-in
// compositor and stays crisp at any export resolution. Mirrors the inline SVG
// used on the home screen so the two brand marks are identical.
function _drawLocahunLogo(ctx, x, y, s){
  const u = s / 100;
  const X = v => x + v * u, Y = v => y + v * u, U = v => v * u;
  ctx.save();
  const rr = (px,py,w,h,r)=>{
    ctx.beginPath();
    if(ctx.roundRect){ ctx.roundRect(px,py,w,h,r); }
    else {
      ctx.moveTo(px+r,py);
      ctx.arcTo(px+w,py,px+w,py+h,r); ctx.arcTo(px+w,py+h,px,py+h,r);
      ctx.arcTo(px,py+h,px,py,r);     ctx.arcTo(px,py,px+w,py,r);
      ctx.closePath();
    }
  };
  const g = ctx.createLinearGradient(0, Y(5), 0, Y(95));
  g.addColorStop(0, '#17171a'); g.addColorStop(1, '#070708');
  rr(X(5), Y(5), U(90), U(90), U(24));
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = U(1.6); ctx.strokeStyle = 'rgba(216,176,97,.9)'; ctx.stroke();
  ctx.strokeStyle = '#f3efe6'; ctx.lineWidth = U(5.4);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const bracket = p => { ctx.beginPath(); ctx.moveTo(X(p[0]),Y(p[1]));
    ctx.lineTo(X(p[2]),Y(p[3])); ctx.lineTo(X(p[4]),Y(p[5])); ctx.stroke(); };
  bracket([25,36,25,25,36,25]); bracket([75,36,75,25,64,25]);
  bracket([25,64,25,75,36,75]); bracket([75,64,75,75,64,75]);
  ctx.beginPath(); ctx.arc(X(50),Y(50),U(10.5),0,Math.PI*2); ctx.fillStyle='#f3a02a'; ctx.fill();
  ctx.beginPath(); ctx.arc(X(50),Y(50),U(4.3),0,Math.PI*2);  ctx.fillStyle='#0c0c0d'; ctx.fill();
  ctx.restore();
}

function composeBurnInFrame(imgCanvas){
  const W = imgCanvas.width, H = imgCanvas.height;
  const pad     = Math.round(Math.min(W, H) * 0.018);
  // Trimmed margins: a thin header (shot # + brand) and a compact 3-column,
  // 3-row info bar. The old layout stacked 6 rows in one column → a tall
  // bottom band with lots of dead space; three columns fit the same data in
  // a third of the height.
  const topH    = Math.round(H * 0.046);               // thin header strip
  const botH    = Math.round(H * 0.112);               // 3-column info bar
  const sideW   = pad;
  const finalW  = W + 2 * sideW;
  const finalH  = H + topH + botH;

  const out = document.createElement('canvas');
  out.width  = finalW;
  out.height = finalH;
  const ctx = out.getContext('2d');

  // Border background
  ctx.fillStyle = '#0c0c0d';
  ctx.fillRect(0, 0, finalW, finalH);

  // Image
  ctx.drawImage(imgCanvas, sideW, topH);

  // Hairline around image
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sideW - 0.5, topH - 0.5, W + 1, H + 1);

  // ── Top strip: SHOT NUMBER (left) + LOCAHUN 3D brand (right) ──
  ctx.textBaseline = 'middle';
  const topFont = Math.round(topH * 0.58);
  if(cam.shot){
    ctx.font = `bold ${topFont}px ui-sans-serif,system-ui,sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0f0f0';
    ctx.fillText(cam.shot, sideW + pad, topH / 2);
  }
  // Brand lockup: app-icon mark + LOCAHUN 3D wordmark, centered in the strip.
  ctx.font = `700 ${Math.round(topFont * 0.92)}px ui-sans-serif,system-ui,sans-serif`;
  const _brand  = 'LOCAHUN 3D';
  const _logoS  = Math.round(topH * 0.82);
  const _logoGp = Math.round(_logoS * 0.30);
  const _brandW = ctx.measureText(_brand).width;
  const _lockW  = _logoS + _logoGp + _brandW;
  const _lockX  = Math.round((finalW - _lockW) / 2);
  _drawLocahunLogo(ctx, _lockX, Math.round((topH - _logoS) / 2), _logoS);
  // Optically center the wordmark on the logo's vertical center. Canvas
  // textBaseline='middle' centers the full em box (incl. the empty descender
  // band), so an ALL-CAPS string like "LOCAHUN 3D" renders visibly high and
  // looks unaligned next to the logo. Center the real glyph bounds instead.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.95)';   // brand wordmark in white (user request v0.0.44)
  const _bm    = ctx.measureText(_brand);
  const _asc   = _bm.actualBoundingBoxAscent  || topFont * 0.70;
  const _dsc   = _bm.actualBoundingBoxDescent || 0;
  const _baseY = topH / 2 + (_asc - _dsc) / 2;
  ctx.fillText(_brand, _lockX + _logoS + _logoGp, _baseY);

  // ── Data ──
  const eq       = _camEquiv35().toFixed(0);
  const hfov     = _camSensorHFovDeg().toFixed(1);
  const vfov     = _camSensorVFovDeg().toFixed(1);
  const panDeg   = _normYawDeg(yaw).toFixed(1);
  const tiltDeg  = (pitch * 180 / Math.PI).toFixed(1);
  const rollDeg  = (roll  * 180 / Math.PI).toFixed(1);
  const dash     = ' — ';
  // HEIGHT: the camera's elevation above the world grid (y=0 plane, where
  // the floor GridHelper is drawn) — the tape-measure ground-to-lens height.
  const heightM  = camPos.y.toFixed(2);

  const col1 = [
    ['LENS',   `${cam.focal.toFixed(0)}mm  (35mm-eq ${eq}mm)`],
    ['画角',   `H ${hfov}°   V ${vfov}°`],
    ['SENSOR', `${cam.sw}×${cam.sh}mm   WB ${cam.wb}K`],
  ];
  const col2 = [
    ['RIG',  cam.rig  || dash],
    ['ENV',  cam.env  || dash],
    ['NOTE', cam.note || dash],
  ];
  const col3 = [
    ['POS',    `X ${camPos.x.toFixed(2)}   Y ${camPos.y.toFixed(2)}   Z ${camPos.z.toFixed(2)}`],
    ['HEIGHT', `${heightM} m  (${(window._lang === 'en' ? 'from grid' : 'グリッドから')})`],
    ['ANGLE',  (window._lang === 'en'
                  ? `Pan ${panDeg}°   Tilt ${tiltDeg}°   Roll ${rollDeg}°`
                  : `パン ${panDeg}°   ティルト ${tiltDeg}°   ロール ${rollDeg}°`)],
  ];

  // ── Bottom area: THREE equal columns ──
  const baseY     = topH + H;
  const innerH    = botH - pad;
  const lineSpace = innerH / 3;
  const fontSize  = Math.round(Math.min(lineSpace * 0.5, finalW * 0.0112));
  const labelW    = Math.round(W * 0.05);
  const colW      = (finalW - 2 * sideW) / 3;

  // Two faint vertical dividers between the three columns
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for(let k = 1; k <= 2; k++){
    ctx.beginPath();
    ctx.moveTo(sideW + colW * k + 0.5, baseY + pad * 0.4);
    ctx.lineTo(sideW + colW * k + 0.5, baseY + botH - pad * 0.4);
    ctx.stroke();
  }

  ctx.textBaseline = 'middle';
  const drawCol = (rows, x) => {
    for(let i = 0; i < rows.length; i++){
      const y = baseY + pad * 0.4 + (i + 0.5) * lineSpace;
      ctx.font = `bold ${Math.round(fontSize * 0.82)}px ui-monospace,"SFMono-Regular",Consolas,monospace`;
      ctx.fillStyle = 'rgba(255,180,84,.7)';
      ctx.textAlign = 'left';
      ctx.fillText(rows[i][0], x, y);
      ctx.font = `${fontSize}px ui-sans-serif,system-ui,sans-serif`;
      ctx.fillStyle = '#e6e6e6';
      ctx.fillText(rows[i][1], x + labelW, y);
    }
  };
  drawCol(col1, sideW + pad);
  drawCol(col2, sideW + colW + pad * 0.6);
  drawCol(col3, sideW + 2 * colW + pad * 0.6);

  return out;
}

window.toggleMeasure = function() {
  const wasActive=msr.active;
  closeAllPanels();
  if(!wasActive){
    // 測定と日照は排他（user request 2026-06-19）。closeAllPanels() は日照を
    // 独立扱いで閉じないため、測定を開くときはここで日照を明示的に閉じる。
    if(typeof sun!=='undefined' && sun.active){
      if(typeof _sunShowPanel==='function') _sunShowPanel(false);
      if(typeof _setSunActive==='function') _setSunActive(false);
    }
    msr.active=true;
    document.body.classList.add('msr-active');
    document.getElementById('btnMeasure').classList.add('on');
    document.getElementById('btnMeasure').innerHTML='📐 <span id="lbl-measure">'+T('msr-active-lbl')+'</span>';
    document.getElementById('btnMeasureEnd').textContent=T('msr-end-lbl');
    const gizmoEl=document.getElementById('gizmo');
    // Position gizmo just below topbar — helpbox was removed.
    const helpboxEl=document.getElementById('helpbox');
    const hbBottom = helpboxEl ? helpboxEl.getBoundingClientRect().bottom : 0;
    const tlBtns=document.getElementById('view-tl-btns');
    const tlBottom=tlBtns?tlBtns.getBoundingClientRect().bottom:0;
    const topPos=Math.max(92, tlBottom + 6, hbBottom + 10);
    gizmoEl.style.top=topPos+'px';
    gizmoEl.style.display='block';
    const hintEl=document.getElementById('msr-hint');
    hintEl.style.display='block';
    // Reserve room for the instruction hint BELOW the panel. Previously the
    // panel was allowed to fill down to (viewport - 14px); on phone-landscape
    // heights the hint pinned at panel-bottom + 6 then landed off-screen
    // (user-reported 下部見切れ). Measure the hint now that it's visible and
    // subtract it from the panel's height budget.
    const _hintH = hintEl.offsetHeight || 46;
    gizmoEl.style.maxHeight = Math.max(120, window.innerHeight - topPos - 14 - _hintH - 6) + 'px';
    const gr=gizmoEl.getBoundingClientRect();
    hintEl.style.top=(gr.bottom+6)+'px';
    hintEl.style.width=gr.width+'px';
    hintEl.style.right='14px';
    updateUndoInfo();
    // Keep helpbox visible (don't hide it)
  }
};

// ── Marker drag helpers ──
function screenPos(worldPt) {
  const v = worldPt.clone().project(camera);
  return {
    x: (v.x + 1) / 2 * innerWidth,
    y: (1 - v.y) / 2 * innerHeight,
    behind: v.z > 1,
  };
}

function nearMarker(clientX, clientY) {
  const THRESH = 22; // px
  if (msr.step >= 1 && msr.markerA.visible) {
    const s = screenPos(msr.ptA);
    if (Math.hypot(clientX-s.x, clientY-s.y) < THRESH) return 'A';
  }
  if (msr.step >= 2 && msr.markerB.visible) {
    const s = screenPos(msr.ptB);
    if (Math.hypot(clientX-s.x, clientY-s.y) < THRESH) return 'B';
  }
  if (msr.heightOn && msr.markerC && msr.markerC.visible) {
    const s = screenPos(msr.ptC);
    if (Math.hypot(clientX-s.x, clientY-s.y) < THRESH) return 'C';
  }
  return null;
}

