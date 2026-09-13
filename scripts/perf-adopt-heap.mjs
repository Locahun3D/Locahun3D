// Promote the reviewed generated artifact; never overwrite an immutable URL.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='F:/Codex/locahun-performance-20260911/',root=new URL('../vendor/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(dir+'heap-candidate-manifest.json'));
const candidate=fs.readFileSync(dir+'spark-heap-candidate.module.js'),rust=fs.readFileSync(dir+'heap-pop.rs');
assert.equal(hash(candidate),'ff799ee9a31cec478ebf173759c0f4061da662164dd72fd9da2efbabadd332f5');
assert.equal(hash(fs.readFileSync(new URL('spark-2.0.0-workers16-incrtraverse.module.js',root))),manifest.originalBundleSha256);
assert.equal(hash(rust),manifest.rustSourceSha256);
const publish=(name,bytes)=>{const url=new URL(name,root);if(fs.existsSync(url)){assert.equal(hash(fs.readFileSync(url)),hash(bytes),'refuse changed immutable asset: '+name);return;}fs.writeFileSync(url,bytes,{flag:'wx'});};
fs.mkdirSync(new URL('spark-heap319-v1/',root),{recursive:true});
publish('spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js',candidate);
publish('spark-heap319-v1/heap-pop.rs',rust);
publish('spark-heap319-v1/provenance.json',Buffer.from(JSON.stringify({...manifest,scope:'Approved 2026-09-11: heap319 only; N2 browser evidence, no end-to-end speed claim',compiler:{rustc:'1.95.0',commit:'59807616e1fa2540724bfbac14d7976d7e4a3860',llvm:'22.1.2',target:'wasm32-unknown-unknown',flags:['--crate-type=cdylib','-C opt-level=3','-C panic=abort','-C lto=fat','-C codegen-units=1']},evidence:'docs/perf-20260911.md'},null,2)+'\n'));
console.log('Reviewed artifact promoted to NEW immutable filename; no build/deploy/sync executed.');
