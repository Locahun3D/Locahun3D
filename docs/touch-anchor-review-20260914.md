# Touch panel anchor correction

## Scope

- Removed the recent uniform camera/daylight inspector position and width override.
- Tablet layers meet the measured header bottom, including after rotation. Their width stays outside the fixed central toolbar.
- Camera keeps the right edge and only clears the top toolbar when they intersect horizontally.
- Daylight returns to the right, above the bottom toolbar. Panels scroll within the available height.
- Landscape elevation controls clear the inspectors and bottom toolbar.
- Desktop rules, renderer, navigation, avatar and vehicle assets are unchanged.

## Verification

- `node scripts/test-touch-panel-anchors.mjs`: 34 checks pass, including tablet header attachment, portrait/landscape, expanded/collapsed layers, actual button hit testing and desktop.
- `node scripts/test-touch-feature-layout.mjs`: 54 checks and 960 tool/layer combinations pass across 12 viewports, no page errors.
- `node --test scripts/test-touch-panel-order.mjs scripts/test-mobile-multitouch.mjs`: 2 pass.
- Online `python scripts/design-fb-audit.py`: 29 OK, 0 NG.
- `node build.mjs` and `git diff --check` pass.
- Screenshots in `docs/touch-anchor-review` reviewed for phone portrait/landscape, tablet and desktop.

This is installed desktop Chrome with emulated touch/viewport sizes, not physical iOS Safari. The rebuilt local HTML is verified; this correction has not been deployed or copied to Dropbox.
