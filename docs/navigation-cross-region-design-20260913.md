# Cross-Region Navigation Design

Status: two-region runtime and authoring integration verified locally; awaiting
guarded publication. The dated implementation notes below are historical.

## Current Verification

The provider lazily verifies the saved graph, queries both independently bound
regions, builds a bounded combined corridor and replays the actual controller
against collision in both directions before movement. It tries at most four
physical candidates from sixteen geometric candidates. Source/epoch/cancel
guards discard late results; rejected and completed cores are disposed.

Authoring preparation automatically generates transitions for exactly two
regions. The real studio output totals 406718 bytes for two navigation/collision
pairs plus graph, while retaining the existing coarse scene collision. The
original active project is not overwritten. Two actual server launches, saves,
graph HTTP loading and staircase clicks passed in package-1789283295645.
Single-portal rendered studio click/hold/touch and ZIP roundtrips also passed.
142 navigation/preparation tests pass; graph stale-source and failed-physical
candidate fallback now have regression tests. No renderer changes.

The ordinary demo does not request graph assets; the desktop comparison has
the same 16.8ms p95 frame interval as published. This is not physical iPad
validation or a universal performance claim. Journeys remain at most two
regions/30m; three-plus-region graph generation is not implemented.

`scripts/navigation-transition-candidates.mjs` returns explicitly unverified
pairs with triangle indices. Synthetic tests reject stacked floors, gaps and
boundary-only overlap. An actual studio split produced 242 candidates (27 near
the staircase). The separate clearance gate accepts 129 pairs (19 near stairs)
against actual Rapier collision, rejecting injected walls and low ceilings.
This is still not proof of per-region connectivity or complete journeys.

The offline two-region query probe now produces a 3.062m real studio staircase
route with bounds A ending at X8.5 and B starting at X6.4. Actual browser
controller/Rapier replay completes both directions and rejects an injected wall.
Narrower overlap (B starts X6.8 or X7) yielded connected paths that physically
stopped near the stair wall. The offline full-route gate now rejects that narrow
case and injected walls, while accepting the wider route in both directions.
It reuses the shipped controller with floor/body/sweep checks. The route probe
still returns unverified output. Its async selector snapshots at most 16 paths,
runs the full gate, rejects canceled/failed results and tries other candidates.
Actual narrow overlap rejects all six candidate paths; wide overlap accepts the
first. Runtime graph integration and source-bound persistence remain pending.

An offline canonical transition-graph codec now binds source and exact paired
region payload digests, not merely region names. Limits: 128KiB and 256 portals.
The certified real studio transition roundtrips in 496 bytes. Changed payloads,
unknown region keys, corruption and cross-floor pairs reject. This codec is not
yet wired into the viewer, project manifest, ZIP or local-server graph delivery.

The codec is now shared with a browser candidate module (not in the template).
Node and actual Chrome WebCrypto decode the same 496-byte studio graph and
reject corruption. Hashing owns input snapshots to avoid asynchronous mutation.

Latest local integration includes the codec in the template and preserves an
optional graph descriptor in settings. Asset collection and desktop bundle
validation retain `assets/<sha256>.lng`; the local server serves only hashed,
read-only graph files up to 128KiB. Actual browser collection verifies five
files for two regions plus graph. Full ZIP/restart graph tests and runtime
routing integration are still pending; this batch is not deployed.

Persistence checks now cover actual browser ZIP save/load (392939B, five
studio-derived navigation files, no rendered RAD layer in this ZIP fixture),
plus two local-server launches/saves and graph HTTP retrieval on a packaged
synthetic scene. Missing graph files reject. Runtime click routing remains
unconnected; these tests do not establish cross-region UI completion.

## Scope

Continue a click journey through adjacent precomputed regions, including stairs,
without increasing ordinary viewer startup work or replacing the renderer.
Preserve the current 30m maximum journey initially. A longer journey is a
separate change, not a reason to remove resource limits here.

## Existing Constraints

- 403h requires both endpoints inside one region with a 0.35m interior margin.
- 403f caches at most two query objects and evicts/disposes older ones.
- 403j acquires a single region collision payload and one corridor core.
- Region keys bind geometry identity, bounds and the fixed navigation profile.
- Vertically overlapping region bounds do not establish a walkable connection.
- Current LNV meshes are generated independently and cannot be safely joined
  merely by concatenating vertices or snapping nearest boundary points.

## Chosen Direction

Generate explicit, verified transition points on the authoring PC. Prefer this
to runtime union/baking or loading every region to search for overlaps. Retain
existing single-region routing as the first, cheaper path.

A transition binds two region keys and two floor points. The two points must
belong to corresponding walkable surfaces in the overlap, within a small
validated tolerance. Same X/Z on different floors is not a connection. Generate
candidate points from actual navmesh surfaces, not AABB centers. Verify the
short crossing against the paired fine collision, including body clearance,
step height, floor support and both directions. Do not infer a connection where
the overlap has insufficient clearance.

Offline transition records must additionally retain each endpoint's connected
component. A region may contain disconnected floors or rooms; a graph node is
therefore a transition endpoint, not just a region ID. Intra-region graph edges
are accepted only after the existing query proves connectivity between their
endpoints. Record route lengths, not straight-line distances, as edge weights.

Version the graph separately from the existing schema-1 manifest. Bind its
digest and bytes to the exact ordered region payload identities and source.
Keep old projects and viewers on their existing single-region behavior.

## Runtime Integration

1. Try the current single-region selector unchanged.
2. Only when needed, use bounded graph search over verified offline edges.
3. Load region queries sequentially; do not retain query objects across LRU
   eviction. Copy validated route points before loading the next region.
4. Check all endpoints, source/epoch/intent, cumulative length and point limits
   after each asynchronous operation. An invalid segment rejects the journey.
5. Build collision for the complete accepted corridor before moving. Initially
   cap a journey to two regions and retain the current corridor box budget.
   Reject over-budget requests instead of freezing mid-flight while loading.
6. Preserve look-drag behavior, explicit translation cancellation, destination
   preview, body clearance, ground +1.8m camera height and lease disposal.

The two-region limit is an initial verified rollout, not full arbitrary-building
coverage. Extend it only after resource measurements and longer-chain tests.

## Required Evidence Before Enabling

- Positive: overlapping regions, different tessellation, stairs, both directions.
- Negative: adjacent but disconnected rooms, wall in overlap, stacked floors,
  low ceiling, gap, changed transform/source, corrupted or missing graph/payload.
- Async: new click, source edit, cancellation, query eviction and late response.
- Limits: graph bytes/nodes/edges, total journey length, corridor boxes and
  pair count. No extra startup requests on the ordinary public demo.
- Real studio: choose endpoints that no individual region can cover, verify
  travel crosses the actual seam and cannot pass through the stair wall.
- ZIP and local save/restart preserve graph records and fail closed on mismatch.
- Visual desktop/mobile Chrome checks; physical iPad Safari remains a separate
  unresolved verification requirement when no device is available.

## Publication Gate

Do not change public schema or enable a runtime fallback from this design alone.
First build and test the offline transition validator on synthetic and real
studio data. Then integrate graph persistence, runtime routing, corridor resource
limits, browser verification and the existing guarded release workflow.
