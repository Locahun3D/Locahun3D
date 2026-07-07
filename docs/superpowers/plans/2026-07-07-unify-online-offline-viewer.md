# Unify Online/Offline Viewer Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canonical `Locahun3D/src/` the single source of truth for BOTH the standalone offline viewer (deployed to viewer.locahun3d.com / downloadable app) and the online SaaS's embedded viewer (`locahun3d_online/public/viewer/offline-viewer.html`), so future viewer improvements only need to be written once.

**Architecture:** All online-only behavior (protected-mode asset streaming, admin preview-capture harness, orbit-preview embed mode, a debug helper) gets ported verbatim into new/existing `src/js/` fragments, gated by URL flags that are already false/absent by default (`_protected`, `?orbit=1`, `?capture=1`) — so the standalone build's *behavior* doesn't change, it just carries a little extra inert code. The ONE thing that must genuinely differ per deployment target — the Spark vendor import path, because ES `importmap` is static and the standalone file has no folder of its own — becomes a build-time variant (`node build.mjs --online`) that swaps in a second small importmap fragment. A new sync script builds the online variant and copies it (+ its vendor file) into the `locahun3d_online` repo, replacing hand-patching entirely.

**Tech Stack:** Plain Node.js build script (no bundler), vanilla JS fragments, existing `mp4-muxer`/`VideoEncoder` already available module-wide.

**Confirmed by direct testing this session:**
- `locahun3d_online` has zero build tooling for `offline-viewer.html` — it is a hand-copied, hand-patched flat file (verified: no matching script in its `package.json`, no reference to `offline-viewer.html` anywhere in its repo besides the file itself).
- Cross-origin `import()`/`fetch(mode:'cors')` of `https://viewer.locahun3d.com/vendor/spark-2.0.0-workers16-incrtraverse.module.js` from a **different origin** genuinely fails (`TypeError: Failed to fetch`) — confirmed live from `https://example.com` in a real browser tab. A `no-cors` fetch to the same URL succeeds (`opaque`, reachable) — so this is a real missing-CORS-header block, not a transient outage. This is why the online copy currently uses the unpatched `jsdelivr` Spark build instead of canonical's fast vendored/patched one — it never could load the vendored file cross-origin. The fix in this plan (serve a same-origin relative copy) sidesteps this without touching shared Cloudflare infra.
- `_protected` (`?protected=1`) already exists in canonical (`src/js/291_render_loop.js:47-48`, `src/js/430_changelog_toggle_home_screen_pulldown.js:412-415`) and is already used by the online SaaS today — this plan reuses it for the new online-only branches instead of inventing a second flag.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `build.mjs` | Modify | Accept `--online` flag; resolve one variant include marker to a different fragment |
| `src/assets/importmap.json` | Unchanged | Standalone/offline importmap (absolute Spark CDN URL) — used by default build |
| `src/assets/importmap.online.json` | **Create** | Same as above but Spark resolves to a same-origin relative vendor path |
| `src/template.html` | Modify (1 line) | Swap the importmap `{{include:...}}` marker for a `{{include-variant:...}}` marker |
| `src/js/180_splat_decimation_user_toggled_low_poly_m.js` | Modify | Add `window.__srDeep` next to existing `window.__srDump` |
| `src/js/292_demo_scene_showcase.js` | Modify | `DEMO_SCENE_URL` branches on `_protected`; autoload handler gains `?autoname=` support + protected-mode R2→viewer-stream URL rewrite |
| `src/js/297_orbit_preview_mode.js` | **Create** | `?orbit=1` auto-rotating preview-embed mode (ported verbatim from online) |
| `src/js/298_admin_capture_harness.js` | **Create** | `?capture=1` admin preview-video capture harness (ported verbatim, muxer import de-duplicated) |
| `sync-online-viewer.sh` | **Create** | Builds the online variant and copies it + vendor file into `../locahun3d_online/public/viewer/` |

---

### Task 1: Teach `build.mjs` a variant flag

**Files:**
- Modify: `F:\Htlml\3DGS\Locahun3D\build.mjs`

- [ ] **Step 1: Read the current include-resolution block**

Current (lines 11-43):
```js
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const FORCE   = args.includes('--force');
const ROOT    = path.dirname(fileURLToPath(import.meta.url));
const SRC     = opt('--src', path.join(ROOT, 'src'));
const BASE    = path.dirname(SRC);   // include相対パス(src/js/...)の基準 = srcの親
const OUT     = opt('--out', path.join(ROOT, 'Locahun3D_OfflineViewer.html'));
const HASHREC = path.join(ROOT, '.build-hash');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ── 手編集ガード: 出力先が前回ビルド結果と違うなら停止 ──
if (!FORCE && fs.existsSync(OUT) && fs.existsSync(HASHREC)) {
  const rec = fs.readFileSync(HASHREC, 'utf8').trim();
  const cur = sha(fs.readFileSync(OUT));
  if (rec && cur !== rec) {
    console.error('FATAL: output file was modified since last build (hotfix?).');
    console.error('       Port the change into src/ first, or rerun with --force to discard it.');
    process.exit(1);
  }
}

const template = fs.readFileSync(path.join(SRC, 'template.html'), 'latin1');
let missing = 0;
const html = template.replace(/^\{\{include:(.+?)\}\}\n/gm, (_m, rel) => {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) { console.error(`FATAL: missing fragment ${rel}`); missing++; return ''; }
  const body = fs.readFileSync(p, 'latin1');
  if (body.length === 0) { console.error(`FATAL: empty fragment ${rel}`); missing++; return ''; }
  return body;
});
if (missing) process.exit(1);
if (html.includes('{{include:')) { console.error('FATAL: unresolved {{include:}} marker remains'); process.exit(1); }

fs.writeFileSync(OUT, html, 'latin1');
fs.writeFileSync(HASHREC, sha(fs.readFileSync(OUT)) + '\n');
console.log(`OK: built ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
```

- [ ] **Step 2: Add an `ONLINE` flag and a second, variant-aware marker resolver**

Replace the whole file body from the `FORCE` line onward with:

```js
const FORCE   = args.includes('--force');
const ONLINE  = args.includes('--online');
const ROOT    = path.dirname(fileURLToPath(import.meta.url));
const SRC     = opt('--src', path.join(ROOT, 'src'));
const BASE    = path.dirname(SRC);   // include相対パス(src/js/...)の基準 = srcの親
const OUT     = opt('--out', path.join(ROOT, ONLINE ? 'Locahun3D_OfflineViewer.online.html' : 'Locahun3D_OfflineViewer.html'));
const HASHREC = path.join(ROOT, ONLINE ? '.build-hash.online' : '.build-hash');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ── 手編集ガード: 出力先が前回ビルド結果と違うなら停止 ──
if (!FORCE && fs.existsSync(OUT) && fs.existsSync(HASHREC)) {
  const rec = fs.readFileSync(HASHREC, 'utf8').trim();
  const cur = sha(fs.readFileSync(OUT));
  if (rec && cur !== rec) {
    console.error('FATAL: output file was modified since last build (hotfix?).');
    console.error('       Port the change into src/ first, or rerun with --force to discard it.');
    process.exit(1);
  }
}

