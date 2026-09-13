import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {startLocalProjectServer} from './local-project-server.mjs';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const at=process.argv.indexOf('--root');
if(at<0)throw new Error('Usage: --root PREPARED_NEW_PROJECT [--headed]');
const root=path.resolve(process.argv[at+1]);
const before=JSON.parse(await fs.readFile(path.join(root,'project-state.json'),'utf8'));
const fingerprint=async file=>createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
const file=before.project.layers.find(l=>l.type==='splat').file;
const originalHash=await fingerprint(file);
const service=await startLocalProjectServer({root});
const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}});let assetWrites=0;const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/assets'))assetWrites++;});
const evidence='F:/Codex/local-project-verification';await fs.mkdir(evidence,{recursive:true});
try{
  await page.goto(service.url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>localProject.ready||localProject.status==='error',{timeout:120000});
  assert.equal(await page.evaluate(()=>localProject.ready),true,await page.locator('#local-project-status').textContent());
  await page.waitForTimeout(7000);
  await page.screenshot({path:path.join(evidence,'2FStudio-before.png')});
  await page.locator('#tb-save-btn').click();
  await page.waitForFunction(r=>localProject.revision===r+1,before.revision,{timeout:60000});
  const saved=JSON.parse(await fs.readFile(path.join(root,'project-state.json'),'utf8'));
  for(const layer of before.project.layers){
    const next=saved.project.layers.find(l=>l.id===layer.id);assert.ok(next);
    for(const key of ['name','type','pos','rot','scale','_flipAxes','_loadFlipped','pathPoints','pathLabel','pathColor','pathOpacity']){
      if(layer[key]!==undefined)assert.deepEqual(next[key],layer[key],layer.name+' '+key);
    }
  }
  assert.equal(saved.status,'draft');assert.equal(await fingerprint(file),originalHash);assert.equal(assetWrites,0);
  await page.reload();await page.waitForFunction(()=>localProject.ready,{timeout:120000});await page.waitForTimeout(5000);
  await page.screenshot({path:path.join(evidence,'2FStudio-reopened.png')});
  assert.deepEqual(errors,[]);
  const report={project:root,revision:saved.revision,status:saved.status,layers:saved.project.layers.length,
    paths:saved.project.layers.filter(l=>l.type==='path').length,assetSha256:originalHash,assetWrites,errors};
  await fs.writeFile(path.join(evidence,'real-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:path.join(evidence,'real-failure.png')});throw error;}
finally{await browser.close();await service.close();}
