import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo=new URL('../',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
const prefix='<html><script>window.__locahunBuildRelease="{{viewer-release-id}}";</script>\n';
const stamp=s=>s.replaceAll('{{viewer-release-id}}',sha(Buffer.from(s,'latin1')));
function fixture(t,web=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'locahun-web-build-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.equal(fs.realpathSync(root),path.resolve(root));fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'src'));
 for(const p of ['build.mjs','scripts/prepare-viewer-release.mjs','scripts/viewer-update-core.cjs'])fs.copyFileSync(new URL(p,repo),path.join(root,p));
 const write=(p,s)=>fs.writeFileSync(path.join(root,p),s,'latin1');
 const template=prefix+'{{include-variant:src/map.json}}\n'+(web?'{{include-web:src/full.html|src/lazy.html}}\n':'{{include:src/full.html}}\n')+'</html>';
 write('src/template.html',template);write('src/map.json','standalone\r\n');write('src/map.online.json','online\r\n');write('src/full.html','embedded\xff\r\n');write('src/lazy.html','lazy\xfe\r\n');
 const run=(...args)=>spawnSync(process.execPath,[path.join(root,'build.mjs'),...args],{encoding:'utf8'});
 const bytes=p=>fs.readFileSync(path.join(root,p));return {root,write,run,bytes};
}
test('default and online retain legacy byte output and hash record names',t=>{
 const f=fixture(t);
 for(const online of [false,true]){
  const args=online?['--online']:[],suffix=online?'.online':'';assert.equal(f.run(...args).status,0);
  const expected=Buffer.from(stamp(prefix+(online?'online':'standalone')+'\r\nembedded\xff\r\n</html>'),'latin1');
  assert.deepEqual(f.bytes('Locahun3D_OfflineViewer'+suffix+'.html'),expected);
  assert.equal(f.bytes('.build-hash'+suffix).toString(),sha(expected)+'\n');
 }
});
test('web axis combines independently with online across four output/hash pairs',t=>{
 const f=fixture(t,true),records=[];
 for(const online of [false,true])for(const web of [false,true]){
  const args=[...(online?['--online']:[]),...(web?['--web']:[])],suffix=(online?'.online':'')+(web?'.web':'');
  const result=f.run(...args);assert.equal(result.status,0,result.stderr);
  const expected=Buffer.from(stamp(prefix+(online?'online':'standalone')+'\r\n'+(web?'lazy\xfe':'embedded\xff')+'\r\n</html>'),'latin1');
  assert.deepEqual(f.bytes('Locahun3D_OfflineViewer'+suffix+'.html'),expected);
  const record=f.bytes('.build-hash'+suffix).toString();assert.equal(record,sha(expected)+'\n');records.push(record);
 }
 assert.equal(new Set(records).size,4);
});
test('web runs never replace existing embedded outputs/hash or bypass their hotfix guard',t=>{
 const f=fixture(t,true);assert.equal(f.run().status,0);assert.equal(f.run('--online').status,0);
 const standalone=f.bytes('.build-hash'),online=f.bytes('.build-hash.online'),onlineHtml=f.bytes('Locahun3D_OfflineViewer.online.html');
 f.write('Locahun3D_OfflineViewer.html','manual edit');
 assert.equal(f.run('--web').status,0);assert.equal(f.run('--online','--web').status,0);
 assert.equal(f.bytes('Locahun3D_OfflineViewer.html').toString(),'manual edit');assert.deepEqual(f.bytes('Locahun3D_OfflineViewer.online.html'),onlineHtml);
 assert.deepEqual(f.bytes('.build-hash'),standalone);assert.deepEqual(f.bytes('.build-hash.online'),online);assert.notEqual(f.run().status,0);
});
test('missing/empty/unresolved web fragments fail before output or record writes',t=>{
 for(const invalid of ['missing','empty','malformed','nested']){
  const f=fixture(t,true);assert.equal(f.run('--web').status,0);const output=f.bytes('Locahun3D_OfflineViewer.web.html'),record=f.bytes('.build-hash.web');
  if(invalid==='missing')fs.unlinkSync(path.join(f.root,'src/lazy.html'));
  if(invalid==='empty')f.write('src/lazy.html','');
  if(invalid==='malformed')f.write('src/template.html',prefix+'{{include-web:src/full.html}}\n</html>');
  if(invalid==='nested')f.write('src/lazy.html','{{include-web:src/full.html|src/lazy.html}}\n');
  const result=f.run('--web');assert.notEqual(result.status,0,invalid);assert.match(result.stderr,/FATAL/);
  assert.deepEqual(f.bytes('Locahun3D_OfflineViewer.web.html'),output);assert.deepEqual(f.bytes('.build-hash.web'),record);
 }
});
test('only the selected delivery fragment must exist and custom output uses the web record',t=>{
 const f=fixture(t,true);fs.unlinkSync(path.join(f.root,'src/lazy.html'));assert.equal(f.run().status,0);
 f.write('src/lazy.html','lazy\xfe\r\n');fs.unlinkSync(path.join(f.root,'src/full.html'));
 assert.equal(f.run('--web','--out',path.join(f.root,'private-web.html')).status,0);
 assert.equal(f.bytes('.build-hash.web').toString(),sha(f.bytes('private-web.html'))+'\n');
});
test('web custom output cannot overwrite either canonical embedded artifact, even with force',t=>{
 const f=fixture(t,true);assert.equal(f.run().status,0);assert.equal(f.run('--online').status,0);
 for(const suffix of ['', '.online']){
  const name='Locahun3D_OfflineViewer'+suffix+'.html',before=f.bytes(name),record=f.bytes('.build-hash'+suffix);
  const result=f.run('--web','--force','--out',path.join(f.root,name));assert.notEqual(result.status,0);
  assert.deepEqual(f.bytes(name),before);assert.deepEqual(f.bytes('.build-hash'+suffix),record);
 }
});
