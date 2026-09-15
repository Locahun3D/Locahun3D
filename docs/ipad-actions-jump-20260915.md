# iPad layer actions and running jump

## Fixes verified locally

- Reproduced model-add button hidden at iPad1180x650. v1 iPad override restored the layer panel but left its footer and model menu hidden by phone CSS. Restore expanded footer and open menu only for iPad. Camera-save device gate now exempts iPad from the performance phone tier.
- Actual canonical app in Chrome touch contexts1180x650,650x1180,820x1180,1180x820: tap model menu, choose cube, native CDP touch hold creates a cube layer; tap camera-save creates a camera layer. No page errors. Screenshots in docs/ipad-actions-review. Physical Safari not exercised.
- Jump button previously depended on synthesized click, unreliable for secondary touch while joystick is held. Pointerdown now queues jump including non-primary touches. Suppress release-generated click to avoid a second jump; keyboard activation remains available. Regression failed before fix and passes at four sizes; running input preserved. This verifies input wiring, not physical-device running animation.
- Existing64 panel layout combinations pass, no page errors. Equipment menu desktop/portrait/landscape tests pass. Design audit29OK/0NG. Build and diff check pass.

## Recording report

- PC Chrome canonical app, synthetic red cube and two-key1s camera work: MP4 exported31444bytes, decoded and played, model visible (8648red pixels). Manual stop also saves nonempty MP4 and restores state. Screenshot docs/camera-export-review/playback.png inspected.
- No recording runtime changes made because reported failure has not been reproduced. Asked user for device and whether start, stop/save or playback fails. This is not a production3DGS or physicaliPad recording test.

## Publication

- Local source and generated standalone HTML updated. These changes have not been pushed, deployed or distributed to Dropbox yet.
