#!/usr/bin/env node
/**
 * merge_ply.js — Merge multiple 3DGS PLY files into one
 *
 * Usage:  node merge_ply.js <output.ply> <input1.ply> <input2.ply> [...]
 *
 * All input PLYs must be binary_little_endian with identical vertex
 * property layouts (same names, same types, same order). The output
 * PLY has the combined vertex count with all vertex data concatenated.
 *
 * Non-vertex elements (face, edge, etc.) are dropped with a warning.
 */

const fs = require('fs');

function fail(msg) {
  console.error('[merge_ply] ' + msg);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 3) {
  fail('Usage: node merge_ply.js <output.ply> <input1.ply> <input2.ply> [...]');
}

const outPath = args[0];
const inputs = args.slice(1);

for (const f of inputs) {
  if (!fs.existsSync(f)) fail('File not found: ' + f);
}

// ── Parse one PLY, return { headerText, headerEnd, numVertices, stride, propsKey, buf } ──
function parsePly(filePath) {
  const buf = fs.readFileSync(filePath);

  let headerEnd = buf.indexOf(Buffer.from('end_header\n', 'ascii'));
  if (headerEnd < 0) fail('Not a valid PLY (no end_header): ' + filePath);
  headerEnd += 'end_header\n'.length;
  const headerText = buf.subarray(0, headerEnd).toString('ascii');

  if (!/format\s+binary_little_endian/i.test(headerText)) {
    fail('Only binary_little_endian supported: ' + filePath);
  }

  const vertexMatch = headerText.match(/element\s+vertex\s+(\d+)/i);
  if (!vertexMatch) fail('No "element vertex" in: ' + filePath);
  const numVertices = parseInt(vertexMatch[1], 10);

  // Check for non-vertex elements
  const otherElements = headerText.match(/element\s+(?!vertex)\w+\s+\d+/gi);
  if (otherElements) {
    for (const el of otherElements) {
      const count = el.match(/\d+$/)[0];
      if (parseInt(count, 10) > 0) {
        console.warn(`[merge_ply] WARNING: "${el}" in ${filePath} will be dropped`);
      }
    }
  }

  const typeSize = {
    char: 1, uchar: 1, int8: 1, uint8: 1,
    short: 2, ushort: 2, int16: 2, uint16: 2,
    int: 4, uint: 4, int32: 4, uint32: 4,
    float: 4, float32: 4,
    double: 8, float64: 8,
  };

  const lines = headerText.split('\n');
  const props = [];
  let inVertex = false, stride = 0;
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (/^element\s+vertex\s+/i.test(trimmed)) { inVertex = true; continue; }
    if (/^element\s+/i.test(trimmed)) { inVertex = false; continue; }
    if (!inVertex) continue;
    const m = trimmed.match(/^property\s+(\w+)\s+(\w+)\s*$/i);
    if (!m) continue;
    const [, type, name] = m;
    const sz = typeSize[type.toLowerCase()];
    if (sz === undefined) fail('Unsupported type: ' + type + ' in ' + filePath);
    props.push({ name, type: type.toLowerCase(), size: sz });
    stride += sz;
  }
  if (!props.length) fail('No vertex properties: ' + filePath);

  // Key for layout comparison: "type:name,type:name,..."
  const propsKey = props.map(p => p.type + ':' + p.name).join(',');

  return { headerText, headerEnd, numVertices, stride, propsKey, props, buf };
}

// ── Parse all inputs ──
console.log(`[merge_ply] Merging ${inputs.length} files...`);
const parsed = inputs.map(f => parsePly(f));

// ── Validate identical layouts ──
const refKey = parsed[0].propsKey;
for (let i = 1; i < parsed.length; i++) {
  if (parsed[i].propsKey !== refKey) {
    fail(
      `Property layout mismatch!\n` +
      `  File 0: ${inputs[0]}\n    ${refKey}\n` +
      `  File ${i}: ${inputs[i]}\n    ${parsed[i].propsKey}`
    );
  }
}

// ── Build merged header ──
const totalVertices = parsed.reduce((s, p) => s + p.numVertices, 0);
const stride = parsed[0].stride;

// Reconstruct a clean header with only vertex element
const propLines = parsed[0].props.map(p => `property ${p.type} ${p.name}`).join('\n');
const mergedHeader =
  `ply\n` +
  `format binary_little_endian 1.0\n` +
  `element vertex ${totalVertices}\n` +
  `${propLines}\n` +
  `end_header\n`;

const headerBuf = Buffer.from(mergedHeader, 'ascii');
const dataBufs = parsed.map(p => p.buf.subarray(p.headerEnd, p.headerEnd + p.numVertices * p.stride));
const totalDataSize = dataBufs.reduce((s, b) => s + b.length, 0);

// ── Write output ──
const outBuf = Buffer.concat([headerBuf, ...dataBufs], headerBuf.length + totalDataSize);
fs.writeFileSync(outPath, outBuf);

const totalStr = totalVertices.toLocaleString();
const sizeStr = (outBuf.length / 1024 / 1024).toFixed(1);
console.log(`[merge_ply] OK: merged ${inputs.length} files -> ${totalStr} vertices (${sizeStr} MB)`);
for (let i = 0; i < inputs.length; i++) {
  console.log(`[merge_ply]   [${i + 1}] ${parsed[i].numVertices.toLocaleString()} vertices <- ${inputs[i]}`);
}
console.log(`[merge_ply]   output: ${outPath}`);
