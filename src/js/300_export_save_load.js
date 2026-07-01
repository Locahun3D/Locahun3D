// ══════════════════════════════════════════════════
//  EXPORT / SAVE / LOAD
// ══════════════════════════════════════════════════
window.openExportModal  = function(){ document.getElementById('export-modal').classList.add('show'); };
window.closeExportModal = function(){ document.getElementById('export-modal').classList.remove('show'); };
document.getElementById('export-modal').addEventListener('click', e=>{
  if(e.target===e.currentTarget) window.closeExportModal();
});

// ── 3DGS Splat Export ──
window.exportSplat = function(){
  const splatLayers = layers.filter(L => L.type === 'splat' && L._rawBuffer && L._rawBuffer.byteLength > 0 && L.visible);
  const streamedOnly = layers.filter(L => L.type === 'splat' && L.visible && L._streamUrl && (!L._rawBuffer || L._rawBuffer.byteLength === 0));
  if(splatLayers.length === 0){
    const anySplat = layers.find(L => L.type === 'splat');
    if(streamedOnly.length > 0)
      showUndoToast(window._lang==='en'
        ? `⚠ ${streamedOnly.length} streamed layer(s) cannot be exported (no local data). Use ZIP save instead.`
        : `⚠ ストリーミング読込の${streamedOnly.length}レイヤーはエクスポート不可（ローカルデータなし）。ZIP保存を使ってください`);
    else if(anySplat)
      showUndoToast(T('splat-nocache'));
    else
      showUndoToast(T('splat-nolayer'));
    return;
  }
  if(streamedOnly.length > 0){
    showUndoToast(window._lang==='en'
      ? `⚠ ${streamedOnly.length} streamed layer(s) skipped (no local data)`
      : `⚠ ストリーミングの${streamedOnly.length}レイヤーはスキップ（ローカルデータなし）`);
  }
  let count = 0;
  for(const L of splatLayers){
    const ext = L._rawExt || 'splat';
    const blob = new Blob([L._rawBuffer], {type: 'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${L.name.replace(/[^a-zA-Z0-9_-]/g,'_')}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    count++;
  }
  showUndoToast(window._lang==='en'
    ? `✅ Exported ${count} 3DGS file${count===1?'':'s'}`
    : `✅ 3DGSファイルをエクスポートしました (${count}件)`);
};

window.exportGLB = async function() {
  try {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    const exportGroup = new THREE.Group();
    let count = 0;
    for(const L of layers){
      if(L.type==='folder'||L.type==='splat'||!L.mesh||!L.visible) continue;
      const clone = L.mesh.clone();
      clone.name = L.name;
      exportGroup.add(clone);
      count++;
    }
    if(!count){ showUndoToast(T('exp-noobj')); return; }
    exporter.parse(exportGroup, (result)=>{
      const blob=new Blob([result],{type:'model/gltf-binary'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download='scene_export.glb';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 5000);
      showUndoToast(window._lang==='en'
        ? `✅ GLB exported (${count} object${count===1?'':'s'})`
        : `✅ GLBエクスポート完了 (${count}オブジェクト)`);
    }, (err)=>{ console.error(err); showUndoToast(T('exp-fail')+(err&&err.message?err.message:err)); },
    { binary:true });
  } catch(e){ console.error(e); showUndoToast(T('exp-fail')+e.message); }
};

// ── OBJ export (via GLTFExporter → re-export as OBJ-like text) ──
window.exportOBJ = async function() {
  try {
    const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js');
    const exporter = new OBJExporter();
    const exportGroup = new THREE.Group();
    let count = 0;
    for(const L of layers){
      if(L.type==='folder'||L.type==='splat'||!L.mesh||!L.visible) continue;
      const clone = L.mesh.clone();
      clone.name = L.name;
      exportGroup.add(clone);
      count++;
    }
    if(!count){ showUndoToast(T('exp-noobj')); return; }
    const result = exporter.parse(exportGroup);
    const blob = new Blob([result],{type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download='scene_export.obj';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    showUndoToast(window._lang==='en'
      ? `✅ OBJ exported (${count} object${count===1?'':'s'})`
      : `✅ OBJエクスポート完了 (${count}オブジェクト)`);
  } catch(e){ console.error(e); showUndoToast(T('exp-fail')+e.message); }
};

// ── Project Save ──
// ── Helper: ArrayBuffer → base64 ──
function bufToBase64(buf){
  const bytes=new Uint8Array(buf);
  let bin='';
  const chunk=8192;
  for(let i=0;i<bytes.length;i+=chunk)
    bin+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(bin);
}
function base64ToBuf(b64){
  const bin=atob(b64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}

