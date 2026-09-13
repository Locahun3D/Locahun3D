let _regionalProviderPending=null,_regionalProviderVersion=0;
function _clearRegionalNavigationProvider(){
  _regionalProviderVersion++;_regionalProviderPending=null;
  if(typeof _clickNavigationJourney!=='undefined'){
    _clickNavigationJourney?.dispose?.();_clickNavigationJourney=null;
  }
}
function _prepareRegionalNavigationProvider(){
  if(_regionalProviderPending)return _regionalProviderPending;
  const saved=walkSetup.settings.navigationRegions;
  if(!saved||walkSetup.settings.meshOnly||walkSetup.settings.meshIds?.length||walkSetup.settings.excludeIds?.length)return Promise.resolve(null);
  const manifest=LocahunWalkSettings.parseNavigationRegions(saved);
  const embedded=typeof _regionalNavigationFiles!=='undefined'&&_regionalNavigationFiles?.source===manifest?.source?_regionalNavigationFiles:null;
  if(!manifest||(!embedded&&!/^https?:$/.test(location.protocol)))return Promise.resolve(null);
  const version=_regionalProviderVersion,epoch=walkSetup.epoch,signature=_walkSourceSignature();
  const current=()=>version===_regionalProviderVersion&&epoch===walkSetup.epoch&&signature===_walkSourceSignature()&&saved===walkSetup.settings.navigationRegions;
  const promise=(async()=>{
    const sources=layers.filter(l=>l.type==='splat'&&l.visible!==false).map(l=>{
      const mesh=l.mesh,cached=_wholeIdentityCache.get(mesh),url=mesh.paged?.rootUrl||l._streamUrl;
      const match=cached?.identity?.match(/^sha256:([a-f0-9]{64})$/);
      if(!match||cached.url!==url||cached.raw!==l._rawBuffer)throw Error('Verified navigation source unavailable');
      mesh.updateMatrixWorld(true);return {sha256:match[1],matrix:[...mesh.matrixWorld.elements]};
    });
    const source=await LocahunNavigationSource.key(sources);
    if(!current()||source!==manifest.source)return null;
    const baseUrl=embedded?'https://offline.invalid/assets/':new URL('assets/',location.href).href;
    const provider=LocahunNavigationProvider.create({manifest,baseUrl,
      ...(embedded?{fetchFn:async url=>{const bytes=embedded.files.get('assets/'+url.slice(baseUrl.length));if(!url.startsWith(baseUrl)||!bytes)throw Error('Navigation archive asset missing');return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});}}:{}),
      read:()=>({source:current()?source:'',epoch:walkSetup.epoch}),
      decodeNavigation:(bytes,key)=>LocahunNavigationCache.decode(bytes,key),
      buildQuery:mesh=>LocahunNavigationQuery.create(THREE,_loadNavigationPathfinding(),mesh),
      decodeCollision:(bytes,key)=>LocahunWholeCollision.decode(bytes,key),
      buildCore:async boxes=>{
        const core=await LocahunWalkCollision.create();try{core.rebuild({boxes});return core;}catch(error){core.dispose();throw error;}
      }});
    if(!current()){provider.dispose();return null;}
    _clickNavigationJourney=provider;return provider;
  })().catch(()=>null).finally(()=>{if(_regionalProviderPending===promise)_regionalProviderPending=null;});
  _regionalProviderPending=promise;return promise;
}
