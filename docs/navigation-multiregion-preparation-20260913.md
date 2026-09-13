# Bounded Multi-Region Preparation

## Verified Integration

The notes below describe historical intermediate stages. The template now loads
the bounded planner. Regional routing replaces its old two-region search with
this planner; it does not stack additional physical attempts. Journey accepts
2-4 distinct nonempty keys, retains the100000-box union limit and8192 corridor
limit, and requires full-route physical replay.138 navigation/input tests pass.

Actual read-only studio QA: browser-1789294013341. Three-region source-bound
fixture506531bytes. Start[5.8000005,-3.6333334,-.7166665] to
[10.1750002,-3.866667,-.9833333] on ground, eye+1.8m. Runtime provider accepts
after1 physical check; an inserted intermediate thin wall rejects after4
checks. Actual mouse click reaches the exclusive third region. Existing stair
click/hold/touch, corrupt payload and changed-source checks pass; browsererrors[].
The preceding run's three-region-after screenshot was inspected. Original
project bytes unchanged; no scene writes. Rendering code/settings unchanged.

Published: source03487cc, Worker1673ac02-19b7-4722-afe6-7edbf617dae0,
onlinecf5f4e4 Actions34751160048 success. Public HTML hashes match both builds;
real file startup passes. Dropbox10HTML synchronized with18267 other file
metadata records unchanged. Demo baseline/current p50both17.7ms andp9518.4/18.5ms
on this desktopChrome run, same budgets and no new regional fetches. This is
not a performance guarantee for physical iOS devices.

Physical iPad validation, original unsaved-project
application and MeetingRoom scale confirmation are not covered by these tests.

Authoring-only extension:2-4 regions can now generate physically verified pair
connections. Runtime rendering, startup, collision-memory and movement limits
are unchanged. More than4 regions retain the prior no-graph behavior.

All inputs are validated before collision construction. The combined collision
still rejects more than100000 unique boxes; the graph explicitly rejects more
than256 portals. No geometry is dropped or coarsened to make it fit. Shared
collision is disposed on every result and error. No new viewer module is added.

Tests first reproduced the missing three-region graph and unvalidated third
payload. Synthetic three-region graph, damaged third-payload rejection and
two-region compatibility pass. Combined related tests11pass.

Actual studio cached source d212009b62a7ae60a03533517c8ad43a09f45f9aeafba1844755823b815906a2
split into X ranges[-8,7.5],[5.5,10.5],[8.5,24], common Y[-10,30],Z[-8,24],
produces207 portals covering all3 region keys, total506531bytes. The manual
test regenerates in memory; original data and distributed files are untouched.

This does NOT implement a single click crossing3 regions. Existing runtime can
use a verified pair from a larger manifest but only one transition per route.
Next requires bounded multi-hop planning, sequential query eviction, full-route
physical replay and actual browser/negative tests. Keep current30m path,1024
points,8192 corridor boxes,100000 input boxes and4 physical candidate attempts.
Do not publish a multi-hop claim based on authoring success alone.

## Unconnected Planner Candidate

403p_navigation_multihop.js is NOT included in the viewer template. It proposes
2-4-region chains using the existing per-region query API, not inferred spatial
connections. It snapshots graph endpoints and copies each query result before
the next prepare can evict that query. Full-route acceptance is mandatory.

Limits:32 entries,256 portals,32 queued chains,256 expansions,16 complete plans,
32 query loads,4 physical checks,1024 route points and30m total travel. Every
await checks the caller's current-source guard. Geometry given to the physical
verifier is immutable. A bounded search may reject a reachable route; it never
authorizes a shortcut merely to fit the budget.

Seven candidate tests pass (eviction, broken connections, wrong source/floor,
query failure, physical rejection/budgets, mutation, cancellation and distance).
Combined existing region/journey tests22pass. No browser/runtime connection or
publication yet. Integration must REPLACE the old cross-region candidate stage,
not add another4 physical attempts after it. Next extend journey's bounded
collision-union handling to2-4keys, reuse full route replay, and test actual
three-region studio movement before adding the template include.
