# Completed Project Export

## Browser operator entry

Online `/admin/workflow` provides admin-only draft destination selection and explicit
project.zip/receipt.json transfer. It connects normal Clerk SDK renewal, incremental
Worker hashing, exact target resolution, write-once upload, downloaded-byte checks
and attachment readback. Only non-secret actor/source/destination-bound retry
metadata is retained. Selecting files does not upload; the transfer button does.
No source project editing, owner approval, publication or sharing is performed.

The complete panel passed an isolated Chrome fixture at1440/820/390 widths,
including retry, corrupt download, CORS rejection and cancellation.
The separately authorized live Chrome test on2026-09-14 now passed with a1495-byte
synthetic ZIP in draft st-005, including downloaded SHA256, attachment readback
and repeat execution without duplicate assets. Production R2 CORS was missing
content-md5/if-none-match; fixed only for the existing application origin.
See online `docs/workflow-operator-review.md` for evidence. Another physical PC,
physical iOS, forced session expiry and large-file live transfer remain unverified.

## Portable completion package (2026-09-14)

```powershell
node scripts/prepare-portable-completion.mjs --zip "SOURCE.zip" --out "NEW_BUNDLE_DIRECTORY"
```

Builds a new Windows x64 bundle without modifying the input ZIP or existing projects.
Open its `Start_AutoExport.cmd`; retain the complete folder when moving PCs.
`Project` holds editable data, `Exports` receives verified completed revisions, and
`tools` contains the exporter, navigation codecs, JSZip and its dependency closure.
Node and third-party licenses are included. Build requires Windows x64 Node24+.
The old launcher inside Project remains unchanged and does not auto-export.
No session, online scene mapping or upload authorization is included.
Viewer external dependencies still mean this is not a fully offline viewer.

Test: a synthetic package is copied to a path containing spaces, the original
package removed, and the actual Windows CMD/PowerShell launcher starts the bundled
Node server there with an isolated home directory. Draft produces no export; an actual HTTP editing-complete save
produces a verified archive whose embedded source bytes match. Input ZIP is
unchanged. The same launcher used by double-click has been executed on this PC;
another physical PC has not yet been exercised. Test mode sets `LOCAHUN_NO_OPEN=1`
to pass `--no-open` to the completion server, avoiding an unsolicited browser tab.
Normal launch still opens the viewer. Failed builds retain only the new incomplete directory
for inspection; do not use incomplete output. Original 2FStudio is not repackaged.

## Connected Workflow (2026-09-14)

On this PC, original 2FStudio now also contains `Start_AutoExport.cmd`. It uses the
bundled Node executable and canonical scripts on F: to open the completion-enabled
viewer. Exports go to sibling `3_LocalViewer/_Exports`. Existing Start scripts and
project data are unchanged. This added launcher is explicitly PC-specific, not a
new portable distribution. Close any existing server for the same folder first;
active project locks are never bypassed.

`listing-review-pack.mjs LEDGER_JSON NEW_REPORT_MD YYYY-MM-DD` builds a source-bound
internal review document. It distinguishes scope conflicts, unknown/absent facts,
stale sources (default30days), completion/manual checks, rights, recipient and share
approval. It never contacts sources, approves them or sends anything. An approved,
future-dated client preview is required before including a request message. Live
source verification remains AI/human work; an input flag is not independent proof.
The StudioPleaseGreen Sep14 ledger/report are saved in the Dropbox workflow reports
folder with official reservation and Tokyo Location Box sources. Original draft2
is explicitly incomplete; no live listing edits or preview link issuance occurred.

The HTTP adapter and completion-triggered export below supersede the historical
"not connected" notes later in this document. They do not approve or publish data.

```powershell
node scripts/completed-project-server.mjs --root "LOCAL_PROJECT_FOLDER" --jobs "EXISTING_EXPORT_DIRECTORY"
```

