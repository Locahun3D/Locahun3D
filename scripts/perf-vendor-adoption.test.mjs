import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {shipped,bodies,sections} from './perf-wasm-tools.mjs';
const root=new URL('../',import.meta.url),name='spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('adopted immutable asset is exactly the visually reviewed candidate; old bytes remain',()=>{
 const old=shipped(),candidate=fs.readFileSync(new URL('vendor/'+name,root),'utf8');
 assert.equal(hash(old.bundle),'d2d5a26e30d1f95b7dd7eeb5378976caa07c20fa81cdbe745b8fa900f6e761be');
 assert.equal(hash(candidate),'ff799ee9a31cec478ebf173759c0f4061da662164dd72fd9da2efbabadd332f5');
 const at=candidate.indexOf('const jsContent = '),worker=vm.runInNewContext(candidate.slice(at,candidate.indexOf('\n',at))+'\njsContent');
 const wasm=Buffer.from(worker.match(/data:application\/wasm;base64,([A-Za-z0-9+/=]+)/)[1],'base64');
 assert(WebAssembly.validate(wasm));
 const imports=WebAssembly.Module.imports(new WebAssembly.Module(old.bytes)).filter(x=>x.kind==='function').length;
 const before=bodies(old.bytes),after=bodies(wasm);assert.equal(after.length,before.length);
 assert.deepEqual(before.flatMap((b,i)=>b.equals(after[i])?[]:[i+imports]),[319]);
 assert.deepEqual(sections(wasm).filter(s=>s.id!==10),sections(old.bytes).filter(s=>s.id!==10));
});
test('both importmaps select the original renderer after rollback',()=>{
 for(const f of ['src/assets/importmap.json','src/assets/importmap.online.json'])assert(JSON.parse(fs.readFileSync(new URL(f,root))).imports['@sparkjsdev/spark'].endsWith('/spark-2.0.0-workers16-incrtraverse.module.js'));
});
test('checked-in provenance and Rust source reproduce review identity',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('vendor/spark-heap319-v1/provenance.json',root)));
 assert.equal(p.candidateBundleSha256,'ff799ee9a31cec478ebf173759c0f4061da662164dd72fd9da2efbabadd332f5');
 assert.equal(hash(fs.readFileSync(new URL('vendor/spark-heap319-v1/heap-pop.rs',root))),p.rustSourceSha256);
});
