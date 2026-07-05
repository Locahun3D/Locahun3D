# vendor/ — patched Spark 3DGS library

## What this is

A locally-vendored copy of the Spark 3DGS runtime (`@sparkjsdev/spark@2.0.0`,
single-file non-minified ESM dist) plus a one-line patched variant that raises
the worker-pool size.

| File | Purpose |
| --- | --- |
| `spark-2.0.0.module.js` | Pristine upstream dist, byte-for-byte from jsDelivr. Keep for diffing / re-patching. |
| `spark-2.0.0-workers16.module.js` | Same file with **one expression** changed: the `NewSplatWorkerPool` worker-pool default size. |

Both files import the bare specifier `three`, which the page's importmap
resolves. Load the patched file the same way the CDN URL was loaded before
(swap the importmap entry — that wiring is out of scope for this vendor dir and
was intentionally not changed here).

## Why

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
  (the viewer already overrides this to 12).
- `this.numFetchers = options.numFetchers ?? 3;` — `SplatPager` default 3.
- `newLodTree` is created with `numFetchers: this.numLodFetchers`, and the fetch
  loop gates on `this.fetchers.length < this.numFetchers`. So effective
  concurrent decode = `min(numFetchers, pool size)`. Raising the pool only helps
  if `numFetchers` is also ≥ the new pool size (the viewer's 12 covers this up to
  a 12-wide pool; a 16-wide pool would be fetcher-limited to 12).

No queue-length or `maxConcurrent`-style hard caps were found beyond the above.

## Upstream version / provenance

- Package: `@sparkjsdev/spark`
- Version: `2.0.0`
- Source URL: `https://cdn.jsdelivr.net/npm/@sparkjsdev/spark@2.0.0/dist/spark.module.js`
- SHA-256 (pristine `spark-2.0.0.module.js`):
  `5053375458453a341fba2f50fcf20df408f5d81ac847eadfa37bc9e4254e6a5c`
- Size: 5,378,907 bytes, 20,686 lines.

## Upgrade procedure

When bumping Spark:

1. Re-download the pristine dist:
   ```sh
   curl -sS -o vendor/spark-<VER>.module.js \
     https://cdn.jsdelivr.net/npm/@sparkjsdev/spark@<VER>/dist/spark.module.js
   sha256sum vendor/spark-<VER>.module.js   # record it in this README
   ```
2. Copy it to the patched name:
   ```sh
   cp vendor/spark-<VER>.module.js vendor/spark-<VER>-workers16.module.js
   ```
3. Re-apply the one-line patch. Find the `NewSplatWorkerPool` constructor
   (grep `constructor(maxWorkers` — the class from `src/SplatWorker.ts`, NOT the
   `OldSplatWorker` module-level `let maxWorkers = 4`) and replace its default
   `= 4` with:
   ```js
   = Math.min(16, Math.max(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8) - 2))
   ```
   The minifier may rename `maxWorkers` (here it is `maxWorkers2`); match by the
   constructor of the class whose singleton is `workerPool` and whose
   `withWorker` runs `qualityLodPackedSplats` / `tinyLodPackedSplats`.
4. Verify:
   ```sh
   diff -u vendor/spark-<VER>.module.js vendor/spark-<VER>-workers16.module.js  # exactly one line
   node --check vendor/spark-<VER>-workers16.module.js                          # (rename .mjs if needed)
   ```
   The diff must be exactly the one constructor line; nothing else.
5. Re-check the "Other caps" list above in the new dist in case upstream changed
   the fetcher defaults.
