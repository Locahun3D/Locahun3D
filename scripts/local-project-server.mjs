import http from 'node:http';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {selectLocalViewer} from './local-viewer-cache.mjs';

const JSON_LIMIT = 16 * 1024 ** 2;
const ASSET_LIMIT = 1024 ** 3;
const EXTENSIONS = new Set(['rad', 'splat', 'ply', 'spz', 'ksplat', 'sog', 'glb', 'gltf', 'obj', 'fbx']);
const LAYER_TYPES = new Set(['folder', 'cube', 'sphere', 'obj', 'splat', 'light', 'figure', 'event', 'path']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor', 'streamUrl', 'rawData', '_buf', 'missing', 'meshData', '_rawBuffer']);
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const navigationAsset=file=>/^assets\/[a-f0-9]{64}\.(lnv|lcp|lng)$/.test(file);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function safeAsset(file) {
  if (typeof file !== 'string' || !/^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(file) || file.includes('..')) return false;
  const name = file.slice(7);
  return EXTENSIONS.has(path.extname(name).slice(1)) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name);
}
function validateEnvelope(value) {
  let nodes = 0;
  function finiteJson(item, depth = 0) {
    if (++nodes > 200000 || depth > 64) fail(400, 'Project exceeds structural limits.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail(400, 'Nonfinite number.'); return; }
    if (Array.isArray(item)) { item.forEach(child => finiteJson(child, depth + 1)); return; }
    if (!object(item)) fail(400, 'Expected JSON values.');
    for (const [key, child] of Object.entries(item)) {
      if (FORBIDDEN.has(key)) fail(400, 'Embedded, missing, external or unsafe fields are not accepted.');
      finiteJson(child, depth + 1);
    }
  }
  finiteJson(value);
  if (!object(value) || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER ||
      !['draft', 'editing_complete'].includes(value.status)) fail(400, 'Invalid revision or status.');
  if (!object(value.project) || ![1, 2, 3, 4].includes(value.project.version) ||
      !Array.isArray(value.project.layers) || value.project.layers.length > 10000) fail(400, 'Invalid project version or layers.');
  const ids = new Set(), assets = new Set();
  for (const layer of value.project.layers) {
    if (!object(layer) || !LAYER_TYPES.has(layer.type) ||
        !(Number.isSafeInteger(layer.id) && layer.id >= 0 || typeof layer.id === 'string' && layer.id.trim() && layer.id.length <= 128)) fail(400, 'Invalid layer.');
    if (ids.has(String(layer.id))) fail(400, 'Duplicate layer ID.');
    ids.add(String(layer.id));
    if (['splat', 'obj'].includes(layer.type) || layer.file != null) {
      if (!safeAsset(layer.file)) fail(400, 'Every model must reference assets/<safe basename>.');
      assets.add(layer.file);
    }
  }
  return assets;
}
function parseJson(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail(400, 'Invalid JSON.'); }
}
function declaredLength(req, limit) {
  const value = req.headers['content-length'];
  if (value === undefined) return;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400, 'Invalid Content-Length.');
  if (Number(value) > limit) fail(413, 'Request body exceeds the limit.');
}
async function readBody(req) {
  declaredLength(req, JSON_LIMIT);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > JSON_LIMIT) fail(413, 'Project JSON exceeds 16 MiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function sendJson(res, status, data) {
  const bytes = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length});
  res.end(bytes);
}
async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const {bytesWritten} = await handle.write(bytes, offset, bytes.length - offset);
    if (!bytesWritten) throw new Error('Incomplete file write.');
    offset += bytesWritten;
  }
}

