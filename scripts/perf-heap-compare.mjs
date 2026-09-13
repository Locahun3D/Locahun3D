import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='F:/Codex/locahun-performance-20260911/';
const [beforeName='heap-expanded-before',afterName='heap-expanded-after']=process.argv.slice(2);
const read=name=>JSON.parse(fs.readFileSync(dir+name+'.json'));
const before=read(beforeName),after=read(afterName);
assert(!before.failure&&!after.failure,'both runs completed');
for(const key of ['sourceHash','radHash','projectStateHash','fov','pixelHeight','decodedSplats','nodeVersion']){
 assert.notEqual(before[key],undefined,'missing identity '+key);
 assert.deepEqual(after[key],before[key],key);
}
assert.equal(after.traversals.length,before.traversals.length);
const comparisons=before.traversals.map((b,i)=>{
 const a=after.traversals[i];
 for(const key of ['i','kind','viewToObjectCols','numSplats','indexHash','sortedIndexHash','resumed'])assert.deepEqual(a[key],b[key],'sample '+i+' '+key);
 return {view:b.i,kind:b.kind,beforeMs:b.wasmMs,afterMs:a.wasmMs,reductionPercent:100*(1-a.wasmMs/b.wasmMs),identicalRawIndices:true};
});
const report={beforeName,afterName,beforeWasmHash:before.wasmHash,afterWasmHash:after.wasmHash,radHash:before.radHash,comparisons,scope:'CPU-only; no browser p95 or visual acceptance'};
fs.writeFileSync(dir+beforeName+'-comparison.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
