// ══════════════════════════════════════════════════
//  FOLDER COLOR PICKER
// ══════════════════════════════════════════════════
const PRESET_COLORS=['#e8a838','#ff4444','#ff8844','#ffcc00','#44cc44','#2299dd','#6644cc','#cc44aa','#888888','#44ffcc'];

function _showColorPopup(x, y, currentColor, onChange, onClose){
  // Remove any existing popup
  const old=document.getElementById('color-preset-popup');
  if(old) old.remove();

  const popup=document.createElement('div');
  popup.id='color-preset-popup';
  popup.className='color-preset-popup';
  // Position near click
  popup.style.left=Math.min(x, window.innerWidth-180)+'px';
  popup.style.top=Math.max(10, y-80)+'px';

  // Native color picker
  const row=document.createElement('div');
  row.className='cpr-native';
  const lbl=document.createElement('label');
  lbl.textContent='Custom:';
  const inp=document.createElement('input');
  inp.type='color';
  inp.value=currentColor;
  inp.style.cssText='width:32px;height:26px;border:none;cursor:pointer;background:transparent;padding:0;';
  inp.addEventListener('input',function(){ onChange(inp.value); });
  inp.addEventListener('change',function(){ onChange(inp.value); });
  row.appendChild(lbl);
  row.appendChild(inp);
  popup.appendChild(row);

  // Preset swatches
  const grid=document.createElement('div');
  grid.className='cpr-grid';
  PRESET_COLORS.forEach(function(clr){
    const sw=document.createElement('div');
    sw.className='cpr-swatch';
    sw.style.background=clr;
    sw.onclick=function(e){ e.stopPropagation(); onChange(clr); };
    grid.appendChild(sw);
  });
  popup.appendChild(grid);

  popup.onclick=function(e){ e.stopPropagation(); };
  document.body.appendChild(popup);

  // Close on outside click
  function closeHandler(e){
    if(!popup.contains(e.target)){
      popup.remove();
      document.removeEventListener('mousedown', closeHandler, true);
      if(onClose) onClose();
    }
  }
  setTimeout(function(){ document.addEventListener('mousedown', closeHandler, true); }, 50);
  return popup;
}

window.openFolderColorPicker = function(id, ev){
  if(ev) ev.stopPropagation();
  const L=findLayer(id); if(!L||L.type!=='folder') return;
  const x=ev?ev.clientX:100, y=ev?ev.clientY:100;
  _showColorPopup(x, y, L.folderColor||'#e8a838', function(clr){
    L.folderColor=clr;
    renderLayerList();
  });
};

window.openEventColorPicker = function(id, ev){
  if(ev) ev.stopPropagation();
  const L=findLayer(id); if(!L||L.type!=='event') return;
  const x=ev?ev.clientX:100, y=ev?ev.clientY:100;
  const curColor=L.eventColor||'#ff8800';
  _showColorPopup(x, y, curColor, function(clr){
    L.eventColor=clr;
    // Update 3D mesh materials
    if(L.mesh){
      const children=L.mesh.children;
      // Ring (index 0)
      if(children[0]&&children[0].material) children[0].material.color.set(clr);
      // Circle fill (index 1) - lighter version
      if(children[1]&&children[1].material){
        const c3=new THREE.Color(clr);
        c3.lerp(new THREE.Color(1,1,1), 0.3);
        children[1].material.color.copy(c3);
      }
    }
    renderLayerList();
    markDirty(4);
  });
};

