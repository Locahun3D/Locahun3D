import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './collision-cache-bridge-fixture.mjs';

function setup() {
  const f=fixture(null),generate={disabled:false},avatar={dataset:{},setAttribute(k,v){this[k]=v;}},label={textContent:'Walk'};
  Object.assign(f.c,{AbortController,Headers,Response});
  f.c.document.getElementById=id=>({'walk-generate':generate,btnAvatarWalk:avatar,'lbl-walk':label}[id]||null);
  f.run('layers[0]._rawBuffer=null;layers[0]._streamUrl="https://synthetic.invalid/scene.rad"');
  let calls=0;
  f.c.fetch=()=>{calls++;return new Promise(()=>{});};
  return {...f,generate,avatar,label,calls:()=>calls};
}
async function waitFor(predicate) {
  for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,1));
  assert(predicate(),'Expected pending HEAD');
}

test('failed reload releases the generate control after cancelling a cache-only job',{timeout:3000},async()=>{
  const f=setup();
  const old=f.run('_walkAutoImport()');
  try {
    await waitFor(()=>f.calls()===1);
    assert.equal(f.generate.disabled,true);
    await assert.rejects(f.run('_walkObserveImport(async()=>{throw Error("reload failed");})()'),/reload failed/);
    assert.equal(await old,false);
    assert.equal(f.run('walkSetup.busy'),false);
    assert.equal(f.run('walkSetup.pending'),null);
    assert.equal(f.avatar['aria-busy'],'false');
    assert.equal(f.label.textContent,'Walk');
    assert.equal(f.generate.disabled,false);
  } finally {f.run('_walkRestoreSettings(null)');await old;}
});

test('old cancelled job cleanup cannot enable the control owned by a new pending job',{timeout:3000},async()=>{
  const f=setup();let newer;
  const old=f.run('_walkAutoImport()');
  try {
    await waitFor(()=>f.calls()===1);
    f.run('_walkCancelPending()');
    newer=f.run('_walkAutoImport()');
    assert.equal(f.generate.disabled,true);
    assert.equal(await old,false);
    await waitFor(()=>f.calls()===2);
    assert.equal(f.run('walkSetup.busy'),true);
    assert.equal(f.run('walkSetup.pending'),newer);
    assert.equal(f.avatar['aria-busy'],'true');
    assert.equal(f.generate.disabled,true);
  } finally {
    f.run('_walkRestoreSettings(null)');
    await old;await newer;
  }
  assert.equal(f.generate.disabled,false);
});
