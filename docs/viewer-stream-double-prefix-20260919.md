# Protected autoload stream prefix

Status: source fixed, both viewer variants built, online working copy synchronized. Not pushed or deployed; awaiting publication confirmation.

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

## After publication approval

Follow the existing online deployment workflow and verify the public HTML matches the synchronized build. Open the Kabukicho Gate property with authorized access; verify the stream request has one prefix and the initial arch-facing camera displays the scene. Check the five newly registered properties and Shibuya crossing separately before claiming all scenes render. Current evidence proves URL routing only, not authenticated production scene rendering.

The user-referenced F:/Claude/docs/fix_viewer_stream_double_prefix.md was absent on this PC; the pasted instructions supplied the report.
