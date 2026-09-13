# Authenticated Operator Entry

Status: implementation plan, not an implemented or verified upload screen.
Reviewed against current online10ddfd3 and offline084b49d on 2026-09-14.

## Selected Boundary

Use a normal authenticated page inside the existing online admin application.
The browser selects a completed export and performs the existing workflow API
sequence. Do not transport Clerk sessions to a loopback server, write session
files, extract browser profiles, or embed credentials in portable packages.
This deliberately keeps the current automatic local export and its launcher intact.

The first entry supports administrative operators, not arbitrary studio owners.
Page access must use requireAdmin, matching /api/admin/workflow. Admin layout
alone is insufficient: it also admits studio owners. No elevation or new role.

## Operator Flow

1. Choose an existing draft property and exactly one existing scene from data
   returned under admin authorization. Display both title and stable ID; no
   title-to-ID guessing and no implicit scene creation.
2. Select the completed export's project.zip and receipt.json. Check bounded
   receipt schema, revision, archive length and SHA against actual selected bytes.
   A receipt is integrity metadata, not evidence of owner or sharing approval.
3. Show the selected destination and source revision before an explicit transfer
   command. Never start upload merely because a file or scene was selected.
4. Resolve the target with the existing target action and retain the first exact
   snapshot across retry. Reserve, write-once PUT, verify, streamed download SHA,
   attach and final readback use the existing API contract.
5. Success means attached to the selected draft, not published, client-approved,
   shared, sent, or human editing complete. Do not expose a preview link as part
   of this flow. Existing source status must not be modified.

## Session And Data Rules

- Clerk's normal browser session remains inside its supported application flow.
  Obtain a fresh supported SDK token for each administrative request with a bounded
  deadline; send it only to the exact application origin, never storage.
- Capture authenticated actor identity at start. Sign-out or account switch stops
  further mutations. Failed renewal offers normal sign-in, not automatic bypass.
- Explicitly persist only non-secret retry binding/receipt metadata. Never persist
  session tokens, presigned URLs, raw archive bytes or arbitrary selected files.
- A transfer session retains its original resolved snapshot after attach changes
  the server timestamp, mirroring the fixed desktop retry behavior.
- Hash file slices in a worker using established incremental SHA256/MD5 libraries.
  Do not load a potentially 2GiB archive into one ArrayBuffer or run hashing on
  the UI thread. Pin direct dependencies; do not rely on incidental transitive ones.
- Existing local packages use Node streams. Their desktop verification module
  cannot simply be imported into a browser bundle.
- R2 endpoints must come from trusted server configuration, not an arbitrary
  hostname accepted from receipt/user input. Storage requests omit credentials,
  reject redirects, and retain Content-MD5 and If-None-Match protections.

## Required Verification Before Publication

The existing signed PUT requires Content-MD5 and If-None-Match and expires in600s
(online src/lib/uploads.ts). Browser CORS support for those headers and download
has NOT been established. Verify only with authorized isolated data. Do not work
around a browser/network block or silently broaden bucket origins/headers.

Test stale target, duplicate/missing IDs, invalid receipt, digest mismatch,
partial/lost upload response, expired/sign-out/switched session, failed CORS,
failed readback and repeated successful transfer. None may silently attach a
different source or create a second reservation because target time changed.

Use a real browser fixture for the full operator sequence and worker cancellation,
then inspect1440/820/390 layouts and run design-fb-audit.py. Local fixture success
is not live positive transfer evidence. The blocked Chrome API navigation and
unauthorized local D1 lookup are not approved alternate routes.

## Next Implementation

Implement the authenticated destination page and a browser transfer controller
together, with its streamed hashing worker and session provider. Keep them local
until the complete fixture flow and visual gates pass, then scoped push/deploy.
Do not publish a target-download-only screen as if it were the transfer entry.
No renderer, splat budget, viewer release or original2F changes are needed.
