import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

if (process.env.PERF_GPU_APPROVED !== '1') throw new Error('Explicit GPU slot required');
const require = createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const baseline = process.env.IOS_REVIEW_BASELINE === '1';
const read = f => baseline && /^(020_|030_|312_|410_)/.test(f)
  ? execFileSync('git', ['show', 'HEAD:src/js/' + f], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
const out = 'F:/Codex/locahun-performance-20260912/ios-budget' + (baseline ? '-before' : '');
const projectRoot = 'C:/Users/askgg/Dropbox/KWI/Products/Locahun3D/01_3DData/StudioPleaseGreen/260907/3_LocalViewer/2FStudio';
const project = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project-state.json'))).project;
const layer = project.layers.find(l => l.type === 'splat');
const state = read('010_state.js');
const identity = state.slice(state.indexOf('const _ua ='), state.indexOf('const _isMac ='));
const restore = read('312_project_load_helpers.js');
const start = restore.indexOf("} else if(entry.type==='splat'){");
const end = restore.indexOf("} else if(entry.type==='light'){", start);
const branch = restore.slice(start, end).replace('} else if', 'if') + '}';
const html = `<!doctype html><style>body{margin:0;background:#000}canvas{display:block}</style><canvas id="scene"></canvas>
<script type="importmap">{"imports":{"three":"/three.js"}}</script><script type="module">
import * as THREE from '/three.js';
import {SparkRenderer,SplatMesh,PagedSplats,SplatFileType} from '/spark.js';
const canvas=document.querySelector('canvas');let renderer,scene,camera;
const isMobile=matchMedia('(pointer:coarse) and (any-hover:none)').matches;
${identity}
const _isMac=true,_heavyDisplay=false;let qualScale=.75,qualIdx=0,_pendingPixelRatio=null,_qualPreferred=.75;
const layers=[];function markDirty(){}function _queuePixelRatio(pr){renderer.setPixelRatio(pr)}function T(x){return x}
function _radEffectiveLodScale(){return [.5,.8,1.2][qualIdx]}function _parseRadHeaderCount(){return 0}
function tuneSplatMesh(){}const SPARK_QUALITY_OPTS={};
const _splatFileTypeFor=()=>SplatFileType.RAD;
${read('020_splat_perf_tier_drives_spark_splat_tunin.js')}
${read('030_renderer_scene.js').split('scene.add(sparkRenderer);')[0]}
scene.add(sparkRenderer);
${read('410_ui_controls.js').split('window.setQuality=function')[0]}
camera=new THREE.PerspectiveCamera(90,innerWidth/innerHeight,.3,2000);
camera.position.set(0,1.5,-2);camera.rotation.set(0,Math.PI,0,'YXZ');
let blobUrls=0;const originalURL=URL.createObjectURL;URL.createObjectURL=function(...args){if(args[0]?.size===entry._buf.byteLength)blobUrls++;return originalURL.apply(this,args)};
const entry=${JSON.stringify(layer)};entry._ext='rad';entry._buf=await (await fetch('/fixture.rad')).arrayBuffer();
const opts={strict:true};let mesh;${branch}
mesh.position.set(entry.pos.x,entry.pos.y,entry.pos.z);mesh.rotation.set(0,entry.rot.y*Math.PI/180,0);
scene.add(mesh);layers.push({mesh,_isMain:true});
renderer.setAnimationLoop(()=>renderer.render(scene,camera));
window.review={state:()=>({tier:_splatPerfTier,inputMobile:isMobile,budget:sparkRenderer.lodSplatCount,pages:sparkRenderer.pager?.maxPages,fetchers:sparkRenderer.numLodFetchers,splats:mesh.paged.numSplats,blobUrls,sourceBytes:entry._buf.byteLength}),quality:(i,source)=>applyQualityTier(i,{source,immediate:true})};
</script>`;
const files = new Map([
  ['/three.js', 'F:/Htlml/kawaii-motion/node_modules/three/build/three.module.js'],
  ['/three.core.js', 'F:/Htlml/kawaii-motion/node_modules/three/build/three.core.js'],
  ['/spark.js', path.join(root, 'vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js')],
  ['/fixture.rad', path.join(projectRoot, layer.file)],
]);
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  const file = files.get(req.url);
  if (!file || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => window.review?.state().splats > 0, null, { timeout: 60000 });
  const states = [];
  for (const actor of ['manual', 'watchdog', 'calibration', 'battery']) {
    for (const i of [0, 1, 2, 1, 0]) {
      states.push(await page.evaluate(({ i, actor }) => { review.quality(i, actor); return review.state(); }, { i, actor }));
    }
  }
  for (const s of states) {
    assert.equal(s.tier, baseline ? 'desktop' : 'tablet'); assert.equal(s.inputMobile, false);
    if (!baseline) assert.equal(s.budget, 1500000);
    assert.equal(s.pages, baseline ? 128 : 96);
    assert.equal(s.fetchers, baseline ? 16 : 6); assert.equal(s.blobUrls, baseline ? 1 : 0);
  }
  await page.waitForFunction(() => review.state().splats > 500000, null, { timeout: 20000 });
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: out + '/ipad-pointer-rad-refined.png' });
  assert.deepEqual(errors, []);
  const finalState = await page.evaluate(() => review.state());
  fs.writeFileSync(out + '/report-refined.json', JSON.stringify({ emulatedIdentityNotPhysicalIos: true, errors, states, finalState }, null, 2));
  console.log(JSON.stringify({ out, state: finalState, errors }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
