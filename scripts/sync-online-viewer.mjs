import fs from 'node:fs/promises';
import {watch} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';

const SOURCE = 'F:/Htlml/3DGS/Locahun3D';
const TARGET = 'F:/Htlml/3DGS/locahun3d_online';
const VENDOR = 'vendor/spark-2.0.0-workers16-incrtraverse.module.js';
const LEGACY_VENDOR = 'public/viewer/vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js';
const ONLINE = 'Locahun3D_OfflineViewer.online.html';
export const OWNED_FILES = ['public/viewer/offline-viewer.html', 'public/viewer/' + VENDOR];
export const REGRESSION_TESTS = [
  'scripts/test-embed-viewer-native.mjs',
  'scripts/test-avatar-existing-clips.mjs',
  'scripts/test-avatar-motion-review-harness.mjs',
  'scripts/test-avatar-physical-motion.mjs',
  'scripts/perf-vendor-adoption.test.mjs',
  'scripts/perf-release-assets.test.mjs',
  'scripts/perf-collision-route.test.mjs',
  'scripts/test-public-demo-collision.mjs',
  'scripts/test-public-demo-runtime.mjs',
  'scripts/test-collision-persistent-cache.mjs',
  'scripts/walk-collision.test.mjs',
  'scripts/test-walk-auto.mjs',
  'scripts/test-walk-bridge.mjs',
  'scripts/test-walk-settings.mjs',
  'scripts/test-walk-lifecycle.mjs',
  'scripts/test-walk-airborne-pending.mjs',
  'scripts/test-whole-collision.mjs',
  'scripts/test-whole-collision-bake.mjs',
  'scripts/test-whole-collision-bridge.mjs',
  'scripts/test-collision-tiles.mjs',
  'scripts/test-collision-source-identity.mjs',
  'scripts/test-collision-asset-headers.mjs',
  'scripts/test-local-collision-headers.mjs',
  'scripts/test-avatar-speed-transitions.mjs',
  'scripts/test-equipment-models.mjs',
  'scripts/test-auto-camera.mjs',
  'scripts/test-path-styling.mjs',
  'scripts/test-path-defaults.mjs',
  'scripts/test-local-project-client.mjs',
  'scripts/test-avatar-locomotion.mjs',
  'scripts/test-avatar-stair-detail.mjs',
  'scripts/test-avatar-core-replacement.mjs',
  'scripts/test-walk-input-release.mjs',
  'scripts/test-camera-collision.mjs',
  'scripts/test-camera-near-avatar.mjs',
  'scripts/test-path-strict-pick.mjs',
  'scripts/avatar-assets/test_asset.mjs',
  'scripts/avatar-assets/test_runtime.mjs',
  'scripts/avatar-assets/test_foot_terrain.mjs',
  'scripts/avatar-assets/test_obj_depth.mjs',
  'scripts/avatar-assets/test_obj_export.mjs',
];
const RAPIER_INPUTS = ['vendor/rapier-walk/rapier.mjs', 'vendor/rapier-walk/provenance.json'];
const SPARK_INPUTS = ['vendor/spark-2.0.0-workers16-incrtraverse.module.js', 'vendor/spark-heap319-v1/provenance.json', 'vendor/spark-heap319-v1/heap-pop.rs'];
const BUILD_INPUTS = ['scripts/prepare-viewer-release.mjs', 'scripts/viewer-update-core.cjs', 'scripts/perf-wasm-tools.mjs', 'scripts/perf-release-assets.mjs', 'scripts/public-demo-collision-contract.mjs'];
const TEST_INPUTS = ['scripts/fixtures/avatar-stairs-2fstudio.json', 'scripts/fixtures/avatar-stairs-hybrid-2fstudio.json', 'scripts/fixtures/avatar-indoor-replacement-2fstudio.json'];
const avatarInput = name => !name.split(/[\\/]/).includes('node_modules') && /\.(?:mjs|cjs|js|json)$/.test(name);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, args) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], {encoding: 'utf8'}).trim();

async function repository(root) {
  const real = await fs.realpath(root);
  const top = await fs.realpath(git(real, ['rev-parse', '--show-toplevel']));
  if (real !== top) throw new Error('Expected repository root: ' + root);
  return real;
}

