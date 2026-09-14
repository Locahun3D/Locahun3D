# Authorized Large Transfer Verification

Date: 2026-09-14. Existing deployed workflow code; no runtime changes.

## Scope

Normal authenticated Chrome at https://locahun3d.com/admin/workflow.
Only the previously authorized fictional draft property st-005 and scene
4fdd112a-b203-4eaa-84bc-6645d6b7b96e were used. No publication, sharing,
recipient delivery or existing studio editing was performed.

Synthetic revision2 contains128MiB of transport-only splat data. Its layer is
hidden; do not open it as a visual quality sample or invoke preview generation.
The real completed-project exporter produced project.zip and receipt.json,
with importer roundtrip verification.

- ZIP bytes:134218888
- ZIP SHA256:6c18b1457038142889b9527eba21964f001a4a6ac366aebc4318409bf4ea84dd
- Export key:068c13a63bdd382cce727648d8219ffa63d3ca12cc182ed59db5b37eb83f7f55
- Local evidence root:F:/Codex/locahun-workflow-live-20260914

## Observed Results

- Live transfer reached the registered-success UI after storage verification.
  The workflow performs downloaded-byte digest verification and attachment readback
  before that state.
- Repeated transfer reached success.
- A new attempt cancelled immediately after starting showed the cancelled UI.
- After page reload, selecting the same destination and files and transferring
  again reached registered success, confirmed by the browser accessibility tree.
- Local ZIP digest was independently rechecked after those operations.

## Limits

Cancellation during PUT or downloaded-byte verification was not captured: two
attempts completed before the cancellation action. This proves startup cancellation
only. No forced logout, physical iOS, other physical PC,2GiB transfer or bandwidth
throttling was tested. Asset-count/readback details were not independently audited
in the asset library for this large revision; do not extend the earlier small-file
duplicate-count evidence to it. The old small fixture is a different source revision.

No renderer, collision, mobile layout or deployment changes were made for this test.
