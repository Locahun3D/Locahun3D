import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../src/js/217b_whole_collision_bridge.js',import.meta.url),'utf8');
function fixture(href='http://127.0.0.1:12345/token/?localProject=1'){
 const c={URL,location:new URL(href),localProject:{ready:true}};vm.createContext(c);
 const start=code.indexOf('function _wholeLocalDigestIdentity('),end=code.indexOf('\nfunction ',start+1);
 if(start>=0)vm.runInContext(code.slice(start,end<0?undefined:end),c);
 return c;
}
test('trusted local content digest survives port/token changes and matches raw-file identity',()=>{
 for(const href of ['http://127.0.0.1:12345/token/?localProject=1','http://127.0.0.1:54321/newtoken/?localProject=1']){
  const c=fixture(href);assert.equal(typeof c._wholeLocalDigestIdentity,'function');
  assert.equal(c._wholeLocalDigestIdentity(new URL('assets/test.rad',href).href,'"sha256-'+ 'a'.repeat(64)+'"'),'sha256:'+'a'.repeat(64));
 }
});
test('remote, wrong directory, query and unsupported digest never become local content identity',()=>{
 const c=fixture(),etag='"sha256-'+'a'.repeat(64)+'"';assert.equal(typeof c._wholeLocalDigestIdentity,'function');
 for(const url of ['https://example.com/token/assets/a.rad','http://127.0.0.1:54321/token/assets/a.rad','http://127.0.0.1:12345/other/assets/a.rad','http://127.0.0.1:12345/token/assets/a.rad?version=1'])assert.equal(c._wholeLocalDigestIdentity(url,etag),null);
 assert.equal(c._wholeLocalDigestIdentity('http://127.0.0.1:12345/token/assets/a.rad','"multipart"'),null);
 c.localProject=null;assert.equal(c._wholeLocalDigestIdentity('http://127.0.0.1:12345/token/assets/a.rad',etag),null);
});
