import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const core=await fs.readFile(new URL('./viewer-update-core.cjs',import.meta.url),'utf8');
const boot=await fs.readFile(new URL('../src/js/002_viewer_update_boot.js',import.meta.url),'utf8');
function documentFor(release,app='bundled',broken=false) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><button id="edit">Edit</button>
<script>window.__locahunBuildRelease=${JSON.stringify(release)};${core}\n${boot}</script>
<script type="module" id="locahun-app-source">await window.__locahunStartupGate;
${broken?'throw new Error("broken release");':`window.app=${JSON.stringify(app)};document.body.dataset.app=window.app;document.getElementById('edit').onclick=()=>window.edited=true;`}
if(window.__locahunUpdateFrame)parent.postMessage({type:'locahun-update-ready',nonce:window.__locahunUpdateFrame},'*');
</script></body></html>`;
}
test('file startup verification, same-version skip, visible wait/cancel, failure fallback and no late switch',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-boot-'));
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  t.after(async()=>{await browser.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('viewer-boot-'));await fs.rm(root,{recursive:true,force:true});});
  const file=path.join(root,'viewer.html');await fs.writeFile(file,documentFor('bundled-id'));
  let remote=documentFor('release-id','updated');
  let mode='success',payloads=0,manifests=0;
  const page=await browser.newPage({viewport:{width:820,height:900}});
  await page.route('https://viewer.locahun3d.com/releases/**',async route=>{
    if(route.request().url().endsWith('stable.json')) {
      manifests++;
      if(mode==='offline'){await route.abort();return;}
      if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,1500));
      const manifest={schema:1,release:mode==='same'?'bundled-id':'release-id',projectVersions:[4],localProjectApi:1,
        viewer:{url:'https://viewer.locahun3d.com/releases/release-id/viewer.html',bytes:Buffer.byteLength(remote),sha256:createHash('sha256').update(remote).digest('hex')}};
      await route.fulfill({json:manifest,headers:{'Access-Control-Allow-Origin':'*'}});
    } else {payloads++;await route.fulfill({body:remote,contentType:'text/html',headers:{'Access-Control-Allow-Origin':'*'}});}
  });
  await page.goto(pathToFileURL(file).href,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__locahunActiveRelease==='release-id');
  assert.equal(await page.evaluate(()=>window.app),undefined);
  assert.equal(await page.frames()[1].evaluate(()=>window.app),'updated');
  assert.equal(manifests,1);assert.equal(payloads,1);
  mode='same';await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(()=>window.app==='bundled');assert.equal(payloads,1);
  mode='offline';await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(()=>window.app==='bundled');
  mode='slow';await page.goto(pathToFileURL(file).href,{waitUntil:'commit'});
  await page.locator('#viewer-update-status').waitFor({state:'visible'});
  if(process.env.VIEWER_UPDATE_QA_DIR) {
    await fs.mkdir(process.env.VIEWER_UPDATE_QA_DIR,{recursive:true});
    for(const width of [1440,820,390]) {
      await page.setViewportSize({width,height:900});
      await page.screenshot({path:path.join(process.env.VIEWER_UPDATE_QA_DIR,`waiting-${width}.png`)});
    }
  }
  await page.getByRole('button',{name:'同梱版を開く'}).click();
  await page.waitForFunction(()=>window.app==='bundled');await page.locator('#edit').click();
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(()=>window.edited),true);
  assert.equal(await page.evaluate(()=>window.__locahunActiveRelease),undefined);
  assert.equal(page.frames().length,1);
  mode='broken';remote=documentFor('broken-id','updated',true);
  await page.goto(pathToFileURL(file).href,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.app==='bundled');
  assert.equal(page.frames().length,1);
});
test('updated frame resolves shared assets at the official root, not the immutable release directory',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-assets-'));
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  t.after(async()=>{await browser.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('viewer-assets-'));await fs.rm(root,{recursive:true,force:true});});
  const file=path.join(root,'viewer.html'), bundled=documentFor('bundled-id');
  await fs.writeFile(file,bundled);
  const remote=documentFor('asset-release','updated');
  const origin='https://viewer.locahun3d.com';
  const manifest={schema:1,release:'asset-release',projectVersions:[4],localProjectApi:1,
    viewer:{url:origin+'/releases/asset-release/viewer.html',bytes:Buffer.byteLength(remote),sha256:createHash('sha256').update(remote).digest('hex')}};
  const assets=['figures/jtoastie_walk.glb','vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js','favicon.ico','version.json'];
  const requested=[];
  const page=await browser.newPage();
  const diagnostics=[];
  page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text());});
  page.on('requestfailed',request=>diagnostics.push(request.url()+': '+request.failure()?.errorText));
  await page.route('https://**/*',async route=>{
    const url=route.request().url();
    const headers={'Access-Control-Allow-Origin':'*'};
    if(url===origin+'/releases/stable.json')return route.fulfill({json:manifest,headers});
    if(url===manifest.viewer.url)return route.fulfill({body:remote,contentType:'application/octet-stream',headers});
    requested.push(url);
    const asset=assets.find(name=>url===origin+'/'+name);
    return route.fulfill({status:asset?200:404,body:asset?'fixture:'+asset:'missing',contentType:'text/plain',headers});
  });
  await page.goto(pathToFileURL(file).href,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__locahunActiveRelease==='asset-release');
  const frame=page.frames().find(f=>f!==page.mainFrame());assert(frame);
  assert.equal(await frame.evaluate(()=>document.baseURI),origin+'/');
  assert.deepEqual(await frame.evaluate(names=>names.map(name=>new URL(name,document.baseURI).href),assets),assets.map(name=>origin+'/'+name));
  // Fetch the reported GLB regression; other relative paths are checked above.
  for(const asset of assets.slice(0,1)){
    const result=await frame.evaluate(async name=>{const response=await fetch(name);return {status:response.status,body:await response.text()};},asset)
      .catch(async error=>{await page.waitForTimeout(100);throw new Error(error.message+'\n'+diagnostics.join('\n')+'\nRequested: '+requested.join(','));});
    assert.deepEqual(result,{status:200,body:'fixture:'+asset});
  }
  assert.deepEqual(requested,[origin+'/'+assets[0]]);
  assert.equal(await page.evaluate(()=>document.baseURI),pathToFileURL(file).href);
  assert.equal(await fs.readFile(file,'utf8'),bundled);
});

test('canonical template retains final module hook scope',async()=>{
  const template=await fs.readFile(new URL('../src/template.html',import.meta.url),'utf8');
  const finalScript=template.slice(template.lastIndexOf('<script'));
  assert.match(finalScript,/type="module"/);assert.match(finalScript,/src\/js\/010_state.js/);
  assert.ok(template.indexOf('002_viewer_update_boot.js')<template.indexOf('id="locahun-app-source"'));
});