/** Reuse a verified live instance, or recover a provably dead owner's lock. */
export async function reuseLocalProjectServer({root}) {
  const directory = await fs.realpath(path.resolve(root));
  const filename = path.join(directory, '.local-project.lock');
  async function snapshot() {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || stat.size > 8192) throw new Error('Unsafe or incomplete project lock; refusing recovery.');
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error('Project lock changed.');
      return {stat, bytes: await handle.readFile()};
    } finally { await handle.close(); }
  }
  let original;
  try { original = await snapshot(); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  let data;
  try { data = JSON.parse(original.bytes.toString('utf8')); } catch { throw new Error('Malformed lock; refusing recovery.'); }
  if (!object(data) || !Number.isInteger(data.pid) || data.pid <= 0 || data.pid > 2147483647 ||
      data.root !== undefined && data.root !== directory) throw new Error('Invalid lock ownership; refusing recovery.');
  let url;
  if (data.url !== undefined) {
    try { url = new URL(data.url); } catch { throw new Error('Invalid lock URL.'); }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.hash ||
        !/^\/[A-Za-z0-9_-]{16,128}\/$/.test(url.pathname) || url.search !== '?localProject=1') throw new Error('Lock URL is not a valid tokenized loopback URL.');
  }
  let dead = false;
  try { process.kill(data.pid, 0); }
  catch (error) { if (error.code === 'ESRCH') dead = true; else throw new Error('Cannot establish owner liveness; lock retained.'); }
  async function unchanged() {
    const latest = await snapshot();
    if (latest.stat.ino !== original.stat.ino || latest.stat.dev !== original.stat.dev ||
        latest.stat.mtimeMs !== original.stat.mtimeMs || !latest.bytes.equals(original.bytes)) throw new Error('Project lock changed; refusing recovery or reuse.');
  }
  if (!dead) {
    if (!url || data.root !== directory) throw new Error('Active server is starting or has a legacy lock; lock retained.');
    const health = await new Promise((resolve, reject) => {
      const req = http.get(new URL('api/health', url), res => {
        const chunks = []; let length = 0;
        if (res.statusCode !== 200) { res.resume(); reject(new Error('Active server health check failed; lock retained.')); return; }
        res.on('data', chunk => { length += chunk.length; if (length > 8192) req.destroy(new Error('Invalid health response.')); else chunks.push(chunk); });
        res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid health response.')); } });
        res.on('error', reject);
      });
      req.setTimeout(1500, () => req.destroy(new Error('Active server did not respond; lock retained.')));
      req.on('error', reject);
    });
    if (health.pid !== data.pid || health.root !== directory) throw new Error('Active server identity mismatch; lock retained.');
    await unchanged();
    return {url: data.url};
  }
  // Serialize recovery of this specific file identity so simultaneous launchers
  // cannot remove a fresh lock after another launcher has recovered the old one.
  const identity = createHash('sha256').update(`${original.stat.dev}:${original.stat.ino}:`).update(original.bytes).digest('hex');
  const guardPath = path.join(directory, `.local-project-recovery-${identity}.lock`);
  let guard;
  try { guard = await fs.open(guardPath, 'wx'); }
  catch { throw new Error('Recovery guard exists; refusing concurrent or interrupted lock recovery.'); }
  try {
    await unchanged();
    try { process.kill(data.pid, 0); throw new Error('Owner became live; lock retained.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    await unchanged();
    await fs.unlink(filename);
    return null;
  } finally { await guard.close(); await fs.unlink(guardPath); }
}

export async function startLocalProjectServer({root, port = 0, token = randomBytes(24).toString('hex'), autoUpdate = false, updateFetch, onCompleted} = {}) {
  if(onCompleted!==undefined&&typeof onCompleted!=='function')throw new Error('Invalid completion handler.');
  if (typeof root !== 'string' || !root || !Number.isInteger(port) || port < 0 || port > 65535 ||
      typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new Error('Invalid root, port or token (16-128 URL-safe characters).');
  const requestedRoot = path.resolve(root);
  if ((await fs.lstat(requestedRoot)).isSymbolicLink()) throw new Error('Project root cannot be a symlink.');
  const directory = await fs.realpath(requestedRoot);
  if (!(await fs.stat(directory)).isDirectory()) throw new Error('Project root must already exist.');
  async function checkDirectory(relative) {
    const filename = path.join(directory, relative);
    const stat = await fs.lstat(filename);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(filename) !== filename) throw new Error('Unsafe project directory.');
    return filename;
  }
  async function openSafe(relative) {
    if (relative.includes('/')) await checkDirectory(relative.split('/')[0]);
    const filename = path.join(directory, relative);
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(filename) !== filename) throw new Error('Unsafe project file.');
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error('Project file changed during access.');
      return {handle, stat: opened};
    } catch (error) { await handle.close(); throw error; }
  }
  async function readSmall(relative) {
    const {handle, stat} = await openSafe(relative);
    try {
      if (!stat.size || stat.size > JSON_LIMIT) throw new Error('Invalid metadata file size.');
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  async function validateAssets(envelope) {
    for (const file of validateEnvelope(envelope)) {
      try {
        const {handle, stat} = await openSafe(file);
        await handle.close();
        if (!stat.size) fail(400, 'Referenced asset is empty.');
      } catch { fail(400, 'Referenced asset is missing, empty or unsafe.'); }
    }
  }
  await checkDirectory('assets'); await checkDirectory('history');
  const viewer = await openSafe('viewer.html'); await viewer.handle.close();
  if (!viewer.stat.size) throw new Error('viewer.html is empty.');
  const lockPath = path.join(directory, '.local-project.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw Object.assign(new Error('Project lock already exists; another server may be running.'), {code: 'PROJECT_LOCKED'}); throw error; }
  let server, closePromise, queue = Promise.resolve();
  const active = new Set();
  async function unlock() { await lock.close(); await fs.unlink(lockPath); }
  try {
    await lock.writeFile(JSON.stringify({pid: process.pid, root: directory}));
    const initialEnvelope=parseJson(await readSmall('project-state.json'));
    await validateAssets(initialEnvelope);
    let completion={status:onCompleted?'idle':'disabled',revision:null};
    let pendingCompletion=null,completionWorker=null;
    function scheduleCompletion(envelope){
      if(!onCompleted||envelope.status!=='editing_complete')return;
      pendingCompletion=envelope.revision;
      if(completionWorker)return;
      completionWorker=(async()=>{
        while(pendingCompletion!==null){
          const revision=pendingCompletion;pendingCompletion=null;
          completion={status:'running',revision};
          try {
            const current=parseJson(await readSmall('project-state.json'));
            if(current.revision!==revision||current.status!=='editing_complete'){completion={status:'superseded',revision};continue;}
            await onCompleted({root:directory,revision});
            const latest=parseJson(await readSmall('project-state.json'));
            completion={status:latest.revision===revision&&latest.status==='editing_complete'?'completed':'superseded',revision};
          }catch{completion={status:'failed',revision};}
        }
      })().finally(()=>{completionWorker=null;});
    }
    let currentRelease;
    if(autoUpdate && viewer.stat.size<=64*1024**2) {
      const bundled=await openSafe('viewer.html');
      try {currentRelease=(await bundled.handle.readFile()).toString('utf8').match(/window\.__locahunBuildRelease="([a-f0-9]{64})"/)?.[1];}
      finally {await bundled.handle.close();}
    }
    const update=autoUpdate ? await selectLocalViewer({root:directory,fetch:updateFetch,projectVersion:initialEnvelope.project.version,currentRelease}) : {};
    const updatedViewer=update.html ? Buffer.from(update.html,'utf8') : null;
    if(autoUpdate) {
      process.stderr.write(updatedViewer ? `Viewer release selected (${update.source}): ${update.release}\n` : `Bundled viewer retained: ${update.reason}\n`);
      if(update.cacheWarning)process.stderr.write(`Verified viewer is usable in memory; cache warning: ${update.cacheWarning}\n`);
    }
    async function createSynced(filename, bytes) {
      const handle = await fs.open(filename, 'wx');
      try { await writeAll(handle, bytes); await handle.sync(); }
      finally { await handle.close(); }
    }
    async function save(envelope) {
      await validateAssets(envelope);
      const previous = await readSmall('project-state.json');
      const current = parseJson(previous); validateEnvelope(current);
      if (envelope.revision !== current.revision) fail(409, 'Revision conflict; reload the current project.');
      const saved = {revision: current.revision + 1, status: envelope.status, project: envelope.project, savedAt: new Date().toISOString()};
      const savedBytes = Buffer.from(JSON.stringify(saved, null, 2) + '\n');
      if (savedBytes.length > JSON_LIMIT) fail(413, 'Persisted project JSON exceeds 16 MiB.');
      const history = await checkDirectory('history');
      const backup = `history/revision-${current.revision}.json`;
      const backupTemp = path.join(history, '.' + randomUUID() + '.tmp');
      const stateTemp = path.join(directory, '.project-' + randomUUID() + '.tmp');
      try {
        await createSynced(backupTemp, previous);
        try { await fs.link(backupTemp, path.join(directory, backup)); }
        catch (error) {
          if (error.code !== 'EEXIST' || !(await readSmall(backup)).equals(previous)) throw new Error('Cannot preserve the previous revision in history.');
        }
        await createSynced(stateTemp, savedBytes);
        // Detect non-cooperating local edits before the single replacement step.
        if (!(await readSmall('project-state.json')).equals(previous)) fail(409, 'Project changed on disk; reload before saving.');
        await fs.rename(stateTemp, path.join(directory, 'project-state.json'));
        return saved;
      } finally {
        await fs.unlink(backupTemp).catch(() => {});
        await fs.unlink(stateTemp).catch(() => {});
      }
    }
    async function upload(req, ext) {
      if (!EXTENSIONS.has(ext)) fail(400, 'Unsupported asset extension.');
      if (/multipart\//i.test(req.headers['content-type'] || '')) fail(415, 'Send binary bytes, not multipart data.');
      declaredLength(req, ASSET_LIMIT);
      const assets = await checkDirectory('assets');
      const temporary = path.join(assets, '.' + randomUUID() + '.upload');
      let handle, size = 0; const hash = createHash('sha256');
      try {
        handle = await fs.open(temporary, 'wx');
        for await (const chunk of req) {
          size += chunk.length; if (size > ASSET_LIMIT) fail(413, 'Asset exceeds 1 GiB.');
          hash.update(chunk); await writeAll(handle, chunk);
        }
        if (!size) fail(400, 'Empty assets are not accepted.');
        await handle.sync(); await handle.close(); handle = null;
        const digest = hash.digest('hex'), file = `assets/${digest}.${ext}`;
        await checkDirectory('assets');
        try { await fs.link(temporary, path.join(directory, file)); }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const existing = await openSafe(file);
          try {
            if (existing.stat.size !== size) throw new Error('Existing asset does not match its hash.');
            const check = createHash('sha256');
            for await (const chunk of existing.handle.createReadStream({autoClose: false})) check.update(chunk);
            if (check.digest('hex') !== digest) throw new Error('Existing asset does not match its hash.');
          } finally { await existing.handle.close(); }
        }
        return {file};
      } finally {
        if (handle) await handle.close();
        await fs.unlink(temporary).catch(() => {});
      }
    }
    // Per-process only: content hashes never enter project state or asset filenames.
    const assetEtags = new Map();
    const assetStamp = s => [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
    async function assetIdentity(relative, handle) {
      const before = await handle.stat({bigint:true});
      const stamp = assetStamp(before);
      const cached = assetEtags.get(relative);
      if (cached?.stamp === stamp) return cached;
      assetEtags.delete(relative);
      const hash = createHash('sha256'); let length = 0n;
      for await (const chunk of handle.createReadStream({start:0,autoClose:false})) {
        hash.update(chunk); length += BigInt(chunk.length);
      }
      if (length !== before.size || assetStamp(await handle.stat({bigint:true})) !== stamp) fail(409, 'Asset changed while hashing; retry.');
      const current = await openSafe(relative);
      try {
        if (assetStamp(await current.handle.stat({bigint:true})) !== stamp) fail(409, 'Asset replaced while hashing; retry.');
      } finally { await current.handle.close(); }
      const identity = {stamp, etag:'"sha256-' + hash.digest('hex') + '"', lastModified:new Date(Number(before.mtimeNs / 1000000n)).toUTCString()};
      if (assetEtags.size >= 1024) assetEtags.delete(assetEtags.keys().next().value);
      assetEtags.set(relative,identity);
      return identity;
    }
    async function serveFile(req, res, relative, isViewer = false) {
      let opened;
      try { opened = await openSafe(relative); } catch { fail(404, 'File not found.'); }
      const {handle, stat} = opened;
      try {
        if(navigationAsset(relative)&&stat.size>(relative.endsWith('.lng')?128*1024:2000000))fail(413,'Navigation asset exceeds limit.');
        let start = 0, end = stat.size - 1, status = 200;
        const headers = {'Content-Type': isViewer ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Accept-Ranges': 'bytes'};
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          let valid = !!match && !!(match[1] || match[2]) && stat.size > 0;
          if (valid) {
            if (!match[1]) { const count = Number(match[2]); valid = Number.isSafeInteger(count) && count > 0; start = Math.max(0, stat.size - count); }
            else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; valid = Number.isSafeInteger(start) && Number.isSafeInteger(Number(match[2] || end)); }
            valid &&= start <= end && start < stat.size;
          }
          if (!valid) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); res.end(); return; }
          status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        }
        headers['Content-Length'] = Math.max(0, end - start + 1);
        if (!isViewer) {
          const identity = await assetIdentity(relative,handle);
          const latest = await handle.stat();
          if (latest.size !== stat.size || latest.mtimeMs !== stat.mtimeMs || latest.ctimeMs !== stat.ctimeMs) fail(409, 'Asset changed during request; retry.');
          headers.ETag = identity.etag;
          headers['Last-Modified'] = identity.lastModified;
        }
        res.writeHead(status, headers);
        if (req.method === 'HEAD' || !stat.size) { res.end(); return; }
        await pipeline(handle.createReadStream({start, end, autoClose: false}), res);
      } finally { await handle.close(); }
    }
    let origin, expectedHost;
    async function route(req, res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store');
      const hosts = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'host');
      if (hosts.length !== 1 || req.headers.host !== expectedHost) fail(403, 'Invalid Host.');
      const prefix = `/${token}/`;
      if (!req.url.startsWith(prefix)) fail(404, 'Not found.');
      const [pathname, query = ''] = req.url.slice(prefix.length).split('?');
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) fail(405, 'Method not allowed.');
      if (req.method === 'POST' && req.headers.origin !== origin) fail(403, 'Invalid Origin.');
      if (pathname === '' && (!query || query === 'localProject=1') && ['GET', 'HEAD'].includes(req.method)) {
        if(updatedViewer) {
          res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':updatedViewer.length});
          res.end(req.method==='HEAD' ? undefined : updatedViewer);return;
        }
        return serveFile(req, res, 'viewer.html', true);
      }
      if (pathname === 'api/health' && !query && req.method === 'GET') return sendJson(res, 200, {pid: process.pid, root: directory});
      if (pathname === 'api/completion' && !query && req.method === 'GET') return sendJson(res,200,completion);
      if (pathname === 'api/project' && !query) {
        if (req.method === 'GET') return sendJson(res, 200, parseJson(await readSmall('project-state.json')));
        if (req.method !== 'POST') fail(405, 'Method not allowed.');
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'Expected application/json.');
        const envelope = parseJson(await readBody(req)); validateEnvelope(envelope);
        const saving = queue.then(() => save(envelope));
        queue = saving.catch(() => {});
        const saved=await saving;
        sendJson(res,200,saved);
        scheduleCompletion(saved);
        return;
      }
      if (pathname === 'api/assets' && req.method === 'POST') {
        const params = new URLSearchParams(query);
        if ([...params.keys()].length !== 1 || !params.has('ext')) fail(400, 'Expected one ext parameter.');
        return sendJson(res, 200, await upload(req, params.get('ext')));
      }
      if (!query && (safeAsset(pathname)||navigationAsset(pathname)) && ['GET', 'HEAD'].includes(req.method)) return serveFile(req, res, pathname);
      fail(404, 'Not found.');
    }
    server = http.createServer((req, res) => {
      const task = route(req, res).catch(error => {
        if (res.destroyed) return;
        if (res.headersSent) { res.destroy(); return; }
        if (!req.complete) res.setHeader('Connection', 'close');
        sendJson(res, error.status || 500, {error: error.status ? error.message : 'Local project operation failed; existing data was not overwritten by a partial write.'});
      }).finally(() => active.delete(task));
      active.add(task);
    });
    server.requestTimeout = 120000; server.headersTimeout = 10000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    expectedHost = '127.0.0.1:' + server.address().port;
    origin = 'http://' + expectedHost;
    const url = `${origin}/${token}/?localProject=1`;
    const lockBytes = Buffer.from(JSON.stringify({pid: process.pid, root: directory, url}));
    await lock.write(lockBytes, 0, lockBytes.length, 0); await lock.truncate(lockBytes.length); await lock.sync();
    scheduleCompletion(initialEnvelope);
    return {server, url, whenCompleted:()=>completionWorker||Promise.resolve(), close() {
      if (!closePromise) closePromise = (async () => {
        const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        server.closeAllConnections();
        await closed; await Promise.allSettled([...active]); await queue; await completionWorker;
        await unlock();
      })();
      return closePromise;
    }};
  } catch (error) {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await unlock(); throw error;
  }
}

