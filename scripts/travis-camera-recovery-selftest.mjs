import assert from 'node:assert/strict';
const events=new EventTarget(),doc=new EventTarget(),timers=new Map();
let next=0,fail=true,calls=0;
globalThis.window=events;
globalThis.document=doc;doc.hidden=false;
globalThis.location={hostname:'127.0.0.1'};
globalThis.setTimeout=(fn,ms)=>{timers.set(++next,{fn,ms});return next;};
globalThis.clearTimeout=id=>timers.delete(id);
globalThis.fetch=async()=>{
  calls++;
  if(fail)throw Error('connection refused');
  return {ok:true,json:async()=>({sources:[{id:'test',lat:0,lon:0,name:'Test camera'}]})};
};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const world=open=>events.dispatchEvent(new CustomEvent('travis:world',{detail:{open}}));
await import('../travis-cctv-network.mjs');
assert.equal(calls,0,'Do not request cameras before user activation');
world(true);await settle();
assert.equal(window.TravisCctv.status().state,'error');
assert.equal(timers.size,1);
for(const delay of [3000,10000,30000]){
  const [id,timer]=[...timers][0];assert.equal(timer.ms,delay);
  timers.delete(id);timer.fn();await settle();
}
assert.equal(timers.size,0,'Retries are bounded');
assert.equal(calls,4);
world(false);fail=false;world(true);await settle();
assert.equal(window.TravisCctv.status().state,'ready','Reopening must recover from previous error');
assert.equal(window.TravisCctv.status().count,1);
const before=calls;world(true);await settle();assert.equal(calls,before,'Reuse healthy cache');
fail=true;await window.TravisCctv.load({force:true});
assert.equal(window.TravisCctv.status().state,'stale');
assert.equal(window.TravisCctv.status().count,1,'Keep previous pins during outage');
world(false);assert.equal(timers.size,0,'Stop recovery when globe closes');
world(true);await settle();doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(timers.size,0,'Do not poll while hidden');
fail=false;doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await settle();
assert.equal(window.TravisCctv.status().state,'ready');
console.log('PASS camera catalog: bounded recovery, reopen, background stop, stale pins retained');
