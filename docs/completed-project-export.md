# Completed Project Export

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
