import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {syncOnce, createSyncQueue, OWNED_FILES, REGRESSION_TESTS} from './sync-online-viewer.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function inventory(root) {
  const result = {};
  for (const name of (await fs.readdir(root, {recursive:true})).sort()) {
    const file = path.join(root,name), stat = await fs.lstat(file);
    result[name] = stat.isFile() ? [stat.size,stat.mtimeMs,hash(await fs.readFile(file))] : ['directory',stat.mtimeMs];
  }
  return result;
}
test('dry run builds and verifies without any target metadata or file writes',async t=>{
  const options=await fixture(t); await legacyState(options);
  const before=await inventory(options.targetRoot);
  const result=await syncOnce({...options,dryRun:true});
  assert.equal(result.dryRun,true); assert.equal(result.changed,true);
  assert.deepEqual(await inventory(options.targetRoot),before);
});
test('dry run rejects source drift and existing locks without target writes',async t=>{
  for(const mode of ['mutate-source','lock']) {
    const options=await fixture(t);
    if(mode==='lock') await put(options.targetRoot,'.git/locahun-viewer-sync.lock','held');
    else await put(options.sourceRoot,mode,'1');
    const before=await inventory(options.targetRoot);
    await assert.rejects(syncOnce({...options,dryRun:true}),/changed|lock/i);
    assert.deepEqual(await inventory(options.targetRoot),before);
  }
});
async function put(root, name, data) {
  const file = path.join(root, name);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, data);
}
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'locahun-sync-test-'));
  // Only this exact, freshly allocated temporary tree may be removed.
  t.after(async () => {
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith('locahun-sync-test-'));
    await fs.rm(dir, {recursive: true, force: true});
  });
  const sourceRoot = path.join(dir, 'source'), targetRoot = path.join(dir, 'target');
  for (const root of [sourceRoot, targetRoot]) {
    await fs.mkdir(root);
    execFileSync('git', ['init', '--quiet', root]);
  }
  await put(sourceRoot, 'src/template.html', '<html>fixture-v1</html>');
  await put(sourceRoot, 'vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js', 'export const fixture = 1;');
  for(const input of ['vendor/spark-2.0.0-workers16-incrtraverse.module.js','vendor/spark-heap319-v1/provenance.json','vendor/spark-heap319-v1/heap-pop.rs','scripts/perf-wasm-tools.mjs'])await put(sourceRoot,input,'fixture dependency');
  for(const input of ['scripts/perf-release-assets.mjs','scripts/public-demo-collision-contract.mjs','collision/demo-source.json','worker.js'])await put(sourceRoot,input,'fixture dependency');
  await put(sourceRoot, 'vendor/rapier-walk/rapier.mjs', 'export default {};');
  await put(sourceRoot, 'vendor/rapier-walk/provenance.json', '{}');
  await put(sourceRoot, 'scripts/avatar-assets/helpers/dependency.mjs', 'export default 1;');
  await put(sourceRoot, 'scripts/prepare-viewer-release.mjs', 'export default 1;');
  await put(sourceRoot, 'scripts/viewer-update-core.cjs', 'module.exports={};');
  await put(sourceRoot, 'scripts/fixtures/avatar-stairs-2fstudio.json', '{}');
  await put(sourceRoot, 'scripts/fixtures/avatar-stairs-hybrid-2fstudio.json', '{}');
  await put(sourceRoot, 'scripts/fixtures/avatar-indoor-replacement-2fstudio.json', '{}');
  await put(sourceRoot, 'build.mjs', `
    import fs from 'node:fs';
    if(fs.existsSync('build-fail'))process.exit(2);
    const online=process.argv.includes('--online');
    if(online&&fs.existsSync('online-build-fail'))process.exit(4);
    fs.appendFileSync('build-calls',online?'online\\n':'offline\\n');
    fs.writeFileSync(online?'Locahun3D_OfflineViewer.online.html':'Locahun3D_OfflineViewer.html',
      fs.readFileSync('src/template.html','utf8')+(online?'online':'offline'));
  `);
  for (const file of REGRESSION_TESTS) await put(sourceRoot, file, `
    import fs from 'node:fs';
    if(fs.existsSync('test-fail'))process.exit(3);
    if(fs.existsSync('mutate-source'))fs.appendFileSync('src/template.html','changed');
    if(fs.existsSync('mutate-dependency'))fs.appendFileSync('scripts/avatar-assets/helpers/dependency.mjs','//changed');
    if(fs.existsSync('mutate-build-dependency'))fs.appendFileSync('scripts/viewer-update-core.cjs','//changed');
    if(fs.existsSync('mutate-stair-fixture'))fs.appendFileSync('scripts/fixtures/avatar-stairs-2fstudio.json',' ');
    if(fs.existsSync('mutate-indoor-fixture'))fs.appendFileSync('scripts/fixtures/avatar-indoor-replacement-2fstudio.json',' ');
  `);
  return {sourceRoot, targetRoot, log() {}};
}

