import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startLocalProjectServer} from './local-project-server.mjs';
import * as localServer from './local-project-server.mjs';

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-project-test-'));
  let running;
  t.after(async () => {
    if (running) await running.close();
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('local-project-test-'));
    await fs.rm(target, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, 'assets')); await fs.mkdir(path.join(root, 'history'));
  await fs.writeFile(path.join(root, 'viewer.html'), '<!doctype html><title>Local fixture</title>');
  await fs.writeFile(path.join(root, 'assets', 'input.rad'), '0123456789');
  const project = {version: 4, layers: [{id: 1, type: 'splat', file: 'assets/input.rad'}], camera: {pos: {x: 0, y: 1, z: 2}}};
  const initial = {revision: 0, status: 'draft', project};
  await fs.writeFile(path.join(root, 'project-state.json'), JSON.stringify(initial));
  running = await startLocalProjectServer({root});
  const origin = new URL(running.url).origin;
  const request = (route, options = {}) => fetch(new URL(route, running.url), options);
  const post = (envelope, options = {}) => request('api/project', {method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: origin, ...options.headers},
    body: JSON.stringify(envelope)});
  return {root, project, initial, running, origin, request, post};
}

test('navigation sidecars are read-only hash-named and bounded',async t=>{
 const f=await setup(t),name='ab'.repeat(32);
 await fs.writeFile(path.join(f.root,'assets',name+'.lnv'),'route');
 assert.equal(await (await f.request('assets/'+name+'.lnv')).text(),'route');
 assert.equal((await f.request('assets/'+name+'.lnv',{method:'POST',headers:{Origin:f.origin}})).status,404);
 await fs.writeFile(path.join(f.root,'assets','arbitrary.lnv'),'no');assert.equal((await f.request('assets/arbitrary.lnv')).status,404);
 await fs.writeFile(path.join(f.root,'assets',name+'.lcp'),Buffer.alloc(2000001));assert.equal((await f.request('assets/'+name+'.lcp')).status,413);
 await fs.writeFile(path.join(f.root,'assets',name+'.lng'),'graph');assert.equal(await (await f.request('assets/'+name+'.lng')).text(),'graph');
 assert.equal((await f.request('assets/'+name+'.lng',{method:'POST',headers:{Origin:f.origin}})).status,404);
 await fs.writeFile(path.join(f.root,'assets',name+'.lng'),Buffer.alloc(128*1024+1));assert.equal((await f.request('assets/'+name+'.lng')).status,413);
});

