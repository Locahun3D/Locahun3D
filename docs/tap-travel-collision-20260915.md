# Tap travel correction, 2026-09-15

## Scope

- Tap/click travel bypasses collision sweeps, body clearance and corridor routing. Ordinary free-camera and avatar collision remain enabled.
- Destination selection still requires a real surface/floor hit and ends at floor + 1.8 m. The existing 30 m limit remains.
- Independent taps are no longer discarded by the 300 ms double-tap filter; synthetic mouse events following touch remain suppressed.
- Ground preparation no longer discards a pending tap solely because the view rotated. New intent, scene replacement and active tool ownership still invalidate it.
- No renderer or layout changes. Local build only; not deployed.

## Verification

- 49 focused navigation/input/camera collision tests passed.
- `node scripts/test-click-navigation-browser.mjs --gpu-granted` passed using Chrome with native touch input, a synthetic floor and real Rapier.
- Browser scenarios include touch rotation followed immediately by a tap, eight further rapid taps during travel, unobstructed travel through a wall barrier, 3/10/20 m travel, held destination preview, measurement taps, tool interaction and jump.
- Browser errors: zero. Rotation/rapid-tap screenshot inspected.
- Evidence: `F:/Codex/3dgs-renderer-research-20260911/click-browser-1789469849097`.
- `node build.mjs` and `git diff --check` passed.
- Physical iPhone/iPad and production/private 3DGS scene verification have not been performed for this change. Browser fixture coverage does not establish performance or floor-picking quality in every scan.
