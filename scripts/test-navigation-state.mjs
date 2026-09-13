import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const c=vm.createContext({console}),file=new URL('../src/js/403c_navigation_state.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);
function fixture(){
 let snapshot={key:'ab'.repeat(32),data:'test',epoch:1},release,decodes=0,disposed=0;
 assert(c.LocahunNavigationState);
 const state=c.LocahunNavigationState.create({read:()=>snapshot,decode:()=>{decodes++;return new Promise(r=>release=r);},build:()=>({find:()=>true,dispose:()=>disposed++})});
 return {state,change:()=>snapshot={...snapshot,epoch:2},release:()=>release({}),get decodes(){return decodes;},get disposed(){return disposed;}};
}
test('navigation initialization is lazy and shared while pending',async()=>{
 const f=fixture();assert.equal(f.decodes,0);assert.equal(f.state.get(),null);
 const a=f.state.prepare(),b=f.state.prepare();assert.equal(f.decodes,1);f.release();assert(await a);assert.equal(await b,f.state.get());
});
test('scene changes discard pending results and dispose ready queries',async()=>{
 const f=fixture(),pending=f.state.prepare();f.change();f.release();assert.equal(await pending,null);assert.equal(f.state.get(),null);
 const next=f.state.prepare();f.release();assert(await next);f.state.clear();assert.equal(f.disposed,1);assert.equal(f.state.get(),null);
});
test('walk settings retain matching navigation data but reject unrelated source',()=>{
 vm.runInContext(fs.readFileSync(new URL('../src/js/216_walk_settings.js',import.meta.url),'utf8'),c);
 const key='ab'.repeat(32),whole={key,data:'YQ=='},navigation={key,data:'Yg=='};
 assert.equal(c.LocahunWalkSettings.parse({whole,navigation}).navigation?.data,'Yg==');
 assert.equal(c.LocahunWalkSettings.parse({whole,navigation:{...navigation,key:'cd'.repeat(32)}}).navigation,null);
});
