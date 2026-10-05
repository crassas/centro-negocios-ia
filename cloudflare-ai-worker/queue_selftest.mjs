import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
let source=await fs.readFile(new URL('./src/index.js',import.meta.url),'utf8');
source=source.replace('import { DurableObject } from "cloudflare:workers";','class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }');
const {TaskQueue}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const values=new Map();
const q=new TaskQueue({storage:{
 async get(k){return values.has(k)?structuredClone(values.get(k)):undefined;},
 async put(k,v){values.set(k,structuredClone(v));}
}},{});
const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
try{
 const task=await q.createTask({action:'git_status',target:'centro-negocios-ia'},'selftest');
 await q.resolveTask(task.id,true);
 assert.equal((await q.pullTask()).attempts,1);
 const fail={exitCode:71,stdout:'',stderr:'network',durationMs:10};
 const first=await q.completeTask(task.id,fail,1);assert.equal(first.retrying,true);
 clock+=1000;
 assert.equal((await q.completeTask(task.id,fail,1)).duplicate,true);
 assert.equal((await q.getJson('task:'+task.id)).retryAfter,first.task.retryAfter);
 clock+=21000;
 assert.equal((await q.pullTask()).attempts,2);
 assert.equal((await q.completeTask(task.id,fail,1)).stale,true);
 const done=await q.completeTask(task.id,{exitCode:0,stdout:'OK'},2);
 assert.equal(done.task.status,'completed');
 assert.equal((await q.completeTask(task.id,fail,2)).duplicate,true);
 assert.equal((await q.getJson('task:'+task.id)).result.exitCode,0);
 console.log('OK duplicate acknowledgement and stale delivery are idempotent');
 const abandoned=await q.createTask({action:'system_info'},'selftest');
 await q.resolveTask(abandoned.id,true);await q.pullTask();
 clock+=21*60*1000;
 const recovered=await q.pullTask();assert.equal(recovered.id,abandoned.id);assert.equal(recovered.attempts,2);
 clock+=21*60*1000;
 assert.equal(await q.pullTask(),null);
 assert.equal((await q.getJson('task:'+abandoned.id)).result.exitCode,124);
 console.log('OK abandoned lease recovered once then terminated');
 const benchmark=await q.startAutonomyBenchmark();
 assert.equal(benchmark.profile,'core-no-openclaw-v1');
 assert.equal(benchmark.total,20);
 for(const item of benchmark.cases){
   const task=await q.getJson('task:'+item.taskId);
   assert.ok(!task.action.includes('openclaw'));
   if(item.caseId==='fault-service')assert.equal(task.action,'fault_laya_recovery');
 }
 assert.equal((await q.startAutonomyBenchmark()).id,benchmark.id);
 const state=await q.getJson('benchmark:'+benchmark.id);
 delete state.profile;
 await q.setJson('benchmark:'+benchmark.id,state);
 const fresh=await q.startAutonomyBenchmark();
 assert.notEqual(fresh.id,benchmark.id);
 assert.equal(fresh.total,20);
 console.log('OK new 20-task profile excludes OpenClaw and preserves real service recovery');
 console.log('queue_selftest: OK');
 const publication=await q.startPublicationSelftest();
 const repeated=await q.startPublicationSelftest();
 assert.equal(publication.id,repeated.id);
 const publicationTask=await q.getJson('task:'+publication.id);
 assert.equal(publicationTask.action,'repo_change');
 assert.equal(publicationTask.target,'centro-negocios-ia');
 assert.deepEqual(publicationTask.args.allowedPaths,['README.md']);
 console.log('OK publication probe is fixed-scope and idempotent');
}finally{Date.now=realNow;}
