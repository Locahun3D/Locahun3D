import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/js/273_figure_object_menu_stats.js',import.meta.url),'utf8');
function setup(){
 const start=source.indexOf('// Lightweight FPS badge');assert(start>=0,'independent badge updater missing');
 const end=source.indexOf('function updatePerfStats()',start);assert(end>start);
 let now=0,writes=0;const timers=[];
 const badge={dataset:{},_text:'',get textContent(){return this._text;},set textContent(v){writes++;this._text=v;},style:{color:''}};
 const c=vm.createContext({window:{__riCounter:0},_fpsDisplay:24,performance:{now:()=>now},document:{hidden:false,getElementById(id){assert.equal(id,'qib-fps');return badge;}},setInterval(fn,ms){timers.push({fn,ms});return 1;}});
 vm.runInContext(source.slice(start,end),c);
 return {c,badge,timers,get writes(){return writes;},tick(t){now=t;timers[0].fn();}};
}
test('closed-panel badge updates with one lightweight 500ms timer and differential text writes',()=>{
 const s=setup();assert.equal(s.timers.length,1);assert.equal(s.timers[0].ms,500);
 s.c.window.__riCounter=1;s.tick(500);assert.equal(s.badge.textContent,'24 fps');
 s.c._fpsDisplay=58;s.c.window.__riCounter=2;s.tick(1000);assert.equal(s.badge.textContent,'58 fps');
 const count=s.writes;s.c.window.__riCounter=3;s.tick(1500);assert.equal(s.writes,count);
});
test('idle stale FPS becomes unavailable and hidden document performs no writes',()=>{
 const s=setup();s.tick(0);assert.equal(s.badge.textContent,'-- fps');
 s.c.window.__riCounter=1;s.tick(500);assert.equal(s.badge.textContent,'24 fps');
 s.tick(2001);assert.equal(s.badge.textContent,'-- fps');
 const count=s.writes;s.c.document.hidden=true;s.c.window.__riCounter=2;s.c._fpsDisplay=60;s.tick(2500);assert.equal(s.writes,count);
 s.c.document.hidden=false;s.tick(3000);assert.equal(s.badge.textContent,'-- fps');
 s.c.window.__riCounter=3;s.tick(3500);assert.equal(s.badge.textContent,'60 fps');
});
test('invalid FPS is unavailable and panel does not create additional badge timers',()=>{
 const s=setup();s.c.window.__riCounter=1;s.c._fpsDisplay=NaN;s.tick(500);assert.equal(s.badge.textContent,'-- fps');
 assert.equal((source.match(/setInterval\(_updateFpsBadge,500\)/g)||[]).length,1);
 const panel=source.slice(source.indexOf('function updatePerfStats()'));
 assert.doesNotMatch(panel,/setInterval\(_updateFpsBadge|_qiFps\.textContent/);
 assert.match(panel,/setInterval\(updatePerfStats, 500\)/);
 assert.match(panel,/clearInterval\(_perfInterval\)/);
});
