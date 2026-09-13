import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(String.raw`C:\Users\askgg\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\package.json`);
const {chromium}=require('playwright');
const dir=String.raw`F:\Codex\locahun-walk\verification`;
const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
const page=await context.newPage(),out={errors:[]};
page.on('pageerror',e=>out.errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:8193/test',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__walkTest,{timeout:60000});
 await page.evaluate(full=>__walkTest.loadScan(full),process.argv.includes('--full'));
 out.loaded=await page.evaluate(()=>__walkTest.state);
 out.auto=await page.evaluate(()=>{const r=computeAutoInitialView({targetCount:200000});applyAutoInitialView(r);return r;});
 await page.screenshot({path:dir+'/real-scan-loaded.png'});
 if(process.argv.includes('--wall')){await page.evaluate(()=>openWalkSetup());await page.locator('#walk-radius').fill('20');await page.getByRole('button',{name:'閉じる',exact:true}).click();}
 out.generated=await page.evaluate(()=>__walkTest.generate());
 out.generatedState=await page.evaluate(()=>__walkTest.state);
 if(!out.generated){await page.evaluate(()=>openWalkSetup());await page.locator('#walk-cell').fill('0.5');await page.getByRole('button',{name:'閉じる',exact:true}).click();out.generated=await page.evaluate(()=>__walkTest.generate());}
 out.settings=await page.evaluate(()=>{const s=__walkTest.save();return {...s,boxes:s.boxes.length}});
 assert(out.generated,'real-scan collision generation failed');
 await page.locator('#btnAvatarWalk').click();
 await page.waitForFunction(()=>__walkTest.state.active,{timeout:60000});
 await page.waitForTimeout(1200);out.start=await page.evaluate(()=>__walkTest.state);
 await page.screenshot({path:dir+'/real-scan-start.png'});
 await page.keyboard.down('w');await page.waitForTimeout(5000);await page.keyboard.up('w');
 await page.waitForTimeout(600);out.end=await page.evaluate(()=>__walkTest.state);
 await page.screenshot({path:dir+'/real-scan-end.png'});
 assert(out.end.active,'walk exited unexpectedly');
 assert(Math.abs(out.end.feet.y-out.start.feet.y)<2,'unstable scan floor');
 out.moved=Math.hypot(out.end.feet.x-out.start.feet.x,out.end.feet.z-out.start.feet.z);
 assert(out.moved>.15,'avatar stuck in real scan');
 if(process.argv.includes('--wall')){
   out.obstacle=await page.evaluate(()=>__walkTest.obstacle());
   assert(out.obstacle,'no suitable scan obstacle found');
   const start=await page.evaluate(()=>__walkTest.state.feet);
   await page.keyboard.down('w');
   await page.waitForTimeout(Math.min(20000,(out.obstacle.distance/out.obstacle.speed+3)*1000));
   out.atWall=await page.evaluate(()=>__walkTest.state);
   await page.evaluate(a=>{const c=__walkTest.camera;__walkTest.setView(c.x,c.y,c.z,Math.round(a/(Math.PI/2))*Math.PI/2,-.3);},out.obstacle.yaw);
   await page.waitForTimeout(1000);out.atWall=await page.evaluate(()=>__walkTest.state);
   await page.waitForTimeout(1200);out.wallHeld=await page.evaluate(()=>__walkTest.state);
   await page.keyboard.up('w');
   out.wallDrift=Math.hypot(out.wallHeld.feet.x-out.atWall.feet.x,out.wallHeld.feet.z-out.atWall.feet.z);
   assert(out.wallDrift<.15,'avatar did not stop against scan obstacle');
   assert(out.wallHeld.walkWeight<.1,'wall pushing still plays walk');
   await page.screenshot({path:dir+'/real-scan-wall.png'});
 }
 assert.deepEqual(out.errors,[]);
 console.log(JSON.stringify(out,null,2));
}catch(e){out.failure=e.stack;await page.screenshot({path:dir+'/real-scan-failure.png'});console.error(JSON.stringify(out,null,2));process.exitCode=1;}
finally{fs.writeFileSync(dir+'/real-scan-results.json',JSON.stringify(out,null,2));await context.close();await browser.close();}
