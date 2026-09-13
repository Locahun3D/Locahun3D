import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNavigationRegionBoxes as select} from './navigation-region-boxes.mjs';
const bounds=[[0,-2,0],[32,6,32]];
test('regional selection keeps crossing floors/walls and border padding without clipping',()=>{
 const long={center:[0,0,0],half:[100,.1,100]},wall={center:[32.2,2,8],half:[.1,2,1]},outside={center:[40,0,40],half:[1,1,1]};
 const result=select([long,wall,outside],bounds);assert.deepEqual(result,[long,wall]);assert.equal(result[0],long);assert.equal(long.half[0],100);
});
test('region rejects oversized, inverted, nonfinite and insufficient-padding settings',()=>{
 for(const b of [[[0,0,0],[33,1,32]],[[0,0,0],[0,1,32]],[[NaN,0,0],[32,1,32]]])assert.throws(()=>select([],b),/Invalid/);
 assert.throws(()=>select([],bounds,.1),/Invalid/);assert.throws(()=>select([{center:[0,0,0],half:[1,-1,1]}],bounds),/Invalid/);
});
