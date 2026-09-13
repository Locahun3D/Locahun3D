// Rejected as a sufficient performance optimization; kept for reproducible A/B.
export function applyCandidate(source,file){
 if(file.endsWith('030_renderer_scene.js')){
  if(source.includes('onDirty: () => markDirty(2),'))return source;
  const old='const sparkRenderer = new SparkRenderer({ renderer, numLodFetchers: _numLodFetchers });';
  if(!source.includes(old))throw new Error('Renderer candidate anchor changed');
  return source.replace(old,'const sparkRenderer = new SparkRenderer({ renderer, numLodFetchers: _numLodFetchers, onDirty: () => markDirty(2), });');
 }
 if(file.endsWith('291_render_loop.js')){
  if(source.includes('_pager.readyUploads?.length'))return source;
  const old='    if(!_pm) continue;';
  if(!source.includes(old))throw new Error('Streaming candidate anchor changed');
  return source.replace(old,old+'\n    const _pager = sparkRenderer.pager;\n    if(_pager && (_pager.lodTreeUpdates?.length || _pager.readyUploads?.length || _pager.newUploads?.length)) return true;');
 }
 return source;
}
