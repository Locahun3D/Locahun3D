// Dedicated same-origin editor transport. No session, source URL or credential
// is placed in the viewer URL, project metadata, or exported archive.
if(new URLSearchParams(location.search).get('onlineSceneEdit')==='1'){
  let sameOriginParent=false;
  try{sameOriginParent=parent!==window && parent.location.origin===location.origin;}catch(_){}
  if(sameOriginParent){
    const origin=location.origin,seen=new Set();
    const state={ready:false,busy:false,dirty:false,version:0,pendingAssets:0};
    window.onlineSceneEditor=state;
    const saveButton=document.getElementById?.('tb-save-btn'),saveLabel=document.getElementById?.('tb-save-lbl');
    if(saveButton)saveButton.title=window._lang==='en'?'Save to scene':'シーンに保存';
    if(saveLabel){saveLabel.id='online-scene-save-label';saveLabel.textContent=window._lang==='en'?'Save to scene':'シーンに保存';}
    let loaded=false,lastExport=null,restoreTicket=0;
    const send=data=>parent.postMessage(data,origin);
    const lock=busy=>{
      state.busy=busy;
      document.body.classList[busy?'add':'remove']('local-project-saving');
      if(busy && typeof window.dispatchEvent==='function')window.dispatchEvent(new Event('blur'));
    };
    const changed=()=>{
      if(!state.ready)return;
      state.dirty=true;state.version++;
      send({type:'locahun:scene-dirty'});
    };
    state.changed=changed;
    state.beginAssetRead=()=>{state.pendingAssets++;changed();};
    state.endAssetRead=()=>{state.pendingAssets=Math.max(0,state.pendingAssets-1);changed();};
    state.beginRestore=()=>{
      state.ready=false;state.version++;state.dirty=true;
      return ++restoreTicket;
    };
    state.endRestore=(ticket,success)=>{
      if(ticket!==restoreTicket)return;
      if(!success){state.ready=false;send({type:'locahun:scene-invalid',code:'incomplete'});}
      else if(loaded){state.ready=true;changed();}
    };
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','dblclick','keydown','wheel','input','change','drop']){
      document.addEventListener(type,event=>{
        if(state.busy || !state.ready){event.preventDefault();event.stopImmediatePropagation();return;}
        if(type==='click' && event.target?.closest?.('#tb-save-btn')){
          event.preventDefault();event.stopImmediatePropagation();send({type:'locahun:scene-save-requested'});return;
        }
        // The outer page owns the server save; never let Ctrl-S download a ZIP
        // that could be mistaken for an attached online revision.
        if(type==='keydown' && (event.ctrlKey||event.metaKey) && event.key?.toLowerCase()==='s'){
          event.preventDefault();event.stopImmediatePropagation();send({type:'locahun:scene-save-requested'});return;
        }
        if(['pointerup','input','change','keydown','wheel','drop'].includes(type))changed();
      },{capture:true,passive:false});
    }
    window.addEventListener('beforeunload',event=>{
      if(state.dirty||state.busy){event.preventDefault();event.returnValue='';}
    });
    window.addEventListener('message',async event=>{
      if(event.origin!==origin || event.source!==parent)return;
      const data=event.data;
      if(!data || typeof data.requestId!=='string' || !data.requestId || data.requestId.length>128)return;
      if(data.type==='locahun:scene-saved'){
        if(lastExport?.requestId===data.requestId && lastExport.version===state.version && !state.busy)state.dirty=false;
        return;
      }
      if(!['locahun:scene-load','locahun:scene-export'].includes(data.type) || seen.has(data.requestId))return;
      seen.add(data.requestId);
      const loading=data.type==='locahun:scene-load';
      const fail=code=>send({type:loading?'locahun:scene-load-error':'locahun:scene-export-error',requestId:data.requestId,code});
      if(state.busy){fail('busy');return;}
      if(loading){
        if(loaded){fail('already_loaded');return;}
        let source;
        try{
          source=new URL(data.sourceUrl,location.href);
          if(source.origin!==origin || source.pathname!=='/api/scene-edit/source' || source.hash || source.username || source.password ||
            !/^\?sessionKey=[a-f0-9]{64}$/.test(source.search) || typeof data.fileName!=='string' || !data.fileName || data.fileName.length>256)throw Error('Invalid source');
        }catch(_){fail('invalid_source');return;}
        lock(true);state.ready=false;
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
        try{
          const response=await fetch(source.href,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
          if(!response.ok)throw Error('Source download failed');
          const shortEdge=Math.min(window.innerWidth||0,window.innerHeight||0);
          const limit=isMobile && shortEdge>0 && shortEdge<700 ? 200*1024**2 : MAX_EMBED_BYTES;
          if(Number(response.headers.get('content-length'))>limit)throw Error('Device capacity exceeded');
          const reader=response.body?.getReader();if(!reader)throw Error('Source stream unavailable');
          const chunks=[];let size=0;
          try{
            for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Device capacity exceeded');chunks.push(value);}
          }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
          await _loadOnlineSceneFile(new Blob(chunks),data.fileName);
          loaded=true;state.ready=true;state.dirty=false;
          send({type:'locahun:scene-ready',requestId:data.requestId});
        }catch(error){state.ready=false;fail(/capacity/i.test(error.message)?'capacity':'incomplete');}
        finally{clearTimeout(timer);lock(false);}
      }else{
        if(!state.ready){fail('not_ready');return;}
        if(state.pendingAssets){fail('asset_pending');return;}
        lock(true);const version=state.version;
        try{
          const archive=await window.saveProjectZip(false,{returnBlob:true,strictOnline:true});
          if(!(archive instanceof Blob) || !archive.size || version!==state.version || !state.ready)throw Error('Incomplete snapshot');
          lastExport={requestId:data.requestId,version};
          send({type:'locahun:scene-exported',requestId:data.requestId,archive});
        }catch(error){state.dirty=true;fail(/capacity/i.test(error.message)?'capacity':/path/i.test(error.message)?'unfinished_path':'incomplete');}
        finally{lock(false);}
      }
    });
    send({type:'locahun:scene-editor-ready'});
  }
}
