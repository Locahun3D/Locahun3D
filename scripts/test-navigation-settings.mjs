import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {navigationRegionEntry} from './navigation-region-contract.mjs';
const c=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../src/js/216_walk_settings.js',import.meta.url),'utf8'),c);
const source='ab'.repeat(32),entry=navigationRegionEntry(source,[[0,0,0],[8,8,8]],new Uint8Array([1]));
const manifest=()=>({schema:1,source,regions:[{navigation:structuredClone(entry),collision:structuredClone(entry)}]});
const parse=value=>JSON.parse(JSON.stringify(c.LocahunWalkSettings.parse(value)));
test('regional manifest survives settings roundtrip independently of coarse collision',()=>{
 const input={cellSize:.25,navigationRegions:manifest()},saved=parse(input);assert.deepEqual(saved.navigationRegions,input.navigationRegions);
 assert.deepEqual(parse(saved),saved);input.navigationRegions.regions[0].navigation.bounds[0][0]=-1;
 assert.equal(saved.navigationRegions.regions[0].navigation.bounds[0][0],0);
});
test('malformed optional regional manifest is discarded without breaking ordinary settings',()=>{
 for(const mutate of [m=>m.regions[0].collision.key='ff'.repeat(32),m=>m.regions.push(m.regions[0]),m=>m.regions[0].navigation.bytes=3000000,m=>m.regions[0].collision.bounds[1][0]=100]){
  const value=manifest();mutate(value);const parsed=parse({cellSize:.25,navigationRegions:value});assert(!parsed.navigationRegions);assert.equal(parsed.cellSize,.25);
 }
});
test('manifest never preserves remote URLs or arbitrary extra fields',()=>{
 const value=manifest();value.url='http://private/';value.regions[0].collision.url='http://private/';
 assert.deepEqual(parse({navigationRegions:value}).navigationRegions,manifest());
});
