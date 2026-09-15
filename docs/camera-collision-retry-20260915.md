# Camera collision retry, 2026-09-15

## Locally verified fix

- Reproduced: after a transient preparation failure, switching camera collision OFF then ON did not retry. The setter changed only the enabled flag, while automatic retries remained suppressed by failedKey/deferredSignature.
- OFF to ON now invokes the existing cache-only preparation path. Repeated ON calls do not rebuild a ready core. No source bake, renderer change or background retry loop was added.
- Regression failed before the fix and passed after it. Whole collision, automatic budget and click-input suites: 50 passed. Camera physics, bridge and lifecycle suites: 14 passed.
- Actual installed Chrome, canonical template and real Rapier: simulated preparation failure, clicked the quality-panel OFF/ON control, observed ON/ready and verified a camera move stopped at the wall. Screenshot inspected: F:/Codex/camera-collision-20260911/retry-ready.png. Synthetic scene only; not the unidentified customer scene.
- Build and git diff --check passed. No layout changes. Not pushed or deployed in this step.

## Remaining

- Identify and reproduce the reported scene that stays unready. Missing collision data is not repaired by a cache retry; ordinary viewing must not trigger a heavy bake.
- Physical iPhone/iPad navigation and layout remain unverified.
- Dropbox read-only inventory found 10 viewers, all SHA256 0fe4dcd34ad1d70220e8a0a843c3acdf2d6382f42b99c8a271eab47854ca37bc. No files were copied. Existing update-dropbox-viewers.mjs expects a different old hash and requires source equality with the published stable manifest. Review the distribution baseline and publish/verify before copying; do not bypass these guards.
- Workflow mid-transfer cancellation, forced session expiry, 2GiB and separate physical devices remain unverified. No new customer uploads or listing changes.
