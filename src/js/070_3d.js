// ══════════════════════════════════════════════════
//  日照 3D 可視化: 方位コンパス＋一日の太陽軌道（サン・サーベイヤー風）
// ══════════════════════════════════════════════════
// camPos 中心の半径 R 球面上に、地平コンパス円・N/E/S/W ラベル・太陽軌道
// （全周=薄/地平線上=明）・日の出/南中/日の入り/現在のマーカーを配置。
// depthTest 無効でビュー上に常に重畳。group は render loop で camPos 追従。
const sunViz = { group:null, ring:null, path:null, arc:null, cur:null, mRise:null, mNoon:null, mSet:null, labels:[], built:false, R:400 };

// ── 空に浮かぶ月ビルボード（満ち欠けの形が見えるムーンフェイス）──
// コンパスの点(sunViz)とは別に、日照モードの空が出ている間ずっとビュー上に表示する。
// 明部だけを不透明で描き暗部は透明にするので、三日月〜満月の形がそのまま夜空に浮かぶ。
let skyMoon = null;
const _SKY_MOON_DIST = 380;   // camPos からの距離（sunViz 球面のすぐ内側）
// 現在の phase(満ち欠け位相) / fraction(照度) から月面 canvas を描く。
function _drawMoonFace(phase, fraction){
  const S=128, cx=S/2, cy=S/2, R=S*0.42;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const x=cv.getContext('2d'); x.clearRect(0,0,S,S);
  const waxing=(phase<0.5), f=Math.max(0,Math.min(1,fraction)), t=1-2*f;  // t: 明暗境界(ターミネータ)係数
  // 明部をスキャンラインで塗る（明=不透明 / 暗=透明）。ターミネータは楕円になる。
  x.fillStyle='#eef1f8';
  for(let yy=-R; yy<=R; yy+=1){
    const w=Math.sqrt(Math.max(0,R*R-yy*yy));
    let x0,x1;
    if(waxing){ x0=t*w; x1=w; }    // 上弦へ向かう=右側が光る
    else      { x0=-w;  x1=-t*w; } // 下弦へ向かう=左側が光る
    if(x1>x0) x.fillRect(cx+x0, cy+yy, (x1-x0)+0.6, 1.2);
  }
  // 明部の上にだけ球面陰影(左上ハイライト→周縁減光)を source-atop で乗せて立体感を出す。
  x.globalCompositeOperation='source-atop';
  const g=x.createRadialGradient(cx-R*0.28, cy-R*0.28, R*0.1, cx, cy, R*1.15);
  g.addColorStop(0,'rgba(255,255,255,0.18)');
  g.addColorStop(0.7,'rgba(205,215,240,0)');
  g.addColorStop(1,'rgba(120,140,180,0.40)');
  x.fillStyle=g; x.fillRect(0,0,S,S);
  x.globalCompositeOperation='source-over';
  return cv;
}
function _ensureSkyMoon(){
  if(skyMoon) return;
  const tex=new THREE.CanvasTexture(_drawMoonFace(0.5,1));
  tex.minFilter=THREE.LinearFilter;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false}));
  sp.renderOrder=-9999;               // ドーム(-10000)の手前・シーンの奥（＝空の一部）
  sp.frustumCulled=false;
  sp.scale.setScalar(_SKY_MOON_DIST*0.10);   // 見やすいよう実際の月より大きめ(約12倍)
  sp.visible=false;
  sp.userData.dir=new THREE.Vector3(0,1,0);
  sp.userData.up=false;
  sp.userData.phaseKey='';
  scene.add(sp); skyMoon=sp;
}
// updateSunMode から呼ぶ: sun._moon(位置・満ち欠け)を月ビルボードへ反映。
// 位置と可視も ここで確定する（描画ループの camPos 追従はタブ非表示中に止まり得るため、
// updateSunMode 時点で即座に配置・表示しておく。ドームを有効化時に1回置くのと同じ考え）。
function _updateSkyMoon(){
  _ensureSkyMoon();
  const mo=(typeof sun!=='undefined')?sun._moon:null;
  skyMoon.userData.up = !!(mo && mo.dir && mo.altDeg>-1.0);
  const show = skyMoon.userData.up && (typeof env!=='undefined' && env.preset==='__sun');
  if(!show){ skyMoon.visible=false; return; }
  skyMoon.userData.dir.copy(mo.dir);
  if(typeof camPos!=='undefined') skyMoon.position.copy(camPos).addScaledVector(mo.dir, _SKY_MOON_DIST);
  skyMoon.material.opacity = (mo.skyOpacity!=null) ? mo.skyOpacity : 1;   // 昼は淡く / 夜はくっきり
  skyMoon.visible = true;
  // phase/fraction が変わったときだけテクスチャを描き直す(0.5%刻み)。
  const key=Math.round(mo.phase*200)+'/'+Math.round(mo.fraction*200);
  if(key!==skyMoon.userData.phaseKey){
    skyMoon.userData.phaseKey=key;
    const m=skyMoon.material.map;
    m.image=_drawMoonFace(mo.phase, mo.fraction);
    m.needsUpdate=true;
  }
}
// デバッグ: 月ビルボードの実状態を確認する（コンソールから __moonDbg()）。
window.__moonDbg = function(){
  if(!skyMoon) return 'skyMoon 未生成（日照モードをONにしてから）';
  const p=skyMoon.position, d=skyMoon.userData.dir;
  return {
    visible: skyMoon.visible, up: skyMoon.userData.up,
    inScene: !!(skyMoon.parent),
    dir: [ +d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2) ],
    pos: [ +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1) ],
    scale: skyMoon.scale.x, renderOrder: skyMoon.renderOrder,
    matVisible: skyMoon.material.visible, opacity: skyMoon.material.opacity,
    envPreset: (typeof env!=='undefined'?env.preset:'?'),
    sunActive: (typeof sun!=='undefined'?sun.active:'?'),
    moon: (typeof sun!=='undefined'?sun._moon:'?'),
    camFar: (typeof camera!=='undefined'?camera.far:'?')
  };
};
function _sunMakeLabel(text,color){
  const cv=document.createElement('canvas'); cv.width=cv.height=64; const x=cv.getContext('2d');
  x.fillStyle=color; x.font='bold 46px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  x.fillText(text,32,34);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),depthTest:false,depthWrite:false,transparent:true}));
  sp.renderOrder=9002; sp.scale.setScalar(sunViz.R*0.085); return sp;
}
function _sunMakeDot(color,mul=1){
  const cv=document.createElement('canvas'); cv.width=cv.height=64; const x=cv.getContext('2d');
  const g=x.createRadialGradient(32,32,0,32,32,30); g.addColorStop(0,'#ffffff'); g.addColorStop(0.35,color); g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g; x.fillRect(0,0,64,64);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),depthTest:false,depthWrite:false,transparent:true}));
  sp.renderOrder=9003; sp.scale.setScalar(sunViz.R*0.05*mul); return sp;
}
function _sunVizBuild(){
  if(sunViz.built) return;
  const R=sunViz.R, g=new THREE.Group(); g.frustumCulled=false;
  // 地平コンパス円 (y=0)
  const rp=[]; for(let i=0;i<=128;i++){ const a=i/128*Math.PI*2; rp.push(new THREE.Vector3(Math.sin(a)*R,0,-Math.cos(a)*R)); }
  sunViz.ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(rp),
    new THREE.LineBasicMaterial({color:0x66ccff,transparent:true,opacity:0.35,depthTest:false,depthWrite:false}));
  sunViz.ring.renderOrder=9000; sunViz.ring.frustumCulled=false; g.add(sunViz.ring);
  // 方位ラベル (北=-Z, 東=+X, 南=+Z, 西=-X)
  for(const [t,A,c] of [['N',0,'#ff6a6a'],['E',90,'#cfe6ff'],['S',180,'#cfe6ff'],['W',270,'#cfe6ff']]){
    const sp=_sunMakeLabel(t,c), ar=A*Math.PI/180;
    sp.position.set(Math.sin(ar)*R,0,-Math.cos(ar)*R); g.add(sp); sunViz.labels.push(sp);
  }
  // 太陽軌道: 全周(薄) ＋ 地平線上(明)
  sunViz.path=new THREE.Line(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({color:0x8899aa,transparent:true,opacity:0.40,depthTest:false,depthWrite:false}));
  sunViz.path.renderOrder=9001; sunViz.path.frustumCulled=false; g.add(sunViz.path);
  sunViz.arc=new THREE.Line(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({color:0xffd24a,transparent:true,opacity:0.95,depthTest:false,depthWrite:false}));
  sunViz.arc.renderOrder=9001; sunViz.arc.frustumCulled=false; g.add(sunViz.arc);
  // マーカー
  sunViz.mRise=_sunMakeDot('#ffd49a'); sunViz.mNoon=_sunMakeDot('#fff0b0');
  sunViz.mSet=_sunMakeDot('#ff9a6a'); sunViz.cur=_sunMakeDot('#ffffff',1.7);
  g.add(sunViz.mRise); g.add(sunViz.mNoon); g.add(sunViz.mSet); g.add(sunViz.cur);
  g.visible=false; scene.add(g); sunViz.group=g; sunViz.built=true;
}
function _sunVizSetVisible(v){ if(sunViz.group){ sunViz.group.visible=v; markDirty(6); } }
function _sunVizUpdate(curDir, times){
  if(!sunViz.built) return;
  const R=sunViz.R;
  // 軌道は日付/場所が変わったときだけ作り直す
  const key=`${sun.y}-${sun.mo}-${sun.d}-${sun.lat}-${sun.lng}`;
  if(key!==sun._vizKey){
    sun._vizKey=key;
    const full=[], above=[];
    for(let m=0;m<=1440;m+=8){
      const d=new Date(Date.UTC(sun.y,sun.mo-1,sun.d,0,0)+m*60000 - sun.tz*3600000);
      const w=_sunWorldDir(d), p=w.dir.clone().multiplyScalar(R);
      full.push(p); if(w.alt>=0) above.push(p);
    }
    sunViz.path.geometry.dispose(); sunViz.path.geometry=new THREE.BufferGeometry().setFromPoints(full);
    sunViz.arc.geometry.dispose();  sunViz.arc.geometry =new THREE.BufferGeometry().setFromPoints(above);
  }
  const place=(sp,dt)=>{ if(!sp) return; if(!dt||isNaN(dt.getTime())){ sp.visible=false; return; }
    sp.visible=true; sp.position.copy(_sunWorldDir(dt).dir.multiplyScalar(R)); };
  place(sunViz.mRise, times&&times.sunrise);
  place(sunViz.mNoon, times&&times.solarNoon);
  place(sunViz.mSet,  times&&times.sunset);
  if(sunViz.cur && curDir){ sunViz.cur.visible=true; sunViz.cur.position.copy(curDir.clone().multiplyScalar(R)); }
}