The human opens the printed local viewer URL, edits, saves and chooses Editing
Complete. Saving returns immediately. A separate completion queue exports the
saved revision and verifies the ZIP; normal saves are not blocked by that work.
The newest queued completed revision supersedes older queued revisions. On restart,
a completed saved revision is checked and its matching verified export is reused.
The token-protected local `api/completion` reports idle/running/completed/failed/
superseded without exposing credentials or signed URLs. Failed exports do not undo
the saved project. This canonical launcher requires this repository's dependencies;
the old portable Start script does not enable the completion handler automatically.

`upload-completed-project.mjs` is the administrative HTTP client:

```powershell
node scripts/upload-completed-project.mjs --root "LOCAL_PROJECT_FOLDER" --jobs "EXISTING_EXPORT_DIRECTORY" --target "TARGET_JSON" --storage-origin "TRUSTED_R2_ORIGIN"
```

TARGET_JSON contains propertyId, sceneId, expectedUpdatedAt and previousUrl only.
Alternatively supply only propertyId and sceneId: the authenticated `target` action
resolves the exact current draft scene before reserve. It does not search by name,
create a scene or write data. Missing/duplicate IDs and inconsistent row timestamps
are rejected. A full supplied snapshot is never silently refreshed; reserve still
rejects intervening edits. This desktop CLI still requires correct operator-selected
IDs and a supplied session provider. The browser entry above has its own normal
authenticated selection/session flow; it does not give browser sessions to the CLI.
The first two-ID resolution is stored with the verified export job, scoped to the
application origin and exact IDs. Retries reuse that snapshot even after successful
attachment changes the online timestamp; they do not allocate a second upload.
Concurrent callers publish the snapshot once. Corrupt or mismatched snapshots fail
closed, never silently re-resolve. These files contain no session tokens. A stale
snapshot conflict requires operator review, not automatic overwrite or deletion.
The short-lived administrative session comes from LOCAHUN_ADMIN_SESSION, never
from a project or exported archive. Programmatic callers can pass an async token
provider, refreshed on each admin request, for uploads longer than a session token's
lifetime. The storage origin is trusted configuration, not copied from a response.
Session providers receive an AbortSignal and have a 30-second maximum deadline;
even a provider ignoring cancellation cannot leave the transfer awaiting it forever.
Actual HTTP regression also covers a lost PUT response followed by a 412 retry,
byte verification and one successful attachment to the same reserved object.

The client reuses the verified export, reserves one source/actor/target-bound asset,
streams a write-once MD5-checked PUT, downloads and streams SHA-256 verification,
rechecks the local source, then attaches to exactly one draft scene and checks the
returned identity. A lost response can be retried with the same target binding.
Storage requests never carry the administrative token and never follow redirects.
The server checks stored size/MD5; SHA-256 is attested by the authenticated client,
not recomputed in the Worker. It does not publish the property or issue share links.

Online implementation: `/api/admin/workflow`, migration0018. Released as 8a04e17,
Actions34774792815 succeeded. Unauthenticated production requests redirect to sign-in.
Authenticated GET readiness inspection in Chrome was blocked with ERR_BLOCKED_BY_CLIENT;
no successful live authenticated transfer or attachment is claimed. Existing QA
exports have not been attached to actual listings. Original 2FStudio is still draft.

Actual 2F QA-copy completion startup reports completed/revision2 and reuses the
existing verified export. HTTP-stream, source-change, digest, origin, retry, SQLite
route and signing tests pass. No viewer rendering changes were made.

The local editing workflow now has a data-only export step. Humans keep editing
the local folder and use Save / Editing Complete; they do not need to rebuild ZIPs.
The AI workflow invokes this tool after observing a saved `editing_complete` revision:

```powershell
node scripts/export-local-project.mjs --root "LOCAL_PROJECT_FOLDER" --out "NEW_UPLOAD_ZIP"
```