function openBrowser(url) {
  let child;
  if (process.platform === 'win32') {
    // Pass the generated URL as environment data, never interpolated shell text.
    const script = 'Start-Process -FilePath $env:LOCAHUN_LOCAL_URL';
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      {windowsHide: true, detached: true, stdio: 'ignore', env: {...process.env, LOCAHUN_LOCAL_URL: url}});
  } else child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {detached: true, stdio: 'ignore'});
  child.on('error', () => process.stderr.write('Could not open browser; open the printed local URL.\n'));
  child.unref();
}
async function main(args) {
  const options = {}; let noOpen = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--no-open' && !noOpen) { noOpen = true; continue; }
    if (!['--root', '--port'].includes(key) || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: --root PROJECT [--port PORT] [--no-open]');
    options[key] = args[++i];
  }
  if (!options['--root'] || options['--port'] !== undefined && !/^\d+$/.test(options['--port'])) throw new Error('Expected --root and optional numeric --port.');
  let running = await reuseLocalProjectServer({root: options['--root']});
  if (!running) {
    try { running = await startLocalProjectServer({root: options['--root'], port: Number(options['--port'] || 0), autoUpdate:true}); }
    catch (error) {
      if (error.code !== 'PROJECT_LOCKED') throw error;
      running = await reuseLocalProjectServer({root: options['--root']});
      if (!running) running = await startLocalProjectServer({root: options['--root'], port: Number(options['--port'] || 0), autoUpdate:true});
    }
  }
  process.stdout.write(running.url + '\n');
  if (!noOpen) openBrowser(running.url);
  if (!running.close) return;
  const stop = () => running.close().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