// ── Orthographic camera ──
let _useOrtho = false;
let _orthoSize = 8; // half-height of frustum in world units
const _orthoCamera = new THREE.OrthographicCamera(
  -_orthoSize*(innerWidth/innerHeight), _orthoSize*(innerWidth/innerHeight),
  _orthoSize, -_orthoSize, 0.001, 5000
);
function _syncOrthoCamera(){
  const aspect = innerWidth/innerHeight;
  _orthoCamera.left   = -_orthoSize*aspect;
  _orthoCamera.right  =  _orthoSize*aspect;
  _orthoCamera.top    =  _orthoSize;
  _orthoCamera.bottom = -_orthoSize;
  _orthoCamera.near   = -2000;
  _orthoCamera.far    =  2000;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  _orthoCamera.position.copy(camera.position).addScaledVector(fwd, -500);
  _orthoCamera.quaternion.copy(camera.quaternion);
  _orthoCamera.updateProjectionMatrix();
}
window.toggleProjection = function(){
  _useOrtho = !_useOrtho;
  if(_useOrtho){
    // Calibrate ortho frustum size to match current perspective view scale
    // Half-height at the nominal scene depth = depth * tan(fov/2)
    const depth = Math.max(0.5, msr.placeDepth || 4);
    _orthoSize = depth * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    _orthoSize = Math.max(0.5, Math.min(300, _orthoSize));
    _syncOrthoCamera();
  }
  const btn = document.getElementById('btn-projection');
  if(!btn) return;
  const isJa = window._lang === 'ja';
  if(_useOrtho){
    btn.textContent = isJa ? '⬜ 正投影' : '⬜ Ortho';
    btn.style.background = 'rgba(255,180,84,.2)';
    btn.style.borderColor = 'rgba(255,180,84,.55)';
    btn.style.color = '#ffd49a';
    btn.onmouseout = ()=>{ btn.style.background='rgba(255,180,84,.2)'; btn.style.borderColor='rgba(255,180,84,.55)'; };
  } else {
    btn.textContent = isJa ? '📐 パース' : '📐 Perspective';
    btn.style.background = 'rgba(20,20,22,.88)';
    btn.style.borderColor = 'rgba(255,255,255,.18)';
    btn.style.color = 'rgba(200,200,200,.85)';
    btn.onmouseout = ()=>{ btn.style.background='rgba(20,20,22,.88)'; btn.style.borderColor='rgba(255,255,255,.18)'; };
  }
  markDirty(8);
};