const template = fs.readFileSync(path.join(SRC, 'template.html'), 'latin1');
let missing = 0;

const resolveInclude = (rel) => {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) { console.error(`FATAL: missing fragment ${rel}`); missing++; return ''; }
  const body = fs.readFileSync(p, 'latin1');
  if (body.length === 0) { console.error(`FATAL: empty fragment ${rel}`); missing++; return ''; }
  return body;
};

// {{include-variant:path/to/base.json}} resolves to base.json normally, or to
// base.online.json (inserting ".online" before the extension) when --online
// is passed. Currently only used for the importmap (Spark import path differs:
// the standalone single-file download has no folder of its own so it needs an
// absolute CDN URL, while the online SaaS serves its own vendor/ copy alongside
// this file and can use a same-origin relative path — see sync-online-viewer.sh).
let html = template.replace(/^\{\{include-variant:(.+?)\}\}\n/gm, (_m, rel) => {
  if (!ONLINE) return resolveInclude(rel);
  const dot = rel.lastIndexOf('.');
  const variantRel = dot === -1 ? `${rel}.online` : `${rel.slice(0, dot)}.online${rel.slice(dot)}`;
  return resolveInclude(variantRel);
});
html = html.replace(/^\{\{include:(.+?)\}\}\n/gm, (_m, rel) => resolveInclude(rel));

if (missing) process.exit(1);
if (html.includes('{{include:') || html.includes('{{include-variant:')) {
  console.error('FATAL: unresolved include marker remains');
  process.exit(1);
}

fs.writeFileSync(OUT, html, 'latin1');
fs.writeFileSync(HASHREC, sha(fs.readFileSync(OUT)) + '\n');
console.log(`OK: built ${OUT} (${(html.length / 1024).toFixed(0)} KB)${ONLINE ? ' [online variant]' : ''}`);
```

Note the default (no `--online`) output filename and hash-record path are UNCHANGED from before (`Locahun3D_OfflineViewer.html` / `.build-hash`), so the existing offline build/deploy flow (`deploy-viewer.sh`) keeps working with zero changes.

- [ ] **Step 3: Run the default build and confirm it is byte-identical to before this change**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
git stash push -- build.mjs   # temporarily revert to compare
node build.mjs --force --out /tmp/before.html
git stash pop
node build.mjs --force --out /tmp/after.html
diff /tmp/before.html /tmp/after.html && echo "IDENTICAL"
```
Expected: `IDENTICAL` (this step only added an `--online` code path; the default path must be untouched).

- [ ] **Step 4: Commit**

```bash
git add build.mjs
git commit -m "build: support an --online variant flag for a second importmap"
```

---

### Task 2: Create the online importmap variant

**Files:**
- Read: `F:\Htlml\3DGS\Locahun3D\src\assets\importmap.json`
- Create: `F:\Htlml\3DGS\Locahun3D\src\assets\importmap.online.json`

- [ ] **Step 1: Copy the current importmap and swap the Spark path to a same-origin relative path**

Current `src/assets/importmap.json`:
```json
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "@sparkjsdev/spark": "https://viewer.locahun3d.com/vendor/spark-2.0.0-workers16-incrtraverse.module.js",
    "fflate": "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js",
    "mp4-muxer": "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs"
  }
}
```

Create `src/assets/importmap.online.json`:
```json
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "@sparkjsdev/spark": "./vendor/spark-2.0.0-workers16-incrtraverse.module.js",
    "fflate": "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js",
    "mp4-muxer": "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs"
  }
}
```

The relative path resolves against wherever the HTML is served from. `sync-online-viewer.sh` (Task 10) will place the HTML at `locahun3d_online/public/viewer/offline-viewer.html` and the vendor file at `locahun3d_online/public/viewer/vendor/spark-2.0.0-workers16-incrtraverse.module.js`, so `./vendor/...` resolves correctly there. This mirrors what `deploy-viewer.sh` already does for the standalone site's own `viewer-dist/vendor/`.

- [ ] **Step 2: Update the template's importmap marker to use the new variant-aware marker**

Edit `F:\Htlml\3DGS\Locahun3D\src\template.html` line 908:
```diff
 <script type="importmap">
-{{include:src/assets/importmap.json}}
+{{include-variant:src/assets/importmap.json}}
 </script>
```

