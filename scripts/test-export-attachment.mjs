import test from 'node:test';
import assert from 'node:assert/strict';
import {attachVerifiedExport} from './export-attachment.mjs';
function fixture(){
 const hash='a'.repeat(64),property={id:'st-004',status:'draft',updatedAt:'v1',title:'Keep',splatItems:[{id:'scene-1',splatUrl:'',notes:'Keep note'},{id:'scene-2',splatUrl:'/other.zip'}]};
 const binding={propertyId:property.id,sceneId:'scene-1',expectedUpdatedAt:'v1',previousUrl:'',assetId:'asset-1',revision:4,projectSha256:'b'.repeat(64),archiveSha256:hash,archiveBytes:123};
 const state={property,saves:0,checks:0};
 const io={verifySource:async()=>({revision:4,projectSha256:'b'.repeat(64),status:'editing_complete'}),getProperty:async()=>structuredClone(state.property),getAsset:async()=>({id:'asset-1',status:'ready',kind:'splat',url:'/assets/splat/a.zip',size:123}),verifyAssetBytes:async()=>{state.checks++;return {sha256:hash,bytes:123};},saveDraft:async(p,opts)=>{assert.equal(opts.expectedUpdatedAt,'v1');state.saves++;state.property={...p,updatedAt:'v2'};return {ok:true,id:p.id,updatedAt:'v2'};}};
 return {state,io,binding};
}
test('attaches exact scene only after digest verification and confirms saved readback',async()=>{
 const f=fixture(),r=await attachVerifiedExport(f.binding,f.io);
 assert.equal(r.status,'attached');assert.equal(f.state.checks,1);assert.equal(f.state.saves,1);
 assert.equal(f.state.property.title,'Keep');assert.equal(f.state.property.splatItems[0].notes,'Keep note');assert.equal(f.state.property.splatItems[1].splatUrl,'/other.zip');
 assert.equal((await attachVerifiedExport(f.binding,f.io)).status,'already_attached');assert.equal(f.state.saves,1);
});
test('wrong digest, source revision, target or concurrently edited property prevents save',async()=>{
 for(const mutate of [f=>{f.io.verifyAssetBytes=async()=>({sha256:'c'.repeat(64),bytes:123});},f=>{f.binding.revision=5;},f=>{f.binding.sceneId='missing';},f=>{f.state.property.updatedAt='newer';},f=>{f.state.property.status='published';}]){
  const f=fixture();mutate(f);await assert.rejects(attachVerifiedExport(f.binding,f.io));assert.equal(f.state.saves,0);
 }
});
test('unconfirmed save response is reconciled by readback without a duplicate save',async()=>{
 const f=fixture(),save=f.io.saveDraft;f.io.saveDraft=async(...args)=>{await save(...args);throw Error('connection lost');};
 assert.equal((await attachVerifiedExport(f.binding,f.io)).status,'attached');assert.equal(f.state.saves,1);
});
test('failed readback never reports completion',async()=>{
 const f=fixture();f.io.saveDraft=async()=>({ok:true,id:'st-004'});
 await assert.rejects(attachVerifiedExport(f.binding,f.io),/readback/i);
});
test('accepts the production R2 asset URL format',async()=>{
 const f=fixture(),get=f.io.getAsset;
 f.io.getAsset=async()=>({...await get(),url:'/api/r2/assets/splat/a.zip'});
 assert.equal((await attachVerifiedExport(f.binding,f.io)).status,'attached');
});
