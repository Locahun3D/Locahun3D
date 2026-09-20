// The local server owns disk writes; the normal downloadable viewer stays unchanged.
if(new URLSearchParams(location.search).get('localProject')==='1') {
  window.localProject = {ready:false,busy:false,revision:null,status:'loading',dirty:false,changeVersion:0};
  const local=window.localProject;
  const assetRefs=new WeakMap();
  const base=new URL('./',location.href);
  let restoreTicket=0,booting=true;
  const validAsset=file=>typeof file==='string' && /^assets\/[a-zA-Z0-9_-]+\.(rad|ply|splat|spz|ksplat|sog|glb|gltf|obj|fbx)$/i.test(file);
  let statusEl,saveButton,completeButton;
  const label=()=>window._lang==='en';
  function status(message,error=false){
    if(statusEl){statusEl.textContent=message;statusEl.title=message;statusEl.classList.toggle('error',error);}
    if(error)showUndoToast(message);
  }
  function controls(){
    if(saveButton)saveButton.disabled=!local.ready||local.busy;
    if(completeButton)completeButton.disabled=!local.ready||local.busy;
  }
  function markLocalDirty(){
    if(!local.ready)return;
    local.changeVersion++;
    local.dirty=true;
    if(!local.busy)status(label()?'Unsaved changes':'未保存の変更あり');
  }
  local.changed=markLocalDirty;
  local.beginRestore=()=>{
    const ticket=++restoreTicket;
    local.restoring=true;local.ready=false;local.changeVersion++;local.dirty=true;
    document.body.classList.add('local-project-restoring');controls();status((label()?'Loading...':'読み込み中...'));
    return ticket;
  };
  local.endRestore=(ticket,success)=>{
    if(ticket!==restoreTicket)return;
    local.restoring=false;local.ready=success&&!booting;
    document.body.classList.remove('local-project-restoring');controls();
    if(!success){local.status='error';status((label()?'Load failed. Do not save; reopen the editor.':'読込に失敗しました。保存せず、編集を開き直してください。'),true);}
    else if(!booting)status(label()?'Unsaved changes':'未保存の変更あり');
  };
  async function request(route,options={}){
    const response=await fetch(new URL(route,base),{cache:'no-store',...options});
    if(!response.ok){
      if(response.status===409)throw new Error(label()?'Another editor saved changes. Reopen before editing.':'別の画面で保存されています。上書きせず、開き直してください。');
      const details=await response.text();
      throw new Error('HTTP '+response.status+': '+details.slice(0,240));
    }
    return response;
  }
  async function resolveAsset(L,exportFallback){
    const known=assetRefs.get(L);
    if(known && known.raw===L._rawBuffer && known.url===L._streamUrl)return known.file;
    let bytes=L._rawBuffer,ext=(L._rawExt||'').toLowerCase();
    if(!bytes && exportFallback){bytes=await exportFallback();ext='glb';}
    if(!bytes)throw new Error((label()?'Reimport the original asset: ':'元データをインポートし直してください: ')+L.name);
    if(!validAsset('assets/new.'+ext))throw new Error('Unsupported asset: '+ext);
    const response=await request('api/assets?ext='+encodeURIComponent(ext),{
      method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes,
    });
    const result=await response.json();
    if(!validAsset(result.file))throw new Error('Invalid saved asset reference');
    assetRefs.set(L,{file:result.file,raw:L._rawBuffer,url:L._streamUrl});
    return result.file;
  }
  async function save(statusValue='draft'){
    if(!local.ready||local.busy)return false;
    if(typeof _pathMode!=='undefined' && _pathMode){
      status(label()?'Finish or cancel the current path first.':'作成中の区画パスを確定またはキャンセルしてください。',true);return false;
    }
    local.busy=true;controls();
    const changeVersion=local.changeVersion;
    status(label()?'Saving...':'保存中...');
    // Prevent editing a partially serialized snapshot while asset uploads are pending.
    document.body.classList.add('local-project-saving');
    try{
      const project=await window.saveProjectZip(false,{localProject:{resolveAsset}});
      if(!project)throw new Error('Project snapshot unavailable');
      if(changeVersion!==local.changeVersion)throw new Error((label()?'Loading or editing is still in progress. Save again when it finishes.':'読込み・編集が進行中です。完了してから再度保存してください。'));
      const response=await request('api/project',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({revision:local.revision,status:statusValue,project})});
      const saved=await response.json();
      if(!Number.isInteger(saved.revision)||saved.revision!==local.revision+1)throw new Error('Unexpected saved revision. Reopen project.');
      local.revision=saved.revision;local.status=saved.status;local.dirty=changeVersion!==local.changeVersion;
      status((saved.status==='editing_complete'?(label()?'Editing complete':'編集完了'):(label()?'Saved':'保存済み'))+' · r'+saved.revision);
      if(local.dirty)status((label()?'There are changes since the last save. Save again.':'保存後の変更があります。再度保存してください。'),true);
      return true;
    }catch(error){
      local.dirty=true;status((label()?'Save failed: ':'保存失敗: ')+error.message,true);return false;
    }finally{
      local.busy=false;document.body.classList.remove('local-project-saving');controls();
    }
  }
  local.save=()=>save('draft');
  local.complete=async()=>{
    if(!local.ready||local.busy)return false;
    if(!confirm(label()?'Have you checked north, paths, and the initial view? Save this revision as editing complete? No upload or publication will occur.':'方角・区画パス・初期視点の表示を確認しましたか？\nこの内容を保存して「編集完了」にします。アップロード・公開はしません。'))return false;
    return save('editing_complete');
  };
  function mount(){
    document.body.classList.add('local-project-mode');
    saveButton=document.getElementById('tb-save-btn');
    saveButton.onclick=local.save;saveButton.title='上書き保存';
    const saveLabel=document.getElementById('tb-save-lbl');
    // Remove the shared i18n target so subsequent language updates cannot restore "ZIP Save".
    saveLabel.id='local-save-label';saveLabel.textContent='保存';
    completeButton=document.createElement('button');completeButton.id='local-project-complete';
    completeButton.textContent='編集完了';completeButton.title=(label()?'Save what you checked and mark editing complete':'確認した内容を保存して編集完了にする');
    completeButton.onclick=local.complete;saveButton.after(completeButton);
    statusEl=document.createElement('div');statusEl.id='local-project-status';statusEl.setAttribute('role','status');
    completeButton.after(statusEl);status((label()?'Loading...':'読み込み中...'));controls();
    const refreshLabels=()=>{
      saveLabel.textContent=label()?'Save':'保存';saveButton.title=label()?'Save in place':'上書き保存';
      completeButton.textContent=label()?'Complete':'編集完了';
    };
    refreshLabels();
    document.addEventListener('keydown',event=>{
      if((local.busy||local.restoring) && !['Tab','Escape'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
        event.preventDefault();event.stopImmediatePropagation();local.save();
      }else if(!event.ctrlKey&&!event.metaKey || ['z','y','v','x'].includes(event.key.toLowerCase()))markLocalDirty();
    },true);
    for(const name of ['pointerup','input','change','wheel'])document.addEventListener(name,event=>{
      if(event.target.closest?.('#tb-save-btn,#local-project-complete,#local-project-status'))return;
      markLocalDirty();refreshLabels();
    },{capture:true,passive:true});
    window.addEventListener('beforeunload',event=>{
      if(local.dirty||local.busy){event.preventDefault();event.returnValue='';}
    });
  }
  async function open(){
    mount();
    try{
      const envelope=await (await request('api/project')).json();
      if(!Number.isInteger(envelope.revision)||!Array.isArray(envelope.project?.layers))throw new Error('Invalid local project');
      const project=envelope.project;
      for(const entry of project.layers){
        if(!['splat','obj'].includes(entry.type))continue;
        if(!validAsset(entry.file))throw new Error('Missing local asset: '+entry.name);
        if(entry.type==='splat' && entry.file.endsWith('.rad'))entry.streamUrl=new URL(entry.file,base).href;
        else entry._buf=await (await request(entry.file)).arrayBuffer();
      }
      const restored=await restoreProject(project,{strict:true});
      if(layers.length!==project.layers.length || !restored || restored.epoch!==walkSetup.epoch || !restored.layers.every((L,i)=>L===layers[i]))throw new Error('Project load was interrupted');
      for(const entry of project.layers){
        const L=layers.find(L=>L.id===entry.id);
        if(!L)throw new Error('Incomplete project load');
        if(entry.file)assetRefs.set(L,{file:entry.file,raw:L._rawBuffer,url:L._streamUrl});
      }
      booting=false;local.revision=envelope.revision;local.status=envelope.status;local.ready=true;local.dirty=false;
      status((envelope.status==='editing_complete'?(label()?'Editing complete':'編集完了'):(label()?'Saved':'保存済み'))+' · r'+envelope.revision);
      controls();
    }catch(error){local.ready=false;local.status='error';status((label()?'Load failed: ':'読込失敗: ')+error.message,true);controls();}
  }
  queueMicrotask(open);
}
