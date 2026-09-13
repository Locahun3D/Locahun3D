import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {navigationSourceKey} from './navigation-region-contract.mjs';
const c=vm.createContext({crypto:webcrypto,TextEncoder,Uint8Array}),file=new URL('../src/js/403e_navigation_source.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);
const sources=[{sha256:'ab'.repeat(32),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,2,0,0,1]}];
const key=async input=>{assert(c.LocahunNavigationSource);return c.LocahunNavigationSource.key(input);};
test('runtime hash matches offline exporter including order and duplicate instances',async()=>{
 for(const input of [sources,[...sources,...sources],[{...sources[0],sha256:'cd'.repeat(32)},...sources]])assert.equal(await key(input),navigationSourceKey(input));
});
test('invalid source information rejects without fetching anything',async()=>{
 assert(c.LocahunNavigationSource);
 for(const input of [[],[null],[{...sources[0],sha256:'etag:anything'}],[{...sources[0],matrix:[1]}]])await assert.rejects(key(input));
});
test('async digest snapshots source matrices before yielding',async()=>{
 const input=structuredClone(sources),expected=navigationSourceKey(input),pending=key(input);input[0].matrix[12]=100;
 assert.equal(await pending,expected);
});
