// ── Capture: render the scene into an offscreen canvas at full resolution,
// crop to the sensor aspect, apply WB tint, optionally surround with a metadata
// border frame (burn-in OUTSIDE the image so nothing covers the shot). ──
window.captureCamShot = async function(){
  if(!cam.active){ alert(T('cam-tool-shoot-warn')); return; }
  _camPullFields();

  // ── Render at the TARGET resolution directly, independent of viewport size.
  // We resize the renderer's drawing buffer to the target (PR=1), set the camera
  // aspect to the user's intended sensor aspect, and use the sensor-native FOV
  // (no viewport scaling). The whole drawing buffer becomes the captured frame
  // — no crop needed, and the JPEG is always full target resolution even if the
  // browser window is small.
  const target = _camTargetResolution();
  const oldPR     = renderer.getPixelRatio();
  const oldSize   = new THREE.Vector2();
  renderer.getSize(oldSize);
  const oldAspect = camera.aspect;
  const oldFov    = camera.fov;
  // FREEZE the camera pose at the instant 撮影 was pressed. The viewer drives the
  // camera with a smooth lerp (yaw/pitch/pos ease toward their targets over a few
  // hundred ms). captureCamShot renders, waits 90 ms for Spark's async sort, then
  // renders again — and during that wait a still-settling lerp would advance the
  // pose, so the saved JPEG framed a SLIGHTLY different shot than the live preview
  // showed at click time ("構図がずれて出力する"). Snapshot the exact pose now and
  // re-pin it before every capture render so the output matches the preview 1:1
  // (and Spark sorts against a stable pose).
  const _capPos  = camera.position.clone();
  const _capQuat = camera.quaternion.clone();
  const _pinPose = () => { camera.position.copy(_capPos); camera.quaternion.copy(_capQuat); camera.updateMatrixWorld(true); };

  // Hide HUD / left shot panel / vignette so they don't poison the source canvas
  const hud    = document.getElementById('cam-hud');
  const vig    = document.getElementById('motion-vignette');
  const info   = document.getElementById('cam-shot-panel');
  const canvas = renderer.domElement;
  const hudWasShown   = hud.style.display;
  const infoWasShown  = info ? info.style.display : 'none';
  const vigOpacity    = vig ? vig.style.opacity : '0';
  const canvasVisWas  = canvas.style.visibility;
  hud.style.display = 'none';
  if(info) info.style.display = 'none';
  if(vig)  vig.style.opacity = '0';
  // Hide the on-screen canvas so the user doesn't see the brief size change
  canvas.style.visibility = 'hidden';
  // Hide the 日照 3-D overlay (方位コンパス + 太陽軌道) so the previz helper
  // lines/labels are NOT baked into the captured JPEG. The sky dome + sun disc
  // (the actual lighting) live on env.mesh and stay visible.
  const _sunVizWasVisible = (typeof sunViz !== 'undefined' && sunViz.group) ? sunViz.group.visible : null;
  if(_sunVizWasVisible) sunViz.group.visible = false;
  // 区画パス・イベントアイコン — チェックON時のみ非表示
  const _chkHideOverlays = !!(document.getElementById('cm-hide-overlays') ||{}).checked;
  const _capHiddenLayers = [];
  if(_chkHideOverlays && typeof layers !== 'undefined'){
    for(const L of layers){
      if(!L || !L.mesh) continue;
      if(L.type === 'path' || L.type === 'event'){
        const prev = { layer: L, mesh: L.mesh.visible };
        L.mesh.visible = false;
        if(L.labelMesh){ prev.label = L.labelMesh.visible; L.labelMesh.visible = false; }
        if(L.eventGuide){ prev.guide = L.eventGuide.visible; L.eventGuide.visible = false; }
        _capHiddenLayers.push(prev);
      }
    }
  }

  // Render the capture from the LIVE drawing buffer — the SAME size the preview
  // uses — instead of resizing the renderer to the delivery resolution. Resizing
  // forced Spark to re-rasterise the splats at a resolution it had NOT settled
  // at, which shrank their on-screen coverage: 3DGS scenes lost their top/bottom
  // and the saved JPEG showed black bands the live preview never had (meshes,
  // having no resolution-dependent rasteriser, were unaffected — which is why
  // only the demo's splat background broke). We instead render the scene into the
  // safe-frame sub-rectangle (exactly what the preview shows, where Spark is
  // already correct) and SCALE that crop to the delivery resolution. Nothing
  // about the renderer's size / pixel-ratio / Spark state changes, so the capture
  // is the preview, pixel for pixel.
  const fr = _camFrameRect();                 // CSS px; aspect === cam.aspect
  const PR = renderer.getPixelRatio();        // live buffer = CSS px × PR
  // Use the camera's CURRENT vFOV (== what the live preview is rendering right
  // now), NOT a re-derived _camSensorVFovDeg(). captureCamShot() runs
  // _camPullFields() first, and if the UI fields are even slightly out of sync
  // with the live cam state (e.g. a scene loaded with a saved camera), re-deriving
  // the FOV yields a different zoom than the preview — the capture came out wider
  // than what was framed. oldFov is the exact value on the live camera, so the
  // capture matches the preview's zoom 1:1.
  // Re-apply the ENTIRE capture frame setup (pose, aspect, fov, viewport,
  // scissor) immediately before EVERY render. We render twice with a settle gap
  // for Spark's sort, and during that await the live animate loop keeps running
  // (rAF on device, the headless pump in tests) — and it resets camera.aspect to
  // the full-viewport aspect and the GL viewport to the whole canvas every frame.
  // If we only set this once up-front, the SECOND render inherited the loop's
  // full-viewport / 2.0-ish aspect, so the saved JPEG was a WIDER-FOV crop than
  // the 16:9 preview (near objects shoved toward the edge while far objects barely
  // moved — the "構図がずれる / 電柱だけ右にずれる" report). Re-pinning everything
  // before each render makes both renders use the exact frame settings.
  const _yFromBottom = innerHeight - fr.y - fr.h;
  const _applyCapFrame = () => {
    _pinPose();
    camera.aspect = fr.w / Math.max(1e-6, fr.h);
    camera.fov    = oldFov;
    camera.updateProjectionMatrix();
    renderer.setViewport(fr.x, _yFromBottom, fr.w, fr.h);
    renderer.setScissor(fr.x, _yFromBottom, fr.w, fr.h);
    renderer.setScissorTest(true);
  };
  _applyCapFrame();
  renderer.render(scene, camera);
  await new Promise(r2=>setTimeout(r2, 90));
  _applyCapFrame();   // ← critical: the animate loop ran during the await above
  renderer.render(scene, camera);
  renderer.setScissorTest(false);

  // Crop the frame-rect region out of the live canvas (intrinsic px = CSS × PR)
  // and scale it to the delivery resolution.
  const img = document.createElement('canvas');
  img.width  = target.w;
  img.height = target.h;
  const ictx = img.getContext('2d');
  ictx.imageSmoothingEnabled = true;
  ictx.imageSmoothingQuality = 'high';
  const _sx = Math.max(0, Math.round(fr.x * PR));
  const _sy = Math.max(0, Math.round(fr.y * PR));
  const _sw = Math.round(fr.w * PR);
  const _sh = Math.round(fr.h * PR);
  ictx.drawImage(canvas, _sx, _sy, _sw, _sh, 0, 0, target.w, target.h);
  // ── Environment scene-tint (matches live #env-tint overlay) ──
  // Applied BEFORE WB so the order is "scene lighting first, then camera correction".
  if(env.preset !== 'off' && ENV_PRESETS[env.preset] && ENV_PRESETS[env.preset].sceneTint){
    const t = ENV_PRESETS[env.preset].sceneTint;
    const k = Math.max(0, Math.min(2, env.intensity));
    const mix = (a, b) => a * (1 - Math.min(1, k)) + b * Math.min(1, k);
    let er = mix(1, t[0]), eg = mix(1, t[1]), eb = mix(1, t[2]);
    if(k > 1){
      const extra = k - 1;
      er *= (1 - extra * 0.5); eg *= (1 - extra * 0.5); eb *= (1 - extra * 0.5);
    }
    ictx.fillStyle = `rgb(${Math.round(Math.max(0,Math.min(1,er))*255)}, ` +
                     `${Math.round(Math.max(0,Math.min(1,eg))*255)}, ` +
                     `${Math.round(Math.max(0,Math.min(1,eb))*255)})`;
    ictx.globalCompositeOperation = 'multiply';
    ictx.fillRect(0, 0, target.w, target.h);
    ictx.globalCompositeOperation = 'source-over';
  }

  // ── WB tint via multiply composite (matches live overlay) ──
  if(cam.wb !== 5600){
    const m = _camWBMult(cam.wb);
    ictx.fillStyle = `rgb(${Math.round(m.r*255)}, ${Math.round(m.g*255)}, ${Math.round(m.b*255)})`;
    ictx.globalCompositeOperation = 'multiply';
    ictx.fillRect(0, 0, target.w, target.h);
    ictx.globalCompositeOperation = 'source-over';
  }

  // ── Optionally bake the grid / safe rectangles INTO the captured image ──
  if(cam.includeGrid) _drawGridOnCanvas(ictx, target.w, target.h);

  // WYSIWYG: the captured frame is the FULL target (= exactly what the live
  // safe-frame preview shows — same aspect, same FOV, same composition). We do
  // NOT auto-trim here: trimming the empty top changed the output aspect/res
  // (e.g. 16:9 1920×1080 → 1920×492), so the saved image no longer matched the
  // frame the user composed. Any empty/black region at the top is now visible
  // in the preview too, so it's composed out by the user (tilt / framing).
  const imgFinal = img;

  // Build final canvas: image alone, OR image + metadata border frame.
  let out;
  if(cam.burnin){
    out = composeBurnInFrame(imgFinal);
  } else {
    out = imgFinal;
  }

  // Restore live HUD / left info / vignette
  hud.style.display = hudWasShown || 'block';
  if(info) info.style.display = infoWasShown || 'block';
  if(vig) vig.style.opacity = vigOpacity;
  // Restore the 日照 3-D overlay hidden for the capture renders above.
  if(_sunVizWasVisible !== null && typeof sunViz !== 'undefined' && sunViz.group) sunViz.group.visible = _sunVizWasVisible;
  // Restore path/event layers hidden for the capture.
  for(const p of _capHiddenLayers){
    p.layer.mesh.visible = p.mesh;
    if(p.label !== undefined && p.layer.labelMesh) p.layer.labelMesh.visible = p.label;
    if(p.guide !== undefined && p.layer.eventGuide) p.layer.eventGuide.visible = p.guide;
  }
  // Restore camera intrinsics (aspect, fov) for live preview
  camera.aspect = oldAspect;
  camera.fov    = oldFov;
  camera.updateProjectionMatrix();
  // Restore renderer resolution to the user's selected quality scale.
  // (Adaptive low-res mode was removed; always restore at full PR.)
  const restorePR = Math.min(devicePixelRatio, _PR_CAP) * qualScale;
  renderer.setPixelRatio(restorePR);
  renderer.setSize(innerWidth, innerHeight);
  // Restore the on-screen viewport/scissor too (the animate loop re-applies it
  // each frame, but reset here so any render before the next frame is correct).
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setScissor(0, 0, innerWidth, innerHeight);
  // Re-show the on-screen canvas
  canvas.style.visibility = canvasVisWas || '';
  // Re-apply live camera math so the safe-frame keeps its sensor-native vertical FOV
  if(typeof applyCamSettings === 'function'){ try{ applyCamSettings(); }catch(_){} }
  markDirty(8);

  const blob0 = await new Promise(r2=>out.toBlob(r2, 'image/jpeg', cam.jpegQ));
  // Inject our camera-state JSON into a JPEG COM segment so the file can be
  // dropped back onto the Salvage zone later to restore camera position + settings.
  const blob = await embedLocahunMetadata(blob0);
  // Filename = ショット名 (or 'shot' if blank). Repeats in the same session get
  // _v2, _v3 … suffixes so nothing overwrites silently.
  const fileName = _nextCaptureFilename(cam.shot);

  // On iPad / iPhone / Android the classic `<a download>` route doesn't put
  // the JPEG into Photos / Album — iOS Safari either previews the file or
  // shoves it into the Files app's Downloads folder, which the user then
  // has to manually move. The Web Share API with a File payload triggers
  // iOS's share sheet (which includes "画像を保存" / "Save to Photos")
  // and Android's equivalent. Detect touch devices and use share-first;
  // fall back to download if `navigator.share` isn't available or the
  // user cancels.
  const _isTouchDevice = window.matchMedia('(pointer:coarse) and (any-hover:none)').matches;
  const _shotFile = (typeof File !== 'undefined')
    ? new File([blob], fileName, { type: 'image/jpeg' })
    : null;
  let _saved = false;
  if(_isTouchDevice && _shotFile && navigator.share &&
     navigator.canShare && navigator.canShare({ files: [_shotFile] })){
    try {
      await navigator.share({
        files: [_shotFile],
        title: 'ロケハン3D',
        text: fileName,
      });
      _saved = true;
      showUndoToast('📸 ' + fileName + ' — 共有メニューから「画像を保存」');
    } catch(e){
      // AbortError = user dismissed the share sheet without picking an
      // action. Treat as "nothing happened" rather than falling back to
      // download (which would surprise-save the file twice).
      if(e && e.name === 'AbortError'){
        _saved = true;
        showUndoToast('📸 保存をキャンセルしました');
      } else {
        console.warn('[capture] navigator.share failed, falling back to download:', e);
      }
    }
  }
  if(!_saved){
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    showUndoToast('📸 ' + fileName);
  }
};

