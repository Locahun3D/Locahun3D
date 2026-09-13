# Bounded Multi-Region Preparation

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
