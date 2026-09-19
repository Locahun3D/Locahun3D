# Layer/header anchor correction

Status: published to standalone and online; distributed to 16 Dropbox viewer files.

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
- This verifies layout in Chrome, including emulated touch devices, not physical iPad Safari. The sample viewer file served at localhost8771 was included in the Dropbox update; an already open page must be reloaded.

## Publication

- Source commit: f5ed561. Online commit: 1388375; GitHub Actions35422857011 succeeded.
- Standalone worker:72f4de78-ea84-4644-98a2-818eaea128bf.
- Release:1a6d4d7224649cfeb64996a07375471d03d678db1334d624945c18ae3bd37f95.
- Standalone SHA256:5d3b506056e6e40c63f40fe442d1ce42cfd5c657dcfe7b5e347b6ebd8cfc9b62. Release wrapper passed111 checks and candidate/live asset and file-origin update verification. Live panel checks80 passed without errors.
- Online SHA256:1d6b8eaf20d0fe48c31b2a72874e6fa61a87e42bd5f0913c2c6313fe64e14dee. Public HTTP200 bytes match the synchronized file. Live panel checks80 passed with zero failures/page errors; compact desktop and expanded tablet/sun screenshots visually inspected.
- Distribution inventory increased from12to16; every target was reviewed against the previous SHA256 before updating. All16 updated;18479 non-viewer file metadata entries unchanged.
- Backup/report:F:/Codex/locahun-navigation-20260913/distribution-1789794287681.