- [ ] **Step 3: Build both variants and diff their importmaps**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
node build.mjs --force
node build.mjs --online --force
diff <(grep -A6 '"imports"' Locahun3D_OfflineViewer.html) <(grep -A6 '"imports"' Locahun3D_OfflineViewer.online.html)
```
Expected: only the `@sparkjsdev/spark` line differs (absolute CDN URL vs `./vendor/...`).

- [ ] **Step 4: Commit**

```bash
git add src/assets/importmap.online.json src/template.html
git commit -m "build: add online-variant importmap (same-origin relative Spark path)"
```

---

### Task 3: Add `__srDeep` debug helper

**Files:**
- Modify: `F:\Htlml\3DGS\Locahun3D\src\js\180_splat_decimation_user_toggled_low_poly_m.js:83`

- [ ] **Step 1: Add the helper immediately after the existing `__srDump`**

Current line 83:
```js
window.__srDump = ()=>{ if(typeof sparkRenderer==='undefined') return 'no sr'; const o={}; for(const k of ['lodSplatCount','lodSplatScale','lodRenderScale','coneFov','coneFov0','coneFoveate','behindFoveate','maxPagedSplats','numLodFetchers','enableLod','enableDriveLod']){ o[k]=sparkRenderer[k]; } return o; };
```

Add directly below it:
```js
// Deeper paging/streaming state than __srDump exposes — used by the online
// SaaS's admin preview-capture flow to confirm a streamed RAD scene has
// loaded enough splats before it starts recording. Harmless everywhere else
// (just an inert debug getter, same as __srDump above).
window.__srDeep = ()=>{
  if(typeof sparkRenderer==='undefined') return 'no sr';
  const sr = sparkRenderer;
  const r = { hasPager:!!sr.pager, lodMeshes:sr.lodMeshes?.length, lastFrame:sr.lastFrame, activeSplats:sr.activeSplats };
  if(typeof splatMesh!=='undefined' && splatMesh && splatMesh.paged) r.nSplat = splatMesh.paged.numSplats;
  return r;
};
```

- [ ] **Step 2: Build and confirm no syntax errors**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
node build.mjs --force
node -c <(sed -n '/<script type="module"/,/<\/script>/p' Locahun3D_OfflineViewer.html | sed '1d;$d') 2>&1 | head -5 || true
```
(If `node -c` on the extracted block complains about `import`/top-level-await syntax that's expected for a module — the real verification is the browser check in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/js/180_splat_decimation_user_toggled_low_poly_m.js
git commit -m "diag: add __srDeep paging-state debug helper alongside __srDump"
```

---

### Task 4: Merge protected-mode demo URL + autoload extensions

**Files:**
- Modify: `F:\Htlml\3DGS\Locahun3D\src\js\292_demo_scene_showcase.js`

- [ ] **Step 1: Branch `DEMO_SCENE_URL` on the existing `_protected` flag**

Current (lines 25-27):
```js
const DEMO_SCENE_URL = 'https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad';
const DEMO_SCENE_LABEL = 'デモシーン(交差点)';
const DEMO_SCENE_SIZE_MB = 357;
```

Replace with:
```js
// _protected (?protected=1, set by src/js/291_render_loop.js which loads
// before this file) means we're embedded in the online SaaS, which proxies
// this same route through its own Next.js API — use a same-origin relative
// URL there instead of the public CDN Worker URL. The standalone/offline
// download (opened via file://, Dropbox, etc.) has no such backend, so it
// always needs the absolute URL.
const DEMO_SCENE_URL = (typeof _protected !== 'undefined' && _protected)
  ? '/api/demo-asset/Kousaten_ForDemo_point_cloud.rad'
  : 'https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad';
const DEMO_SCENE_LABEL = 'デモシーン(交差点)';
const DEMO_SCENE_SIZE_MB = 357;
```

- [ ] **Step 2: Extend the `?autoload=` handler with `?autoname=` support and the protected-mode R2→viewer-stream rewrite**

Current (lines 158-166):
```js
setTimeout(async ()=>{
  const m  = location.search.match(/[?&]autoload=([^&]+)/);
  const dm = /[?&]demo=1/.test(location.search);
  if(m){
    await loadFromURL(decodeURIComponent(m[1]));
  } else if(dm && DEMO_SCENE_URL){
    await loadFromURL(DEMO_SCENE_URL, (typeof T==='function'?T('demo-btn-lbl'):DEMO_SCENE_LABEL));
  }
}, 0);
```

Replace with:
```js
setTimeout(async ()=>{
  const m  = location.search.match(/[?&]autoload=([^&]+)/);
  const dm = /[?&]demo=1/.test(location.search);
  if(m){
    let autoUrl = decodeURIComponent(m[1]);
    // Online SaaS only: stored asset URLs are the public R2-proxy path
    // (e.g. /api/r2/assets/splat/foo.zip). Under ?protected=1 the
    // authenticated same-origin stream lives at /api/viewer-stream/<r2key>,
    // so reduce the value to the bare R2 object key (strip leading slashes
    // and the /api/r2/ proxy prefix, matching toR2Key() in /api/viewer-asset
    // on the online SaaS side) and route it through that endpoint instead.
    // blob: URLs (local-file salvage flows) and already-absolute http(s)
    // URLs are left untouched.
    if(typeof _protected !== 'undefined' && _protected &&
       !(/^https?:\/\//.test(autoUrl)) && !autoUrl.startsWith('blob:')){
      const r2key = autoUrl.replace(/^\/+/, '').replace(/^api\/r2\//, '');
      autoUrl = '/api/viewer-stream/' + r2key;
    }
    // ?autoname=<filename> — online SaaS admin preview-capture only: when a
    // blob: URL is auto-loaded (no extension to sniff), this supplies a
    // filename so format detection still works.
    const an = location.search.match(/[?&]autoname=([^&]+)/);
    await loadFromURL(autoUrl, an ? decodeURIComponent(an[1]) : undefined);
  } else if(dm && DEMO_SCENE_URL){
    await loadFromURL(DEMO_SCENE_URL, (typeof T==='function'?T('demo-btn-lbl'):DEMO_SCENE_LABEL));
  }
}, 0);
```

- [ ] **Step 3: Build and confirm the plain (offline) `?autoload=`/`?demo=1` paths are unaffected**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
node build.mjs --force
grep -c "_protected" Locahun3D_OfflineViewer.html   # sanity: still present, unconditional code path untouched
```
Real behavioral verification (both variants, `_protected` on/off) happens in Task 8/9 with a live browser — this step is just confirming the build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/js/292_demo_scene_showcase.js
git commit -m "feat(autoload): protected-mode viewer-stream rewrite + demo URL + autoname param"
```

---

### Task 5: Port the `?orbit=1` auto-preview mode

**Files:**
- Create: `F:\Htlml\3DGS\Locahun3D\src\js\297_orbit_preview_mode.js`
- Modify: `F:\Htlml\3DGS\Locahun3D\src\template.html` (one new include line)

- [ ] **Step 1: Create the fragment (ported verbatim from the online copy, comment header adjusted since it now lives in the shared source)**

```js
// ══════════════════════════════════════════════════
//  ?orbit=1 — Slow 360° auto-orbit for inline preview embeds (online SaaS
//  property listing pages). Waits for the scene to load, then gently
//  rotates yaw a full turn over ~10 s. Stops on any pointer interaction so
//  the user can take manual control. OFF by default — zero effect unless
//  the URL explicitly requests it, so this is inert in the standalone app.
// ══════════════════════════════════════════════════
if(/[?&]orbit=1/.test(location.search)){
  (function(){
    // Preview mode: hide ALL UI, show only the rotating 3D scene
    const style = document.createElement('style');
    style.textContent = '#topbar,#hud,#layer-panel,#overlay,#dropzone,#orient-lock,#sun-panel,#immersive-exit,#env-tint,#light-halo-layer,#view-tl-btns,#qp-panel,[id^="lfi-"],[id^="obj-type-menu"]{display:none!important}body{overflow:hidden!important;margin:0!important}#c{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:0!important}';
    document.head.appendChild(style);

    // When capture=1 is also active, capture code drives the orbit itself.
    if(/[?&]capture=1/.test(location.search)) return;

    const ORBIT_DURATION_S = 10;
    const RAD_PER_S = (2 * Math.PI) / ORBIT_DURATION_S;
    let orbitRaf = 0;
    let baseYaw = 0;

    const hasScene = ()=> (typeof layers!=='undefined' && layers.some(L=>L&&L.mesh&&L.type!=='camera'));

    async function startOrbit(){
      for(let i=0; i<160 && !hasScene(); i++) await new Promise(r=>setTimeout(r,500));
      if(!hasScene()) return;
      await new Promise(r=>setTimeout(r,1500));

      baseYaw = yaw;
      let prev = performance.now();

      (function loop(now){
        const dt = (now - prev) / 1000;
        prev = now;
        _yawTarget += RAD_PER_S * dt;
        yaw = _yawTarget;
        if(typeof markDirty === 'function') markDirty(2);
        if(yaw - baseYaw >= 2 * Math.PI) return;
        orbitRaf = requestAnimationFrame(loop);
      })(performance.now());
    }
    setTimeout(startOrbit, 200);
  })();
}
```

- [ ] **Step 2: Add the include line to `template.html`, right after `293_diag_instrumentation.js` / `294_rad_lod_prefetch.js`**

Edit `F:\Htlml\3DGS\Locahun3D\src\template.html` around line 975-976:
```diff
 {{include:src/js/294_rad_lod_prefetch.js}}
+{{include:src/js/297_orbit_preview_mode.js}}
 {{include:src/js/300_export_save_load.js}}
```

- [ ] **Step 3: Build and confirm no unresolved markers**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
node build.mjs --force
```
Expected: `OK: built ...` with no FATAL errors.

- [ ] **Step 4: Commit**

```bash
git add src/js/297_orbit_preview_mode.js src/template.html
git commit -m "feat(preview): add ?orbit=1 auto-rotate embed mode (was online-only)"
```

---

### Task 6: Port the `?capture=1` admin preview-capture harness

**Files:**
- Create: `F:\Htlml\3DGS\Locahun3D\src\js\298_admin_capture_harness.js`
- Modify: `F:\Htlml\3DGS\Locahun3D\src\template.html` (one new include line)
- Source (verified, read in full during plan-writing): `F:\Htlml\3DGS\locahun3d_online\public\viewer\offline-viewer.html:17948-18139` (192-line block)

- [ ] **Step 1: The full 192-line source block has already been read and verified line-by-line** (via `sed -n '17948,18139p' "F:/Htlml/3DGS/locahun3d_online/public/viewer/offline-viewer.html"` during plan-writing). The fragment in Step 2 below is the verified exact port — no further diffing needed, just create the file as written.

- [ ] **Step 2: Create the fragment — same logic, but reuse the already-imported `Mp4Muxer`/`Mp4ArrayBufferTarget` (from `src/js/010_state.js`, added this week for the camera-animation WebCodecs rewrite) instead of a second dynamic import of a different `mp4-muxer` version. This is the ONLY intentional behavioral diff from the source — every other line, including all comments, is unchanged.**

```js
// ══════════════════════════════════════════════════
//  ?capture=1 — Record the orbit as a video and postMessage the blob back
//  to the parent window. Used by the online SaaS's admin editor to
//  auto-generate lightweight preview videos after 3DGS upload. OFF by
//  default — zero effect unless the URL explicitly requests it, so this is
//  inert in the standalone app.
//
//  Flow: load scene → warmup (5s, GPU settles + splats stream in)
//        → wait for orbit to be running → record for captureSec → post blob
// ══════════════════════════════════════════════════
if(/[?&]capture=1/.test(location.search)){
  (function(){
    const params = new URLSearchParams(location.search);
    const ORBIT_S = parseInt(params.get('orbitSec')||'20', 10);
    const canvas = document.getElementById('c');
    if(!canvas) return;

    const target = window.opener || parent;
    const msg = (type, extra)=> target.postMessage(Object.assign({type}, extra||{}), '*');

    const hasScene = ()=> (typeof layers!=='undefined' && layers.some(L=>L&&L.mesh&&L.type!=='camera'));
    const nSplat = ()=> typeof window.__nSplat==='function' ? window.__nSplat() : -1;

    // ── フレーム待ち（hidden タブ対応）─────────────────────────────
    // requestAnimationFrame はブラウザが「非表示/背面のタブ」で完全停止させる。
    // キャプチャは右下に縮小表示された iframe 内で走るが、親タブが背面に回る
    // （別ウィンドウに隠れる/別タブに切替）と rAF が止まり、解像度安定化ループが
    // 永久にハングする（実測: visibilityState=hidden で rAF が 0 回/4秒）。
    // headless モード（?headless=1、capture 時は必ず付与）では setTimeout で
    // 待つ — こちらは hidden タブでも発火し続けるため確実に前進する。
    // レンダーループ自体も headless では setTimeout 駆動なので、この待ちの間に
    // Spark の sort/LoD/RAD ストリーミングは進む。
    const _capHeadless = /[?&]headless=1/.test(location.search);
    const nextFrame = ()=> _capHeadless
      ? new Promise(r=>setTimeout(r, 16))
      : new Promise(r=>requestAnimationFrame(r));

    async function run(){
      // Phase 1: wait for a renderable scene (up to 90s).
      // hasScene() inspects layers[].mesh, but a streaming RAD keeps its data
      // on the global splatMesh (not the layer ref) — so __nSplat()>0 ("splats
      // are present & rendering") is an equally valid readiness signal. Accept
      // either, else ZIP-restored streaming scenes hang here and time out.
      const sceneReady = ()=> hasScene() || nSplat() > 0;
      msg('capture-progress',{phase:'loading', text:'3DGS 読み込み中…'});
      // 240s: 大きい ZIP はダウンロード＋解凍で 90s を超えることがある
      for(let i=0; i<480 && !sceneReady(); i++) await new Promise(r=>setTimeout(r,500));
      if(!sceneReady()){ msg('capture-error',{error:'no-scene'}); return; }

      // Phase 2: readiness.
      //  - Streaming RAD (__nSplat()>0): wait for splats to stream in & stabilise.
      //  - Non-streaming ZIP/PLY/SPLAT: __nSplat (a RAD-only counter) stays 0/-1
      //    even though geometry is fully baked & present once the scene layer
      //    exists, so gate on hasScene() instead of forcing a 'no-splats' abort.
      // ZIP から展開された RAD はストリーミング開始が遅れ、nSplat が「後から」
      // >0 になる。即時判定すると非ストリーミング扱いになり、直後の重さ判定
      // （_heavy）も 0 のまま誤判定する → 少し待ってから分岐し直す。
      if(nSplat() <= 0){
        msg('capture-progress',{phase:'loading', text:'シーン安定化中…', pct:20});
        await new Promise(r=>setTimeout(r, 2500));
      }
      if(nSplat() > 0){
        msg('capture-progress',{phase:'loading', text:'RAD データ読み込み中…'});
        let lastCount = 0, stableMs = 0;
        const STABLE_MS = 3000, POLL_MS = 500, MAX_MS = 60000;
        let elapsed = 0;
        while(elapsed < MAX_MS){
          await new Promise(r=>setTimeout(r, POLL_MS));
          elapsed += POLL_MS;
          const c = nSplat();
          if(c > 0 && c === lastCount){ stableMs += POLL_MS; if(stableMs >= STABLE_MS) break; }
          else { stableMs = 0; lastCount = c; }
          msg('capture-progress',{phase:'loading', text:'RAD 読み込み中… '+(c>0?c.toLocaleString()+' splats':'待機中'), pct:Math.min(30, Math.round(elapsed/MAX_MS*30))});
        }
        if(nSplat() <= 0){ msg('capture-error',{error:'no-splats'}); return; }
      } else {
        // Non-streaming scene (PLY / SPLAT): already settled above.
        if(!hasScene()){ msg('capture-error',{error:'no-scene'}); return; }
      }

      // Phase 3: Lock resize handler and force 1280×720 (HD) capture resolution.
      // プレビュー動画は物件ページで複数同時に自動再生されるため、画質より
      // ファイルサイズ（ページの重さ）を優先し 1920×1080 から落としてある。
      const CAP_W = 1280, CAP_H = 720;
      const CAP_FOV = 90;   // 固定FOV（90）でキャプチャ
      if(typeof _captureLock!=='undefined') _captureLock = true;
      // 画質=高: RAD の LoD 密度を最大化。setQuality は pixelRatio を 1.5 に
      // 上げてしまい VideoEncoder の 1280×720 と不整合になるため、ここでは
      // 品質変数と RAD lodScale だけ高に寄せ、pixelRatio は下で 1 に固定する。
      try {
        if(typeof qualScale!=='undefined') qualScale = 1.5;
        if(typeof qualIdx!=='undefined') qualIdx = 2;
        if(typeof _qualPreferred!=='undefined') _qualPreferred = 1.5;
        if(typeof _radEffectiveLodScale==='function' && typeof layers!=='undefined' && layers){
          const hi = _radEffectiveLodScale();
          for(const L of layers){
            if(L && L.mesh && L.mesh.paged && typeof L.mesh.lodScale === 'number') L.mesh.lodScale = hi;
          }
        }
      } catch(_){}
      if(typeof renderer!=='undefined'){
        renderer.setPixelRatio(1);          // キャプチャ backing を厳密に CAP_W×CAP_H に
        renderer.setSize(CAP_W, CAP_H);
      } else {
        canvas.width = CAP_W; canvas.height = CAP_H;
      }
      if(typeof camera!=='undefined'){
        camera.aspect = CAP_W / CAP_H;
        if('fov' in camera) camera.fov = CAP_FOV;
        camera.updateProjectionMatrix();
      }
      // Warm-up: let the viewer's render loop run for ~2s at capture resolution
      // so Spark can re-sort splats and stabilise LOD at 1280×720.
      if(typeof markDirty==='function') markDirty(120);
      msg('capture-progress',{phase:'loading', text:'解像度安定化中…', pct:28});
      for(let w=0; w<120; w++) await nextFrame();

      // Phase 4: rAF-driven frame-by-frame capture.
      // No setTimeout loop — tight for-loop with encoder backpressure yield.
      const FPS = 24;
      const TOTAL_FRAMES = FPS * ORBIT_S;
      // 回転速度は ORBIT_S に連動させない — 常に「360° を FULL_ROTATION_SEC 秒で
      // 一周する」一定ペースを保つ。ORBIT_S を短くしても等速のまま途中で止まる
      // だけにして、短尺化のために早回しになるのを防ぐ（一周する必要はない）。
      const FULL_ROTATION_SEC = 20;
      const ANGLE_PER_FRAME = (2 * Math.PI) / (FPS * FULL_ROTATION_SEC);

      // Reuse the module-wide Mp4Muxer/Mp4ArrayBufferTarget imported in
      // 010_state.js (added for the camera-animation WebCodecs rewrite)
      // instead of dynamically importing a second, different mp4-muxer
      // version — same library, one fewer network fetch, one fewer version
      // to keep in sync. (Original online-only code did
      // `await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/+esm')`
      // here — this is the one intentional deviation from the source.)
      const muxTarget = new Mp4ArrayBufferTarget();
      const muxer = new Mp4Muxer({
        target: muxTarget,
        video: { codec: 'avc', width: CAP_W, height: CAP_H },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: e => msg('capture-error',{error:'VideoEncoder: '+e.message}),
      });
      encoder.configure({
        codec: 'avc1.640028',
        width: CAP_W, height: CAP_H,
        bitrate: 4_000_000, // 720p 相当に下げたビットレート（旧 1080p 時は 8Mbps）
        framerate: FPS,
      });

      msg('capture-started',{durationSec: ORBIT_S});

      // Capture: set yaw → force render → GPU flush → capture.
      // Direct renderer.render() guarantees the canvas is painted before
      // VideoFrame reads it (rAF alone races with the viewer's own loop).
      for(let f = 0; f < TOTAL_FRAMES; f++){
        while(encoder.encodeQueueSize > 5){
          await new Promise(r => setTimeout(r, 1));
        }

        if(typeof _yawTarget!=='undefined') _yawTarget += ANGLE_PER_FRAME;
        if(typeof yaw!=='undefined') yaw = _yawTarget;
        // FOV を毎フレーム固定（カメラモード等が触っても 90 を維持）。
        if(typeof camera!=='undefined' && 'fov' in camera && camera.fov !== CAP_FOV){
          camera.fov = CAP_FOV; camera.updateProjectionMatrix();
        }
        if(typeof markDirty==='function') markDirty(30);

        // Spark needs multiple frames to process sort/LOD after yaw change.
        // hidden タブでも進むよう nextFrame()（headless では setTimeout）を使う。
        for(let w=0; w<3; w++) await nextFrame();
        if(typeof renderer!=='undefined' && typeof scene!=='undefined' && typeof camera!=='undefined'){
          renderer.render(scene, camera);
          const gl = renderer.getContext();
          if(gl) gl.finish();
        }

        const vf = new VideoFrame(canvas, { timestamp: f * (1_000_000 / FPS) });
        encoder.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
        vf.close();

        if(f % 24 === 0){
          const pct = Math.round(f / TOTAL_FRAMES * 100);
          msg('capture-progress',{phase:'recording', text:'録画中… '+pct+'%  ('+f+'/'+TOTAL_FRAMES+')', pct:30+Math.round(pct*0.7)});
        }
      }

      // Finalize
      await encoder.flush();
      encoder.close();
      muxer.finalize();
      const blob = new Blob([muxTarget.buffer], {type:'video/mp4'});
      msg('capture-done',{blob, mimeType:'video/mp4', ext:'mp4'});
    }
    setTimeout(run, 300);
  })();
}
```

- [ ] **Step 3: Add the include line to `template.html`, right after the orbit-mode fragment**

```diff
 {{include:src/js/297_orbit_preview_mode.js}}