- Drafts are rejected. This command does not mark a project complete or approve it.
- It preserves the saved project fields, including camera, path labels and transforms.
- Referenced model data and verified regional navigation files are included.
- It records revision and source digests in `export-info.json`; local history,
  server tokens, runtime and local filesystem paths are not included.
- The archive is streamed, then reopened through the existing strict local-project
  importer for CRC, schema, asset and navigation validation before publication.
- It detects source edits and rejects existing output paths, including concurrent
  exports. Output must be outside the source folder. Maximum ZIP size is 2 GiB.
- It never uploads, attaches to a property, sends mail or publishes a listing.

Requires the same Node/JSZip setup as `prepare-local-project.mjs`, plus the canonical
viewer and helper files for importer verification. No viewer runtime code changes.
This is an AI-invoked export step, not yet a server-side automatic completion hook.

## Verification

`test-export-local-project.mjs` covers exact project/asset preservation, importer
roundtrip, drafts, source/revision changes, conflicting outputs and unsafe paths.
The actual 2FStudio QA copy exported and reimported all five navigation sidecars;
`package-1789319646073` passed two Chrome launch/save/stair-click cycles, without
rebaking collision, with no page errors. The original source remains draft revision2.

## Remaining Workflow Integration

## Repeatable Export Job

```powershell
node scripts/completed-export-job.mjs --root "LOCAL_PROJECT_FOLDER" --jobs "EXISTING_JOB_DIRECTORY"
```

The job directory must be outside the local project. Drafts return waiting_for_edit
without producing an archive. A completed revision and its source hashes identify
one immutable result directory containing project.zip and receipt.json. Repeated
runs verify the archive hash, receipt binding and current source/navigation before
reusing it. Incomplete private stages are not published; ordinary failures clean
their own stage and may be retried. A hard process crash can leave a private
.pending-export directory; it is not a completed result and is never reused.
Concurrent successful attempts converge on one result. Corrupted completed outputs
are rejected and preserved for inspection, not silently overwritten.

Actual 2F QA-copy job 1aa36c45ee97ccde7ec0feef09ae9d679b97113ec0b7260effa3ca3f845fabc4
was created then reused, with archive SHA
d435868fd406615c1d94c61c36d774a512aed451c937c52a0a5c97955124838f.
This is the resumable export stage only, not an upload or listing job.

Next: bind upload/attachment
to the correct property and scene; verify retrieval and preview. The listing facts
ledger and recipient confirmation pack are separate unfinished steps in the Sep9
workflow plan. Do not describe these as implemented merely because export works.

## Attachment Core (Private)

`export-attachment.mjs` accepts injected authenticated admin operations. It binds
the completed source revision, property ID, stable splatItems scene ID, expected
updatedAt, previous URL, asset ID and archive digest. It requires a draft property,
verifies downloaded bytes before attaching, edits only that scene URL/size and
reads the property back before reporting success. A lost save response is reconciled
without sending a second save; an already attached verified asset is reused.

Four mock-transport tests cover wrong source/target/digest, changed saved version,
readback failure and lost response. This is NOT an authenticated HTTP adapter and
has not uploaded anything. verifySource must validate the complete export receipt
and live source; verifyAssetBytes must perform a bounded, approved-origin fetch.

Existing online presign creates a new random asset ID every call. Do not blindly
retry it after an uncertain response. Existing saveDraftAction compares updatedAt
before repo.upsert, not atomically inside a database conditional update. A real
automation adapter must address that concurrency window and asset reservation
idempotency before it is enabled. No Next.js server-action ID is hardcoded here.

`verify-uploaded-export.mjs` now provides the desktop streaming digest verifier.
It requires a trusted exact-origin allowlist, expected bytes/SHA, rejects redirects
and credentials, bounds total bytes and deadline, and does not buffer the complete
archive. Tests cover actual local HTTP streaming, redirect refusal, corrupt/short/
oversized bodies and uncooperative fetch/cancellation. This helper is not yet wired
to authenticated asset discovery or the attachment transport.
