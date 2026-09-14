# Mobile controls and vehicle review, 2026-09-14

## Changes

- Camera Work joins the fixed bottom toolbar. Opening an inspector does not move its buttons.
- Touch inspectors share one visible slot; logical camera settings are retained on tablets.
- Quality chip touchend is included, since its existing handler suppresses click.
- Circular jump control accepts a second finger while the first holds the movement joystick.
- Tap intent consumes small touch drift before look rotation; a deliberate second tap is accepted.
- Verified navigation routes may be up to 100m rather than 30m. Coverage, wall checks, bounded work and disconnected-floor rejection remain mandatory. Unsupported destinations are not teleported to.
- Vehicle mirrors, cab wheel arches, dual rear tires, door details, front glazing and vehicle-specific grille/lamp proportions updated. Mirror extensions are not part of the catalog body width.

## Manufacturer references inspected

- Toyota HiAce exterior photos: https://toyota.jp/hiacevan/gallery/
- Toyota HiAce body dimensions: https://toyota.jp/pages/contents/hiacevan/005_b_023/4.0/pdf/spec/hiacevan_spec_202606.pdf
- Toyota Dyna cargo exterior: https://toyota.jp/dynacargo2t/
- Toyota Dyna specifications: https://toyota.jp/pages/contents/dynacargo2t/001_b_001/pdf/dynacargo2t_spec_202607.pdf
- Isuzu Forward cab: https://www.isuzu.co.jp/product/forward_post/variation/cab.html
- Isuzu Forward cargo: https://www.isuzu.co.jp/product/forward_post/variation/f_cargo.html

These are original lightweight planning representations, not manufacturer CAD or exact trim replicas. No manufacturer photography or geometry is embedded. Existing nominal body dimensions are retained; external mirrors increase placement clearance requirements.

## Verification and limits

- Chrome touch emulation: 12 portrait/landscape phone and tablet sizes, 54 individual inspectors, 960 tool subsets in forward/reverse order with tablet layers open/closed. No overlap, offscreen controls, duplicate visible inspectors or page exceptions in that matrix.
- Real two-finger CDP events: sprint remains held while jump is pressed/released/repeated; cancel clears input. Separate full-viewer fixture verifies airborne state and landing.
- Full viewer with real Rapier and synthetic floor: measured point placement, hold preview, tap travel, look rotation during travel, wall stopping, wall-to-floor target, and approximately 32m travel succeed.
- Vehicle geometry tests enforce finite geometry, feet at zero, nominal body dimensions excluding mirrors, fewer than 100 meshes and 12,000 triangles per model. Blender front/side/three-quarter images are in `docs/vehicle-review`.
- Renderer, Spark budgets and splat assets are not changed.
- This is Chrome emulation, NOT physical iPhone/iPad Safari verification. Native safe areas, software keyboard, all nested settings, arbitrary tool ordering and scan-specific route coverage are not exhaustively certified.
- Local online HTML synchronization is not a production deployment. No push/deploy is performed by these changes.

## Reproduce

## Publication verified

- Offline source commit: `638ed04`; online sync: `9548cfa`. Both pushed.
- Standalone Worker: `449a398b-3b07-41d2-ac23-24b03a3d4e7b`.
- Standalone release: `7e07874f8fb94efc93dccfea1d3b460e3bd5d78bfdfec9b966c92397cddd5982`.
- Online release: `301498a37ad73c1564595adbeee73efc030034d4f9163df409dc4d7c29abf905`.
- Online Actions run `34780029626` completed successfully. Published viewer hash/stamp, toolbar interaction and zero page exceptions verified. Standalone demo screenshot reviewed and file-origin startup update passed.
- The standalone wrapper returned a nonzero exit after promotion without a final diagnostic; direct live HTML hash, complete release-asset verification, startup update and demo UI checks were subsequently rerun and passed.
- Dropbox: 10 known-old viewer HTML files replaced, backups at `F:/Codex/locahun-navigation-20260913/distribution-1789330641859`; 18,282 non-viewer files retained unchanged metadata.

## Commands

```powershell
node scripts/test-touch-feature-layout.mjs
node scripts/test-mobile-multitouch.mjs
node scripts/test-jump-button-browser.mjs
node scripts/test-click-navigation-browser.mjs --gpu-granted
node --test scripts/test-equipment-models.mjs
node scripts/generate-equipment-assets.mjs --vehicles
& 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --factory-startup -b -t 4 --python scripts/render-vehicle-review.py
node scripts/generate-equipment-assets.mjs --pack
node scripts/sync-online-viewer.mjs
```