window.resetCameraToInitial = function(){
  // Leaving for "home" should also tidy up: hide the camera-animation
  // panel (it used to linger on the view) and release any locked-camera
  // snap-back hold, otherwise the engaged camera would immediately yank
  // the view back and the reset wouldn't stick.
  if(typeof _hideCamAnimPanel === 'function') _hideCamAnimPanel();
  if(typeof _engagedCamId !== 'undefined') _engagedCamId = null;
  camPos.copy(_initCamPos);
  setCamRotImmediate(_initYaw, _initPitch);
  showUndoToast(T('cam-reset-msg'));
  markDirty(10);
};

// Resize handler. iOS Safari fires `resize` on orientation change but
// the first dispatch frequently arrives with stale innerWidth /
// innerHeight values (the visual viewport hasn't finished rotating
// yet), which then locked the renderer at the wrong size and left
// black bands on the freshly rotated screen. Run the resize logic
// once immediately AND twice on a short timer to let the visual
// viewport settle, and also hook orientationchange + visualViewport
// so we don't depend on a single event source.
function _doViewportResize(){
  // 撮影(captureCamShot)中は renderer のサイズ/pixelRatio を固定した上でクロップする。
  // ここで setSize すると撮影中バッファが変わり出力が崩れるので何もしない（撮影終了時に
  // captureCamShot 側が現在サイズへ再フィットする）。
  if(window._captureBusy) return;
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  _syncOrthoCamera();
  markDirty(8);
}
window.addEventListener('resize', () => {
  _doViewportResize();
  // Re-run on the next two frames; on iOS the canvas dimensions
  // sometimes don't reflect the post-rotation viewport until layout
  // commits, leaving black bars otherwise.
  requestAnimationFrame(_doViewportResize);
  setTimeout(_doViewportResize, 250);
});
window.addEventListener('orientationchange', () => {
  // iOS Safari often does NOT fire a usable resize after a rotate
  // unless we wait — kick three deferred re-fits to catch the various
  // commit timings across iPhone / iPad / split-view.
  setTimeout(_doViewportResize,  50);
  setTimeout(_doViewportResize, 250);
  setTimeout(_doViewportResize, 600);
});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', _doViewportResize);
}