test('startup update dependencies cannot change during verified sync',async t=>{
  const options=await fixture(t);
  await put(options.sourceRoot,'mutate-build-dependency','1');
  await assert.rejects(syncOnce(options),/changed/i);
});

async function legacyState(options){
 const old='public/viewer/vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js';
 const files={'public/viewer/offline-viewer.html':hash(Buffer.from('legacy-html')),[old]:hash(Buffer.from('legacy-vendor'))};
 await put(options.targetRoot,'public/viewer/offline-viewer.html','legacy-html');
 await put(options.targetRoot,old,'legacy-vendor');
 await put(options.targetRoot,'.git/locahun-viewer-sync-state.json',JSON.stringify({version:1,sourceRoot:await fs.realpath(options.sourceRoot),targetRoot:await fs.realpath(options.targetRoot),files}));
 return old;
}
test('versioned vendor migration verifies legacy hashes and preserves old URL',async t=>{
 const options=await fixture(t),old=await legacyState(options);
 await syncOnce(options);
 assert.equal(await fs.readFile(path.join(options.targetRoot,old),'utf8'),'legacy-vendor');
 assert.equal(await fs.readFile(path.join(options.targetRoot,OWNED_FILES[1]),'utf8'),'fixture dependency');
 await syncOnce(options);
});

test('rollback migration accepts an already present byte-identical original renderer',async t=>{
 const options=await fixture(t),old=await legacyState(options);
 await put(options.targetRoot,OWNED_FILES[1],await fs.readFile(path.join(options.sourceRoot,'vendor/spark-2.0.0-workers16-incrtraverse.module.js')));
 await syncOnce(options);
 assert.equal(await fs.readFile(path.join(options.targetRoot,old),'utf8'),'legacy-vendor');
});
test('versioned migration rejects changed old asset or preexisting new asset',async t=>{
 for(const collision of ['old','new']){
  const options=await fixture(t),old=await legacyState(options);
  await put(options.targetRoot,collision==='old'?old:OWNED_FILES[1],'user-change');
  await assert.rejects(syncOnce(options),/hash|modified|existing|untracked/i);
  await assert.rejects(fs.stat(path.join(options.sourceRoot,'build-calls')),{code:'ENOENT'});
 }
});

test('stair fixture cannot change during verified sync',async t=>{
  const options=await fixture(t);
  await put(options.sourceRoot,'mutate-stair-fixture','1');
  await assert.rejects(syncOnce(options),/changed/i);
});

test('indoor replacement regression is required and its fixture cannot change during sync',async t=>{
  assert.ok(REGRESSION_TESTS.includes('scripts/test-avatar-core-replacement.mjs'));
  const options=await fixture(t);
  await put(options.sourceRoot,'mutate-indoor-fixture','1');
  await assert.rejects(syncOnce(options),/changed/i);
});

test('copies online HTML and vendor with exact hashes; unchanged and repeated sync are allowed', async t => {
  const options = await fixture(t);
  await syncOnce(options);
  const expected = [
    await fs.readFile(path.join(options.sourceRoot, 'Locahun3D_OfflineViewer.online.html')),
    await fs.readFile(path.join(options.sourceRoot, 'vendor/spark-2.0.0-workers16-incrtraverse.module.js')),
  ];
  for (let i = 0; i < OWNED_FILES.length; i++) {
    assert.equal(hash(await fs.readFile(path.join(options.targetRoot, OWNED_FILES[i]))), hash(expected[i]));
  }
  const again = await syncOnce(options);
  assert.equal(again.changed, false);
  await put(options.sourceRoot, 'src/template.html', 'fixture-v2');
  assert.equal((await syncOnce(options)).changed, true);
  assert.equal(await fs.readFile(path.join(options.targetRoot, OWNED_FILES[0]), 'utf8'), 'fixture-v2online');
  assert.match(await fs.readFile(path.join(options.sourceRoot, 'build-calls'), 'utf8'), /^offline\nonline\n/);
});

