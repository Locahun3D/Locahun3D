let _regionalNavigationFiles=null;
globalThis.LocahunNavigationFiles={async read(value,read){
  const manifest=LocahunWalkSettings.parseNavigationRegions(value);
  if(!manifest)throw Error('Invalid navigation manifest');
  if(manifest.regions.reduce((n,p)=>n+p.navigation.bytes+p.collision.bytes,manifest.graph?.bytes||0)>64*1024*1024)throw Error('Navigation archive size limit');
  const files=new Map();
  for(const pair of manifest.regions)for(const [type,ext] of [['navigation','lnv'],['collision','lcp']]){
    const entry=pair[type],name='assets/'+entry.key+'.'+ext,bytes=await read(name,entry,ext);
    if(!(bytes instanceof Uint8Array)||bytes.length!==entry.bytes||await _wholeHash(bytes)!==entry.sha256)throw Error('Missing or corrupt navigation asset: '+name);
    files.set(name,new Uint8Array(bytes));
  }
  if(manifest.graph){
    const entry=manifest.graph,name='assets/'+entry.sha256+'.lng',bytes=await read(name,{...entry,key:entry.sha256},'lng');
    if(!(bytes instanceof Uint8Array)||bytes.length!==entry.bytes||await _wholeHash(bytes)!==entry.sha256)throw Error('Missing or corrupt navigation graph');
    await LocahunTransitionGraph.create(_wholeHash).decode(bytes,entry,manifest);
    files.set(name,new Uint8Array(bytes));
  }
  return {source:manifest.source,files};
}};
async function _collectRegionalNavigationFiles(manifest){
  const embedded=_regionalNavigationFiles?.source===manifest.source?_regionalNavigationFiles:null;
  const baseUrl=new URL('assets/',location.href).href;
  return LocahunNavigationFiles.read(manifest,async(name,entry,extension)=>{
    if(embedded)return embedded.files.get(name);
    return LocahunNavigationRegionLoader.create({baseUrl,extension})(entry);
  });
}