// ── Browser fullscreen toggle (phone / tablet) ──
// iOS Safari supports the Fullscreen API on iPhone since 16.4 (webkit-prefixed
// on documentElement). The topbar ⛶ button is shown only when (a) the API is
// actually present and (b) the device is touch — desktop already has F11.
// ?fstest=1 force-shows the button on desktop so the wiring can be verified
// with a real (trusted) click in Chrome.
window.toggleAppFullscreen = function(){
  const d  = document;
  const el = d.documentElement;
  // Primary mechanism = CSS "immersive" mode (hide the viewer's own top chrome).
  // This is what actually maximises the view on iPhone, which has no Fullscreen
  // API. We ALSO drive the real Fullscreen API where it exists (iPad / Android
  // Chrome) so those get true OS fullscreen on top of the immersive layout.
  const goImmersive = !d.body.classList.contains('immersive');
  d.body.classList.toggle('immersive', goImmersive);
  try {
    const fsEl = d.fullscreenElement || d.webkitFullscreenElement;
    if(goImmersive && !fsEl){
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if(req){
        const p = req.call(el);
        if(p && p.catch) p.catch(()=>{}); // user-gesture / permission denials are non-fatal
      }
    } else if(!goImmersive && fsEl){
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    }
  } catch(_){}
  // Entering/leaving immersive changes the usable viewport; refit the renderer
  // the same way orientation / fullscreen changes do (iOS commits the size late).
  if(typeof _doViewportResize === 'function'){
    _doViewportResize();
    setTimeout(_doViewportResize, 250);
  }
};
(function _initFullscreenButton(){
  const btn = document.getElementById('tb-fullscreen-btn');
  if(!btn) return;
  // Phone-only (user request 2026-06): show the fullscreen toggle on PHONES,
  // never on iPad/tablet (the iPad already uses the whole screen and the button
  // just clutters its top bar). A phone's SHORT screen edge is < 600 CSS px; an
  // iPad's is >= 768. Use a lenient touch test so phones that don't report
  // (any-hover:none) — e.g. some Android browsers — still qualify.
  // NOTE: we no longer gate on the Fullscreen API being present — iPhone Safari
  // has no such API, but toggleAppFullscreen() falls back to a CSS "immersive"
  // mode (hide the viewer chrome) that works there too, so the button is useful
  // on every phone.
  let touch = false;
  try { touch = window.matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints||0) > 0; } catch(_){}
  const shortEdge = Math.min(screen.width||9999, screen.height||9999);
  const isPhone = touch && shortEdge < 600;
  const force = /[?&]fstest=1/.test(location.search);
  if(isPhone || force) btn.style.display = 'inline-block';
  const upd = ()=>{
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.textContent = on ? '⤢' : '⛶';
    btn.title = on ? '全画面を終了' : '全画面表示';
    // Fullscreen change resizes the visual viewport; refit the renderer the
    // same way orientation changes do (iOS commits the new size late).
    if(typeof _doViewportResize === 'function'){
      _doViewportResize();
      setTimeout(_doViewportResize, 250);
    }
  };
  document.addEventListener('fullscreenchange', upd);
  document.addEventListener('webkitfullscreenchange', upd);
})();
// ── Touch tap feedback auto-clear (user 2026-06-27) ──
// On touch devices the press highlight on the top row (#view-tl-btns) and the
// bottom bar (#hud .cbar) used to STICK after a tap (iOS sticky :hover, and the
// top buttons' inline onmouseover setting an inline background). Show the press
// highlight for ~1s only: add a `.tap-fx` class on touchend and remove it after
// 1000ms, also resetting any inline hover background the top buttons applied.
(function _tapFlashAutoClear(){
  const coarse = window.matchMedia && window.matchMedia('(pointer:coarse) and (any-hover:none)').matches;
  if(!coarse) return;
  const SEL = '#view-tl-btns button, #hud .cbar button';
  const TOP_BASE_BG = 'rgba(20,20,22,.88)', TOP_BASE_BORDER = 'rgba(255,255,255,.18)';
  document.addEventListener('touchend', e=>{
    const btn = e.target.closest && e.target.closest(SEL);
    if(!btn) return;
    btn.classList.add('tap-fx');
    setTimeout(()=>{
      btn.classList.remove('tap-fx');
      // Top-row buttons set an inline hover bg via onmouseover (which iOS fires
      // on tap and never clears) — reset it so the highlight doesn't persist.
      if(btn.closest('#view-tl-btns')){
        btn.style.background = TOP_BASE_BG;
        btn.style.borderColor = TOP_BASE_BORDER;
      }
    }, 1000);
  }, {passive:true});
})();
// Move the 画質 / perf badge to the RIGHT END of the camera action row so the top
// controls read as one cohesive group instead of a separate floating chip in the
// corner (user request 2026-06). It becomes the last flex child of #view-tl-btns;
// CSS below (`#view-tl-btns > #qi-badge`) drops its fixed positioning so it flows
// inline. The #quality-panel still anchors under it (its JS reads the live rect).
(function _qiBadgeIntoActionRow(){
  const badge = document.getElementById('qi-badge');
  const row   = document.getElementById('view-tl-btns');
  if(badge && row) row.appendChild(badge);
  // ── iOS double-tap-zoom guard for the 画質 chip ──────────────────────────
  // User (2026-06, multiple devices, NOT just iPad): tapping the 画質 chip zooms
  // the whole top button row. It does NOT reproduce on desktop (mouse) — so it's
  // a touch-browser gesture (iOS synthesises a double-tap zoom on this small
  // control), and neither making it a <button> nor touch-action:manipulation
  // stopped it. The bullet-proof fix is to own the touch sequence: preventDefault
  // on touchend cancels ANY default gesture for that touch — including the zoom
  // AND the synthesised click — and we toggle the panel ourselves. The onclick
  // attribute still handles desktop mouse (no touchend there, so no double-fire).
  // Touches that move (a drag, not a tap) are ignored.
  if(badge){
    let _sx = 0, _sy = 0, _moved = false;
    badge.addEventListener('touchstart', function(e){
      const t = e.changedTouches[0]; _sx = t.clientX; _sy = t.clientY; _moved = false;
    }, { passive: true });
    badge.addEventListener('touchmove', function(e){
      const t = e.changedTouches[0];
      if(Math.abs(t.clientX - _sx) > 10 || Math.abs(t.clientY - _sy) > 10) _moved = true;
    }, { passive: true });
    badge.addEventListener('touchend', function(e){
      e.preventDefault();                 // kills the double-tap zoom + the synthesised click
      if(!_moved) toggleQualityPanel();   // do the tap action ourselves
    }, { passive: false });
  }
})();

const grid = new THREE.GridHelper(200, 200, 0x221100, 0x110800);
grid.position.y = -0.01; grid.visible = false; scene.add(grid);