test('initial dirty owned files are rejected before building; unrelated changes are allowed', async t => {
  const options = await fixture(t);
  await put(options.targetRoot, OWNED_FILES[0], 'manual');
  await assert.rejects(syncOnce(options), /dirty|untracked|modified/i);
  await assert.rejects(fs.stat(path.join(options.sourceRoot, 'build-calls')), {code: 'ENOENT'});
  assert.equal(await fs.readFile(path.join(options.targetRoot, OWNED_FILES[0]), 'utf8'), 'manual');
  await fs.unlink(path.join(options.targetRoot, OWNED_FILES[0]));
  await put(options.targetRoot, 'unrelated.txt', 'keep');
  await syncOnce(options);
  assert.equal(await fs.readFile(path.join(options.targetRoot, 'unrelated.txt'), 'utf8'), 'keep');
});

test('manual edits or deletion after sync are rejected without overwriting either owned file', async t => {
  const options = await fixture(t);
  await syncOnce(options);
  const vendor = await fs.readFile(path.join(options.targetRoot, OWNED_FILES[1]));
  await put(options.targetRoot, OWNED_FILES[0], 'user edit');
  await assert.rejects(syncOnce(options), /hash|modified/i);
  assert.equal(await fs.readFile(path.join(options.targetRoot, OWNED_FILES[0]), 'utf8'), 'user edit');
  assert.deepEqual(await fs.readFile(path.join(options.targetRoot, OWNED_FILES[1])), vendor);
  await fs.unlink(path.join(options.targetRoot, OWNED_FILES[0]));
  await assert.rejects(syncOnce(options), /hash|missing|modified/i);
});

for (const failure of ['build-fail', 'online-build-fail', 'test-fail', 'mutate-source', 'mutate-dependency']) {
  test(`${failure} prevents publishing and preserves the previous sync`, async t => {
    const options = await fixture(t);
    await syncOnce(options);
    const before = await Promise.all(OWNED_FILES.map(f => fs.readFile(path.join(options.targetRoot, f))));
    await put(options.sourceRoot, 'src/template.html', 'unverified-v2');
    await put(options.sourceRoot, failure, '1');
    await assert.rejects(syncOnce(options), /failed|changed/i);
    for (let i = 0; i < OWNED_FILES.length; i++)
      assert.deepEqual(await fs.readFile(path.join(options.targetRoot, OWNED_FILES[i])), before[i]);
  });
}

for (const gate of ['scripts/perf-release-assets.test.mjs','scripts/perf-collision-route.test.mjs','scripts/test-public-demo-runtime.mjs','scripts/test-collision-persistent-cache.mjs','scripts/perf-vendor-adoption.test.mjs', 'scripts/test-path-styling.mjs', 'scripts/test-path-strict-pick.mjs', 'scripts/avatar-assets/test_asset.mjs',
  'scripts/avatar-assets/test_runtime.mjs', 'scripts/avatar-assets/test_obj_depth.mjs',
  'scripts/avatar-assets/test_obj_export.mjs']) {
  test(`${gate} is a mandatory gate before the first copy`, async t => {
    const options = await fixture(t);
    assert.ok(REGRESSION_TESTS.includes(gate));
    await put(options.sourceRoot, gate, 'process.exit(5);');
    await assert.rejects(syncOnce(options), /failed/i);
    for (const name of OWNED_FILES) await assert.rejects(fs.stat(path.join(options.targetRoot, name)), {code: 'ENOENT'});
  });
}

