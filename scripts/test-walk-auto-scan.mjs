import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(String.raw`C:\Users\askgg\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\package.json`);
const {chromium}=require('playwright');
const sharp=require('sharp');
const base=String.raw`F:\Codex\locahun-walk\verification`;
const variant=[process.argv.includes('--rad')?'rad':process.argv.includes('--full')?'full':'sample',
  process.argv.includes('--mobile')?'mobile':'desktop',process.argv.includes('--wall')?'obstacle':'walk'].join('-');
const dir=base+'/auto-'+variant;
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--enable-webgl','--ignore-gpu-blocklist']});
const viewport=process.argv.includes('--mobile')?{width:390,height:844}:{width:1440,height:900};
const context=await browser.newContext({viewport,recordVideo:{dir:base,size:viewport}});
const page=await context.newPage(),out={errors:[]};
page.on('pageerror',e=>out.errors.push(e.message));
const progress=setInterval(()=>{
  page.evaluate(()=>window.__walkTest?.state).then(s=>{
    if(s)console.log(JSON.stringify({progress:s.status,boxes:s.boxes,active:s.active}));
  }).catch(()=>{});
},15000);
try {
  await page.goto('http://127.0.0.1:8193/test',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__walkTest,null,{timeout:60000});
  const scan=process.argv.includes('--rad')
    ? String.raw`F:\UNDEFINED Dropbox\UNDEFINED\Works\MFF\01_ProjectFile\3DGS\3DGS\Kousaten_ForDemo_point_cloud.rad`
    : process.argv.includes('--full')
    ? String.raw`F:\UNDEFINED Dropbox\UNDEFINED\Works\MFF\01_ProjectFile\3DGS\3DGS\locahun3d_Demo_point_cloud.splat`
    : String.raw`F:\Codex\locahun-walk\fixtures\real-scan.splat`;
  await page.locator('#fi').setInputFiles(scan);
  // No generation helper, camera placement, or collision settings in this path.
  await page.waitForFunction(()=>__walkTest.state.boxes>0,null,{timeout:120000});
  out.generated=await page.evaluate(()=>__walkTest.state);
  assert(out.generated.boxes>0,'import did not automatically generate collision');
  out.toolbar=await page.locator('#view-tl-btns > button').evaluateAll(buttons=>buttons.filter(b=>b.getBoundingClientRect().width>0).map(b=>{
    const r=b.getBoundingClientRect();return {id:b.id,left:r.left,right:r.right};
  }));
  assert(out.toolbar.every(b=>b.left>=0 && b.right<=viewport.width),'toolbar buttons are clipped outside the viewport');
  await page.screenshot({path:dir+'/auto-scan-loaded.png'});
  await page.locator('#btnAvatarWalk').click();
  await page.waitForFunction(()=>__walkTest.state.active,null,{timeout:60000});
  await page.waitForTimeout(1500);
  out.start=await page.evaluate(()=>__walkTest.state);
  assert.equal(out.start.airborne,false,'automatic spawn has no support');
  await page.screenshot({path:dir+'/auto-scan-start.png'});
  const startPixels=await page.locator('#c').screenshot();
  const stats=await sharp(startPixels).stats();
  out.canvasDeviation=stats.channels.slice(0,3).map(c=>c.stdev);
  assert(out.canvasDeviation.some(v=>v>15),'3D canvas is blank or visually uniform');
  await page.keyboard.down('w');
  await page.waitForTimeout(4000);
  await page.keyboard.up('w');
  await page.waitForTimeout(700);
  out.end=await page.evaluate(()=>__walkTest.state);
  assert(out.end.active,'automatic collision walk exited');
  assert.equal(out.end.airborne,false,'walk lost scan support');
  out.distance=Math.hypot(out.end.feet.x-out.start.feet.x,out.end.feet.z-out.start.feet.z);
  assert(out.distance>.15,'automatic spawn is stuck');
  await page.screenshot({path:dir+'/auto-scan-end.png'});
  const first=await sharp(startPixels).resize(128,128).removeAlpha().raw().toBuffer();
  const last=await sharp(await page.locator('#c').screenshot()).resize(128,128).removeAlpha().raw().toBuffer();
  out.pixelDifference=first.reduce((sum,v,i)=>sum+Math.abs(v-last[i]),0)/first.length;
  assert(out.pixelDifference>.5,'3D canvas did not visibly move');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal mobile overflow');
  if(process.argv.includes('--wall')) {
    out.obstacle=await page.evaluate(()=>__walkTest.obstacle(true));
    out.search=[];
    for(let step=0;!out.obstacle && step<5;step++) {
      await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');
      await page.waitForTimeout(600);
      out.search.push(await page.evaluate(()=>({state:__walkTest.state,region:__walkTest.save().region})));
      assert(out.search.at(-1).state.active,'walk stopped during automatic region extension');
      out.obstacle=await page.evaluate(()=>__walkTest.obstacle(true));
    }
    assert(out.obstacle,'scan has no nearby obstacle to verify');
    out.target=await page.evaluate(o=>{
      const p=__walkTest.state.feet;
      return {x:p.x+Math.sin(o.yaw)*o.distance,z:p.z+Math.cos(o.yaw)*o.distance};
    },out.obstacle);
    // Keep aiming at the observed surface point instead of sliding past a narrow pole.
    await page.evaluate(target=>{
      window.__walkAim=setInterval(()=>{
        const p=__walkTest.state.feet,c=__walkTest.camera;
        __walkTest.setView(c.x,c.y,c.z,Math.atan2(target.x-p.x,target.z-p.z),-.3);
      },50);
    },out.target);
    await page.keyboard.down('w');
    await page.waitForTimeout(Math.min(20000,(out.obstacle.distance/out.obstacle.speed+3)*1000));
    out.atWall=await page.evaluate(()=>__walkTest.state);
    await page.waitForTimeout(1500);
    out.wallHeld=await page.evaluate(()=>__walkTest.state);
    await page.keyboard.up('w');
    await page.evaluate(()=>clearInterval(window.__walkAim));
    out.wallDrift=Math.hypot(out.wallHeld.feet.x-out.atWall.feet.x,out.wallHeld.feet.z-out.atWall.feet.z);
    assert(out.wallHeld.active,'collision region extension exited walk');
    assert(out.wallDrift<.15,'avatar penetrated or did not stop at scan obstacle');
    assert(out.wallHeld.walkWeight<.1,'walk animation continues while blocked');
    await page.screenshot({path:dir+'/auto-scan-wall.png'});
  }
  if(process.argv.includes('--reenter')) {
    await page.evaluate(()=>openWalkSetup());
    await page.getByRole('button',{name:'開始位置を保存',exact:true}).click();
    await page.getByRole('button',{name:'閉じる',exact:true}).click();
    out.savedSpawn=await page.evaluate(()=>__walkTest.save().spawn);
    await page.locator('#btnAvatarWalk').click();
    await page.evaluate(()=>{const c=__walkTest.camera;__walkTest.setView(c.x+8,c.y,c.z,c.yaw,c.pitch);});
    await page.waitForTimeout(2500);
    assert.deepEqual(await page.evaluate(()=>__walkTest.save().spawn),out.savedSpawn,'view movement erased saved spawn');
    await page.locator('#btnAvatarWalk').click();
    await page.waitForFunction(()=>__walkTest.state.active,null,{timeout:60000});
    await page.waitForTimeout(500);
    out.reentered=await page.evaluate(()=>__walkTest.state);
    assert(Math.hypot(out.reentered.feet.x-out.savedSpawn.x,out.reentered.feet.z-out.savedSpawn.z)<.05,'walk did not return to the saved spawn');
  }
  assert.deepEqual(out.errors,[]);
  console.log(JSON.stringify(out,null,2));
} catch(e) {
  out.failure=e.stack;
  out.state=await page.evaluate(()=>window.__walkTest?.state).catch(()=>null);
  await page.screenshot({path:dir+'/auto-scan-failure.png'});
  console.error(JSON.stringify(out,null,2));process.exitCode=1;
} finally {
  clearInterval(progress);
  await page.evaluate(()=>clearInterval(window.__walkAim)).catch(()=>{});
  fs.writeFileSync(dir+'/auto-scan-results.json',JSON.stringify(out,null,2));
  await context.close();await browser.close();
}
