# Project File Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the viewer save/open a project as a real linked file (via the browser's File System Access API) so repeat saves overwrite the same file silently instead of triggering a fresh download every time, with a visible "🔗 連携中 / 未保存" badge and full fallback to today's download/file-input behavior on unsupported browsers (Safari).

**Architecture:** A new module (`src/js/320_file_handle_link.js`) holds an in-memory `FileSystemFileHandle` (`_linkedHandle`) plus a small badge-rendering helper. `saveProjectZip()` and `loadProjectZip()` are modified at their I/O boundary only — the ZIP-building/parsing logic they already have is untouched. A new `_disposeProjectZip(zipBuf, suggestedName)` helper centralizes the "write these bytes somewhere" decision (overwrite linked handle → `showSaveFilePicker` to establish a new link → classic Blob/`<a>` download fallback).

**Tech Stack:** Vanilla JS (no framework, no bundler beyond the repo's `node build.mjs` concatenation build), File System Access API (`showOpenFilePicker`/`showSaveFilePicker`/`FileSystemFileHandle`), fflate (already in use for ZIP).

**Spec:** `docs/superpowers/specs/2026-08-03-project-file-linkage-design.md`

**No test framework in this repo** (confirmed with the user 2026-08-02). Every task below is verified by rebuilding (`node build.mjs`), serving the built HTML locally, and driving it with the `Claude_Browser` MCP tools (`javascript_tool` to stub `window.showSaveFilePicker`/`showOpenFilePicker` and inspect DOM/console, `read_console_messages` to confirm log lines). This mirrors the verification approach already used earlier in this project for the lite-save/reattach feature — screenshots are not required for this feature since nothing here is a layout/visual change beyond the small badge (verify that with `read_page`/`javascript_tool` DOM reads).

---

### Task 1: File-link state module + badge markup/CSS

**Files:**
- Create: `src/js/320_file_handle_link.js`
- Modify: `src/html/020_view_buttons_ar.html:82-85` (add badge span next to `#tb-project-name`)
- Modify: `src/css/010_style_block.css` (append badge styles)

- [ ] **Step 1: Add the badge span to the topbar markup**

In `src/html/020_view_buttons_ar.html`, the project-name span currently ends at line 85:

```html
    <span id="tb-project-name" class="tb-pn"
      style="font-size:.78em;color:rgba(200,200,200,.9);cursor:text;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;padding:2px 22px 2px 9px;border-radius:5px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05);user-select:none;letter-spacing:.02em;"
      onclick="startEditProjectName()" ondblclick="startEditProjectName()"
      title="クリックして名前を編集">Untitled Project</span>
```

Replace it with (adds the badge span right after, same line-ending style):

```html
    <span id="tb-project-name" class="tb-pn"
      style="font-size:.78em;color:rgba(200,200,200,.9);cursor:text;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;padding:2px 22px 2px 9px;border-radius:5px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05);user-select:none;letter-spacing:.02em;"
      onclick="startEditProjectName()" ondblclick="startEditProjectName()"
      title="クリックして名前を編集">Untitled Project</span>
    <span id="tb-link-badge" class="tb-link-badge unsaved"></span>
```

- [ ] **Step 2: Add badge CSS**

Append to the end of `src/css/010_style_block.css`:

```css
/* ── Project file-link badge (next to #tb-project-name) ──────────────────
   "🔗 連携中" = saving overwrites the linked file directly (File System
   Access API). "未保存" = next save will download / prompt for a location.
   See docs/superpowers/specs/2026-08-03-project-file-linkage-design.md. */
#topbar .tb-link-badge{
  display:inline-flex;align-items:center;margin-left:6px;
  border-radius:10px;padding:1px 8px;font-size:.68em;white-space:nowrap;
  letter-spacing:.02em;
}
#topbar .tb-link-badge.linked{
  background:rgba(100,255,150,.15);color:#8f8;border:1px solid rgba(100,255,150,.4);
}
#topbar .tb-link-badge.unsaved{
  background:rgba(255,255,255,.06);color:#888;border:1px solid rgba(255,255,255,.15);
}
```

- [ ] **Step 3: Create the state module**

Create `src/js/320_file_handle_link.js`:

```js
// ══════════════════════════════════════════════════
//  PROJECT FILE LINKAGE (File System Access API)
//  docs/superpowers/specs/2026-08-03-project-file-linkage-design.md
// ══════════════════════════════════════════════════
// _linkedHandle lives in memory ONLY — closing or reloading the tab clears
// it by design (no IndexedDB persistence). Re-establish via "開く" or the
// next "保存" (showSaveFilePicker).
let _linkedHandle = null;
let _linkedFileName = null;

function _supportsFSAccess(){
  return typeof window.showSaveFilePicker === 'function'
      && typeof window.showOpenFilePicker === 'function';
}

function _updateLinkBadge(){
  const el = document.getElementById('tb-link-badge');
  if(!el) return;
  if(_linkedHandle){
    el.textContent = T('tb-link-connected');
    el.title = _linkedFileName || '';
    el.classList.add('linked');
    el.classList.remove('unsaved');
  } else {
    el.textContent = T('tb-link-unsaved');
    el.title = '';
    el.classList.add('unsaved');
    el.classList.remove('linked');
  }
}

window.addEventListener('load', () => { _updateLinkBadge(); });
```

- [ ] **Step 4: Build**

Run:
```bash
cd /f/Htlml/3DGS/Locahun3D && node build.mjs
```
Expected: `OK: built F:\Htlml\3DGS\Locahun3D\Locahun3D_OfflineViewer.html (NNN KB)` — no errors.

- [ ] **Step 5: Verify the badge renders on load**

Serve the built file locally (`python -m http.server 8971` from the repo root — kill the port-specific PID when done, never a blanket `taskkill /F /IM python.exe`) and open it in the Browser pane. Run via `javascript_tool`:

```js
(() => {
  const el = document.getElementById('tb-link-badge');
  return { text: el && el.textContent, classes: el && [...el.classList] };
})()
```

Expected: `{"text":"未保存","classes":["tb-link-badge","unsaved"]}` (once Task 4 adds the i18n key the text will read "未保存"; until then `T('tb-link-unsaved')` falls back to returning the raw key string per `T()`'s `?? key` fallback — that's fine, this step only confirms the element exists and the function ran without throwing. Note the exact string doesn't matter yet, only that `classes` includes `"unsaved"`).

- [ ] **Step 6: Commit**

```bash
git add src/html/020_view_buttons_ar.html src/css/010_style_block.css src/js/320_file_handle_link.js Locahun3D_OfflineViewer.html
git commit -m "feat(viewer): add project file-link state module and topbar badge"
```

---

### Task 2: `_disposeProjectZip()` + wire into `saveProjectZip()`

**Files:**
- Modify: `src/js/320_file_handle_link.js` (append `_disposeProjectZip`)
- Modify: `src/js/310_zip_project_save_load_fflate.js:349-390`

- [ ] **Step 1: Append `_disposeProjectZip` to the state module**

Append to `src/js/320_file_handle_link.js`:

```js

// Writes zipBuf to disk using the best available method:
//  - already linked                     → overwrite the held handle silently
//  - FS Access supported, no handle yet → showSaveFilePicker, remember the handle
//  - unsupported / user cancelled       → classic Blob+<a> download (unchanged)
// Returns {mode:'linked'|'new-link'|'download'}.
async function _disposeProjectZip(zipBuf, suggestedName){
  const _en = window._lang === 'en';
  if(_linkedHandle){
    try{
      const writable = await _linkedHandle.createWritable();
      await writable.write(zipBuf);
      await writable.close();
      return {mode:'linked'};
    }catch(e){
      console.warn('[fileLink] overwrite failed, unlinking:', e);
      _linkedHandle = null; _linkedFileName = null;
      _updateLinkBadge();
      showUndoToast(_en
        ? '⚠ Overwrite failed — downloading instead'
        : '⚠ 上書きに失敗したためダウンロードします');
      // fall through to the download branch below
    }
  }
  if(_supportsFSAccess()){
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types:[{description:'Locahun3D Project', accept:{'application/zip':['.zip']}}],
      });
      const writable = await handle.createWritable();
      await writable.write(zipBuf);
      await writable.close();
      _linkedHandle = handle; _linkedFileName = handle.name;
      _updateLinkBadge();
      return {mode:'new-link'};
    }catch(e){
      if(e && e.name !== 'AbortError') console.warn('[fileLink] showSaveFilePicker failed:', e);
      // AbortError (user cancelled) or any other failure — fall through to download
    }
  }
  const blob = new Blob([zipBuf], {type:'application/zip'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  return {mode:'download'};
}
```

- [ ] **Step 2: Replace the inline download block in `saveProjectZip()`**

In `src/js/310_zip_project_save_load_fflate.js`, find (around line 349-356):

```js
    const zipBuf = fflate.zipSync(zipEntries);
    const blob=new Blob([zipBuf],{type:'application/zip'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    const _liteSuffix=_skipSplatData?'_lite':'';
    a.download=(_projectName||'scene_project').replace(/[^a-zA-Z0-9_\\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g,'_')+_liteSuffix+'.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
```

Replace with:

```js
    const zipBuf = fflate.zipSync(zipEntries);
    const _liteSuffix=_skipSplatData?'_lite':'';
    const _suggestedName=(_projectName||'scene_project').replace(/[^a-zA-Z0-9_\\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g,'_')+_liteSuffix+'.zip';
    const _disposeResult = await _disposeProjectZip(zipBuf, _suggestedName);
```

- [ ] **Step 3: Add a mode-specific note to the final toasts**

Immediately below (still in `src/js/310_zip_project_save_load_fflate.js`), find:

```js
    const _streamNote = streamed>0
      ? (_en ? ` · ${streamed} streamed via URL (online required)` : ` · ${streamed}件はURLストリーミング参照（再生にネット必要）`)
      : '';
    if(_skipSplatData){
```

Insert a new `_modeNote` line right before `if(_skipSplatData){`, and append `${_modeNote}` to both toast templates below it. The full block becomes:

```js
    const _streamNote = streamed>0
      ? (_en ? ` · ${streamed} streamed via URL (online required)` : ` · ${streamed}件はURLストリーミング参照（再生にネット必要）`)
      : '';
    const _modeNote = _disposeResult.mode==='linked'
      ? (_en ? ' · overwritten in linked file' : ' · 連携先に上書き保存')
      : _disposeResult.mode==='new-link'
        ? (_en ? ' · now linked to this file' : ' · このファイルと連携開始')
        : '';
    if(_skipSplatData){
      const mb = Math.round(_totalSplatBytes / 1024 / 1024);
      showUndoToast(_en
        ? `📦 Lite save: skipped ${_skippedSplatCount} splat file(s) (${mb} MB). Loading this ZIP later will ask you to re-select the original 3DGS file.${_modeNote}`
        : `📦 軽量保存: Splat ${_skippedSplatCount}件 (${mb} MB) を除外して保存しました。次回読込時に元の3DGSファイルの選択が必要です。${_modeNote}`);
    } else {
      showUndoToast(missing>0
        ?(_en?`⚠ ZIP save: ${missing} file(s) uncached (reload then save)`
             :`⚠ ZIP保存: ${missing}件はファイル未キャッシュ（再読込後に保存してください）`)
        :(_en?`✅ ZIP saved (${fileCount} file${fileCount===1?'':'s'} + project.json${_offlineNote}${_streamNote}${_modeNote})`
             :`✅ ZIP保存完了 (${fileCount}ファイル + project.json${_offlineNote}${_streamNote}${_modeNote})`));
    }
```

- [ ] **Step 4: Build**

```bash
cd /f/Htlml/3DGS/Locahun3D && node build.mjs
```
Expected: `OK: built ... .html (NNN KB)`.

- [ ] **Step 5: Verify — no linked handle, FS Access stubbed to succeed → becomes linked**

Serve the built HTML, open a scene (a small synthetic `.splat` file is enough — see the pattern used earlier in this project: 500 rows × 32 bytes, random floats/positions, written with a short Python snippet, then dispatched via a synthetic `DragEvent('drop', ...)` on `document`). Then run via `javascript_tool`:

```js
(async () => {
  const written = [];
  window.showSaveFilePicker = async (opts) => ({
    name: opts.suggestedName,
    async createWritable(){
      return {
        async write(bytes){ written.push(bytes); },
        async close(){},
      };
    },
  });
  await window.saveProjectZip();
  await new Promise(r=>setTimeout(r,200));
  const badge = document.getElementById('tb-link-badge');
  return {
    wroteBytes: written.length === 1 && written[0].byteLength > 0,
    badgeClasses: [...badge.classList],
    toast: document.getElementById('undo-toast').textContent,
  };
})()
```

Expected: `wroteBytes: true`, `badgeClasses` includes `"linked"` (not `"unsaved"`), toast includes "このファイルと連携開始" (or "now linked to this file" in EN).

- [ ] **Step 6: Verify — already linked → silent overwrite, no picker call**

Immediately after Step 5 (badge is now `linked`), run:

```js
(async () => {
  let pickerCalled = false;
  window.showSaveFilePicker = async () => { pickerCalled = true; return null; };
  const written = [];
  // _linkedHandle from the previous step still holds our fake handle with
  // its own createWritable — patch it to record this second write too.
  await window.saveProjectZip();
  await new Promise(r=>setTimeout(r,200));
  return { pickerCalled, toast: document.getElementById('undo-toast').textContent };
})()
```

Expected: `pickerCalled: false` (the linked-handle branch returned before ever reaching `showSaveFilePicker`), toast includes "連携先に上書き保存" (or "overwritten in linked file").

- [ ] **Step 7: Verify — overwrite failure falls back to download and unlinks**

Reload the page fresh (clears `_linkedHandle`), load the scene again, then:

```js
(async () => {
  window.showSaveFilePicker = async (opts) => ({
    name: opts.suggestedName,
    async createWritable(){ return { async write(){ throw new Error('disk full'); }, async close(){} }; },
  });
  await window.saveProjectZip(); // establishes a link, but this save's own write doesn't throw — it's the NEXT save that hits the throwing handle
  await new Promise(r=>setTimeout(r,200));
  window.__downloadCaptured = null;
  const origCreate = document.createElement.bind(document);
  document.createElement = function(tag){
    const el = origCreate(tag);
    if(tag === 'a'){ el.click = function(){ window.__downloadCaptured = el.download; }; }
    return el;
  };
  await window.saveProjectZip(); // this one hits the throwing writable → should unlink + fall back to download
  await new Promise(r=>setTimeout(r,200));
  const badge = document.getElementById('tb-link-badge');
  return { downloaded: !!window.__downloadCaptured, badgeClasses: [...badge.classList] };
})()
```

Expected: `downloaded: true`, `badgeClasses` includes `"unsaved"` (unlinked after the failed overwrite).

- [ ] **Step 8: Commit**

```bash
git add src/js/320_file_handle_link.js src/js/310_zip_project_save_load_fflate.js Locahun3D_OfflineViewer.html
git commit -m "feat(viewer): route ZIP save through linked-file overwrite when available"
```

---

### Task 3: FS-Access branch in `loadProjectZip()`

**Files:**
- Modify: `src/js/311_zip_load_core.js:134-142`

- [ ] **Step 1: Extract the existing `<input>` flow and add the FS-Access branch**

In `src/js/311_zip_load_core.js`, find:

```js
window.loadProjectZip = function(){
  const input=document.createElement('input');
  input.type='file'; input.accept='.zip';
  input.onchange=async(e)=>{
    const f=e.target.files[0]; if(!f) return;
    await _loadProjectZipFromFile(f);
  };
  input.click();
};
```

Replace with:

```js
function _loadProjectZipViaInput(){
  const input=document.createElement('input');
  input.type='file'; input.accept='.zip';
  input.onchange=async(e)=>{
    const f=e.target.files[0]; if(!f) return;
    await _loadProjectZipFromFile(f);
  };
  input.click();
}

window.loadProjectZip = function(){
  if(_supportsFSAccess()){
    window.showOpenFilePicker({
      types:[{description:'Locahun3D Project', accept:{'application/zip':['.zip']}}],
    }).then(async ([handle])=>{
      const file = await handle.getFile();
      await _loadProjectZipFromFile(file);
      _linkedHandle = handle; _linkedFileName = handle.name;
      _updateLinkBadge();
    }).catch((e)=>{
      if(e && e.name === 'AbortError') return; // user cancelled — do nothing
      console.warn('[fileLink] showOpenFilePicker failed, falling back:', e);
      _loadProjectZipViaInput();
    });
    return;
  }
  _loadProjectZipViaInput();
};
```

- [ ] **Step 2: Build**

```bash
cd /f/Htlml/3DGS/Locahun3D && node build.mjs
```
Expected: `OK: built ... .html (NNN KB)`.

- [ ] **Step 3: Verify — open via FS Access establishes a link**

Serve the built HTML fresh and load a synthetic splat scene first (so the ZIP produced below has something in it). Then run this single self-contained script via `javascript_tool` — it captures a real save as a `File`, then feeds that `File` back in through a stubbed `showOpenFilePicker`:

```js
(async () => {
  // 1. Produce a project ZIP File by hooking the download <a> the normal
  //    saveProjectZip() path creates (same capture technique used earlier
  //    in this project for testing saveProjectZip).
  window.__lastAnchor = null;
  const origCreate = document.createElement.bind(document);
  document.createElement = function(tag){
    const el = origCreate(tag);
    if(tag === 'a'){ el.click = function(){ window.__lastAnchor = {href: el.href, download: el.download}; }; }
    return el;
  };
  delete window.showSaveFilePicker; // force the plain-download branch for this capture
  await window.saveProjectZip();
  await new Promise(r=>setTimeout(r,150));
  const zipBuf = await (await fetch(window.__lastAnchor.href)).arrayBuffer();
  const zipFile = new File([zipBuf], window.__lastAnchor.download, {type:'application/zip'});

  // 2. Reload-equivalent: clear any link state a prior step may have left,
  //    by re-declaring the module state is not possible from outside, so
  //    this step should be run on a FRESH page load (badge starts unsaved).
  window.showOpenFilePicker = async () => [{
    name: zipFile.name,
    async getFile(){ return zipFile; },
  }];
  window.loadProjectZip();
  await new Promise(r=>setTimeout(r, 2000));
  const badge = document.getElementById('tb-link-badge');
  return { badgeClasses: [...badge.classList], toast: document.getElementById('undo-toast').textContent };
})()
```

Expected: `badgeClasses` includes `"linked"`, toast shows the normal ZIP-restore success message (`_loadProjectZipFromFile` is completely unmodified, so its own toast is unchanged).

- [ ] **Step 4: Verify — drag-and-drop open stays unlinked**

Reload fresh, drop a project ZIP via `document.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:dt}))` (same pattern as the existing lite-save reattach tests in this project — `dt.items.add(zipFile)`), then:

```js
(() => {
  const badge = document.getElementById('tb-link-badge');
  return [...badge.classList];
})()
```

Expected: includes `"unsaved"` — dropped files never carry a writable handle, so the project loads normally but stays unlinked (matches the spec).

- [ ] **Step 5: Verify — cancelling the picker does not fall back to the `<input>` flow**

```js
(async () => {
  window.showOpenFilePicker = async () => { const e = new Error('cancelled'); e.name='AbortError'; throw e; };
  window.__inputOpened = false;
  const origCreate = document.createElement.bind(document);
  document.createElement = function(tag){
    const el = origCreate(tag);
    if(tag === 'input'){ el.click = function(){ window.__inputOpened = true; }; }
    return el;
  };
  window.loadProjectZip();
  await new Promise(r=>setTimeout(r, 500));
  return { inputOpened: window.__inputOpened };
})()
```

Expected: `inputOpened: false` — an `AbortError` must NOT fall back to the `<input>` picker (the spec says cancel = do nothing).

- [ ] **Step 6: Commit**

```bash
git add src/js/311_zip_load_core.js Locahun3D_OfflineViewer.html
git commit -m "feat(viewer): open project via File System Access when available"
```

---

### Task 4: i18n badge text + language-switch refresh

**Files:**
- Modify: `src/js/250_i18n.js` (JA dict, EN dict, `applyI18n()`)

- [ ] **Step 1: Add JA dictionary entries**

In `src/js/250_i18n.js`, find the line added earlier in this project's history:

```js
  'rm-title':'📎 3DGSファイルの再選択が必要です',
  'rm-pick':'📎 ファイルを選択',
  'rm-skip':'スキップ（元データなしで復元）',
```

Add two new keys right after it (still inside the `I18N.ja` object):

```js
  'rm-title':'📎 3DGSファイルの再選択が必要です',
  'rm-pick':'📎 ファイルを選択',
  'rm-skip':'スキップ（元データなしで復元）',
  'tb-link-connected':'🔗 連携中',
  'tb-link-unsaved':'未保存',
```

- [ ] **Step 2: Add EN dictionary entries**

Find the matching EN block:

```js
  'rm-title':'📎 3DGS file re-select needed',
  'rm-pick':'📎 Select File',
  'rm-skip':'Skip (restore without original data)',
```

Add:

```js
  'rm-title':'📎 3DGS file re-select needed',
  'rm-pick':'📎 Select File',
  'rm-skip':'Skip (restore without original data)',
  'tb-link-connected':'🔗 Linked',
  'tb-link-unsaved':'Unsaved',
```

- [ ] **Step 3: Refresh the badge on language switch**

In `applyI18n()` (same file), find:

```js
  // Refresh the reset / reposition button label depending on walk mode
  if(typeof _refreshResetBtnLabel === 'function'){
    _refreshResetBtnLabel();
  }
```

Insert a new block immediately before it:

```js
  // Refresh the project file-link badge (state doesn't change on language
  // switch, only its displayed text does).
  if(typeof _updateLinkBadge === 'function') _updateLinkBadge();
  // Refresh the reset / reposition button label depending on walk mode
  if(typeof _refreshResetBtnLabel === 'function'){
    _refreshResetBtnLabel();
  }
```

- [ ] **Step 4: Build**

```bash
cd /f/Htlml/3DGS/Locahun3D && node build.mjs
```
Expected: `OK: built ... .html (NNN KB)`.

- [ ] **Step 5: Verify badge text in both languages**

Serve the built HTML fresh, then:

```js
(() => {
  const before = document.getElementById('tb-link-badge').textContent;
  window.toggleLang();
  const afterEN = document.getElementById('tb-link-badge').textContent;
  window.toggleLang();
  const afterJA = document.getElementById('tb-link-badge').textContent;
  return { before, afterEN, afterJA };
})()
```

Expected: `before: "未保存"`, `afterEN: "Unsaved"`, `afterJA: "未保存"` (round-trips cleanly, matching the exact strings from Steps 1-2).

- [ ] **Step 6: Commit**

```bash
git add src/js/250_i18n.js Locahun3D_OfflineViewer.html
git commit -m "feat(viewer): add JA/EN strings for the file-link badge"
```

---

### Task 5: End-to-end regression pass + unsupported-browser fallback proof

**Files:** none (verification only, no code changes expected — this task exists to catch integration issues across Tasks 1-4 before considering the feature done)

- [ ] **Step 1: Full happy-path walkthrough on a fresh load**

Serve the freshly-built HTML. Load a synthetic splat scene (same generator script used throughout this project's session — 500 rows × 32 bytes). Without stubbing anything (i.e. using the REAL `window.showSaveFilePicker`/`showOpenFilePicker` if the embedded Browser pane's Chromium supports them — check first with `typeof window.showSaveFilePicker` via `javascript_tool`; if the automation environment can't drive the native OS picker dialog, stub exactly as in Task 2/3's steps instead and rely on those for full coverage), confirm:
- Badge starts `unsaved`
- `saveProjectZip()` (stubbed picker returning a fake handle) flips badge to `linked` and a second save doesn't call the picker again (Task 2 Steps 5-6 already prove this — just confirm both still pass after Tasks 3-4 landed on top).

- [ ] **Step 2: Simulate an unsupported browser (Safari-equivalent) and prove zero regression**

```js
(async () => {
  const savedSave = window.showSaveFilePicker;
  const savedOpen = window.showOpenFilePicker;
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
  window.__downloadCaptured = null;
  const origCreate = document.createElement.bind(document);
  document.createElement = function(tag){
    const el = origCreate(tag);
    if(tag === 'a'){ el.click = function(){ window.__downloadCaptured = el.download; }; }
    return el;
  };
  await window.saveProjectZip();
  await new Promise(r=>setTimeout(r,200));
  const badge = document.getElementById('tb-link-badge');
  const result = { downloaded: !!window.__downloadCaptured, badgeClasses: [...badge.classList] };
  window.showSaveFilePicker = savedSave;
  window.showOpenFilePicker = savedOpen;
  return result;
})()
```

Expected: `downloaded: true`, `badgeClasses` includes `"unsaved"` — with both FS Access functions absent, the save falls straight to the classic download path and the badge never claims a link, exactly matching today's pre-feature behavior for Safari users.

- [ ] **Step 3: Confirm the existing lite-save + reattach feature (from the prior session) still works unmodified**

Re-run the exact lite-save round-trip already established in this project (save with `saveProjectZip(true)`, confirm the ZIP contains only `project.json`, reload, load that lite ZIP, confirm the reattach modal (`#reattach-modal`) appears and completes correctly when the original splat file is re-supplied). This task's changes only touch the *disposal* step of `saveProjectZip` and the *entry point* of `loadProjectZip` — the ZIP-building/parsing bodies are untouched, so this should need no code changes, only confirmation.

- [ ] **Step 4: Clean up test artifacts and stop any local server**

```bash
rm -f "F:/Htlml/3DGS/Locahun3D/test_scene.splat"
```

Find and stop the local `python -m http.server` by exact PID (never a blanket `taskkill /F /IM python.exe` — see `feedback_session_bloat_and_taskkill` project convention):

```bash
netstat -ano | grep ":8971" | grep LISTENING
```
then
```bash
taskkill //F //PID <the PID printed above>
```

- [ ] **Step 5: Final commit (if Step 1-3 surfaced any fixes)**

```bash
git add -A
git commit -m "test(viewer): confirm project file-linkage end-to-end, no regressions"
```

If nothing needed fixing, skip this commit — Tasks 1-4 already each committed their own work.

---

## Plan self-review notes

- **Spec coverage:** save state machine (Task 2), open state machine (Task 3), badge UI (Task 1 + 4), error fallback (Task 2 Step 7), lite-save untouched (Task 5 Step 3), Safari/unsupported unchanged (Task 5 Step 2). All spec sections have a corresponding task.
- **Type consistency:** `_disposeProjectZip(zipBuf, suggestedName)` returns `{mode}`; the only consumer (`saveProjectZip`) reads `_disposeResult.mode` with the same three string values (`'linked'|'new-link'|'download'`) used in both the function and its caller. `_linkedHandle`/`_linkedFileName`/`_updateLinkBadge`/`_supportsFSAccess` are named identically everywhere they're referenced (Tasks 1-4).
- **No placeholders:** every step shows the exact code to write and the exact command + expected output to verify it.