test('target edited during regression gates is preserved by the second guard', async t => {
  const options = await fixture(t);
  await syncOnce(options);
  await put(options.sourceRoot, 'src/template.html', 'next');
  const dest = path.join(options.targetRoot, OWNED_FILES[0]);
  await put(options.sourceRoot, REGRESSION_TESTS[0], `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(dest)}, 'late manual edit');`);
  await assert.rejects(syncOnce(options), /hash mismatch/i);
  assert.equal(await fs.readFile(dest, 'utf8'), 'late manual edit');
});

test('injected destination guard rejects before building', async t => {
  const options = await fixture(t);
  await assert.rejects(syncOnce({...options, guard: async () => { throw new Error('Destination changed'); }}), /Destination changed/);
  await assert.rejects(fs.stat(path.join(options.sourceRoot, 'build-calls')), {code: 'ENOENT'});
});

test('destination changes during tests abort before copying or updating ownership', async t => {
  const options = await fixture(t);
  await syncOnce(options);
  const owned = [...OWNED_FILES, '.git/locahun-viewer-sync-state.json'];
  const before = await Promise.all(owned.map(name => fs.readFile(path.join(options.targetRoot, name))));
  const marker = path.join(options.targetRoot, '.git/destination-changed');
  await put(options.sourceRoot, 'src/template.html', 'next version');
  await put(options.sourceRoot, REGRESSION_TESTS[0], `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'changed');`);
  let checks = 0;
  const guard = async () => {
    checks++;
    const changed = await fs.stat(marker).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
    if (changed) throw new Error('Destination changed');
  };
  await assert.rejects(syncOnce({...options, guard}), /Destination changed/);
  assert.equal(checks, 2);
  for (let i = 0; i < owned.length; i++)
    assert.deepEqual(await fs.readFile(path.join(options.targetRoot, owned[i])), before[i]);
  await assert.rejects(fs.stat(path.join(options.targetRoot, '.git/locahun-viewer-sync.lock')), {code: 'ENOENT'});
  assert.ok(!(await fs.readdir(path.join(options.targetRoot, 'public/viewer'))).some(name => name.endsWith('.sync-tmp')));
});

test('existing lock rejects a second writer before building', async t => {
  const options = await fixture(t);
  await put(options.targetRoot, '.git/locahun-viewer-sync.lock', 'existing owner');
  await assert.rejects(syncOnce(options), /lock exists/i);
  assert.equal(await fs.readFile(path.join(options.targetRoot, '.git/locahun-viewer-sync.lock'), 'utf8'), 'existing owner');
  await assert.rejects(fs.stat(path.join(options.sourceRoot, 'build-calls')), {code: 'ENOENT'});
});

test('node_modules and unused vendor archives do not enter the source digest', async t => {
  const options = await fixture(t);
  await put(options.sourceRoot, 'scripts/avatar-assets/node_modules/large/index.js', 'before');
  await put(options.sourceRoot, 'vendor/unused.tgz', 'before');
  await put(options.sourceRoot, REGRESSION_TESTS[0], `import fs from 'node:fs';
    fs.writeFileSync('scripts/avatar-assets/node_modules/large/index.js','after');
    fs.writeFileSync('vendor/unused.tgz','after');`);
  assert.equal((await syncOnce(options)).changed, true);
});

test('ownership state prevents a different source repository from overwriting', async t => {
  const options = await fixture(t), other = await fixture(t);
  await syncOnce(options);
  await assert.rejects(syncOnce({...options, sourceRoot: other.sourceRoot}), /source|ownership/i);
});

test('debounce coalesces bursts and serializes changes arriving during a run', async () => {
  let calls = 0, active = 0, peak = 0, release;
  const first = new Promise(resolve => { release = resolve; });
  const errors = [];
  const queue = createSyncQueue(async () => {
    calls++; peak = Math.max(peak, ++active);
    try { if (calls === 1) await first; } finally { active--; }
  }, {delay: 10, onError: e => errors.push(e)});
  try {
    queue.schedule(); queue.schedule(); queue.schedule();
    await sleep(50);
    assert.equal(calls, 1);
    queue.schedule(); queue.schedule();
    await sleep(30);
    assert.equal(calls, 1);
    release();
    await sleep(70);
    assert.equal(calls, 2); assert.equal(peak, 1); assert.deepEqual(errors, []);
  } finally { release(); await queue.stop(); }
});
