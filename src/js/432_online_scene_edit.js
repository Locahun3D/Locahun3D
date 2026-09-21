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
        // 2026-09-21: 1本の通信で全体を取りに行くと、Worker 経由では数百MBで数分かかり、120秒の打ち切りにも当たっていた。
        // Range で 16MB ずつ・6並列で取り、進捗を読み込み画面と外側のページの両方に出す。
        // cache:'no-store' は必須（同じURLの並列取得は Chrome のキャッシュロックで直列化される）。
        const controller=new AbortController(),timer=0;
        try{
          const shortEdge=Math.min(window.innerWidth||0,window.innerHeight||0);
          const limit=isMobile && shortEdge>0 && shortEdge<700 ? 200*1024**2 : MAX_EMBED_BYTES;
          const en=typeof _en==='function'&&_en();
          const uiFns={showLd:typeof showLd==='function'?showLd:null,setBar:typeof setBar==='function'?setBar:null,setMsg:typeof setMsg==='function'?setMsg:null};
          const ui=(fn,...args)=>{try{uiFns[fn]?.(...args);}catch(_){}};
          const get=(headers,ms)=>fetch(source.href,{credentials:'same-origin',cache:'no-store',redirect:'error',headers,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(ms)])});
          ui('showLd',en?'Downloading the scene':'3DGSをダウンロードしています');ui('setBar',1);
          let total=0;
          const probe=await get({Range:'bytes=0-0'},60000);
          if(probe.status===206){const m=/\/(\d+)\s*$/.exec(probe.headers.get('content-range')||'');if(m)total=Number(m[1]);}
          await probe.arrayBuffer().catch(()=>{});
          if(!probe.ok)throw Error('Source download failed');
          let chunks=[],loadedBytes=0,lastSent=0;
          const progress=()=>{
            const mb=n=>Math.round(n/1048576);
            if(total){ui('setBar',1+loadedBytes/total*89);ui('setMsg',(en?'Downloading the scene ':'3DGSをダウンロードしています ')+mb(loadedBytes)+' / '+mb(total)+' MB');}
            const now=performance.now();
            if(now-lastSent>400||loadedBytes===total){lastSent=now;send({type:'locahun:scene-load-progress',requestId:data.requestId,loaded:loadedBytes,total});}
          };
          if(total){
            if(total>limit)throw Error('Device capacity exceeded');
            const CHUNK=16*1024**2,count=Math.ceil(total/CHUNK);let next=0;
            chunks=new Array(count);
            const worker=async()=>{
              for(;;){
                const i=next++;if(i>=count)return;
                const from=i*CHUNK,to=Math.min(total,from+CHUNK)-1;let lastError;
                for(let attempt=0;attempt<4;attempt++){
                  if(controller.signal.aborted)throw Error('aborted');
                  let got=0;
                  try{
                    const part=await get({Range:'bytes='+from+'-'+to},120000);
                    if(part.status!==206)throw Error('Range not honoured');
                    const reader=part.body.getReader(),pieces=[];
                    for(;;){const {done,value}=await reader.read();if(done)break;got+=value.byteLength;loadedBytes+=value.byteLength;pieces.push(value);progress();}
                    if(got!==to-from+1)throw Error('Chunk truncated');
                    chunks[i]=new Blob(pieces);lastError=null;break;
                  }catch(error){loadedBytes-=got;lastError=error;await new Promise(r=>setTimeout(r,800*(attempt+1)));}
                }
                if(lastError){controller.abort();throw lastError;}
              }
            };
            await Promise.all(Array.from({length:Math.min(6,count)},worker));
          }else{
            // Range が使えない配信（ローカル開発など）は従来どおり1本で取る。
            const response=await get({},600000);
            if(!response.ok)throw Error('Source download failed');
            total=Number(response.headers.get('content-length'))||0;
            if(total>limit)throw Error('Device capacity exceeded');
            const reader=response.body?.getReader();if(!reader)throw Error('Source stream unavailable');
            for(;;){const {done,value}=await reader.read();if(done)break;loadedBytes+=value.byteLength;if(loadedBytes>limit)throw Error('Device capacity exceeded');chunks.push(value);progress();}
          }
          ui('setMsg',en?'Opening the scene':'3DGSを開いています');
          await _loadOnlineSceneFile(new Blob(chunks),data.fileName);
          loaded=true;state.ready=true;state.dirty=false;
          send({type:'locahun:scene-ready',requestId:data.requestId});
        }catch(error){state.ready=false;try{if(typeof hideLd==='function')hideLd();}catch(_){}fail(/capacity/i.test(error.message)?'capacity':'incomplete');}
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
