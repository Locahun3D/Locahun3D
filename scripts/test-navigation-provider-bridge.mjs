import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const source='ab'.repeat(32),mesh={updateMatrixWorld(){},matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}},layer={type:'splat',mesh,_streamUrl:'https://example.test/a.rad'};
 const cache=new WeakMap([[mesh,{identity:'sha256:'+source,url:layer._streamUrl,raw:undefined}]]);let created=0,disposed=0;
 const c=vm.createContext({URL,location:{protocol:'https:',href:'https://viewer.test/scene/'},layers:[layer],_wholeIdentityCache:cache,
  walkSetup:{epoch:1,settings:{navigationRegions:{schema:1,source}}},_walkSourceSignature:()=> 'signature',
  LocahunWalkSettings:{parseNavigationRegions:v=>v},LocahunNavigationSource:{key:async()=>source},
  LocahunNavigationProvider:{create(io){created++;return {read:io.read,dispose(){disposed++;}};}}});
 vm.runInContext('let _clickNavigationJourney=null;',c);
 vm.runInContext(fs.readFileSync(new URL('../src/js/403l_navigation_provider_bridge.js',import.meta.url),'utf8'),c);
 return {c,layer,cache,get created(){return created;},get disposed(){return disposed;}};
}
test('bridge is lazy, coalesces preparation and rejects later scene state',async()=>{
 const f=fixture();assert.equal(f.created,0);const p=f.c._prepareRegionalNavigationProvider();assert.equal(f.c._prepareRegionalNavigationProvider(),p);
 const provider=await p;assert(provider);assert.equal(f.created,1);f.c.walkSetup.epoch++;
 assert.equal(provider.read().source,'');f.c._clearRegionalNavigationProvider();assert.equal(f.disposed,1);
});
test('missing config, unsupported source and stale cached URL do not activate',async()=>{
 for(const mutate of [f=>delete f.c.walkSetup.settings.navigationRegions,f=>f.c.walkSetup.settings.meshOnly=true,f=>f.layer._streamUrl+='changed',f=>f.cache.delete(f.layer.mesh)]){
  const f=fixture();mutate(f);assert.equal(await f.c._prepareRegionalNavigationProvider(),null);assert.equal(f.created,0);
 }
});
test('restoring another scene while hashing prevents late activation',async()=>{
 const f=fixture();let release;f.c.LocahunNavigationSource.key=()=>new Promise(r=>release=r);
 const p=f.c._prepareRegionalNavigationProvider();f.c._clearRegionalNavigationProvider();release('ab'.repeat(32));
 assert.equal(await p,null);assert.equal(f.created,0);
});
