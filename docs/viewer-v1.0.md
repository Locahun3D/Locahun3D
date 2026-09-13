# Viewer v1.0

Designated stable by the owner on 2026-09-14. Display version: v1.0;
machine-readable version: 1.0.0.

Baseline: viewer runtime from 03487cc / artifacts 1ad1d6f; offline workflow
0f15722 and online workflow 8a04e17. This release changes version and release
notes only, not rendering, movement, collision or project data.

The home-screen changelog now contains one concise bilingual v1.0 entry.
Superseded alpha/beta UI notes are removed; development records remain in Git
and docs. No universal performance or physical iOS validation is claimed.

Known validation boundaries remain: physical iPad Safari, authenticated live
workflow storage integration, exact listing/scene mapping, and unresolved
MeetingRoom scale. These are not represented as completed in the release notes.

Validation: rebuilt offline and online variants; sync regression gate reported
307 passed, one skipped, one TODO, zero failures. Release contract: 5 passed.
Changelog expansion/collapse and JA/EN notes checked in desktop Chrome at
desktop, phone and tablet viewport sizes; screenshots reviewed. Design audit:
29 passed. These viewport checks are not physical iPad tests.

Publication: local artifacts and online checkout synchronized; this version
designation has not yet been pushed or deployed to production.
