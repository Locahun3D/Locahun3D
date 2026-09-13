import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('tool changes reconcile synchronously even when zero-delay timers have not run',()=>{
 const handlers=[],elements={};
 for(const id of ['cam-panel','sun-panel','gizmo','cam-anim-panel','quality-panel','qi-badge','view-tl-btns'])elements[id]={id,style:{display:'none'},dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},getBoundingClientRect:()=>({bottom:84}),removeAttribute(){}};
 const ctx={matchMedia:()=>({matches:true,addEventListener(){}}),getComputedStyle:e=>e.style,innerHeight:1180,setTimeout:()=>1,clearTimeout(){},addEventListener(){},document:{getElementById:id=>elements[id],querySelector:()=>({getBoundingClientRect:()=>({height:44,top:924})}),documentElement:{style:{setProperty(){}}},addEventListener:(type,fn,capture)=>handlers.push({type,fn,capture})}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(new URL('../src/js/407_touch_panel_layout.js',import.meta.url),'utf8'),ctx);
 const click=id=>{const e={target:{closest:()=>({id})},preventDefault(){},stopImmediatePropagation(){this.stopped=true;}};for(const h of handlers.filter(h=>h.type==='click'&&h.capture))h.fn(e);if(e.stopped)return;const panel=id==='btnCamTool'?'cam-panel':'sun-panel';elements[panel].style.display='block';for(const h of handlers.filter(h=>h.type==='click'&&!h.capture))h.fn(e);};
 click('btn-sun');click('btnCamTool');
 assert.equal(elements['cam-panel'].dataset.touchOccluded,'false');assert.equal(elements['sun-panel'].dataset.touchOccluded,'true');
 click('btn-sun');assert.equal(elements['cam-panel'].dataset.touchOccluded,'true');assert.equal(elements['sun-panel'].dataset.touchOccluded,'false');
 elements['quality-panel'].style.display='block';elements['qi-badge'].listeners.touchend();
 assert.equal(elements['quality-panel'].dataset.touchOccluded,'false');assert.equal(elements['sun-panel'].dataset.touchOccluded,'true');
});
