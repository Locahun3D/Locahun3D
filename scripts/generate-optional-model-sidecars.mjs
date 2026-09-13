import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function generateOptionalModelSidecars({ out, prefix = '/figures' }) {
  if (!out) throw new Error('A private --out directory is required');
  if (!['/figures', '/viewer/figures'].includes(prefix)) throw new Error('Unsupported URL prefix');
  const destination = path.resolve(out);
  const relative = path.relative(root, destination);
  if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)))
    throw new Error('Output must be outside the canonical repository');

  const equipmentSource = fs.readFileSync(path.join(root, 'src/assets/equipment_models.html'), 'utf8');
  const equipmentMatch = equipmentSource.match(/^\s*<script\s+type="application\/json"\s+id="equipment-assets">([\s\S]*?)<\/script>\s*$/);
  if (!equipmentMatch) throw new Error('Equipment source wrapper changed');
  const equipment = Buffer.from(equipmentMatch[1], 'utf8');
  const parsed = JSON.parse(equipmentMatch[1]);
  if (Object.keys(parsed).length !== 6 || Object.values(parsed).some(x => !x.glb || !x.thumbnail))
    throw new Error('Equipment payload schema changed');
  const mixamoSource = fs.readFileSync(path.join(root, 'src/assets/mixamo_glb_b64.html'), 'utf8');
  const mixamoMatch = mixamoSource.match(/^\s*<script>\s*window\.MIXAMO_GLB_B64="([A-Za-z0-9+/=]+)";?\s*<\/script>\s*$/);
  if (!mixamoMatch) throw new Error('Mixamo source wrapper changed');
  const mixamo = Buffer.from(mixamoMatch[1], 'base64');
  if (mixamo.readUInt32LE(0) !== 0x46546c67 || mixamo.readUInt32LE(8) !== mixamo.length)
    throw new Error('Invalid embedded Mixamo GLB');

  const assets = [];
  function write(name, bytes) {
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  for (const [id, bytes, extension, fragment] of [
    ['equipment-models', equipment, 'json', 'equipment_models.web.html'],
    ['mixamo-model', mixamo, 'glb', 'mixamo_glb_b64.web.html'],
  ]) {
    const sha256 = hash(bytes);
    const name = `${id}-v1-${sha256}.${extension}`;
    const descriptor = { version: 1, url: prefix + '/' + name, sha256, bytes: bytes.length };
    const json = JSON.stringify(descriptor);
    const html = id === 'equipment-models'
      ? `<script type="application/json" id="equipment-assets">${json}</script>\n`
      : `<script>window.MIXAMO_GLB_ASSET=${json};</script>\n`;
    write('figures/' + name, bytes);
    write('src/assets/' + fragment, html);
    assets.push({ id, path: 'figures/' + name, descriptor,
      fragment: 'src/assets/' + fragment, fragmentSha256: hash(Buffer.from(html)) });
  }
  const manifest = { version: 1, prefix,
    sourceHashes: { equipment: hash(Buffer.from(equipmentSource)), mixamo: hash(Buffer.from(mixamoSource)) }, assets };
  write('optional-model-assets.json', JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const manifest = generateOptionalModelSidecars({ out: option('--out'), prefix: option('--prefix') });
  console.log(JSON.stringify(manifest, null, 2));
}
