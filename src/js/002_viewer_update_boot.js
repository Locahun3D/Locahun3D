(function() {
  'use strict';
  if(window.__locahunBootStarted)return;
  window.__locahunBootStarted=true;
  let resolveStartup;
  window.__locahunStartupGate=new Promise(resolve=>{resolveStartup=resolve;});
  let finished=false,frame,timer,statusPanel;
  const muted=[];
  const controller=new AbortController();
  function clearWait() {
    clearTimeout(timer);window.removeEventListener('message',ready);
    for(const [element,inert] of muted)element.inert=inert;
    statusPanel?.remove();
  }
  function startBundled() {
    if(finished)return;finished=true;controller.abort();clearWait();frame?.remove();
    resolveStartup();
  }
  function ready(event) {
    if(finished || event.source!==frame?.contentWindow || event.data?.type!=='locahun-update-ready' || event.data.nonce!==frame.dataset.nonce)return;
    finished=true;clearWait();frame.style.visibility='visible';
    window.__locahunActiveRelease=frame.dataset.release;
  }
  // HTTP/local-project startup is owned by the server. Nested views and query-driven loads never switch sessions.
  if(location.protocol!=='file:' || window!==window.top || location.search || location.hash) {startBundled();return;}
  for(const element of document.body.children){muted.push([element,element.inert]);element.inert=true;}
  statusPanel=document.createElement('div');statusPanel.id='viewer-update-status';statusPanel.setAttribute('role','status');
  statusPanel.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#fff;color:#202124;font:16px sans-serif;padding:24px;box-sizing:border-box;text-align:center';
  const statusText=document.createElement('div');statusText.textContent='更新を確認中...';
  const skip=document.createElement('button');skip.type='button';skip.textContent='同梱版を開く';skip.onclick=startBundled;
  skip.style.cssText='padding:10px 16px;min-height:44px;border:1px solid #666;border-radius:4px;background:#fff;color:#202124;font:inherit';
  statusPanel.append(statusText,skip);document.body.append(statusPanel);
  (async()=>{
    const release=await LocahunViewerUpdate.check({currentRelease:window.__locahunBuildRelease,signal:controller.signal});
    if(finished)return;
    if(!release.html){startBundled();return;}
    statusText.textContent='最新版を起動中...';
    const nonce=crypto.randomUUID();
    frame=document.createElement('iframe');frame.title='Locahun3D';frame.dataset.nonce=nonce;frame.dataset.release=release.release;
    frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:white;visibility:hidden';
    // Isolate module/import-map startup. The original document remains untouched until readiness.
    // Verified HTML is versioned; shared figures/vendor assets remain at the official origin root.
    const assetBase=new URL('/',release.url).href;
    const prelude='<base href="'+assetBase+'"><script>window.__locahunUpdateFrame='+JSON.stringify(nonce)+';<\/script>';
    frame.srcdoc=release.html.replace(/<head([^>]*)>/i,'<head$1>'+prelude);
    timer=setTimeout(startBundled,15000);
    window.addEventListener('message',ready);document.body.append(frame);
  })().catch(()=>startBundled());
})();
