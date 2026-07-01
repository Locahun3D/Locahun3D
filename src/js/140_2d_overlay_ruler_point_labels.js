// ══════════════════════════════════════════════════
//  2D OVERLAY – RULER + POINT LABELS
// ══════════════════════════════════════════════════
const overlay  = document.getElementById('overlay');
const octx     = overlay.getContext('2d');

function resizeOverlay() {
  overlay.width  = innerWidth;
  overlay.height = innerHeight;
}
resizeOverlay();
window.addEventListener('resize', resizeOverlay);

function drawArrowHead(x, y, angle, size, color) {
  octx.save();
  octx.translate(x, y);
  octx.rotate(angle);
  octx.beginPath();
  octx.moveTo(0, 0);
  octx.lineTo(-size, -size * 0.45);
  octx.lineTo(-size,  size * 0.45);
  octx.closePath();
  octx.fillStyle = color;
  octx.fill();
  octx.restore();
}

function drawPointLabel(sx, sy, label, color) {
  const R = 15;
  // Outer glow ring
  octx.beginPath();
  octx.arc(sx, sy, R + 3, 0, Math.PI*2);
  octx.strokeStyle = color + '44';
  octx.lineWidth = 3;
  octx.stroke();
  // Circle bg
  octx.beginPath();
  octx.arc(sx, sy, R, 0, Math.PI*2);
  octx.fillStyle = 'rgba(10,10,0,0.82)';
  octx.fill();
  octx.strokeStyle = color;
  octx.lineWidth = 2;
  octx.stroke();
  // Label text
  octx.fillStyle = color;
  octx.font = 'bold 12px "Segoe UI",monospace';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  octx.fillText(label, sx, sy);
}

// drawRuler: ruler line + arrows + distance pill + ΔX/ΔY/ΔZ component
// labels between two points. Originally hard-coded for A↔B; now takes the
// 3D points as arguments so the same renderer can also draw A↔C when the
// height marker is enabled (the user-reported missing distance display).
// `color` is the ruler / pill stroke; defaults to neutral grey for A↔B.
function drawRuler(sA, sB, ptA, ptB, color) {
  const dx = sB.x - sA.x, dy = sB.y - sA.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len < 8) return;

  // Unit vectors
  const ux = dx/len, uy = dy/len;   // along A→B
  const px = -uy,   py = ux;        // perpendicular (CCW 90°)

  const RCOL = color || '#D8D8D8';
  const CAP  = 8; // end-cap half-length

  octx.save();

  // ── Main ruler line: directly from sA to sB ──
  octx.strokeStyle = RCOL + 'cc';
  octx.lineWidth = 1.8;
  octx.beginPath();
  octx.moveTo(sA.x, sA.y);
  octx.lineTo(sB.x, sB.y);
  octx.stroke();

  // End caps perpendicular at A and B
  octx.lineWidth = 1.8;
  octx.strokeStyle = RCOL + 'aa';
  octx.beginPath();
  octx.moveTo(sA.x - px*CAP, sA.y - py*CAP);
  octx.lineTo(sA.x + px*CAP, sA.y + py*CAP);
  octx.stroke();
  octx.beginPath();
  octx.moveTo(sB.x - px*CAP, sB.y - py*CAP);
  octx.lineTo(sB.x + px*CAP, sB.y + py*CAP);
  octx.stroke();

  // Arrow heads pointing inward
  const rulerAngle = Math.atan2(dy, dx);
  drawArrowHead(sA.x, sA.y, rulerAngle,           9, RCOL + 'cc');
  drawArrowHead(sB.x, sB.y, rulerAngle + Math.PI, 9, RCOL + 'cc');

  // ── Distance label: offset perpendicular from midpoint ──
  const dist3D = ptA.distanceTo(ptB);
  const dx3 = Math.abs(ptB.x - ptA.x);
  const dy3 = Math.abs(ptB.y - ptA.y);
  const dz3 = Math.abs(ptB.z - ptA.z);

  const LOFF = 26; // px offset from line
  const mx = (sA.x + sB.x) / 2 + px * LOFF;
  const my = (sA.y + sB.y) / 2 + py * LOFF;

  const distStr = dist3D.toFixed(2) + ' m';
  octx.font = 'bold 13px "Segoe UI",monospace';
  const tw = octx.measureText(distStr).width;
  const PH = 21, PW = tw + 14;

  // Pill background
  octx.fillStyle = 'rgba(10,10,0,0.88)';
  roundRect(octx, mx - PW/2, my - PH/2, PW, PH, 6);
  octx.fill();
  octx.strokeStyle = RCOL + '88';
  octx.lineWidth = 1;
  roundRect(octx, mx - PW/2, my - PH/2, PW, PH, 6);
  octx.stroke();

  // Leader from midpoint on line to label
  octx.setLineDash([3,3]);
  octx.strokeStyle = RCOL + '55';
  octx.lineWidth = 1;
  octx.beginPath();
  octx.moveTo((sA.x+sB.x)/2, (sA.y+sB.y)/2);
  octx.lineTo(mx, my);
  octx.stroke();
  octx.setLineDash([]);

  // Distance text
  octx.fillStyle = RCOL;
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  octx.fillText(distStr, mx, my);

  // Component deltas below label
  const compY = my + PH/2 + 14;
  const parts = [
    { label: `ΔX ${dx3.toFixed(2)}`, col:'#ff5566' },
    { label: `ΔY ${dy3.toFixed(2)}`, col:'#55ee66' },
    { label: `ΔZ ${dz3.toFixed(2)}`, col:'#5599ff' },
  ];
  octx.font = '10px "Segoe UI",monospace';
  const totalW = 160;
  let cx2 = mx - totalW/2;
  for (const {label, col} of parts) {
    octx.fillStyle = col + 'bb';
    octx.textAlign = 'left';
    octx.fillText(label, cx2, compY);
    cx2 += totalW/3;
  }

  octx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}


