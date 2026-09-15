# Camera collision retry, 2026-09-15

## Locally verified fix

- Reproduced: after a transient preparation failure, switching camera collision OFF then ON did not retry. The setter changed only the enabled flag, while automatic retries remained suppressed by failedKey/deferredSignature.
- OFF to ON now invokes the existing cache-only preparation path. Repeated ON calls do not rebuild a ready core. No source bake, renderer change or background retry loop was added.
- Regression failed before the fix and passed after it. Whole collision, automatic budget and click-input suites: 50 passed. Camera physics, bridge and lifecycle suites: 14 passed.
- Actual installed Chrome, canonical template and real Rapier: simulated preparation failure, clicked the quality-panel OFF/ON control, observed ON/ready and verified a camera move stopped at the wall. Screenshot inspected: F:/Codex/camera-collision-20260911/retry-ready.png. Synthetic scene only; not the unidentified customer scene.
- Build and git diff --check passed. No layout changes.

## Publication verified

- Source b7865cb pushed. Guarded standalone release passed 111 release tests, preview verification and file-origin update verification, then promoted Worker 1bf3c9bb-6da0-4035-92a7-cd0b7160473c. Public release 174f666f087a26332ee8b9812eb7c56582fffc9252bffda9a46d9709127169f7; HTML SHA256 97f6e9ff7a54cf633147724d28c47594ce22fbfb793cc429941535d93875d383.
- Online sync regression: 309 pass, 1 skipped, 1 TODO. Online commit 4e17fa5 pushed; Actions 34954506530 completed successfully. Public https://locahun3d.com/viewer/offline-viewer returned HTTP 200 and exactly matched the generated online HTML SHA256 5b37f0d40e8ba24e5bd3aebd484a6e60bc8d4b9480baba58b40449acb269173d (8557178 bytes).
- Updated all 10 inventoried Dropbox viewers after checking the published stable manifest and exact old hashes. Backup: F:/Codex/locahun-navigation-20260913/distribution-1789465654473. Verified 18355 protected non-viewer files unchanged.
- Workflow browser fixture now holds actual PUT or GET requests before cancellation, then releases late responses and verifies no attachment and successful retry. Passed at widths 1440, 820 and 390; no page errors. Inspected 390-cancel-PUT.png: cancellation feedback and controls fit without overlap. Controlled browser fixture only, not production mid-byte cancellation or physical iOS.

## Remaining

- Identify and reproduce the reported scene that stays unready. Missing collision data is not repaired by a cache retry; ordinary viewing must not trigger a heavy bake.
- Physical iPhone/iPad navigation and layout remain unverified.
- Workflow production mid-transfer cancellation, forced session expiry, 2GiB and separate physical devices remain unverified. No new customer uploads or listing changes. Isolated cancellation/recovery coverage is now verified, as described above.