+{{include:src/js/298_admin_capture_harness.js}}
 {{include:src/js/300_export_save_load.js}}
```

- [ ] **Step 4: Build and confirm no unresolved markers**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
node build.mjs --force
```

- [ ] **Step 5: Commit**

```bash
git add src/js/298_admin_capture_harness.js src/template.html
git commit -m "feat(preview): add ?capture=1 admin preview-video harness (was online-only)"
```

---

### Task 7: Build both variants and confirm the offline artifact only grew, never changed existing behavior

**Files:** none (verification only)

- [ ] **Step 1: Build both**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
node build.mjs --force
node build.mjs --online --force
ls -la Locahun3D_OfflineViewer.html Locahun3D_OfflineViewer.online.html
```

- [ ] **Step 2: Confirm the only import-map difference is the Spark path**

```bash
diff <(grep -A6 '"imports"' Locahun3D_OfflineViewer.html) <(grep -A6 '"imports"' Locahun3D_OfflineViewer.online.html)
```
Expected: exactly one differing line (`@sparkjsdev/spark`).

- [ ] **Step 3: Confirm all four new/changed markers are present exactly once in both variants**

```bash
for f in Locahun3D_OfflineViewer.html Locahun3D_OfflineViewer.online.html; do
  echo "=== $f ==="
  grep -c "window.__srDeep" "$f"
  grep -c "orbit=1" "$f"
  grep -c "capture-done" "$f"
  grep -c "viewer-stream" "$f"
