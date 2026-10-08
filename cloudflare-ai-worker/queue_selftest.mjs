import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
let source=await fs.readFile(new URL('./src/index.js',import.meta.url),'utf8');
source=source.replace('import { DurableObject } from "cloudflare:workers";','class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }');
source+='\nexport {parseOperitInstruction,automaticRepoChange,assistSystem};';
const {TaskQueue,default:worker,parseOperitInstruction,automaticRepoChange,assistSystem}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.match(assistSystem('en','conversation'),/always answer in natural English/);
assert.match(assistSystem('en','translation'),/Return only the translation/);
assert.match(assistSystem('pt'),/português de Portugal/);
assert.equal(parseOperitInstruction('/claude @2irmaos Faz o SEO da página').action,'repo_change');
assert.equal(parseOperitInstruction('/claude @2irmaos Analisa o SEO da página').action,'claude_query');
assert.equal(automaticRepoChange('Como melhorar o SEO dos dois irmãos?'),null);
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
 q.authenticate=async()=>true;
 const response=await worker.fetch(new Request('https://test/api/operit/selftest',{
   method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({quiet:true})
 }),{TASKS:{getByName:()=>q}},{});
 assert.equal(response.status,200,await response.clone().text());
 const probe=await response.json();
 assert.equal((await q.getJson('task:'+probe.id)).source,'stability');
 console.log('OK quiet selftest HTTP route reads request before creating stability task');
 const originalFetch=globalThis.fetch;
 try{
  let notifications=0;
  globalThis.fetch=async()=>{notifications++;return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{headers:{'content-type':'application/json'}});};
  const env={TASKS:{getByName:()=>q},TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_CHAT_ID:'42'};
  assert.equal(parseOperitInstruction('/travis estás aí').action,'jarvis_query');
  assert.equal(parseOperitInstruction('/jarvis estás aí').action,'jarvis_query');
  const localBody={question:'estás aí',mode:'local',context:{projects:[]},requestId:'local-request-test-01'};
  const localSend=()=>worker.fetch(new Request('https://test/api/agent',{method:'POST',body:JSON.stringify(localBody)}),{...env,AI:{run:()=>{throw Error('Cloud inference must not run');}}},{});
  const localResult=await (await localSend()).json();
  const localTask=await q.getJson('task:'+localResult.taskId);
  assert.equal(localTask.action,'jarvis_query');assert.equal(localTask.status,'queued');
  assert.equal(localTask.args.prompt,'estás aí');
  assert.equal((await (await localSend()).json()).taskId,localResult.taskId);
  console.log('OK Jarvis uses the shared persistent queue, without cloud inference or duplicate tasks');
  const body={question:'Faz o SEO da página dos dois irmãos',requestId:'seo-request-test-01'};
  const send=()=>worker.fetch(new Request('https://test/api/agent',{method:'POST',body:JSON.stringify(body)}),env,{});
  const first=await send();assert.equal(first.status,200,await first.clone().text());
  const data=await first.json();
  const created=await q.getJson('task:'+data.taskId);
  assert.equal(created.action,'repo_change');assert.equal(created.target,'restaurante-2-irmaos');assert.equal(created.status,'queued');
  assert.equal(data.approvalRequired,false);
  assert.equal((await (await send()).json()).taskId,data.taskId);assert.equal(notifications,1);
  assert.equal((await q.getJson('task:ids')).filter(id=>id===data.taskId).length,1);

  const riskyBody={question:'Altera o Centro para trocar o token da API',requestId:'security-request-test-01'};
  const risky=await worker.fetch(new Request('https://test/api/agent',{method:'POST',body:JSON.stringify(riskyBody)}),env,{});
  assert.equal(risky.status,200,await risky.clone().text());
  const riskyData=await risky.json();
  const riskyTask=await q.getJson('task:'+riskyData.taskId);
  assert.equal(riskyTask.action,'repo_change');assert.equal(riskyTask.target,'centro-negocios-ia');assert.equal(riskyTask.status,'pending');
  assert.equal(riskyData.approvalRequired,true);
  assert.match(String(riskyData.approvalReason||''),/credenciais|segurança/i);

  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN));
  const secret=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const approve=()=>worker.fetch(new Request('https://test/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:999999,callback_query:{id:'cb',data:'taskapprove:'+riskyData.taskId,message:{chat:{id:42}}}})}),env,{});
  assert.equal((await approve()).status,200);await approve();
  assert.equal((await q.getJson('task:'+riskyData.taskId)).status,'queued');

  q.authenticate=async()=>false;
  const unauthorised=await worker.fetch(new Request('https://test/api/operit/submit',{method:'POST',body:JSON.stringify(body)}),env,{});
  assert.equal(unauthorised.status,401);
  console.log('OK high-autonomy policy: routine SEO auto-queues; security/credentials require Telegram; duplicate request creates no second task; submit requires authentication');
 }finally{globalThis.fetch=originalFetch;}
}finally{Date.now=realNow;}
{
 const request=()=>new Request('https://test/api/assist',{method:'POST',headers:{origin:'https://crassas.github.io'},body:JSON.stringify({question:'Olá',mode:'conversation',context:{}})});
 let structuredCalls=0;
 const structuredPayload=[{id:'case-0',a:42,c:0.8}];
 const structured=await worker.fetch(request(),{AI:{async run(){structuredCalls++;return {response:structuredPayload}}}},{});
 assert.equal(structured.status,200);
 assert.deepEqual(JSON.parse((await structured.json()).answer),structuredPayload);
 assert.equal(structuredCalls,1,'A structured answer must not trigger fallback inference');
 console.log('OK structured AI answers remain valid through the HTTP endpoint');
 const models=[];
 const response=await worker.fetch(request(),{AI:{async run(model){models.push(model);if(models.length===1)throw Error('primary unavailable');return {response:'Estou aqui.'}}}},{});
 assert.equal(response.status,200);assert.equal((await response.json()).answer,'Estou aqui.');assert.equal(models[1],'@cf/meta/llama-3.2-3b-instruct');
 const unavailable=await worker.fetch(request(),{AI:{async run(){throw Error('daily limit exceeded')}}},{});
 assert.equal(unavailable.status,503);const error=await unavailable.json();assert.equal(error.ok,false);assert.equal(error.reason,'quota');assert.equal(error.answer,undefined);
 console.log('OK conversation uses real alternate inference; quota failure never becomes a successful answer');
}
