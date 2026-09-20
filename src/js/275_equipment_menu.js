// Uses the existing OBJ layer/persistence path; no loader or renderer dependency at placement.
(() => {
  let assets, assetSource, assetPending;
  let openRequest=0;
  let dismissBound=false, menuOpener=null;
  function bindDismiss(menu){
    if(dismissBound)return;
    dismissBound=true;
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&menu.style.display==='flex'){
        event.preventDefault();event.stopPropagation();
        menu.removeAttribute('aria-busy');window.closeObjTypeMenuTop();menuOpener?.focus();
      }
    });
  }
  function getAssetSource(){
    if(!assetSource)assetSource=JSON.parse(document.getElementById('equipment-assets').textContent);
    return assetSource;
  }
  function getAssets() {
    if(!assets){
      const source=getAssetSource();
      if(source.url)throw new Error('Equipment assets are not ready');
      assets=source;
    }
    return assets;
  }
  function ensureAssets(){
    if(assets)return Promise.resolve(assets);
    if(assetPending)return assetPending;
    assetPending=_fetchOptionalModelBytes(getAssetSource()).then(bytes=>{
      const parsed=JSON.parse(new TextDecoder().decode(bytes));
      for(const item of LocahunEquipment.catalog){
        if(typeof parsed[item.id]?.glb!=='string'||!parsed[item.id].glb||typeof parsed[item.id].thumbnail!=='string')
          throw new Error('Missing equipment asset: '+item.id);
      }
      assets=parsed;return assets;
    }).finally(()=>{assetPending=null;});
    return assetPending;
  }
  window.addEquipmentLayer=function(id, point) {
    const item=LocahunEquipment.catalog.find(item=>item.id===id);
    if(!item)throw new Error('Unknown equipment: '+id);
    if(!point||!['x','y','z'].every(k=>Number.isFinite(point[k])))throw new Error('Invalid equipment position');
    const encoded=getAssets()[id]?.glb;
    if(!encoded)throw new Error('Missing equipment asset: '+id);
    const data=atob(encoded), bytes=new Uint8Array(data.length);
    for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);
    const mesh=LocahunEquipment.build(THREE,id);mesh.position.copy(point);
    const L=addLayer({name:window._lang==='en'?item.en:item.name,type:'obj',mesh});
    L.pos={x:point.x,y:point.y,z:point.z};
    L.objColor=null;L.objOpacity=1;L.objWireframe=false;L.upAxis='y';L.pivotSpace='local';
    L._rawBuffer=bytes.buffer;L._rawExt='glb';
    pushGlobalUndo({type:'layer-add',id:L.id});
    selectLayer(L.id);markDirty(6);return L;
  };
  const categories=[['basic','基本','Basic'],['people','人物','People'],['vehicles','車両','Vehicles'],['equipment','機材','Equipment']];
  let activeCategory='basic';
  function selectCategory(menu,id,focus=false) {
    activeCategory=id;
    const width=Math.min(id==='basic'||id==='people'?280:460,innerWidth-16);
    menu.style.width=width+'px';
    if(menuOpener){
      const rect=menuOpener.getBoundingClientRect();
      menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
    }
    for(const tab of menu.querySelectorAll('[role="tab"]')){
      const active=tab.dataset.category===id;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      if(active&&focus)tab.focus();
    }
    for(const panel of menu.querySelectorAll('[role="tabpanel"]'))panel.hidden=panel.dataset.category!==id;
  }
  function initialize(menu) {
    if(menu.dataset.equipmentReady)return;
    const legacy=[...menu.querySelectorAll('button')].map(button=>({button,
      category:button.querySelector('#lbl-addfig-top')||button.dataset.modelCategory==='people'?'people':'basic'}));
    menu.replaceChildren();menu.classList.add('equipment-model-menu');menu.dataset.equipmentReady='true';
    const tabs=document.createElement('div');tabs.className='equipment-tabs';tabs.setAttribute('role','tablist');menu.append(tabs);
    for(const [id,ja,en] of categories){
      const tab=document.createElement('button');tab.type='button';tab.id='equipment-tab-'+id;tab.dataset.category=id;
      tab.setAttribute('role','tab');tab.setAttribute('aria-controls','equipment-panel-'+id);
      tab.dataset.ja=ja;tab.dataset.en=en;tab.textContent=window._lang==='en'?en:ja;
      tab.addEventListener('click',()=>selectCategory(menu,id));
      tab.addEventListener('keydown',event=>{
        const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        const current=categories.findIndex(entry=>entry[0]===id);
        const next=event.key==='Home'?0:event.key==='End'?3:(current+(event.key==='ArrowRight'?1:3))%4;
        selectCategory(menu,categories[next][0],true);
      });
      tabs.append(tab);
      const panel=document.createElement('div');panel.id='equipment-panel-'+id;panel.dataset.category=id;
      panel.className=id==='vehicles'||id==='equipment'?'equipment-grid':'equipment-legacy';
      panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);menu.append(panel);
      for(const entry of legacy.filter(entry=>entry.category===id)){
        const previews=document.getElementById('basic-model-previews');
        const label=entry.button.querySelector('#obj-add-cube,#obj-add-event,#obj-add-path,#lbl-addfig-top');
        const kind={'obj-add-cube':'cube','obj-add-event':'event','obj-add-path':'path','lbl-addfig-top':'figure'}[label?.id];
        if(previews&&kind){
          const source=JSON.parse(previews.textContent)[kind];
          if(source){
            const image=document.createElement('img');image.src=source;image.width=400;image.height=260;image.alt='';image.draggable=false;
            label.classList.add('equipment-choice-name');
            entry.button.replaceChildren(image,label);entry.button.classList.add('equipment-choice','equipment-basic-choice');
            entry.button.removeAttribute('style');entry.button.removeAttribute('onmouseover');entry.button.removeAttribute('onmouseout');
          }
        }
        panel.append(entry.button);
      }
      for(const item of LocahunEquipment.catalog.filter(item=>item.category===id)){
        const button=document.createElement('button');button.type='button';button.className='equipment-choice';button.dataset.equipmentId=item.id;
        const image=document.createElement('img');image.src=getAssets()[item.id].thumbnail;image.width=400;image.height=260;image.alt='';
        const name=document.createElement('span');name.className='equipment-choice-name';name.dataset.ja=item.name;name.dataset.en=item.en;
        const variant=document.createElement('span');variant.className='equipment-choice-variant';variant.dataset.ja=item.variant;variant.dataset.en=item.variantEn;
        button.dataset.titleJa=item.dimensions;button.dataset.titleEn=item.dimensionsEn||item.dimensions;button.title=window._lang==='en'?button.dataset.titleEn:button.dataset.titleJa;button.append(image,name,variant);
        button.addEventListener('click',()=>{window._beginPlace('equipment:'+item.id);window.closeObjTypeMenuTop();});panel.append(button);
      }
    }
    menu.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
  }
  window.toggleEquipmentModelMenu=function(button){
    const menu=document.getElementById('obj-type-menu-top');if(!menu)return;
    const request=++openRequest;
    const opening=menu.style.display!=='flex';
    if(!opening){menu.removeAttribute('aria-busy');window.closeObjTypeMenuTop();return;}
    menuOpener=button;bindDismiss(menu);
    menu.style.display='flex';menu.style.position='fixed';menu.style.right='auto';
    const width=Math.min(460,innerWidth-16),rect=button.getBoundingClientRect();
    menu.style.width=width+'px';menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
    const top=Math.min(rect.bottom+6,Math.max(8,innerHeight-200));
    menu.style.top=top+'px';menu.style.maxHeight=Math.max(80,innerHeight-top-8)+'px';
    const finish=()=>{
      menu.removeAttribute('aria-busy');
      initialize(menu);
      for(const element of menu.querySelectorAll('[data-ja]'))element.textContent=window._lang==='en'?element.dataset.en:element.dataset.ja;
      for(const element of menu.querySelectorAll('[data-title-ja]'))element.title=window._lang==='en'?element.dataset.titleEn:element.dataset.titleJa;
      // 開くたびに「基本」から（2026-09-20 本人指示。前回のタブは引き継がない）
      selectCategory(menu,'basic');
      menu.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    };
    if(assets||!getAssetSource().url){finish();return;}
    const epoch=typeof walkSetup==='undefined'?null:walkSetup.epoch;
    menu.setAttribute('aria-busy','true');
    return ensureAssets().then(()=>{
      if(request!==openRequest||menu.style.display!=='flex')return;
      if(epoch!==null&&epoch!==walkSetup.epoch){window.closeObjTypeMenuTop();return;}
      finish();
    }).catch(error=>{
      if(request!==openRequest||menu.style.display!=='flex')return;
      window.closeObjTypeMenuTop();showUndoToast(error.message);
    }).finally(()=>{if(request===openRequest)menu.removeAttribute('aria-busy');});
  };
})();
