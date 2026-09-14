# Requested v1.0 restoration

The owner requested the designated v1.0 state after rejecting the later touch UI changes.

- Baseline: c3a773f25a298948837ca9b4dc01fc8645c0dc57.
- Entire `src` tree, including vehicle assets, matches that baseline. No selective new UI fixes retained.
- Administrative upload/workflow implementation remains unchanged.
- Restored by explicit revert commits, preserving repository history and unrelated work.
- Sync regression: 307 passed, 1 skipped, 1 TODO, 0 failed. Standalone release tests: 109 passed. v1.0 notes/browser test passed.
- Standalone deployed Worker: be9e9db9-4a7f-4b32-b0a6-9c8af290b278.
- Release: fae8b1459d94e87b2cd509dbb452726bebc1f3fd7f7217b46f16ab792afb1c0a.
- Viewer SHA256: bd2f9ed1842ef0c5761977c24cf1d1b8644b55561994ff9b3352b0197311c37d.
- Official release assets and file-origin automatic update verified by deployment wrapper.
- Online restoration pushed as 624dadd; Actions34798086024 succeeded. Published release93f2f9f9cbede78e9d7fa8831c0ee1561fe73b327cf30b6695d73271c0c31848 verified against the local artifact. Both public viewers passed actual Chrome release/UI checks with no page errors; screenshots reviewed. Standalone demo canvas was nonblank.
- `git diff c3a773f --exit-code -- src Locahun3D_OfflineViewer.html version.json` returned zero: complete viewer source, generated standalone HTML and version metadata match v1.0 exactly.

Do not reapply the withdrawn touch panel fixes or vehicle changes from the intervening commits. Physical iOS verification and separate live workflow transfer approval remain outstanding. Dropbox copies have not been changed in this restoration.
