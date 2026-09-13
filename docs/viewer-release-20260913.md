# Viewer Release 2026-09-13

## Shipped Runtime

- Original Spark renderer retained; no new renderer or upscaling experiment enabled.
- Compact model categories, actual model thumbnails and long-press placement.
- Existing figure-based 1.65m avatar, restrained locomotion and right-bottom jump control.
- Phone quality/layer controls hidden; tablet controls retained. Toolbars stay centered.
- Touch measurement, fixed-noon initial sunlight, viewport-safe touch controls.
- Click/hold destination preview, ground +1.8m camera travel, look changes during travel.
- Source-bound regional navigation is optional and loaded only on demand.
- ZIP import/export preserves navigation sidecars; Lite Save does not fetch a streamed RAD.

## Preparation

`scripts/prepare-local-navigation.mjs --root PROJECT --output NEW_JSON --regions BOUNDS_JSON`
prepares navigation on the authoring PC. BOUNDS_JSON contains 1-32 world-space
bounding boxes, each `[[minX,minY,minZ],[maxX,maxY,maxZ]]`, maximum 32m in X/Z.
It writes paired LNV/LCP assets beside NEW_JSON, retaining a coarse ordinary
collision cache rather than installing fine collision throughout the viewer.

`scripts/apply-local-navigation.mjs --root PROJECT --prepared NEW_JSON` validates
the source inventory and revision, copies verified sidecars, and saves through
the local server's history/revision mechanism. It refuses an active server lock.
Do not modify a saved scene after preparing and before applying.

Regions do not yet form a cross-region navigation graph. Each accepted journey
must fit a single region and be at most 30m. Changed geometry invalidates routes.
No private project or regional scan payload is published with the viewer.

## Verification

- Real studio RAD: click/look/hold/touch stairs; ZIP roundtrip; two local-server
  restarts and saves with a generated 0.25m coarse cache plus fine sidecars.
- Public demo comparison: same 0.25m collision/129082 boxes and pixel ratio;
  sampled p95 frame interval approximately 16.8ms in both arms. This is one
  desktop Chrome comparison, not a universal performance guarantee.
- 147 navigation/packaging/input tests; 34 sync tests; release gate 109 tests.
- General suite: 307 passed, one skipped and one TODO; zero failures.
- Responsive tools: 18 viewport/panel combinations; actual mouse/touch tool,
  measurement and jump interactions in Chrome. Physical iPad Safari unverified.

## Publication

Standalone Worker `4de21cd5-0f74-4a86-a37c-3447eceff4f1`, release
`b4483955e3d9b7eac965737afe9e641cc6a45c54ad6ebd812ae10d36749d2f01`.
Live file startup updater and immutable assets verified. Online viewer commit
`3c0dae2` deployed successfully (GitHub Actions run 34738463032). Live online
HTML SHA-256 is `1fe621d509071108d58a812aa9764df0d64fa39d405c1e951b261da6a5347d87`.
Source commit `be27b8d` pushed. Ten known Dropbox viewer HTML files updated
with backups; project data was not edited. The 2FStudio server helpers were
updated for next launch without interrupting its active editing session.

Post-deployment public demo check: demo-release-1789275099441, nonblank image,
no page errors, collision ready in 1204ms in this run. Physical iPad Safari and
cross-region journeys remain unverified/unsupported as stated above. Regional
studio preparation was tested on copies, not applied to the active user's scene.
