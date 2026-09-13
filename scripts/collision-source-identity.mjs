import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const EXTENSIONS = new Set(['rad','splat','ply','spz','ksplat','sog','glb','gltf','obj','fbx']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error('Expected finite JSON data');
}
function safeRelative(file) {
  if (typeof file !== 'string' || !file || /[\\:\x00-\x1f\x7f%<>"|?*]/.test(file)) throw new Error('Unsafe relative path');
  for (const part of file.split('/')) {
    if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) throw new Error('Unsafe path component');
  }
}
async function protectedPath(root, relative) {
  safeRelative(relative);
  let current = path.resolve(root);
  const rootStat = await fs.lstat(current);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await fs.realpath(current) !== current) throw new Error('Unsafe root or link');
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || await fs.realpath(current) !== current || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('Unsafe file or directory link');
  }
  return current;
}
const stamp = stat => [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].map(String).join(':');
async function readProtected(root, relative, collect = false) {
  const file = await protectedPath(root, relative);
  const before = await fs.lstat(file,{bigint:true});
  if (collect && before.size > 16n * 1024n ** 2n) throw new Error('Project metadata exceeds 16 MiB');
  const handle = await fs.open(file,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (stamp(await handle.stat({bigint:true})) !== stamp(before)) throw new Error('File changed during open');
    const hash = createHash('sha256'), chunks = []; let bytes = 0;
    for await (const chunk of handle.createReadStream({autoClose:false})) {
      bytes += chunk.length;
      if (collect && bytes > 16 * 1024 ** 2) throw new Error('Project metadata exceeds 16 MiB');
      hash.update(chunk); if (collect) chunks.push(chunk);
    }
    if (!Number.isSafeInteger(bytes) || BigInt(bytes) !== before.size || stamp(await handle.stat({bigint:true})) !== stamp(before) ||
        await protectedPath(root,relative) !== file || stamp(await fs.lstat(file,{bigint:true})) !== stamp(before)) throw new Error('File changed while hashing');
    return {file:relative,bytes,sha256:hash.digest('hex'),...(collect ? {data:Buffer.concat(chunks)} : {}),stamp:stamp(before)};
  } finally { await handle.close(); }
}
/** Read-only, bounded-memory full-byte digest. No filename/hash trust shortcut. */
export async function hashProtectedFile({root,file}) {
  const {stamp: ignored, ...identity} = await readProtected(root,file);
  return identity;
}
/** Saved layer records describe transforms, not evaluated runtime matrixWorld. */
export async function inventoryProject({root,projectFile='project-state.json'}) {
  const metadata = await readProtected(root,projectFile,true);
  const value = JSON.parse(metadata.data.toString('utf8'));
  const project = projectFile === 'project-state.json' ? value.project : value;
  if (!project || ![1,2,3,4].includes(project.version) || !Array.isArray(project.layers) || project.layers.length > 10000) throw new Error('Unsupported project');
  canonical(project);
  const files = new Map(), ids = new Set();
  for (const layer of project.layers) {
    if (!layer || typeof layer !== 'object' || !['string','number'].includes(typeof layer.id) || ids.has(String(layer.id))) throw new Error('Invalid or duplicate layer ID');
    ids.add(String(layer.id));
    if (layer.streamUrl || layer.rawData || layer.meshData || layer._rawBuffer) throw new Error('External or inline sources require explicit full-byte hashing');
    if (layer.file != null) {
      safeRelative(layer.file);
      if (!EXTENSIONS.has(path.posix.extname(layer.file).slice(1).toLowerCase())) throw new Error('Unsupported asset extension');
      if (!files.has(layer.file)) files.set(layer.file,await readProtected(root,layer.file));
    } else if (['splat','obj'].includes(layer.type)) throw new Error('Missing source asset');
  }
  // Detect edits across the inventory pass, not just during each file read.
  for (const item of [metadata,...files.values()]) {
    const file = await protectedPath(root,item.file);
    if (stamp(await fs.lstat(file,{bigint:true})) !== item.stamp) throw new Error('Project changed during inventory');
  }
  const assets = [...files.values()].map(({stamp: ignored,...asset}) => asset).sort((a,b)=>a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return {schema:'locahun-source-inventory-v1',projectFile,projectSha256:metadata.sha256,assets,layers:project.layers,
    sceneIdentity:digest(canonical({version:project.version,layers:project.layers,assets})),
    transformContract:'Saved layer records only; runtime must bind exact evaluated matrixWorld and selection/exclusions.'};
}
function validSource(source) {
  if (!source || !Number.isSafeInteger(source.bytes) || source.bytes < 0) throw new Error('Invalid source size');
  if (/^[a-f0-9]{64}$/.test(source.sha256 || '')) return {sha256:source.sha256,bytes:source.bytes};
  if (typeof source.scope === 'string' && source.scope.trim() && /^"[\x21\x23-\x7e]+"$/.test(source.etag || '')) return {scope:source.scope,etag:source.etag,bytes:source.bytes};
  throw new Error('Authoritative SHA-256 or scoped strong ETag required');
}
/** Caller must trust the endpoint/scope and fetch fresh headers; this does not authenticate a server. */
export function identityFromHeaders({scope,headers,status=200}) {
  if (![200,206].includes(status)) throw new Error('Expected successful source response');
  let length = headers.get('content-length');
  if (status === 206) {
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers.get('content-range') || '');
    if (!m || Number(m[1]) > Number(m[2]) || Number(m[2]) >= Number(m[3]) || Number(length) !== Number(m[2])-Number(m[1])+1) throw new Error('Invalid source range');
    length = m[3];
  }
  if (!/^\d+$/.test(length || '')) throw new Error('Missing source size');
  return validSource({scope,etag:headers.get('etag'),bytes:Number(length)});
}
/** Key only, not signature verification or evidence of full bake coverage. */
export function collisionCacheKey({sources,worldMatrices,decoder,bake,selection}) {
  if (!Array.isArray(sources) || !sources.length || !Array.isArray(worldMatrices) || worldMatrices.length !== sources.length ||
      worldMatrices.some(m=>!Array.isArray(m) || m.length !== 16 || m.some(n=>!Number.isFinite(n))) ||
      typeof decoder !== 'string' || !decoder.trim() || !bake || typeof bake !== 'object' ||
      selection === undefined) throw new Error('Sources, exact matrices, decoder, bake and selection are required');
  return digest(canonical({schema:'locahun-collision-binding-v1',sources:sources.map(validSource),worldMatrices,decoder,bake,selection}));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  try {
    for (let i=0;i<args.length;i+=2) {
      if (!['--root','--project'].includes(args[i]) || !args[i+1] || options[args[i]]) throw new Error('Usage: --root PROJECT [--project project.json]');
      options[args[i]]=args[i+1];
    }
    if (!options['--root']) throw new Error('Required: --root PROJECT');
    console.log(JSON.stringify(await inventoryProject({root:options['--root'],projectFile:options['--project'] || 'project-state.json'}),null,2));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