done
```
Expected: all counts ≥1 in both files (the code is present in both; whether it *activates* depends on the URL flags, checked in Task 8/9).

---

### Task 8: Real-browser regression check — offline variant behaves exactly as before

**Files:** none (verification only). Use the Claude Preview browser tools, not Bash/curl, per this session's tooling rules.

- [ ] **Step 1: Serve the offline variant locally and load a real scene with no special flags**

Start a static server over the repo root (any simple HTTP server works; `F:\.claude\range_server.py` has been used all session), then in the browser:
```
http://localhost:<port>/Locahun3D_OfflineViewer.html?diag=1
```
Load a real PLY/RAD scene (e.g. via `window.__loadRad(url)`), confirm the app behaves identically to before this plan: no visual/console change, `_protected` is `false`, `document.body.classList.contains('protected-mode')` is `false`.

- [ ] **Step 2: Confirm `?orbit=1` / `?capture=1` do nothing when absent**

```js
JSON.stringify({
  orbitCodePresent: /\?&]?orbit=1/.test('dummy'), // sanity the regex exists; real check below
  bodyHasProtected: document.body.classList.contains('protected-mode'),
  demoUrlIsAbsolute: DEMO_SCENE_URL.startsWith('https://'),
})
```
Expected: `demoUrlIsAbsolute: true` (since `_protected` is false by default), `bodyHasProtected: false`.

- [ ] **Step 3: Sanity-check `?orbit=1` actually engages when explicitly requested (even in the offline build)**

Reload with `?diag=1&orbit=1` on a loaded scene, confirm the UI hides and the camera yaw slowly rotates over ~10s (screenshot before/after, or poll `yaw` value increasing).

- [ ] **Step 4: Do NOT attempt to fully exercise `?capture=1` here** — it needs `window.opener`/`parent` to receive `postMessage`, which a bare top-level tab doesn't have. Deeper capture-harness verification happens in Task 9 against the real online integration path.

---

### Task 9: Real-browser verification — online variant

**Files:** none (verification only)

- [ ] **Step 1: Stage a same-origin test layout mirroring the real deploy target**

```bash
mkdir -p /tmp/online-test/viewer/vendor
cp "F:/Htlml/3DGS/Locahun3D/Locahun3D_OfflineViewer.online.html" /tmp/online-test/viewer/offline-viewer.html
cp "F:/Htlml/3DGS/Locahun3D/vendor/spark-2.0.0-workers16-incrtraverse.module.js" /tmp/online-test/viewer/vendor/
```
Serve `/tmp/online-test` over a local static server (same tool as before), so the layout matches `locahun3d_online/public/viewer/{offline-viewer.html,vendor/...}`.

- [ ] **Step 2: Confirm the relative Spark import actually loads (this is the whole point of the online variant)**

```
http://localhost:<port>/viewer/offline-viewer.html?diag=1
```
Check console for import errors, confirm `window.__dbg` (or any post-init global) exists, confirm a loaded scene renders. This is the one thing that COULD plausibly break silently (wrong relative path math) — do not skip it.

- [ ] **Step 3: Confirm `?protected=1` correctly switches `DEMO_SCENE_URL` to the relative form**

```
http://localhost:<port>/viewer/offline-viewer.html?diag=1&protected=1
```
```js
JSON.stringify({ demoUrl: DEMO_SCENE_URL, bodyProtected: document.body.classList.contains('protected-mode') })
```
Expected: `demoUrl: "/api/demo-asset/Kousaten_ForDemo_point_cloud.rad"`, `bodyProtected: true`.

- [ ] **Step 4: Confirm the protected-mode autoload URL rewrite**

```
http://localhost:<port>/viewer/offline-viewer.html?diag=1&protected=1&autoload=%2Fapi%2Fr2%2Fassets%2Fsplat%2Ftest.zip
```
Add a temporary `console.log`-free check via `window.__loadResult` (the existing test hook used earlier this session) or inspect the network request the autoload path actually issues — confirm it requests `/api/viewer-stream/assets/splat/test.zip`, NOT `/api/r2/assets/splat/test.zip`. (A 404 for the fake path is fine/expected here — this step only confirms the URL REWRITE happened, not that the fake asset exists.)

- [ ] **Step 5: Smoke-test the `?capture=1` harness end-to-end**

This is the highest-stakes piece (feeds live property-preview generation) — verify it produces a genuinely playable video, using the same rigor established for the camera-animation recording work this week (actual `<video>` playback check, not just the `capture-done` postMessage firing):
```js
// In a parent tab that opens the viewer in a child window/iframe and listens:
const child = window.open('http://localhost:<port>/viewer/offline-viewer.html?diag=1&headless=1&capture=1&orbitSec=3&autoload=' + encodeURIComponent(sceneUrl));
const result = await new Promise((resolve) => {
  window.addEventListener('message', function handler(e){
    if(e.data && e.data.type === 'capture-done'){ window.removeEventListener('message', handler); resolve(e.data); }
    if(e.data && e.data.type === 'capture-error'){ window.removeEventListener('message', handler); resolve(e.data); }
  });
});
// Then: create a video element from result.blob, check readyState/duration/videoWidth/videoHeight like the WebCodecs verification done for camera-animation recording this week.
```
Use a short `orbitSec` (e.g. 3) to keep this fast. Confirm `videoWidth===1280`, `videoHeight===720`, `duration` roughly matches `orbitSec`, and the video actually decodes (`readyState===4`, no `error`).

---

### Task 10: Create the online sync script

**Files:**
- Create: `F:\Htlml\3DGS\Locahun3D\sync-online-viewer.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# sync-online-viewer.sh — builds the online-variant viewer and copies it
# (plus its vendor Spark file) into the locahun3d_online repo, replacing the
# old hand-patch-and-copy workflow. Does NOT commit or push in the online
# repo — review the diff there and commit yourself.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ONLINE_REPO="${1:-$DIR/../locahun3d_online}"

