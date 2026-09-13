import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from './navigation-region-contract.mjs';
const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const a={sha256:'ab'.repeat(32),matrix},b={sha256:'cd'.repeat(32),matrix:[...matrix]};
const key=sources=>{assert.equal(typeof contract.navigationSourceKey,'function');return contract.navigationSourceKey(sources);};
test('source identity is independent of renderer/collision settings and layer order',()=>{
 assert.equal(key([a,b]),key([b,a]));assert.equal(key([a]),key([{...a,cellSize:.25,quality:'low'}]));
});
test('content, transformed placement and duplicate instances change source identity',()=>{
 assert.notEqual(key([a]),key([b]));const moved=[...matrix];moved[12]=1;
 assert.notEqual(key([a]),key([{...a,matrix:moved}]));assert.notEqual(key([a]),key([a,a]));
});
test('invalid and unbounded source records are rejected',()=>{
 assert.equal(typeof contract.navigationSourceKey,'function');
 for(const sources of [[],[null],[{...a,sha256:'url.rad'}],[{...a,matrix:[1]}],[{...a,matrix:matrix.map(()=>NaN)}],Array(1001).fill(a)])assert.throws(()=>key(sources));
});
