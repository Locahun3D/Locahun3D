import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {setup,code,instrumentation} from './collision-cache-bridge-fixture.mjs';
const require=createRequire('F:/Htlml/3DGS/locahun3d_online/package.json');
const {chromium}=require('playwright');

test('real Chrome fresh pages use native IndexedDB instead of rebaking; corrupt and changed sources regenerate',async t=>{
  const html='<!doctype html><meta charset="utf-8"><title>Collision cache verification</title><p id="result">Collision cache verification</p><script>'+setup+'\n'+code+'\n'+instrumentation+'</script>';
  const server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  t.after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
  // Separate Chrome instance/profile, no user tabs or WebGL work.
  browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-gpu']});
  const context=await browser.newContext({viewport:{width:900,height:500}});
  const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  const url=`http://127.0.0.1:${server.address().port}/`;
  async function fresh(){const page=await context.newPage();await page.goto(url);return page;}
  const first=await fresh();
  const baked=await first.evaluate(()=>runFixture());
  assert.equal(baked.ok,true);assert.equal(baked.bakes,1);
  const saved=await first.evaluate(async key=>(await LocahunCollisionCache.get(key))?.byteLength,baked.key);
  assert(saved>0);await first.close();

  const second=await fresh();
  assert.equal(await second.evaluate(()=>_wholeByteCache.size===0&&walkSetup.settings.whole==null),true);
  await second.evaluate(()=>{LocahunCollisionBake.generate=async()=>{bakes++;throw Error('Fresh page unexpectedly rebaked');};});
  const hit=await second.evaluate(()=>runFixture());
  assert.equal(hit.ok,true);assert.equal(hit.key,baked.key);assert.equal(hit.bakes,0);assert.equal(hit.coreBuilds,1);
  await second.evaluate(()=>{document.getElementById('result').textContent='PASS: Native IndexedDB cache hit on a fresh page. Zero rebakes.';});
  const evidence=path.resolve(process.env.COLLISION_CACHE_EVIDENCE || 'F:/Codex/collision-cache-browser');
  await fs.mkdir(evidence,{recursive:true});
  await second.screenshot({path:path.join(evidence,'fresh-page-cache-hit.png')});
  assert.equal(await second.evaluate(async key=>LocahunCollisionCache.put(key,new Uint8Array([1,2,3])),baked.key),true);
  await second.close();

  const third=await fresh();const repaired=await third.evaluate(()=>runFixture());
  assert.equal(repaired.ok,true);assert.equal(repaired.bakes,1);assert.equal(repaired.key,baked.key);await third.close();
  const fourth=await fresh();await fourth.evaluate(()=>{layers[0]._rawBuffer[0]=1;});
  const changed=await fourth.evaluate(()=>runFixture());
  assert.equal(changed.ok,true);assert.equal(changed.bakes,1);assert.notEqual(changed.key,baked.key);await fourth.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({chrome:browser.version(),initialBakes:baked.bakes,freshPageBakes:hit.bakes,corruptEntryBakes:repaired.bakes,changedSourceBakes:changed.bakes,payloadBytes:saved,evidence}));
});
