import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('let executionPollInFlight=null;');
const end=source.indexOf('\nfunction renderSystem()',begin);
assert.ok(begin>=0&&end>begin);
let requests=0,release,fail=false,updates=0,offline=0;
const context={document:{hidden:false},Date,AbortController,setTimeout,clearTimeout,Promise,$:()=>({}),renderExecutions(){},window:{CentroRoom:{update(){updates++;},offline(){offline++;}}},
  aiFetch:async()=>{requests++;await new Promise(r=>{release=r;});if(fail)throw Error('network unavailable');return {executions:[],stats:{running:0,queued:0}};}};
vm.createContext(context);
vm.runInContext(source.slice(begin,end)+'\nthis.poll=loadExecutions;',context);
const first=context.poll(),second=context.poll();
assert.equal(first,second,'overlapping refreshes share one request');
assert.equal(requests,1);
release();await first;assert.equal(updates,1);
fail=true;const broken=context.poll(true);release();await broken;
assert.equal(offline,1);
await context.poll();assert.equal(requests,2,'background retries respect backoff');
fail=false;const forced=context.poll(true);release();await forced;
assert.equal(requests,3);assert.equal(updates,2,'manual retry can recover without waiting');
context.document.hidden=true;await context.poll();assert.equal(requests,3,'hidden page does not poll');
console.log('PASS: single request, bounded retry cadence, manual recovery and hidden-page pause');
