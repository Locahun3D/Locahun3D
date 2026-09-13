import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/js/110_user_manual_modal_opened_from_dropzone_o.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('window._isNarrowPhoneUI ='),source.indexOf('window.toggleCamTool ='));
for(const [width,height,touch,expected] of [[390,844,true,true],[844,390,true,true],[667,375,true,true],[820,1180,true,false],[1180,820,true,false],[1280,720,false,false]]){
  const window={innerWidth:width,innerHeight:height,matchMedia:()=>({matches:touch})};
  vm.runInNewContext(helper,{window});
  assert.equal(window._isNarrowPhoneUI(),expected,`${width}x${height} touch=${touch}`);
}
console.log('Phone tool mode: six viewport/input cases passed');