async function readOptional(file) {
  try { return await fs.readFile(file); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

// Refuse junctions/symlinks at every owned-path component, including absent-file parents.
async function safePath(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symlink/junction is not a sync destination: ' + current);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}

async function sourceDigest(root) {
  const digest = createHash('sha256');
  async function visit(relative, filtered = false) {
    const file = path.join(root, relative), stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw new Error('Source symlink is not canonical: ' + file);
    if (stat.isDirectory()) {
      for (const entry of (await fs.readdir(file, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === 'node_modules') continue;
        if (filtered && !entry.isDirectory() && !avatarInput(entry.name)) continue;
        await visit(relative + '/' + entry.name, filtered);
      }
    } else if (stat.isFile()) {
      digest.update(relative + '\0'); digest.update(hash(await fs.readFile(file)));
    } else throw new Error('Unsupported source input: ' + file);
  }
  for (const relative of ['src', 'collision', 'worker.js', VENDOR, ...RAPIER_INPUTS, ...SPARK_INPUTS, ...BUILD_INPUTS, ...TEST_INPUTS, 'build.mjs',
    ...REGRESSION_TESTS.filter(name => !name.startsWith('scripts/avatar-assets/'))]) await visit(relative);
  await visit('scripts/avatar-assets', true);
  return digest.digest('hex');
}

async function targetGuard(sourceRoot, targetRoot, stateFile) {
  const stateBytes = await readOptional(stateFile);
  const state = stateBytes ? JSON.parse(stateBytes) : null;
  const keys = Object.keys(state?.files || {}).sort().join('|');
  const legacy = !!state && keys === [OWNED_FILES[0], LEGACY_VENDOR].sort().join('|');
  if (state && (state.version !== 1 || state.sourceRoot !== sourceRoot || state.targetRoot !== targetRoot ||
      (!legacy && keys !== [...OWNED_FILES].sort().join('|'))))
    throw new Error('Invalid sync ownership/source state; review before retrying.');
  // A new immutable URL may be introduced only after checking every old owned byte.
  if (legacy) for (const relative of [OWNED_FILES[0], LEGACY_VENDOR]) {
    const bytes = await readOptional(await safePath(targetRoot, relative));
    if (!bytes || hash(bytes) !== state.files[relative]) throw new Error('Legacy target hash mismatch: ' + relative);
  }
  if (!state && git(targetRoot, ['status', '--porcelain', '--untracked-files=all', '--', ...OWNED_FILES]))
    throw new Error('Initial target owned files are dirty or untracked; refusing to overwrite.');
  for (const relative of OWNED_FILES) {
    const file = await safePath(targetRoot, relative), bytes = await readOptional(file);
    if (state) {
      if (legacy && relative !== OWNED_FILES[0]) {
        if (bytes && hash(bytes)!==hash(await fs.readFile(await safePath(sourceRoot,VENDOR))))
          throw new Error('New versioned target already existing with different bytes; refusing to overwrite: ' + file);
      } else if (!bytes || hash(bytes) !== state.files[relative]) throw new Error('Target hash mismatch (modified or missing): ' + file);
    } else if (bytes) {
      // git status omits ignored untracked files. Never adopt those silently.
      try { git(targetRoot, ['ls-files', '--error-unmatch', '--', relative]); }
      catch { throw new Error('Initial target contains an untracked/ignored file: ' + file); }
    }
  }
  return state;
}

function node(root, args, log) {
  return new Promise((resolve, reject) => {
    // A nested test runner must not inherit the parent's worker identity.
    const env = {...process.env};
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, {cwd: root, env, shell: false, windowsHide: true});
    let tail = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      tail = (tail + chunk).slice(-8000);
      log(chunk.toString().trimEnd());
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve();
      else reject(new Error('Source command failed: node ' + args.join(' ') + (timedOut ? ' (timeout)' : '') + '\n' + tail));
    });
  });
}

// Explicit roots are an import-only seam for isolated tests. CLI has no path overrides.
export async function syncOnce({sourceRoot = SOURCE, targetRoot = TARGET, log = console.log, guard, dryRun = false} = {}) {
  sourceRoot = await repository(sourceRoot); targetRoot = await repository(targetRoot);
  if (sourceRoot === targetRoot) throw new Error('Source and target must be different repositories.');
  await guard?.();
  const metadata = name => path.resolve(targetRoot, git(targetRoot, ['rev-parse', '--git-path', name]));
  const stateFile = metadata('locahun-viewer-sync-state.json');
  const lockFile = metadata('locahun-viewer-sync.lock');
  let lock;
  try {
    if (dryRun) {
      if (await readOptional(lockFile)) throw Object.assign(new Error('Existing lock'), {code:'EEXIST'});
    } else lock = await fs.open(lockFile, 'wx');
  }
  catch (e) { if (e.code === 'EEXIST') throw new Error('Sync lock exists; another run or interrupted run requires review: ' + lockFile); throw e; }
  const staged = [];
  try {
    await lock?.writeFile(JSON.stringify({pid: process.pid, sourceRoot, targetRoot}));
    await targetGuard(sourceRoot, targetRoot, stateFile);
    const before = await sourceDigest(sourceRoot);
    log('Building offline and online variants.');
    await node(sourceRoot, ['build.mjs'], log);
    await node(sourceRoot, ['build.mjs', '--online'], log);
    const products = [await fs.readFile(path.join(sourceRoot, ONLINE)), await fs.readFile(path.join(sourceRoot, VENDOR))];
    if (products.some(bytes => !bytes.length)) throw new Error('Build produced an empty sync file.');
    log('Running regression gates.');
    await node(sourceRoot, ['--test', ...REGRESSION_TESTS], log);
    if (before !== await sourceDigest(sourceRoot)) throw new Error('Canonical source changed during build/tests; no files synced. Retry.');
    if (hash(await fs.readFile(path.join(sourceRoot, ONLINE))) !== hash(products[0]))
      throw new Error('Build output changed during tests; no files synced.');
    const files = Object.fromEntries(OWNED_FILES.map((name, i) => [name, hash(products[i])]));
    if (dryRun) {
      await targetGuard(sourceRoot, targetRoot, stateFile);
      await guard?.();
      if (await readOptional(lockFile)) throw new Error('Sync lock appeared during dry run.');
      if (before !== await sourceDigest(sourceRoot)) throw new Error('Canonical source changed during dry run.');
      const proposed = [];
      for (const relative of OWNED_FILES) {
        const bytes = await readOptional(await safePath(targetRoot,relative));
        proposed.push({relative,currentSha256:bytes ? hash(bytes) : null,sha256:files[relative]});
      }
      const result = {dryRun:true,sourceDigest:before,changed:proposed.some(p=>p.currentSha256!==p.sha256),files,proposed};
      log(JSON.stringify(result));
      return result;
    }
    let changed = false;
    for (let i = 0; i < OWNED_FILES.length; i++) {
      const dest = await safePath(targetRoot, OWNED_FILES[i]);
      const current = await readOptional(dest);
      if (current && hash(current) === files[OWNED_FILES[i]]) continue;
      await fs.mkdir(path.dirname(dest), {recursive: true});
      const temp = dest + '.' + randomUUID() + '.sync-tmp';
      staged.push({temp, dest, relative: OWNED_FILES[i]});
      await fs.writeFile(temp, products[i], {flag: 'wx'});
      if (hash(await fs.readFile(temp)) !== files[OWNED_FILES[i]]) throw new Error('Staged copy hash mismatch.');
      changed = true;
    }
    // A user may have edited the target while tests were running.
    await targetGuard(sourceRoot, targetRoot, stateFile);
    await guard?.();
    for (const {temp, dest, relative} of staged) {
      await safePath(targetRoot, relative);
      await fs.rename(temp, dest);
    }
    for (const relative of OWNED_FILES)
      if (hash(await fs.readFile(path.join(targetRoot, relative))) !== files[relative]) throw new Error('Copied file hash mismatch: ' + relative);
    const tempState = stateFile + '.' + randomUUID() + '.sync-tmp';
    staged.push({temp: tempState});
    await fs.writeFile(tempState, JSON.stringify({version: 1, sourceRoot, targetRoot, files}, null, 2) + '\n', {flag: 'wx'});
    await fs.rename(tempState, stateFile);
    log(changed ? 'Local viewer synced. No commit, push or deploy performed.' : 'Local viewer unchanged; all gates passed.');
    return {changed, files};
  } finally {
    for (const {temp} of staged) await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') log('Temporary file cleanup failed: ' + temp); });
    if (lock) { await lock.close(); await fs.unlink(lockFile); }
  }
}

export function createSyncQueue(run, {delay = 400, onError = console.error} = {}) {
  let timer, current = null, dirty = false, closed = false;
  function schedule() {
    if (closed) return;
    dirty = true; clearTimeout(timer);
    if (current) return;
    timer = setTimeout(() => {
      dirty = false;
      current = Promise.resolve().then(run).catch(onError).finally(() => {
        current = null;
        if (dirty && !closed) schedule();
      });
    }, delay);
  }
  return {schedule, async stop() { closed = true; dirty = false; clearTimeout(timer); await current; }};
}

async function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/sync-online-viewer.mjs [--watch|--dry-run]\nDry run builds canonical outputs and tests without target writes. No commit/push/deploy.');
    return;
  }
  if (args.some(arg => !['--watch','--dry-run'].includes(arg)) || args.length > 1) throw new Error('Only --watch or --dry-run is supported; no --force, path or test bypass flags.');
  const sourceRoot = await repository(SOURCE), targetRoot = await repository(TARGET);
  if (await fs.realpath(path.dirname(path.dirname(fileURLToPath(import.meta.url)))) !== sourceRoot)
    throw new Error('Run the wrapper from the canonical source checkout, not a copied/worktree script.');
  const guard = async () => {
    if (await repository(SOURCE) !== sourceRoot || await repository(TARGET) !== targetRoot)
      throw new Error('Canonical repository location changed; no sync performed.');
    if (git(targetRoot, ['remote', 'get-url', 'origin']) !== 'https://github.com/Locahun3D/Locahun3DOnline.git' ||
      git(targetRoot, ['branch', '--show-current']) !== 'morning-restored')
      throw new Error('Unexpected online repository origin or branch; no sync performed.');
  };
  const run = () => syncOnce({sourceRoot, targetRoot, guard, dryRun:args.includes('--dry-run')});
  if (!args.includes('--watch')) return run();
  const queue = createSyncQueue(run, {onError: e => console.error(e.message)});
  const watchers = [];
  try {
    watchers.push(watch(path.join(sourceRoot, 'src'), {recursive: true}, queue.schedule));
    watchers.push(watch(path.join(sourceRoot, 'vendor'), {recursive: true}, (_, name) => {
      const relative = name && 'vendor/' + name.toString().replaceAll('\\', '/');
      if (!relative || [VENDOR, ...RAPIER_INPUTS, ...SPARK_INPUTS].includes(relative)) queue.schedule();
    }));
    // Watch directories so editor atomic-save replacements retain their subscriptions.
    watchers.push(watch(sourceRoot, (_, name) => { if (!name || ['build.mjs','worker.js'].includes(name.toString())) queue.schedule(); }));
    watchers.push(watch(path.join(sourceRoot,'collision'),{recursive:true},()=>queue.schedule()));
    watchers.push(watch(path.join(sourceRoot, 'scripts'), (_, name) => {
      if (!name || [...REGRESSION_TESTS,...BUILD_INPUTS].includes('scripts/' + name.toString())) queue.schedule();
    }));
    watchers.push(watch(path.join(sourceRoot, 'scripts/avatar-assets'), {recursive: true}, (_, name) => {
      if (!name || avatarInput(name.toString())) queue.schedule();
    }));
    watchers.push(watch(path.join(sourceRoot, 'scripts/fixtures'), (_, name) => {
      if (!name || TEST_INPUTS.includes('scripts/fixtures/' + name.toString())) queue.schedule();
    }));
    for (const watcher of watchers) watcher.on('error', e => { console.error(e.message); process.kill(process.pid, 'SIGINT'); });
    console.log('Watching canonical sources; initial sync is queued. Ctrl+C stops after the current run.');
    queue.schedule();
    await new Promise(resolve => {
      const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve(); };
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
    });
  } finally { for (const watcher of watchers) watcher.close(); await queue.stop(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
