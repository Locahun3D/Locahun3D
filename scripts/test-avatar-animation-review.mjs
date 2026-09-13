// Reuse the established real-Rapier fixture without editing its owner's script.
// No viewer HTML is built or written; Chrome uses a fresh isolated process.
import fs from 'node:fs';
const root=new URL('..',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1');
process.env.AVATAR_VERIFY_DIR||=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'F:/Codex/locahun-walk/verification/animation-2026-09-11/male-final';
let source=fs.readFileSync(new URL('test-avatar-locomotion-browser.mjs',import.meta.url),'utf8');
const privateAsset=process.argv.find(a=>a.startsWith('--asset='))?.slice(8);
function replace(before,after){
  if(!source.includes(before))throw new Error('Review fixture changed: '+before);
  source=source.replace(before,after);
}
replace("const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');",'const root='+JSON.stringify(root)+';');
replace("channel:'chrome',headless:true","channel:'chrome',headless:false");
replace("${fs.readFileSync(path.join(root,'src/assets/kawaii_walk_glb_b64.html'),'utf8')}",
  "${fs.readFileSync(path.join(root,'src/assets/kawaii_walk_glb_b64.html'),'utf8')}\n${fs.readFileSync(path.join(root,'src/assets/male165_glb_b64.html'),'utf8')}");
replace('_buildKawaiiWalkAvatar(1.7)','_buildKawaiiWalkAvatar(1.65)');
replace('walkSetup.core.setCharacter({x:0,y:.02,z:0},1.7,.22)','walkSetup.core.setCharacter({x:0,y:.02,z:0},1.65,.22)');
if(privateAsset){
  replace("${fs.readFileSync(path.join(root,'src/assets/male165_glb_b64.html'),'utf8')}",'<script>window.KAWAII_MALE_GLB_B64='+JSON.stringify(fs.readFileSync(privateAsset).toString('base64'))+';</script>');
  const driver=fs.readFileSync(new URL('elbow-morph-driver.mjs',import.meta.url),'utf8').replace('export function','function');
  replace("let auto=false,view='side'",driver+`
let correctionEnabled=true;
let correctiveMesh;walkMode.avatar.traverse(o=>{if(o.morphTargetDictionary?.Elbow_R_45!==undefined)correctiveMesh=o;});
const correction=createElbowMorphDriver(walkMode.avatar,{mesh:correctiveMesh,neutralAngle:15.291,samples:[45,70,105].map(angle=>({angle,name:'Elbow_R_'+angle}))});
const baseApi=walkMode.avatar.userData.kawaiiAnimation,baseUpdate=baseApi.update.bind(baseApi),baseReset=baseApi.reset.bind(baseApi);
baseApi.update=(...args)=>{baseUpdate(...args);walkMode.avatar.updateMatrixWorld(true);correction.setEnabled(correctionEnabled);correction.update();};
baseApi.reset=()=>{baseReset();correction.reset();};
let auto=false,view='side'`);
  replace('window.fixture={reset,',"window.fixture={setCorrection(v){correctionEnabled=v;correction.setEnabled(v);correction.update();},reset,");
}
replace("else{camera.position.set(p.x+(view==='side'?4:0)",
  "else if(view==='feet'){camera.position.set(p.x+1.65,p.y+.55,p.z+.2);camera.lookAt(p.x,p.y+.42,p.z);}\n  else if(view==='upper-front'||view==='upper-back'){camera.position.set(p.x,p.y+1.3,p.z+(view==='upper-back'?-2.1:2.1));camera.lookAt(p.x,p.y+1.15,p.z);}\n  else{camera.position.set(p.x+(view==='side'?4:0)");
replace("const video=await page.evaluate(()=>fixture.record());",`
  ${privateAsset?`for(const mode of ['walk','run','jump'])for(const enabled of [false,true])for(const view of ['side','upper-front','upper-back']){
    await page.evaluate(({mode,enabled,view})=>{fixture.reset();fixture.setCorrection(enabled);fixture.setView(view);fixture.input({KeyW:true,ShiftLeft:mode==='run',Space:mode==='jump'});fixture.advance(mode==='jump'?20:90);},{mode,enabled,view});
    await page.screenshot({path:path.join(out,'corrective-'+mode+'-'+(enabled?'on':'off')+'-'+view+'.png')});
  }`:''}
  await page.evaluate(()=>{fixture.reset();fixture.setView('side');fixture.input({KeyW:true,ShiftLeft:true});fixture.advance(90);});
  for(let i=0;i<12;i++){
    await page.evaluate(()=>fixture.advance(2));
    await page.screenshot({path:path.join(out,'run-phase-'+String(i).padStart(2,'0')+'.png')});
  }
  for(const view of ['upper-front','upper-back']){
    await page.evaluate(v=>{fixture.reset();fixture.setView(v);fixture.input({KeyW:true,ShiftLeft:true});fixture.advance(90);},view);
    for(let i=0;i<6;i++){
      await page.evaluate(()=>fixture.advance(3));
      await page.screenshot({path:path.join(out,view+'-'+i+'.png')});
    }
  }
  await page.evaluate(()=>{fixture.reset();fixture.setView('feet');fixture.input({KeyW:true,ShiftLeft:true});fixture.advance(60);});
  for(let i=0;i<18;i++){
    await page.evaluate(()=>fixture.advance(2));
    await page.screenshot({path:path.join(out,'feet-phase-'+String(i).padStart(2,'0')+'.png')});
  }
  await page.evaluate(()=>{fixture.input({KeyW:false,ShiftLeft:false});fixture.advance(38);});
  for(let i=0;i<15;i++){
    await page.screenshot({path:path.join(out,'stop-phase-'+String(i).padStart(2,'0')+'.png')});
    await page.evaluate(()=>fixture.advance(2));
  }
  await page.evaluate(()=>{fixture.reset();fixture.setView('front');fixture.input({Space:true});});
  for(let i=0;i<12;i++){
    await page.evaluate(()=>fixture.advance(5));
    await page.screenshot({path:path.join(out,'jump-phase-'+String(i).padStart(2,'0')+'.png')});
  }
  const video=await page.evaluate(()=>fixture.record());`);
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
