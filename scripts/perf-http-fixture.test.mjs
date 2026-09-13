import test from 'node:test';
import assert from 'node:assert/strict';
import {assetResponse} from './perf-http-fixture.mjs';
const asset={size:100,sha256:'a'.repeat(64)};
test('HEAD advertises body length but transfers no body',()=>{const r=assetResponse(asset,'HEAD');assert.equal(r.bytes,0);assert.equal(r.headers['Content-Length'],100);assert.equal(r.headers.ETag,'"sha256-'+asset.sha256+'"');});
test('range GET has same strong identity as HEAD',()=>{const r=assetResponse(asset,'GET','bytes=10-19');assert.equal(r.status,206);assert.equal(r.bytes,10);assert.equal(r.headers['Content-Range'],'bytes 10-19/100');assert.equal(r.headers.ETag,assetResponse(asset,'HEAD').headers.ETag);});
test('open and oversized ranges clamp to asset',()=>{assert.equal(assetResponse(asset,'GET','bytes=10-').bytes,90);assert.equal(assetResponse(asset,'GET','bytes=10-999').bytes,90);});
test('invalid and unsatisfiable ranges have no payload',()=>{for(const range of ['bytes=100-','bytes=20-10','bytes=-1','x']){const r=assetResponse(asset,'GET',range);assert.equal(r.status,416);assert.equal(r.bytes,0);}});
