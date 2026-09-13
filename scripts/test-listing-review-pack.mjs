import test from 'node:test';
import assert from 'node:assert/strict';
import {buildListingReviewPack} from './listing-review-pack.mjs';
const fixture=()=>({version:1,studioName:'Studio',propertyId:'p',sceneId:'s',identityConfirmed:false,facts:[{field:'address',value:'Address',sourceUrl:'https://studio.test/access',checkedAt:'2026-09-14',scope:'s',status:'sourced'}],revision:2,projectSha256:'a'.repeat(64),checks:{north:false,paths:false,visual:false,photoPermission:false},recipient:null,approvedToShare:false,previewUrl:null});
test('report separates sourced facts, unknowns and human approval without publishing',()=>{
 const result=buildListingReviewPack(fixture(),{asOf:'2026-09-14'});
 assert.equal(result.readyToShare,false);assert.equal(result.sent,false);assert.equal(result.published,false);
 assert.ok(result.blockers.includes('identity_unconfirmed'));assert.ok(result.blockers.includes('missing:price'));
 assert.match(result.markdown,/https:\/\/studio.test\/access/);assert.match(result.markdown,/Address/);
});
test('cross-floor, stale, conflicting and unsourced values are not presented as verified',()=>{
 const f=fixture();f.facts.push({...f.facts[0],value:'Different'});
 f.facts.push({field:'price',value:10000,scope:'other',status:'sourced',sourceUrl:'https://studio.test/',checkedAt:'2026-09-14'});
 f.facts.push({field:'access',value:'Access',scope:'s',status:'sourced',sourceUrl:'https://studio.test/',checkedAt:'2025-01-01'});
 const r=buildListingReviewPack(f,{asOf:'2026-09-14'});
 assert.ok(r.blockers.includes('conflict:address'));assert.ok(r.blockers.includes('scope:price'));assert.ok(r.blockers.includes('stale:access'));
 assert.equal(r.acceptedFacts.length,0);
});
test('links cannot turn report into a token or local-file disclosure',()=>{
 const f=fixture();f.previewUrl='https://locahun3d.com/admin/properties/p/preview';
 assert.throws(()=>buildListingReviewPack(f,{asOf:'2026-09-14'}),/preview/);
 f.previewUrl=null;f.facts[0].sourceUrl='file:///C:/private';
 assert.throws(()=>buildListingReviewPack(f,{asOf:'2026-09-14'}),/source/);
});
test('request text needs completed source, all checks and a future approved preview',()=>{
 const f=fixture();Object.assign(f,{sourceStatus:'editing_complete',identityConfirmed:true,recipient:'担当者',approvedToShare:true,previewUrl:'https://locahun3d.com/preview/example-token',previewExpiresAt:'2026-10-01',checks:{north:true,paths:true,visual:true,photoPermission:true}});
 f.facts=['address','access','price','usageRules'].map(field=>({...f.facts[0],field}));
 const ready=buildListingReviewPack(f,{asOf:'2026-09-14'});assert.equal(ready.readyToShare,true);assert.match(ready.markdown,/確認依頼文/);
 f.previewExpiresAt='2026-09-14';assert.equal(buildListingReviewPack(f,{asOf:'2026-09-14'}).readyToShare,false);
});
