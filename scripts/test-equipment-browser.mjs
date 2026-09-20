// Canonical menu fixture, no viewer build. GPU rendering requires an explicit queue grant.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const gpu=process.argv.includes('--gpu-approved');
const dir=new URL('../docs/equipment-verification/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const template=read('template.html'),buttonAt=template.indexOf('<button id="btnAddCubeTop"');
const menuHtml=template.slice(template.lastIndexOf('<div style="position:relative">',buttonAt),template.indexOf('<button onclick="saveCameraLayer()',buttonAt));
const legacyClose=read('js/420_auto_quality_probe_runs_once_after_each_.js');
const closeSource=legacyClose.slice(legacyClose.indexOf('window.closeObjTypeMenuTop ='),legacyClose.indexOf('// Ctrl key tracking'));
const html=`<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#343639;font-family:Arial,sans-serif;}
${read('css/011_style_block_layer_panel.css')}
${read('css/062_equipment_menu.css')}</style><div id="layer-panel" class="visible"><div class="lp-head">シーンレイヤー</div><div class="lp-footer"><button>読み込み</button>${menuHtml}<button>カメラ保存</button></div></div>${read('assets/equipment_models.html')}
${read('assets/basic_model_previews.html')}<script>window._lang='ja';window._beginPlace=kind=>window.chosen=kind;${closeSource}
${read('js/274_equipment_geometry.js')}
${read('js/275_equipment_menu.js')}</script>`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:gpu?['--enable-webgl']:['--disable-gpu','--disable-software-rasterizer']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.route('http://equipment.test/',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://equipment.test/');
  await page.evaluate(()=>{
    const extra=document.createElement('button');extra.id='existing-custom-model';extra.textContent='Existing custom model';
    document.getElementById('obj-type-menu-top').append(extra);
  });
  for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(viewport);await page.evaluate(()=>closeObjTypeMenuTop());
    await page.locator('#btnAddCubeTop').click();
    assert.equal(await page.getByRole('tab').count(),4);
    // 2026-09-21: 開くたびに「基本」から（2026-09-20 本人指示。前回のタブは引き継がない）
    assert.equal(await page.getByRole('tab',{name:'基本',exact:true}).getAttribute('aria-selected'),'true','menu always opens on the Basic tab');
    for(const [category,label] of [['vehicles','車両'],['equipment','機材']]){
      await page.getByRole('tab',{name:label,exact:true}).click();
      assert.equal(await page.getByRole('tab',{name:label,exact:true}).getAttribute('aria-selected'),'true');
      const styles=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(t=>({selected:t.getAttribute('aria-selected')==='true',border:getComputedStyle(t).borderBottomColor,transition:getComputedStyle(t).transitionDuration})));
      assert(styles.every(t=>t.transition==='0s'),'category highlight must switch immediately with its panel');
      assert(styles.filter(t=>t.border==='rgb(112, 191, 176)').length===1);
      const panel=page.locator('#equipment-panel-'+category);assert.equal(await panel.locator('.equipment-choice').count(),3);
      await panel.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
      const bounds=await page.locator('#obj-type-menu-top').boundingBox();
      assert(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+.1);
      assert(bounds.y>=0&&bounds.y+bounds.height<=viewport.height+.1);
      const overflows=await panel.locator('button,span').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent));
      assert.deepEqual(overflows,[]);
      await page.screenshot({path:new URL(`menu-${category}-${viewport.width}x${viewport.height}.png`,dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
    }
    await page.getByRole('tab',{name:'人物',exact:true}).click();
    assert(await page.locator('#equipment-panel-people #lbl-addfig-top').isVisible());
    assert.equal(await page.locator('#equipment-panel-people img').count(),1);
    await page.locator('#equipment-panel-people img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    assert((await page.locator('#obj-type-menu-top').boundingBox()).width<=300);
    await page.screenshot({path:new URL(`menu-people-${viewport.width}x${viewport.height}.png`,dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
    await page.locator('#lbl-addfig-top').click();assert.equal(await page.evaluate(()=>chosen),'figure');
    await page.locator('#btnAddCubeTop').click();await page.getByRole('tab',{name:'基本',exact:true}).click();
    for(const id of ['obj-add-cube','obj-add-event','obj-add-path'])assert(await page.locator('#'+id).isVisible());
    assert.equal(await page.locator('#equipment-panel-basic img').count(),3);
    await page.locator('#equipment-panel-basic img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    assert(await page.locator('#equipment-panel-basic #existing-custom-model').isVisible(),'additional pre-existing choices are not discarded');
    await page.getByRole('tab',{name:'車両',exact:true}).click();await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab',{name:'機材',exact:true}).getAttribute('aria-selected'),'true');
    await page.locator('[data-equipment-id="scorpio"]').click();assert.equal(await page.evaluate(()=>chosen),'equipment:scorpio');
    await page.locator('#btnAddCubeTop').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#obj-type-menu-top').evaluate(e=>e.style.display),'none');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'btnAddCubeTop');
    await page.locator('#btnAddCubeTop').click();
    // 2026-09-21: 直前が「機材」でも開き直しは必ず「基本」。機材のボタンを触る前にタブを選び直す
    assert.equal(await page.getByRole('tab',{name:'基本',exact:true}).getAttribute('aria-selected'),'true','reopening forgets the previous category');
    await page.getByRole('tab',{name:'機材',exact:true}).click();
    await page.locator('#equipment-panel-equipment button').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.getElementById('obj-type-menu-top').contains(document.activeElement)),false);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#obj-type-menu-top').evaluate(e=>e.style.display),'none','Escape closes after Tab leaves menu');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'btnAddCubeTop');
    await page.keyboard.press('Tab');const outsideFocus=await page.evaluate(()=>document.activeElement.outerHTML);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement.outerHTML),outsideFocus,'closed menu must not steal focus');
  }
  if(gpu){
    const threeRoot=new URL('../../../kawaii-motion/node_modules/three/build/',import.meta.url);
    await page.route('http://equipment.test/vendor/*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(new URL(route.request().url().split('/').at(-1),threeRoot),'utf8')}));
    await page.evaluate(async()=>{
      const T=await import('/vendor/three.module.js');window.THREE=T;
      document.getElementById('layer-panel').style.display='none';
      window.layers=[];const scene=new T.Scene();scene.background=new T.Color(0xd3d8da);
      const camera=new T.PerspectiveCamera(45,innerWidth/innerHeight,.01,100);
      const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
      window.addLayer=opts=>{const layer={...opts,id:layers.length+1};layers.push(layer);scene.add(layer.mesh);return layer;};
      window.selectLayer=()=>{};window.markDirty=()=>{};window.pushGlobalUndo=()=>{};
      window.__renderEquipment=id=>{
        renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
        for(const L of layers){scene.remove(L.mesh);L.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}layers.length=0;
        const L=addEquipmentLayer(id,new T.Vector3()),bounds=new T.Box3().setFromObject(L.mesh),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
        camera.position.copy(center).add(new T.Vector3(1,.65,1).normalize().multiplyScalar(size.length()*1.65*Math.max(1,1/camera.aspect)));camera.lookAt(center);renderer.render(scene,camera);
        const pixels=new Uint8Array(4*innerWidth*innerHeight);renderer.getContext().readPixels(0,0,innerWidth,innerHeight,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);
        let different=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-pixels[0])+Math.abs(pixels[i+1]-pixels[1])+Math.abs(pixels[i+2]-pixels[2])>30)different++;
        let framed=true;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
          const p=new T.Vector3(x,y,z).project(camera);if(Math.abs(p.x)>.98||Math.abs(p.y)>.98)framed=false;
        }
        return {different,framed,meshCount:L.mesh.children.length,size:size.toArray()};
      };
    });
    for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      for(const id of ['hiace','truck2t','truck4t','jib','scorpio','lightstand']){
        const stats=await page.evaluate(id=>__renderEquipment(id),id);assert(stats.different>120,id+' nonblank pixels');assert(stats.framed,id+' full-frame bounds');
        await page.screenshot({path:new URL(`placed-${id}-${viewport.width}x${viewport.height}.png`,dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
      }
    }
  }
  assert.deepEqual(errors,[]);console.log('Equipment menu passed desktop, portrait and landscape; GPU placement '+(gpu?'checked':'NOT RUN (queue grant required)'));
} finally {await browser.close();}
