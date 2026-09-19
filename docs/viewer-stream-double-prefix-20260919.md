# Protected autoload stream prefix

Status: approved, pushed and deployed to the online property viewer. Source bbcfb4e; online 56654a2; deployment35425278862 succeeded. Standalone/Dropbox distribution was not changed in this release.

## Reproduction and correction

Protected autoload stripped only the api/r2 prefix before adding api/viewer-stream. An input already starting with /api/viewer-stream therefore became /api/viewer-stream/api/viewer-stream and requested the wrong object key.

In src/js/292_demo_scene_showcase.js the prefix match now accepts both r2 and viewer-stream. Absolute HTTP(S), blob URLs and unprotected autoload remain unchanged. No rendering, authentication, permission or scene-data changes.

## Evidence

- Regression test failed on the original code with the duplicated stream prefix.
- scripts/test-autoload-stream-url.mjs executes the actual deferred startup callback and captures loadFromURL arguments.
- 20 cases per artifact (protected/unprotected, existing stream paths, legacy r2 paths, raw keys, leading slashes, queries, HTTP(S), blob, autoname).
- Source, standalone build, synchronized online build: 60 checks passed.
- node build.mjs and sync-online-viewer.sh succeeded.
- Online output SHA256: 19dd5eee67c215720eb1021b9805a63b3e1dd1b687985eee6fa6f4df3bb81f7e.

## Production verification

- Public online HTML returned HTTP200 with SHA256 matching the synchronized build above.
- Authenticated Chrome admin preview for shinjuku-kabuki-gate opened successfully. Its normal click handler used a signed asset URL; that path rendered the initial arch-facing view.
- Separately navigated to the preview's actual link target with autoload=/api/viewer-stream/assets/splat/9BV2JZVFZI-ShinjukuKabukiGate.zip and protected=1, testing the affected route without the signed-URL handler.
- Stream-path loading completed and the viewer reported ZIP restored (one file). Screenshot visually confirmed the arch-facing initial view with the full 3D street scene.
- URL regression checks:60 passed immediately before publication. Other individual properties have not all been visually re-tested; do not claim an all-property visual audit.

## Further regression coverage

Follow the existing online deployment workflow and verify the public HTML matches the synchronized build. Open the Kabukicho Gate property with authorized access; verify the stream request has one prefix and the initial arch-facing camera displays the scene. Check the five newly registered properties and Shibuya crossing separately before claiming all scenes render. Current evidence proves URL routing only, not authenticated production scene rendering.

The user-referenced F:/Claude/docs/fix_viewer_stream_double_prefix.md was absent on this PC; the pasted instructions supplied the report.
