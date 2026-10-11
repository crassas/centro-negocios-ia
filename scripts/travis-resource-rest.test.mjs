import test from 'node:test';
import assert from 'node:assert/strict';

test('rest transitions are idempotent, isolate errors and cancel delayed shutdown on a quick return',async()=>{
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
  globalThis.CustomEvent=class extends Event{constructor(name,opts){super(name);this.detail=opts.detail;}};
  const {registerRestResource}=await import('../travis-resource-rest.mjs?test');
  const calls=[];
  const remove=registerRestResource('map',{delayMs:25,suspend(){calls.push('sleep');return true;},resume(){calls.push('wake');}});
  const visibility=(hidden)=>{document.hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));};
  visibility(true);visibility(false);await new Promise(r=>setTimeout(r,35));assert.deepEqual(calls,[]);
  visibility(true);await new Promise(r=>setTimeout(r,35));visibility(true);assert.deepEqual(calls,['sleep']);
  visibility(false);visibility(false);assert.deepEqual(calls,['sleep','wake']);
  window.dispatchEvent(new Event('pagehide'));assert.deepEqual(calls,['sleep','wake','sleep']);
  window.dispatchEvent(new Event('pageshow'));assert.deepEqual(calls,['sleep','wake','sleep','wake']);
  registerRestResource('broken',{suspend(){throw Error('fixture');},resume(){}});
  visibility(true);await new Promise(r=>setTimeout(r,35));assert.equal(calls.at(-1),'sleep');
  assert.equal(window.TravisResources.status().resources.find(x=>x.name==='broken').error,'fixture');
  visibility(false);remove();assert.equal(window.TravisResources.status().resources.length,1);
});
