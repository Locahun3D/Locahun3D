# vendor/ — patched Spark 3DGS library

## What this is

A locally-vendored, **from-source rebuild** of the Spark 3DGS runtime
(`@sparkjsdev/spark@2.0.0`, single-file non-minified ESM dist) with two
patches applied: a larger worker-pool size, and an incremental ("differential")
LOD-traversal algorithm in the Rust/WASM core.

| File | Purpose |
| --- | --- |
| `spark-2.0.0.module.js` | Pristine upstream dist, byte-for-byte from jsDelivr (2026-07-06 tag `v2.0.0`). Kept for diffing / provenance only — **no longer the base of the shipped file** (see below). |
| `spark-2.0.0-src-rebuild.module.js` | The same `v2.0.0` tag, rebuilt from source (`npm run build:wasm` + `vite build --mode dev`) with **zero code changes** — a reproducibility baseline. Differs from the jsDelivr dist only in embedded-WASM bytes (build-environment non-determinism, unrelated crate `spark-rs`) and GLSL shader `\r\n` vs `\n` (Windows checkout artifact). Diffed line-by-line against `spark-2.0.0-workers16.module.js` before any further patch was applied — confirmed clean. |
| `spark-2.0.0-workers16.module.js` | `spark-2.0.0.module.js` (jsDelivr) + **one expression** changed: the `NewSplatWorkerPool` worker-pool default size. **Superseded** by the file below — kept for history/rollback. |
| `spark-2.0.0-workers16-incrtraverse.module.js` | **Currently shipped file.** `spark-2.0.0-src-rebuild.module.js` + the same worker-pool patch + the incremental-traversal patch (Rust source change, not a JS-level patch — see below). |

All files import the bare specifier `three`, which the page's importmap
resolves. `src/assets/importmap.json` points `@sparkjsdev/spark` at
`spark-2.0.0-workers16-incrtraverse.module.js`.

## Patch 1 — worker pool size

Spark runs LOD traversal + RAD chunk fetch/decode through a shared worker pool,
`NewSplatWorkerPool`, whose singleton `workerPool` is constructed with a
hardcoded default of **4** workers. That 4-thread ceiling caps concurrent RAD
chunk decode regardless of the viewer's `numLodFetchers` setting, and is the
main bottleneck for RAD LOD refinement speed on multi-core desktops.

The patch scales the pool with the machine instead of pinning it at 4:

```js
maxWorkers2 = Math.min(16, Math.max(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8) - 2))
```

- Leaves 2 cores for the main/UI + compositor threads (`hardwareConcurrency - 2`).
- Never drops below the original 4 (`Math.max(4, ...)`).
- Caps at 16 to avoid pathological oversubscription on very high-core machines.
- Falls back to 8 (→ pool of 6) when `navigator.hardwareConcurrency` is
  unavailable, and guards `typeof navigator` so the module still parses/loads
  in a non-DOM context.

Only the **worker-pool size declaration from `src/SplatWorker.ts`** was touched
(the `NewSplatWorkerPool` constructor default). The unrelated `OldSplatWorker`
module-level `let maxWorkers = 4` (used for full-file format decode:
PLY/SPZ/SPLAT/KSPLAT/PCSOGS) was intentionally **not** changed.

### Other caps NOT patched (informational)

These still bound concurrent RAD chunk decode after the pool is enlarged. They
are runtime options with sane defaults, not hard-compiled ceilings, so they are
left alone here — tune them at the call site if needed:

- `this.numLodFetchers = options.numLodFetchers ?? 3;` — default 3
  (the viewer already overrides this to 12/16).
- `this.numFetchers = options.numFetchers ?? 3;` — `SplatPager` default 3.
- `newLodTree` is created with `numFetchers: this.numLodFetchers`, and the fetch
  loop gates on `this.fetchers.length < this.numFetchers`. So effective
  concurrent decode = `min(numFetchers, pool size)`.

No queue-length or `maxConcurrent`-style hard caps were found beyond the above.

## Patch 2 — incremental (differential) LOD traversal (2026-07-06)

**Problem:** `traverse_lod_trees` (Rust, `rust/spark-worker-rs/src/lod_tree.rs`)
is a best-first priority-queue search over the splat LOD tree, run fresh from
the root on **every single call**. When the camera is stationary and the user
jumps the splat budget up in one big step (e.g. manually picking the "高"
quality tier: 2.5M → 5M splats), the whole tree gets re-explored from scratch
even though the smaller budget's exploration is a strict prefix of the larger
one. Measured cost of that jump on the 934MB / 49.4M-splat reference RAD file:
**~2.0s** (real-app measurement, see below).

**Fix:** the frontier/output of the traversal now persist across calls in a
per-"cache slot" (`cache_slot: u32` — 0 = the main render-budget pass, 1 = the
optional low-budget raycast pass; SparkRenderer.ts's two call sites now each
pass their own slot so they can't clobber each other's state). A call
**resumes** from where the previous call for that slot left off instead of
rebuilding from the root when:
- the view (camera transform), per-instance LOD/foveate params, and
  `pixel_scale_limit` are bit-identical to the previous call for that slot, and
- `max_splats` has not decreased since the previous call.

