// Fetch only the pinned official npm tarball, verify integrity, and emit the offline asset.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = path.join(root, 'vendor/rapier-walk');
const version = '0.20.0';
const url = `https://registry.npmjs.org/@dimforge/rapier3d-compat/-/rapier3d-compat-${version}.tgz`;
const integrity = 'sha512-X4W9pJBdGRX5CO3c/gUNjBFEFG2fn4nYxp9k8STdBDaLa0/w5XTW2ArpayS+9jGFojTi3uFSOWAElCd4rkpekA==';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

await fs.mkdir(vendor, { recursive: true });
if (!process.argv.includes('--embed-only')) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Official npm download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity)
    throw new Error('Official npm tarball integrity mismatch; refusing to vendor.');
  const temp = await fs.mkdtemp(path.join(vendor, '.extract-'));
  try {
    const archive = path.join(temp, 'package.tgz');
    await fs.writeFile(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', temp,
      'package/dist/rapier.mjs', 'package/LICENSE', 'package/package.json', 'package/README.md']);
    for (const [from, to] of [['dist/rapier.mjs', 'rapier.mjs'], ['LICENSE', 'LICENSE'],
      ['package.json', 'upstream-package.json'], ['README.md', 'README.upstream.md']])
      await fs.copyFile(path.join(temp, 'package', from), path.join(vendor, to));
  } finally {
    if (path.dirname(path.resolve(temp)) !== path.resolve(vendor)) throw new Error('Unsafe cleanup path.');
    await fs.rm(temp, { recursive: true, force: true });
  }
}
const esm = await fs.readFile(path.join(vendor, 'rapier.mjs'));
// The module is unmodified upstream; only the distribution payload omits its external source-map URL.
const payload = Buffer.from(esm.toString('utf8').replace(/^\/\/# sourceMappingURL=.*$/gm, ''));
const asset = `<!-- @dimforge/rapier3d-compat ${version}; Apache-2.0; see vendor/rapier-walk/LICENSE -->\n<script>\nwindow.WALK_RAPIER_B64 = "${payload.toString('base64')}";\n</script>\n`;
await fs.writeFile(path.join(root, 'src/assets/rapier_walk_b64.html'), asset);
await fs.writeFile(path.join(vendor, 'provenance.json'), JSON.stringify({
  package: '@dimforge/rapier3d-compat', version, url, integrity,
  esmSha256: sha256(esm), payloadSha256: sha256(payload), assetSha256: sha256(asset),
  esmBytes: esm.length, payloadBytes: payload.length, assetBytes: Buffer.byteLength(asset)
}, null, 2) + '\n');
console.log(`Rapier ${version}: ${esm.length} ESM bytes, ${Buffer.byteLength(asset)} offline asset bytes.`);
