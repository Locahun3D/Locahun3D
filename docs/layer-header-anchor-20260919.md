# Layer/header anchor correction

Status: local build only, not published or distributed.

## Cause

The width-only media query at max-width1100px forced layer top to128px. Previous overrides applied only to coarse-pointer devices. At the reported desktop viewport722x414, header bottom45px and layer top128px left an83px gap. Prior desktop coverage used only1440x900.

## Change

- Remove the128px override, not just override it again.
- One base layer top uses the measured header bottom for all input types. Header ResizeObserver now updates desktop as well as touch devices.
- Remove duplicate tablet positioning rules; retain phone hiding and iPad visibility rules.
- Compact desktop top controls reserve the layer column even when collapsed, avoiding overlap without shifting on layer open/close. Wide desktop layout unchanged.

## Verification

- New assertion failed before the fix: pc722x414 layer128/header45.
- Expanded Chrome canonical-template checks:80 cases passed, zero page errors. Desktop722,900,1100,1101,1440 widths; existing phone/tablet rotations and panel states retained.
- Desktop header height changed45to63px: layer followed to63px.
- Screenshot `docs/v1-panel-review/pc-722-414-header-connected.png` inspected: connected layer and unobstructed top controls.
- `node build.mjs`, `git diff --check`, design-fb-audit29OK/0NG passed.
- This verifies canonical-source layout in Chrome, not physical iPad Safari or the previously distributed localhost8771 copy. That copy still requires the next authorized release/distribution update.
