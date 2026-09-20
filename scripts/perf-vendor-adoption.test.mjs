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
// 2026-09-13 に本人指示で元のレンダラーへ戻した。2026-09-20、perf-rad-turn.mjs の A/B（2回とも再現・出力スプラット数同一・fps同等、
// 振り向き後の収束 3.2s→1.9s）を根拠に「オンライン版だけ」heap319 を再採用。単体配布版はリリース手順（perf-release-assets）が
// 元のレンダラーを前提にしているので変えない。戻すときは importmap.online.json を元の名前にし、この期待値も戻す。
test('standalone keeps the original renderer; online selects heap319 (re-adopted 2026-09-20)',()=>{
 const pick=f=>JSON.parse(fs.readFileSync(new URL(f,root))).imports['@sparkjsdev/spark'];
 assert(pick('src/assets/importmap.json').endsWith('/spark-2.0.0-workers16-incrtraverse.module.js'));
 // 2026-09-20: さらに Range 取得を cache:"no-store" にした版（同一URLの並列取得が Chrome のキャッシュロックで直列化される問題の回避。
 // 思い出横丁 584MB・遅延150ms で 読込 20s→3.9s、振り向き 4〜6s→2.0〜2.4s、2回再現）。heap319 本体との差はその1か所だけ。
 assert(pick('src/assets/importmap.online.json').endsWith('/'+name.replace('.module.js','-nostore.module.js')));
});
test('checked-in provenance and Rust source reproduce review identity',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('vendor/spark-heap319-v1/provenance.json',root)));
 assert.equal(p.candidateBundleSha256,'ff799ee9a31cec478ebf173759c0f4061da662164dd72fd9da2efbabadd332f5');
 assert.equal(hash(fs.readFileSync(new URL('vendor/spark-heap319-v1/heap-pop.rs',root))),p.rustSourceSha256);
});