if [ ! -d "$ONLINE_REPO/.git" ]; then
  echo "FATAL: $ONLINE_REPO doesn't look like the locahun3d_online repo (no .git)." >&2
  echo "       Usage: bash sync-online-viewer.sh [path-to-locahun3d_online]" >&2
  exit 1
fi

echo "=== Checking locahun3d_online working tree is clean ==="
if [ -n "$(cd "$ONLINE_REPO" && git status --porcelain -- public/viewer)" ]; then
  echo "FATAL: locahun3d_online has uncommitted changes under public/viewer — resolve first." >&2
  exit 1
fi

echo "=== Building online-variant viewer ==="
node "$DIR/build.mjs" --online

echo "=== Copying into locahun3d_online ==="
mkdir -p "$ONLINE_REPO/public/viewer/vendor"
cp "$DIR/Locahun3D_OfflineViewer.online.html" "$ONLINE_REPO/public/viewer/offline-viewer.html"
cp "$DIR/vendor/spark-2.0.0-workers16-incrtraverse.module.js" "$ONLINE_REPO/public/viewer/vendor/"

echo "=== Done. Review the diff in $ONLINE_REPO before committing: ==="
(cd "$ONLINE_REPO" && git status --short -- public/viewer)
echo "SHA256: $(sha256sum "$ONLINE_REPO/public/viewer/offline-viewer.html" | cut -d' ' -f1)"
```

- [ ] **Step 2: Make it executable and commit**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
chmod +x sync-online-viewer.sh
git add sync-online-viewer.sh
git commit -m "build: add sync-online-viewer.sh to replace hand-patching the online copy"
```

