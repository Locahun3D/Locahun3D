import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const url=new URL('./prepare-project-navigation.mjs',import.meta.url);
const prepare=fs.existsSync(url)?(await import(url)).prepareProjectNavigation:null;
const ctx=vm.createContext({Uint8Array,DataView,Float32Array,Uint32Array,Blob,CompressionStream,DecompressionStream,TextEncoder,TextDecoder});
for(const name of ['216b_whole_collision','403_navigation_cache'])vm.runInContext(fs.readFileSync(new URL('../src/js/'+name+'.js',import.meta.url),'utf8'),ctx);
const key='ab'.repeat(32);
async function fixture(cellSize=.1){
 const size=cellSize===.1?1:.9;
 const bytes=await ctx.LocahunWholeCollision.encodeTiles([{coord:[0,-1,0],boxes:[{center:[size,-cellSize,size],half:[size,cellSize,size]}]}],key,cellSize);
 return {version:3,layers:[],walk:{cellSize,signature:'source-transform',whole:{key,data:Buffer.from(bytes).toString('base64')}}};
}
test('offline project preparation generates bound navigation without mutating the input',async()=>{
 assert.equal(typeof prepare,'function');
 const input=await fixture(),before=JSON.stringify(input),result=await prepare(input);
 assert.equal(result.status,'generated');assert.equal(JSON.stringify(input),before);
 assert.equal(result.project.walk.navigation.key,key);
 await ctx.LocahunNavigationCache.decode(Buffer.from(result.project.walk.navigation.data,'base64'),key);
 assert.equal(result.project.walk.signature,input.walk.signature);
 const second=await prepare(result.project);assert.equal(second.status,'reused');assert.deepEqual(second.project,result.project);
});
test('absent or coarse proxy is explicit and never triggers a runtime bake',async()=>{
 assert.equal(typeof prepare,'function');
 assert.equal((await prepare({version:3,layers:[]})).status,'missing-collision');
 assert.equal((await prepare(await fixture(.15))).status,'unsupported-cell-size');
});
test('wrong proxy identity fails rather than installing an unrelated route',async()=>{
 assert.equal(typeof prepare,'function');
 const project=await fixture();project.walk.whole.key='cd'.repeat(32);
 await assert.rejects(prepare(project),/source/i);
});
