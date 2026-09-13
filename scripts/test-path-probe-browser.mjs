import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const { chromium } = require('playwright');
const hook = `
window.__probeDiag=()=>{
 const m=_pathProbeMarker;
 if(!m)return null;
 m.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const pos=m.getWorldPosition(new THREE.Vector3()),ndc=pos.clone().project(camera);
 const f=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 return {position:pos.toArray(),ndc:ndc.toArray(),scale:m.scale.toArray(),culled:m.frustumCulled,
 inFrustum:f.intersectsSprite(m),visible:m.visible,calls:m.userData.calls||0,near:camera.near,far:camera.far,number:m.userData.pathPointNumber};
};
window.__probeWatch=()=>{const m=_pathProbeMarker,fn=m.onBeforeRender;m.onBeforeRender=function(...args){m.userData.calls=(m.userData.calls||0)+1;return fn.apply(this,args);};markDirty(30);};
window.__probeNoCull=()=>{_pathProbeMarker.frustumCulled=false;markDirty(30);};
`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const dir='F:/Codex/locahun-walk/verification/path-probe-diagnostic';
fs.mkdirSync(dir,{recursive:true});
await page.route('**/probe-diagnostic',route=>{
  let html=fs.readFileSync(new URL('../Locahun3D_OfflineViewer.html',import.meta.url),'utf8');
  const at=html.lastIndexOf('</script>');
  return route.fulfill({contentType:'text/html',body:html.slice(0,at)+hook+html.slice(at)});
});
try {
  await page.goto('http://127.0.0.1:8193/probe-diagnostic',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__probeDiag);
  await page.locator('#fi').setInputFiles('F:/Codex/locahun-walk/fixtures/real-scan.splat');
  await page.waitForTimeout(6500);
  await page.evaluate(()=>addPathLayer());
  await page.mouse.move(850,560);await page.mouse.down();await page.waitForTimeout(350);
  const first=await page.evaluate(()=>__probeDiag());
  await page.mouse.up();await page.mouse.move(980,610);await page.mouse.down();await page.waitForTimeout(350);
  await page.evaluate(()=>__probeWatch());await page.waitForTimeout(300);
  const before=await page.evaluate(()=>__probeDiag());
  await page.screenshot({path:dir+'/before.png'});
  await page.evaluate(()=>__probeNoCull());await page.waitForTimeout(300);
  const after=await page.evaluate(()=>__probeDiag());
  await page.screenshot({path:dir+'/after.png'});
  console.log(JSON.stringify({first,before,after}));
} finally { await browser.close(); }