test('token viewer, project metadata and single byte ranges only', async t => {
  const f = await setup(t);
  assert.equal(new URL(f.running.url).search, '?localProject=1');
  const page = await f.request('');
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await f.request('api/project')).headers.get('referrer-policy'), 'no-referrer');
  assert.match(await (await f.request('')).text(), /Local fixture/);
  assert.deepEqual(await (await f.request('api/project')).json(), f.initial);
  let response = await f.request('assets/input.rad', {headers: {Range: 'bytes=2-5'}});
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await response.text(), '2345');
  response = await f.request('assets/input.rad', {headers: {Range: 'bytes=-3'}});
  assert.equal(await response.text(), '789');
  response = await f.request('assets/input.rad', {headers: {Range: 'bytes=8-'}});
  assert.equal(await response.text(), '89');
  for (const range of ['bytes=100-200', 'bytes=3-2', 'bytes=0-1,4-5', 'bytes=-0']) {
    response = await f.request('assets/input.rad', {headers: {Range: range}});
    assert.equal(response.status, 416); assert.equal(response.headers.get('content-range'), 'bytes */10');
  }
  assert.equal((await fetch(f.origin + '/')).status, 404);
  assert.equal((await f.request('project-state.json')).status, 404);
  assert.equal((await f.request('history/revision-0.json')).status, 404);
  assert.equal((await f.request('assets/input.rad', {method: 'HEAD'})).headers.get('content-length'), '10');
});
test('atomic save creates byte-exact backup and revision; completion can return to draft', async t => {
  const f = await setup(t), stateFile = path.join(f.root, 'project-state.json');
  const before = await fs.readFile(stateFile, 'utf8');
  let response = await f.post({...f.initial, status: 'editing_complete'});
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.revision, 1); assert.equal(saved.status, 'editing_complete');
  assert.ok(Number.isFinite(Date.parse(saved.savedAt)));
  assert.equal(await fs.readFile(path.join(f.root, 'history', 'revision-0.json'), 'utf8'), before);
  assert.deepEqual(JSON.parse(await fs.readFile(stateFile, 'utf8')), saved);
  response = await f.post({revision: 1, status: 'draft', project: f.project});
  assert.equal(response.status, 200); assert.equal((await response.json()).revision, 2);
});
test('stale/concurrent revisions cannot overwrite another save', async t => {
  const f = await setup(t);
  const results = await Promise.all([f.post(f.initial), f.post({...f.initial, status: 'editing_complete'})]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await f.post(f.initial)).status, 409);
  assert.equal((await (await f.request('api/project')).json()).revision, 1);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'history')), ['revision-0.json']);
});
test('backup failure preserves original bytes and leaves no state temporary files', async t => {
  const f = await setup(t);
  const stateFile = path.join(f.root, 'project-state.json'), before = await fs.readFile(stateFile, 'utf8');
  await fs.writeFile(path.join(f.root, 'history', 'revision-0.json'), 'unrelated history: never overwrite');
  assert.equal((await f.post(f.initial)).status, 500);
  assert.equal(await fs.readFile(stateFile, 'utf8'), before);
  assert.equal(await fs.readFile(path.join(f.root, 'history', 'revision-0.json'), 'utf8'), 'unrelated history: never overwrite');
  assert.ok(!(await fs.readdir(f.root)).some(name => name.endsWith('.tmp')));
});
test('replacement failure preserves state and backup; retry succeeds without overwriting history', async t => {
  const f = await setup(t);
  const stateFile = path.join(f.root, 'project-state.json'), before = await fs.readFile(stateFile, 'utf8');
  const rename = fs.rename;
  const mock = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === stateFile) throw Object.assign(new Error('simulated disk failure'), {code: 'EIO'});
    return rename(from, to);
  });
  assert.equal((await f.post(f.initial)).status, 500);
  mock.mock.restore();
  assert.equal(await fs.readFile(stateFile, 'utf8'), before);
  assert.equal(await fs.readFile(path.join(f.root, 'history', 'revision-0.json'), 'utf8'), before);
  assert.ok(!(await fs.readdir(f.root)).some(name => name.endsWith('.tmp')));
  assert.equal((await f.post(f.initial)).status, 200);
});
test('a newer on-disk revision is read again for every save', async t => {
  const f = await setup(t);
  const external = {...f.initial, revision: 7};
  await fs.writeFile(path.join(f.root, 'project-state.json'), JSON.stringify(external));
  assert.equal((await f.post(f.initial)).status, 409);
  assert.equal((await f.post(external)).status, 200);
  assert.equal((await (await f.request('api/project')).json()).revision, 8);
});
test('only exact Host and write Origin are accepted; no CORS', async t => {
  const f = await setup(t);
  for (const origin of [undefined, 'null', 'https://example.com', f.origin + '/']) {
    const headers = {'Content-Type': 'application/json'}; if (origin) headers.Origin = origin;
    const r = await f.request('api/project', {method: 'POST', headers, body: JSON.stringify(f.initial)});
    assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  const badHost = await new Promise((resolve, reject) => {
    const req = http.get(new URL('api/project', f.running.url), {headers: {Host: 'localhost:' + new URL(f.origin).port}}, res => {res.resume(); resolve(res.statusCode);});
    req.on('error', reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await f.request('api/project', {method: 'OPTIONS'})).status, 405);
});
test('invalid project structure, asset references and nonfinite numbers fail without saving', async t => {
  const f = await setup(t);
  const cases = [null, [], {...f.initial, revision: -1}, {...f.initial, status: 'published'},
    {...f.initial, project: {version: 99, layers: []}},
    {...f.initial, project: {version: 4, layers: [{id: 1, type: 'not-renderable'}]}},
    {...f.initial, project: {...f.project, layers: [f.project.layers[0], f.project.layers[0]]}}];
  for (const file of ['../input.rad', 'assets/../viewer.html', 'assets/%2e%2e.rad', 'assets/missing.rad', '/etc/passwd', 'https://example.com/a.rad']) {
    cases.push({...f.initial, project: {...f.project, layers: [{id: 1, type: 'splat', file}]}});
  }
  for (const key of ['streamUrl', 'rawData', '_buf', 'missing']) {
    cases.push({...f.initial, project: {...f.project, layers: [{...f.project.layers[0], [key]: 'x'}]}});
  }
  await fs.writeFile(path.join(f.root, 'assets', 'empty.glb'), '');
  cases.push({...f.initial, project: {version: 4, layers: [{id: 1, type: 'obj', file: 'assets/empty.glb'}]}});
  for (const value of cases) assert.equal((await f.post(value)).status, 400);
  const nonfinite = JSON.stringify(f.initial).replace('"x":0', '"x":1e999');
  assert.equal((await f.request('api/project', {method: 'POST', headers: {Origin: f.origin, 'Content-Type': 'application/json'}, body: nonfinite})).status, 400);
  assert.equal((await (await f.request('api/project')).json()).revision, 0);
});
test('camera layers cannot be saved as local projects because savedPose cannot roundtrip', async t => {
  const f = await setup(t);
  const before = await fs.readFile(path.join(f.root, 'project-state.json'), 'utf8');
  const project = {...f.project, layers: [...f.project.layers,
    {id: 2, type: 'camera', savedPose: {pos: {x: 0, y: 1, z: 2}, yaw: 0, pitch: 0}}]};
  for (const status of ['draft', 'editing_complete']) {
    assert.equal((await f.post({revision: 0, status, project})).status, 400);
  }
  assert.equal(await fs.readFile(path.join(f.root, 'project-state.json'), 'utf8'), before);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'history')), []);
});
test('immutable binary uploads are hashed, deduplicated, range-readable and referenced by saves', async t => {
  const f = await setup(t), data = Buffer.from('binary fixture payload');
  const upload = () => f.request('api/assets?ext=glb', {method: 'POST', headers: {Origin: f.origin}, body: data});
  const responses = await Promise.all([upload(), upload()]);
  for (const r of responses) assert.equal(r.status, 200);
  const a = await responses[0].json(), b = await responses[1].json(); assert.deepEqual(a, b);
  assert.equal(a.file, 'assets/' + createHash('sha256').update(data).digest('hex') + '.glb');
  assert.deepEqual(Buffer.from(await (await f.request(a.file)).arrayBuffer()), data);
  assert.equal((await f.post({...f.initial, project: {version: 4, layers: [{id: 2, type: 'obj', file: a.file}]}})).status, 200);
  assert.ok(!(await fs.readdir(path.join(f.root, 'assets'))).some(name => name.startsWith('.')));
  assert.equal((await f.request('api/assets?ext=exe', {method: 'POST', headers: {Origin: f.origin}, body: data})).status, 400);
  assert.equal((await f.request('api/assets?ext=rad', {method: 'POST', headers: {Origin: f.origin}, body: ''})).status, 400);
});
test('assets and directory symlinks cannot escape the project; no traversal route', async t => {
  const f = await setup(t);
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'escape.rad'), 'do not serve');
  const assets = path.join(f.root, 'assets');
  await fs.rename(assets, path.join(f.root, 'assets-original'));
  await fs.symlink(outside, assets, process.platform === 'win32' ? 'junction' : 'dir');
  assert.notEqual((await f.request('assets/escape.rad')).status, 200);
  assert.equal((await f.post(f.initial)).status, 400);
  assert.notEqual((await f.request('api/assets?ext=rad', {method: 'POST', headers: {Origin: f.origin}, body: 'x'})).status, 200);
  assert.equal((await f.request('assets/%2e%2e/viewer.html')).status, 404);
  assert.deepEqual(await fs.readdir(outside), ['escape.rad']);
});
test('same-root second server refuses to start; close permits restart', async t => {
  const f = await setup(t);
  await assert.rejects(startLocalProjectServer({root: f.root}), /lock|already/i);
  const child = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./local-project-server.mjs', import.meta.url)), '--root', f.root, '--no-open'], {encoding: 'utf8', windowsHide: true, timeout: 10000});
  assert.equal(child.stdout.trim(), f.running.url);
  await f.running.close();
  const second = await startLocalProjectServer({root: f.root});
  await second.close();
});
test('CLI helper reuses only the matching healthy loopback instance', async t => {
  const f = await setup(t);
  const lock = JSON.parse(await fs.readFile(path.join(f.root, '.local-project.lock'), 'utf8'));
  assert.equal(lock.url, f.running.url); assert.equal(lock.root, await fs.realpath(f.root));
  assert.deepEqual(await localServer.reuseLocalProjectServer({root: f.root}), {url: f.running.url});
});
test('real CLI launch can be reopened and its crash lock recovered on next launch', async t => {
  const f = await setup(t); await f.running.close();
  const script = fileURLToPath(new URL('./local-project-server.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--root', f.root, '--no-open'], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('CLI startup timed out')), 5000);
    child.stdout.on('data', data => {
      output += data.toString();
      if (output.includes('\n')) { clearTimeout(timer); resolve(output.split('\n')[0].trim()); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('CLI exited before URL')); });
  });
  const reopened = await promisify(execFile)(process.execPath, [script, '--root', f.root, '--no-open'], {encoding: 'utf8', windowsHide: true, timeout: 5000});
  assert.equal(reopened.stdout.trim(), url);
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  assert.ok((await fs.stat(path.join(f.root, '.local-project.lock'))).isFile());
  assert.equal(await localServer.reuseLocalProjectServer({root: f.root}), null);
  const next = await startLocalProjectServer({root: f.root});
  try { assert.equal((await fetch(new URL('api/project', next.url))).status, 200); }
  finally { await next.close(); }
});
test('stale recovery verifies dead PID; malformed, alive and changed locks fail closed', async t => {
  const f = await setup(t); await f.running.close();
  const lockFile = path.join(f.root, '.local-project.lock');
  const child = spawn(process.execPath, ['-e', ''], {windowsHide: true, stdio: 'ignore'});
  const deadPid = child.pid; await once(child, 'exit');
  const stale = {pid: deadPid, root: await fs.realpath(f.root), url: f.running.url};
  await fs.writeFile(lockFile, JSON.stringify(stale));
  assert.equal(await localServer.reuseLocalProjectServer({root: f.root}), null);
  await assert.rejects(fs.stat(lockFile), {code: 'ENOENT'});
  for (const lock of [{pid: 'invalid'}, {...stale, pid: process.pid}, {...stale, url: 'https://example.com/'}]) {
    const bytes = JSON.stringify(lock); await fs.writeFile(lockFile, bytes);
    await assert.rejects(localServer.reuseLocalProjectServer({root: f.root}));
    assert.equal(await fs.readFile(lockFile, 'utf8'), bytes);
  }
  await fs.writeFile(lockFile, JSON.stringify(stale));
  const replacement = JSON.stringify({...stale, pid: process.pid});
  const kill = process.kill;
  const mocked = t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === deadPid) {
      writeFileSync(lockFile, replacement);
      throw Object.assign(new Error('dead'), {code: 'ESRCH'});
    }
    return kill(pid, signal);
  });
  await assert.rejects(localServer.reuseLocalProjectServer({root: f.root}), /changed/i);
  mocked.mock.restore();
  assert.equal(await fs.readFile(lockFile, 'utf8'), replacement);
});
test('aborted upload cleans its temporary file and never publishes partial bytes', async t => {
  const f = await setup(t), assets = path.join(f.root, 'assets');
  const req = http.request(new URL('api/assets?ext=rad', f.running.url), {method: 'POST', headers: {Origin: f.origin, 'Content-Length': '10000'}});
  req.on('error', () => {}); req.write('partial');
  const waitFor = async predicate => {
    for (let i = 0; i < 200; i++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Timed out waiting for upload cleanup');
  };
  try { await waitFor(async () => (await fs.readdir(assets)).some(name => name.endsWith('.upload'))); }
  finally { req.destroy(); }
  await waitFor(async () => !(await fs.readdir(assets)).some(name => name.endsWith('.upload')));
  assert.deepEqual(await fs.readdir(assets), ['input.rad']);
});
test('declared oversized upload is rejected before data transfer', async t => {
  const f = await setup(t);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(new URL('api/assets?ext=rad', f.running.url), {method: 'POST', headers: {Origin: f.origin, 'Content-Length': String(1024 ** 3 + 1)}}, res => {res.resume(); resolve(res.statusCode);});
    req.on('error', reject); req.flushHeaders();
  });
  assert.equal(status, 413);
  assert.ok(!(await fs.readdir(path.join(f.root, 'assets'))).some(name => name.startsWith('.')));
});
test('formatted state must fit the metadata read limit before replacing a valid project', async t => {
  const f = await setup(t);
  const value = structuredClone(f.initial); value.project.note = '';
  value.project.note = 'x'.repeat(16 * 1024 ** 2 - Buffer.byteLength(JSON.stringify(value)));
  assert.equal((await f.post(value)).status, 413);
  assert.equal((await (await f.request('api/project')).json()).revision, 0);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'history')), []);
});
