import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startLocalProjectServer} from './local-project-server.mjs';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'locahun-local-ui-'));
const evidence='F:/Codex/local-project-verification';
await fs.mkdir(evidence,{recursive:true});await fs.mkdir(path.join(root,'assets'));await fs.mkdir(path.join(root,'history'));
await fs.copyFile(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),path.join(root,'viewer.html'));
await fs.copyFile('F:/Codex/locahun-walk/fixtures/real-scan.splat',path.join(root,'assets/scan.splat'));
const project={version:4,projectName:'Local editing test',camera:{pos:{x:0,y:1.6,z:3},yaw:0,pitch:0},layerNextId:3,
  layers:[{id:1,name:'Scan',type:'splat',file:'assets/scan.splat',rawExt:'splat',isMain:true,visible:true,pos:{x:0,y:0,z:0},rot:{x:0,y:0,z:0},size:{x:1,y:1,z:1}},
    {id:2,name:'Area',type:'path',visible:true,pathPoints:[{x:-1,y:0,z:-1},{x:1,y:0,z:-1},{x:1,y:0,z:1},{x:-1,y:0,z:1}],pathColor:'#00d0ff',pathWidth:.2,pathLabel:'Entry',pos:{x:0,y:0,z:0},rot:{x:0,y:0,z:0},size:{x:1,y:1,z:1}}]};
await fs.writeFile(path.join(root,'project-state.json'),JSON.stringify({revision:0,status:'draft',project}));
const service=await startLocalProjectServer({root});
const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];let assetWrites=0;
const hook='window.__localTest={select:()=>selectLayer(2),count:()=>layers.length,restore:p=>restoreProject(p),race:p=>Promise.allSettled([restoreProject(p,{strict:true}),restoreProject(p,{strict:true})])};';
async function wire(p){
  p.on('pageerror',e=>errors.push(e.message));
  p.on('dialog',d=>d.accept());
  p.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/assets'))assetWrites++;});
  await p.route('**/?localProject=1',async route=>{
    const response=await route.fetch();let html=await response.text();const at=html.lastIndexOf('</script>');
    await route.fulfill({response,body:html.slice(0,at)+hook+html.slice(at)});
  });
  await p.goto(service.url,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.localProject?.ready || window.localProject?.status==='error',{timeout:90000});
  assert.equal(await p.evaluate(()=>localProject.ready),true,await p.locator('#local-project-status').textContent());
}
try{
  await wire(page);assert.equal(await page.evaluate(()=>__localTest.count()),2);
  const stale=await browser.newPage();await wire(stale);
  await page.evaluate(()=>__localTest.select());
  if(await page.locator('#layer-panel').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#lp-title-head').click();
  await page.locator('#path-width-number-2').fill('0.55');
  await page.locator('#path-color-2').fill('#f04378');
  await page.locator('textarea[oninput*="setPathLabel"]').fill('商店街側入り口\nhttps://maps.example/entry');
  assert.equal(await page.locator('#lr-2 .lr-name').textContent(),'商店街側入り口');
  assert.equal(await page.locator('#btnWalkSetup').count(),0);
  await page.locator('#tb-save-btn').click();
  await page.waitForFunction(()=>localProject.revision===1);
  const saved=JSON.parse(await fs.readFile(path.join(root,'project-state.json'),'utf8'));
  assert.equal(saved.project.layers[1].pathWidth,.55);assert.equal(saved.project.layers[1].pathColor,'#f04378');
  assert.equal(saved.project.layers[1].name,'商店街側入り口');
  assert.equal(saved.project.layers[1].pathLabel,'商店街側入り口\nhttps://maps.example/entry');
  assert.equal(saved.project.layers[0].file,'assets/scan.splat');assert.equal(saved.project.layers[0].streamUrl,undefined);
  assert.equal(assetWrites,0,'unchanged model should never be uploaded on checkpoint');
  assert.equal(await stale.evaluate(()=>localProject.save()),false);
  assert.match(await stale.locator('#local-project-status').textContent(),/別の画面|Another editor/);await stale.close();
  await page.reload();await page.waitForFunction(()=>localProject.ready,{timeout:90000});
  await page.evaluate(()=>__localTest.select());
  assert.equal(await page.locator('#path-width-number-2').inputValue(),'0.55');
  assert.equal(await page.locator('#lr-2 .lr-name').textContent(),'商店街側入り口');
  await page.locator('#local-project-complete').click();await page.waitForFunction(()=>localProject.status==='editing_complete');
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'project-state.json'),'utf8')).status,'editing_complete');
  await page.locator('#tb-save-btn').click();await page.waitForFunction(()=>localProject.revision===3);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'project-state.json'),'utf8')).status,'draft');
  assert.ok((await fs.readdir(path.join(root,'history'))).length>=3);
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(()=>localProject.dirty),true,'undo shortcut must mark checkpoint dirty');
  await page.evaluate(()=>localProject.save());
  await page.route('**/api/project',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    await page.evaluate(()=>addCubeLayer());
    await route.continue();
  });
  await page.evaluate(()=>localProject.save());
  assert.equal(await page.evaluate(()=>localProject.dirty),true,'async import during save must remain unsaved');
  await page.unroute('**/api/project');
  await page.evaluate(()=>localProject.save());
  assert.equal(await page.evaluate(()=>localProject.dirty),false);
  for(const width of [1440,820,390]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(300);
    for(const id of ['tb-save-btn','local-project-complete']){
      const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width,id+' out of viewport');
    }
    await page.screenshot({path:path.join(evidence,'editor-'+width+'.png')});
  }
  const race=await page.evaluate(()=>__localTest.race({version:4,layers:[]}));
  assert.equal(race[0].status,'rejected','superseded strict restore must reject even with matching IDs/count');
  assert.equal(race[1].status,'fulfilled');
  const stateBeforeFailure=await fs.readFile(path.join(root,'project-state.json'),'utf8');
  const failed=await page.evaluate(async()=>{
    try{await __localTest.restore({version:4,layers:[{id:9,type:'obj',name:'Broken'}]});return false;}catch{return true;}
  });
  assert.equal(failed,true,'ordinary restore must become strict in local mode');
  assert.equal(await page.evaluate(()=>localProject.ready),false);
  assert.equal(await page.evaluate(()=>localProject.save()),false);
  assert.equal(await fs.readFile(path.join(root,'project-state.json'),'utf8'),stateBeforeFailure);
  assert.deepEqual(errors,[]);console.log('PASS local viewer: real SPLAT, edit/save/reopen, no model uploads, conflicts, complete/draft, backups, desktop/mobile');
}catch(e){await page.screenshot({path:path.join(evidence,'failure.png')});throw e;}
finally{
  await browser.close();await service.close();
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('locahun-local-ui-'));
  await fs.rm(root,{recursive:true,force:true});
}