---

### Task 11: Run the real sync and review (stop before committing in the online repo)

**Files:** `F:\Htlml\3DGS\locahun3d_online\public\viewer\offline-viewer.html`, `F:\Htlml\3DGS\locahun3d_online\public\viewer\vendor\spark-2.0.0-workers16-incrtraverse.module.js`

- [ ] **Step 1: Run the sync script for real**

```bash
cd "F:/Htlml/3DGS/Locahun3D"
bash sync-online-viewer.sh
```

- [ ] **Step 2: Review the resulting diff in locahun3d_online**

```bash
cd "F:/Htlml/3DGS/locahun3d_online"
git diff --stat -- public/viewer
```
Expected: `offline-viewer.html` changes substantially (picks up months of canonical improvements: WebCodecs recording, 4K toggle, easing fix, 2GB-file fix, vendored/patched Spark, quality-governor rewrite, this week's URL-label fix, etc.) while still containing the online-only behavior (now unconditionally present in canonical, so present here too) — a NEW `public/viewer/vendor/` directory appears.

- [ ] **Step 3: Re-run the live verification from Task 9 against this real copy** (not just the `/tmp` staging copy) to confirm the real deploy target works, ideally via the online repo's own local dev server (`next dev`) so `/api/demo-asset` and `/api/viewer-stream` are real routes, not 404s.

- [ ] **Step 4: STOP here — do not commit or push in `locahun3d_online`.** Report the diff summary to the user and let them review/test the online site (or a preview deploy) before that repo's changes go live. This repo is a separate live SaaS product; committing/deploying it needs explicit confirmation, same as any other shared/production system.

---

### Task 12: Update memory

**Files:** none in the repo — this updates the cross-session memory system, not the codebase.

- [ ] **Step 1: Write a new project memory** documenting: the online copy is no longer hand-patched; future viewer changes only touch `Locahun3D/src/`; `node build.mjs --online` + `sync-online-viewer.sh` regenerate the online copy; the old `project_viewer_module_split.md` warning about "never cp the canonical build over the online copy" is now OBSOLETE and should be corrected (the sync script IS the correct way now) — update that memory file rather than leaving a stale, now-wrong warning in place.

- [ ] **Step 2: Update `MEMORY.md`'s index line** for `project_viewer_module_split.md` to point at the new reality, and add a new index line for this unification.

---

## Self-Review Notes

- **Spec coverage:** every block the mapping agent found (protected-mode rewrite, autoname param, orbit mode, capture harness, `__srDeep`, `DEMO_SCENE_URL`) has a task. The one thing intentionally NOT touched: deeper code-reuse between the capture harness's `VideoEncoder` loop and `113b_camera_animation_panel.js`'s `_camAnimMakeExporter` — flagged by the mapping agent as an opportunity, but out of scope here to keep risk down (the capture harness is a live production pipeline; only its muxer import was de-duplicated, not its control flow).
- **Placeholder scan:** Task 6's ported block was re-verified against the real 192-line source (`sed -n '17948,18139p'` on the online file) during plan-writing — no abbreviated/placeholder sections remain; the fragment in the plan is the full, exact text with only the one documented muxer-import change.
- **Type/naming consistency:** `Mp4Muxer`/`Mp4ArrayBufferTarget` names in Task 6 match the actual import aliases already established in `src/js/010_state.js` this week for the camera-animation rewrite (`import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';`) — verified against that file's real content, not assumed.
