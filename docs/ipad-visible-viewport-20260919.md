# iPad: bottom controls hidden under the browser toolbar (2026-09-19)

## Symptom
iPad landscape (Safari/Chrome with tabs + address bar): joystick, ▲▼ pad and the bottom of the camera panel were cut off at the bottom edge.

## Cause
iOS browsers report the visible height to scripts (`innerHeight`, `visualViewport.height`), but CSS lays out `position:fixed` / `100vh` / `inset:0` against a taller layout viewport that includes the toolbar area. The old joystick correction (`--joy-viewport-bottom`) subtracted `innerHeight - visualViewport.height`, which is 0 in this state, so nothing moved. Other controls had no correction at all.

## Fix
`src/js/409_visible_viewport.js` + `src/css/065_visible_viewport.css`: on touch devices `<body>` is sized to the visible area (`min(innerHeight, visualViewport.height)`, offset by `visualViewport.offsetTop`) and gets `transform:translateZ(0)`, which makes it the containing block for every fixed control. All bottom anchors now resolve against the visible edge; no per-control patches, no iPad user-agent sniffing. The page is also scrolled back to 0 after the software keyboard closes. Desktop is unchanged.

## Verification
`node scripts/test-visible-viewport.mjs <built html>` emulates iOS semantics (script height 115 px shorter than CSS layout height). Before: joystick bottom 796 px vs visible 705 px. After: 681 px; no fixed element below the visible edge in landscape/portrait; desktop unchanged. Existing `test-joystick-viewport`, `test-v1-panel-anchors` (80 checks), `test-ipad-layer-actions`, `test-mobile-toolbar-spacing` pass.

Real-device check: open the viewer with `?vvdebug=1` to show the measured values (inner / client / visualViewport / body height / joystick bottom).
