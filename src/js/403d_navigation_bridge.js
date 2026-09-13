let _navigationQueryState=null;
function _navigationSavedSource(){
  const entry=walkSetup.settings.navigation;
  if(!entry||entry.key!==walkSetup.settings.whole?.key||!walkSetup.wholeIndex||
    Math.abs(walkSetup.wholeIndex.cellSize-.1)>1e-6||walkSetup.settings.signature!==_walkSourceSignature())return null;
  return {...entry,epoch:walkSetup.epoch,signature:walkSetup.settings.signature};
}
function _navigationState(){
  if(!_navigationQueryState)_navigationQueryState=LocahunNavigationState.create({
    read:_navigationSavedSource,
    decode:entry=>LocahunNavigationCache.decode(_wholeUnbase64(entry.data),entry.key),
    build:mesh=>LocahunNavigationQuery.create(THREE,_loadNavigationPathfinding(),mesh)
  });
  return _navigationQueryState;
}
function _getNavigationQuery(){return _navigationState().get();}
function _prepareNavigationQuery(){return _navigationState().prepare();}
function _clearNavigationQuery(){_navigationQueryState?.clear();}