Any other change (camera moved, quality/foveate settings changed, budget
shrank, or a slot's very first call) falls back to the exact original
from-root behavior — so the fallback path is provably unchanged from upstream.

Newly-resident chunks are picked up on every call regardless of resume: a node
whose children exist but aren't loaded yet is parked back onto the frontier
(not treated as a permanent leaf) so the very next call re-checks its
residency for free, instead of requiring a full reset to notice pages that
finished loading in the background.

This is a **Rust source change**, not a JS-level patch — `lod_tree.rs` was
edited directly in the cloned `sparkjsdev/spark` v2.0.0 repo, rebuilt via
`wasm-pack build --target web --release` (spark-worker-rs) and
`vite build --mode dev`, then the worker-pool patch above was re-applied to
the resulting dist. See `spark-src/rust/spark-worker-rs/src/lod_tree.rs` for
the full change (search "2026-07-06" / "differential traversal").

**Correctness validation:** a standalone Node.js test suite
(`scratchpad/test_incremental_traverse.mjs`, run against a `--target nodejs`
build of the same crate) exercises: resumed-vs-fresh-rebuild equivalence,
residency-reopening after a simulated page load, budget-shrink fallback,
view-change cache invalidation, and cross-slot isolation — all pass. A `resumed`
boolean was added to the traversal result (threaded through `worker.ts` →
`SparkRenderer.lastTraverseResumed` → `__diagState.lastTraverseResumed`) to
directly observe which calls actually resumed in the running app.

**Real-app measurement** (same file/hardware/methodology as Patch 1's
measurements; local Range-server, `?headless=1` to bypass the tab-visibility
render gate, camera stationary, quality-tier jump 2.5M→5M splats after full
settle):

| Build | Jump cost |
| --- | --- |
| Pre-incremental (`spark-2.0.0-workers16.module.js`) | ~2010 ms |
| Incremental, resumed (`spark-2.0.0-workers16-incrtraverse.module.js`) | ~16 ms |

Confirmed via `__diagState.lastTraverseResumed === true` on the fast call.
~125× on this specific transition. The gain is scenario-dependent: it comes
from reusing already-expanded frontier state, so a jump from a barely-started
traversal (tiny prior budget) gains much less than a jump from a *settled*
smaller tier — the settled-tier-jump is the actual real-world case (manually
raising quality after the scene has stabilized).

## Upstream version / provenance

- Package: `@sparkjsdev/spark`
- Version: `2.0.0` (git tag `v2.0.0`, commit `ea56ee73f1ec015deac852998870e1dc80f21a7f`)
- Source URL (pristine dist): `https://cdn.jsdelivr.net/npm/@sparkjsdev/spark@2.0.0/dist/spark.module.js`
- SHA-256 (pristine `spark-2.0.0.module.js`):
  `5053375458453a341fba2f50fcf20df408f5d81ac847eadfa37bc9e4254e6a5c`
- Size: 5,378,907 bytes, 20,686 lines.
- SHA-256 (`spark-2.0.0-src-rebuild.module.js`, from-source rebuild, no code changes):
  `579d484a3c573a3436ce75e5300c7d7d2236a462ddee801753106105fbe705c1`
- Build toolchain used for the rebuild: `rustc`/`cargo` 1.95.0, `wasm-pack`
  (bundled `wasm-bindgen` 0.2.117), Node 24, `vite` 6.3.2 (`vite build --mode dev`
  — non-minified, matches the pristine dist's format).

## Upgrade procedure

When bumping Spark, decide first whether the incremental-traversal patch
should carry forward (it's a real Rust source diff against upstream, not a
one-liner — check `lod_tree.rs` upstream hasn't changed shape enough to make
the merge non-trivial).

1. Clone the new tag of `sparkjsdev/spark`, apply the `lod_tree.rs` change
   (diff against this repo's copy of `rust/spark-worker-rs/src/lod_tree.rs`
   for the exact edit) and the `worker.ts`/`SparkRenderer.ts` `cacheSlot`
   plumbing (search "cacheSlot" / "resumed" in those two files).
2. Rebuild WASM: `RUSTFLAGS="-C target-feature=+simd128,+bulk-memory" wasm-pack build --target web --release`
   in both `rust/spark-worker-rs` and `rust/spark-rs`.
3. `npm install && npx vite build --mode dev` at the repo root → `dist/spark.module.js`.
4. Copy that to `vendor/spark-<VER>-src-rebuild.module.js`, then to
   `vendor/spark-<VER>-workers16-incrtraverse.module.js` and re-apply the
   worker-pool one-liner (grep `constructor(maxWorkers` — NOT the
   `OldSplatWorker` module-level `let maxWorkers = 4`):
   ```js
   = Math.min(16, Math.max(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8) - 2))
   ```
5. Verify:
   ```sh
   node --check vendor/spark-<VER>-workers16-incrtraverse.module.js
   grep -c cacheSlot vendor/spark-<VER>-workers16-incrtraverse.module.js   # expect >0
   grep -c resumed   vendor/spark-<VER>-workers16-incrtraverse.module.js   # expect >0
   ```
   Re-run `scratchpad/test_incremental_traverse.mjs` against a fresh
   `--target nodejs` build of the upgraded crate before shipping.
6. Update `src/assets/importmap.json` and `deploy-viewer.sh` to the new filename.
7. Re-check the "Other caps NOT patched" list above in case upstream changed
   the fetcher defaults.
