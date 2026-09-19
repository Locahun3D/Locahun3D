// ── Visible-viewport shell (touch devices) ──
// iPad browsers can lay the page out at a height that includes the area under
// their own toolbars (and iOS can leave the page panned after the keyboard
// closes). Every bottom-anchored control (joystick, ▲▼, bottom bar, camera
// panel) then lands partly off-screen. Instead of correcting each control,
// size <body> to the area the user can actually see and make it the
// containing block for all position:fixed UI (see 065_visible_viewport.css).
// One measurement, applied everywhere; no iPad user-agent sniffing.
(function(){
  const root = document.documentElement;
  const touch = window.matchMedia ? matchMedia('(pointer:coarse) and (any-hover:none)') : null;
  const debug = /[?&]vvdebug=1\b/.test(location.search);
  let frame = 0, debugBox = null, lastKey = '';

  function editing(){
    const el = document.activeElement;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  function measure(){
    frame = 0;
    const active = !!(touch && touch.matches);
    root.classList.toggle('vv-shell', active);
    const vv = window.visualViewport;
    const layoutH = Math.max(1, innerHeight);
    const top = active && vv && Number.isFinite(vv.offsetTop) ? Math.max(0, vv.offsetTop) : 0;
    const height = active && vv && Number.isFinite(vv.height) && vv.height > 0 ? Math.min(layoutH, vv.height) : layoutH;
    root.style.setProperty('--vv-top', top + 'px');
    root.style.setProperty('--vv-height', height + 'px');
    root.style.setProperty('--vv-hidden-bottom', Math.max(0, layoutH - top - height) + 'px');
    // Let the renderer re-fit to the new visible size (070_3d.js listens to resize).
    const key = active + ':' + Math.round(top) + ':' + Math.round(height);
    if(key !== lastKey){ const first = !lastKey; lastKey = key; if(!first || active) dispatchEvent(new Event('resize')); }
    // iOS keeps the page panned after the software keyboard closes; undo it.
    if(active && !editing() && (scrollX || scrollY)) window.scrollTo(0, 0);
    if(debug) paintDebug(vv, layoutH, top, height);
  }
  function schedule(){ if(!frame) frame = requestAnimationFrame(measure); }
  function paintDebug(vv, layoutH, top, height){
    if(!debugBox){
      debugBox = document.createElement('pre');
      debugBox.id = 'vv-debug';
      debugBox.style.cssText = 'position:fixed;left:8px;top:52px;z-index:2147483647;margin:0;padding:6px 8px;'
        + 'background:rgba(0,0,0,.78);color:#8f8;font:11px/1.4 monospace;pointer-events:none;white-space:pre';
      document.body.appendChild(debugBox);
    }
    const probe = document.getElementById('joy');
    const r = probe && probe.getBoundingClientRect();
    debugBox.textContent = [
      'shell ' + root.classList.contains('vv-shell') + '  touch ' + !!(touch && touch.matches),
      'inner ' + innerWidth + 'x' + innerHeight + '  client ' + root.clientWidth + 'x' + root.clientHeight,
      'vv ' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' top ' + Math.round(vv.offsetTop) + ' scale ' + vv.scale : 'none'),
      'used top ' + Math.round(top) + ' height ' + Math.round(height) + ' hidden ' + Math.round(layoutH - top - height),
      'scroll ' + scrollX + ',' + scrollY + '  body ' + document.body.getBoundingClientRect().height,
      'joy bottom ' + (r ? Math.round(r.bottom) : '-') + '  iPad ' + (typeof _isIPad !== 'undefined' && _isIPad),
    ].join('\n');
  }

  measure();
  addEventListener('resize', schedule);
  addEventListener('orientationchange', () => { schedule(); setTimeout(schedule, 250); setTimeout(schedule, 600); });
  addEventListener('pageshow', schedule);
  addEventListener('scroll', schedule, {passive:true});
  document.addEventListener('focusout', () => setTimeout(schedule, 60));
  if(window.visualViewport){
    visualViewport.addEventListener('resize', schedule);
    visualViewport.addEventListener('scroll', schedule);
  }
  if(touch){
    if(touch.addEventListener) touch.addEventListener('change', schedule);
    else if(touch.addListener) touch.addListener(schedule);
  }
  window._visibleViewportSize = function(){
    if(!root.classList.contains('vv-shell')) return null;
    const r = document.body.getBoundingClientRect();
    return {width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height))};
  };
})();
