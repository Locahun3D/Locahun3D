// ══════════════════════════════════════════════════
//  PIVOT HOVER GLOW (2D overlay)
// ══════════════════════════════════════════════════
let _hoveredLpv = null;   // current lpv hover data

function drawGlowCircle(ctx, x, y, r, col, alpha=0.7){
  const g=ctx.createRadialGradient(x,y,0,x,y,r*2.5);
  g.addColorStop(0,col.replace(')',`,${alpha})`).replace('rgb','rgba'));
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(x,y,r*2.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function hexToRgb(hex){
  const n=parseInt(hex.replace('#',''),16);
  return `rgb(${(n>>16)&255},${(n>>8)&255},${n&255})`;
}

function drawPivotGlow(octx){
  // ── MSR marker hover (already tracked in _hoveredAxis) ──
  if(_hoveredAxis){
    const pt=_hoveredAxis.point;
    const worldPt=pt==='A'?msr.ptA:msr.ptB;
    const sp=screenPos(worldPt);
    if(!sp.behind){
      const col=`#${_hoveredAxis.color.toString(16).padStart(6,'0')}`;
      drawGlowCircle(octx,sp.x,sp.y,18,hexToRgb(col),0.55);
      octx.save();
      octx.strokeStyle=col;
      octx.lineWidth=2.5;
      octx.shadowColor=col;
      octx.shadowBlur=10;
      octx.beginPath();
      octx.arc(sp.x,sp.y,20,0,Math.PI*2);
      octx.stroke();
      octx.restore();
      // Axis label
      const labels={x:'X',y:'Y',z:'Z',xz:'XZ'};
      octx.save();
      octx.font='bold 11px "Segoe UI",monospace';
      octx.fillStyle=col; octx.textAlign='center'; octx.textBaseline='top';
      octx.shadowColor=col; octx.shadowBlur=6;
      octx.fillText(labels[_hoveredAxis.axisName]||'',sp.x,sp.y+24);
      octx.restore();
    }
  }
  // ── Layer pivot hover ──
  if(_hoveredLpv && lpv.group && lpv.group.visible){
    const sp=screenPos(lpv.group.position);
    if(!sp.behind){
      const col=`#${_hoveredLpv.color.toString(16).padStart(6,'0')}`;
      drawGlowCircle(octx,sp.x,sp.y,20,hexToRgb(col),0.45);
      octx.save();
      octx.strokeStyle=col;
      octx.lineWidth=2;
      octx.shadowColor=col;
      octx.shadowBlur=12;
      octx.beginPath();
      octx.arc(sp.x,sp.y,22,0,Math.PI*2);
      octx.stroke();
      // Label
      const lbl=_hoveredLpv.isRot?('↻'+_hoveredLpv.axisName.toUpperCase()):_hoveredLpv.axisName.toUpperCase();
      octx.font='bold 11px "Segoe UI",monospace';
      octx.fillStyle=col; octx.textAlign='center'; octx.textBaseline='top';
      octx.shadowBlur=6;
      octx.fillText(lbl,sp.x,sp.y+26);
      octx.restore();
    }
  }
}

function updateOverlay() {
  // Fast-path: if nothing in this overlay needs to redraw AND nothing was
  // drawn last frame either, skip even the clearRect (which on a large
  // viewport iterates millions of canvas2d pixels). Two state bits gate it:
  //   • _hasOverlayContent — true when measurement, layer pivot, or event
  //     guides are active (any one of these wants per-frame drawing)
  //   • _overlayDirty — set when state transitions in or out so we still
  //     clear the previous frame's content once
  const overlayWants = (msr && (msr.active || msr.step > 0)) ||
                       (selectedLayerId != null) ||
                       (window._activeBillboardCount > 0);
  if(!overlayWants && !window._overlayHadContent){
    return; // nothing to draw, nothing to clear — pure no-op frame
  }
  octx.clearRect(0, 0, overlay.width, overlay.height);
  window._overlayHadContent = overlayWants;

  // msr-hint removed (user 2026-06-20) — no positioning needed.

  // ── Pivot glow is always drawn (measurement OR layer pivot) ──
  drawPivotGlow(octx);

  // ── Event guide labels — skip iteration entirely when there are no
  //    event/billboard layers in the scene (the common case for splat-only
  //    sessions). The counter is maintained by _recountLayerActivity.
  if(window._activeBillboardCount) for(const L of layers){
    if(L.type==='event' && L.visible && L.mesh && L.eventGuide){
      const sp=screenPos(L.mesh.position);
      if(sp&&!sp.behind){
        const text=L.eventGuide;
        octx.save();
        octx.font='bold 13px "Segoe UI",sans-serif';
        const tw=octx.measureText(text).width;
        const px=sp.x-tw/2-6, py=sp.y-46, pw=tw+12, ph=22;
        octx.fillStyle='rgba(0,0,0,0.65)';
        octx.beginPath();
        if(octx.roundRect){octx.roundRect(px,py,pw,ph,5);}
        else{octx.rect(px,py,pw,ph);}
        octx.fill();
        octx.fillStyle='#FFFFFF';
        octx.textAlign='center';
        octx.textBaseline='middle';
        octx.fillText(text,sp.x,py+ph/2);
        octx.restore();
      }
    }
  }

  if (!msr.active) return;

  const sA = (msr.step >= 1 && msr.markerA.visible) ? screenPos(msr.ptA) : null;
  const sB = (msr.step >= 2 && msr.markerB.visible) ? screenPos(msr.ptB) : null;
  // Point C is the optional height marker — only shown when 高さを図る
  // (msr.heightOn) is enabled and we have at least an A point placed.
  const sC = (msr.heightOn && msr.step >= 1 && msr.markerC && msr.markerC.visible)
             ? screenPos(msr.ptC) : null;

  // Ruler between A and B
  if (sA && !sA.behind && sB && !sB.behind) {
    drawRuler(sA, sB, msr.ptA, msr.ptB);
  }
  // Ruler between A and C (height) — same renderer as A↔B but tinted cyan
  // to match the C marker / 3D AC line, so the user-reported "no AC distance
  // shown on the view" matches the existing AB display.
  if (sA && !sA.behind && sC && !sC.behind) {
    drawRuler(sA, sC, msr.ptA, msr.ptC, '#66ddff');
  }

  // Point labels (drawn on top of ruler)
  if (sA && !sA.behind) drawPointLabel(sA.x, sA.y, 'A', '#ffff44');
  if (sB && !sB.behind) drawPointLabel(sB.x, sB.y, 'B', '#ff8844');
  if (sC && !sC.behind) drawPointLabel(sC.x, sC.y, 'C', '#66ddff');

  // Preview ghost label
  if (msr.previewMarker && msr.previewMarker.visible) {
    const sp = screenPos(msr.previewMarker.position);
    if (!sp.behind) {
      const isA = (msr.step === 0 || msr.step === 2);
      const col  = isA ? '#ffff44' : '#ff8844';
      const lbl  = isA ? 'A?' : 'B?';
      octx.save();
      octx.globalAlpha = 0.65;
      drawPointLabel(sp.x, sp.y, lbl, col);
      octx.globalAlpha = 1;
      octx.restore();
    }
  }

  // Pivot glow
  drawPivotGlow(octx);
  // Axis label tooltips when dragging
  if (msr.axisDragging) {
    const { point, axisDir, isXZ } = msr.axisDragging;
    const spt = screenPos(point==='A' ? msr.ptA : msr.ptB);
    let axLabel, col;
    if (isXZ) { axLabel = 'XZ'; col = '#ffeebb'; }
    else {
      axLabel = axisDir.x ? 'X' : axisDir.y ? 'Y' : 'Z';
      const axColors = { X:'#ff3344', Y:'#33ee55', Z:'#3399ff' };
      col = axColors[axLabel];
    }
    octx.save();
    octx.font = 'bold 12px "Segoe UI",monospace';
    octx.fillStyle = col;
    octx.textAlign = 'center';
    octx.fillText('← ' + axLabel + ' →', spt.x, spt.y - 30);
    octx.restore();
  }
}

