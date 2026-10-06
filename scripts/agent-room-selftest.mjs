import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const sync={};
const context={window:{},document:{addEventListener(){},getElementById(id){return id==='room-sync'?sync:null;}},Date,Intl};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../agent-room.js',import.meta.url),'utf8'),context);
const room=context.window.CentroRoom;

const coordinator={id:'coordinator',home:[12,76]};
const planner={id:'planner',home:[31,76]};
const executor={id:'executor',home:[50,76]};
const reviewer={id:'reviewer',home:[69,76]};
const publisher={id:'publisher',home:[88,76]};
const laya={id:'laya',home:[88,54]};

assert.equal(room.summary().running,null);
room.update({executions:[],stats:{running:2,queued:3}});
assert.equal(room.summary().running,2);
assert.equal(room.summary().queued,3);

room.offline();
assert.equal(room.model(executor).state,'unknown');
room.update({executions:[{action:'git_status',status:'running',id:'one'}],stats:{running:1,queued:0}});
assert.equal(room.model(executor).state,'working');
assert.equal(room.model(planner).state,'idle');
assert.deepEqual(room.position(executor,{zone:'anything'}),executor.home);
assert.equal(room.destination(executor,{action:'git_status'}),'home');

room.update({executions:[{action:'repo_change',status:'running',id:'two',progressPhase:'planning',progressDetail:'A preparar o plano'}],stats:{running:1,queued:0}});
assert.equal(room.model(planner).state,'working');
assert.equal(room.model(planner).task.id,'two');
assert.equal(room.model(executor).state,'idle','only the recorded phase owns the live task');

room.update({executions:[{action:'repo_change',status:'running',id:'two',progressPhase:'editing',progressDetail:'A aplicar o plano'}],stats:{running:1,queued:0}});
assert.equal(room.model(executor).state,'working');
assert.equal(room.model(planner).state,'idle');

room.update({executions:[{action:'repo_change',status:'running',id:'two',progressPhase:'validating',progressDetail:'A correr testes'}],stats:{running:1,queued:0}});
assert.equal(room.model(reviewer).state,'working');
assert.equal(room.model(executor).state,'idle');

room.update({executions:[{action:'repo_change',status:'running',id:'two',progressPhase:'publishing',progressDetail:'A publicar'}],stats:{running:1,queued:0}});
assert.equal(room.model(publisher).state,'working');
assert.equal(room.model(reviewer).state,'idle');

room.update({executions:[{action:'repo_change',status:'queued',id:'queued'}],stats:{running:0,queued:1}});
assert.equal(room.model(coordinator).state,'waiting');
assert.equal(room.model(planner).state,'idle');

room.update({executions:[{action:'laya_decide',status:'running',id:'laya-one'}],stats:{running:1,queued:0}});
assert.equal(room.model(laya).state,'working');
assert.equal(room.model(executor).state,'idle','Laya is auxiliary and does not make the main executor look blocked');

room.update({executions:[{action:'repo_change',status:'completed',exitCode:67,id:'failed',progressPhase:'blocked'}],stats:{running:0,queued:0}});
assert.equal(room.model(executor).state,'error');

room.offline();
assert.equal(room.model(executor).state,'unknown','connection loss must not show work as live');
assert.equal(room.model(executor).task,null);

room.update({executions:[],stats:{running:0,queued:0}});
assert.equal(room.model(executor).state,'idle');
assert.equal(room.model(executor).task,null);

room.setConversationBusy(true);
assert.equal(room.model(planner).state,'working');
assert.equal(room.model(planner).task,null,'conversation must not invent a queue task');
room.setConversationBusy(false);
assert.equal(room.model(planner).state,'idle');

room.setFinance({balance:0,income:0,expense:0,pending:25});
const evidence=room.resultHTML({id:'seo',target:'restaurante-2-irmaos',status:'completed',exitCode:0,output:'Commit: '+ 'a'.repeat(40)+'\nVerificações: SEO audit: 0\n<script>alert(1)</script>'});
assert.ok(evidence.includes('/commit/'+ 'a'.repeat(40)));
assert.ok(evidence.includes('SEO audit: 0'));
assert.ok(!evidence.includes('<script>'));
assert.ok(room.resultHTML({id:'pending',status:'pending'}).includes('Aguarda confirmação importante'));

room.trackTask('seo');
room.update({executions:[{id:'background',status:'running',source:'stability'},{id:'seo',action:'repo_change',status:'queued',source:'app'}],stats:{running:1,queued:1}});
assert.equal(room.model(coordinator).task.id,'seo','tracked queued work belongs to the coordinator');

room.trackTask('');
room.update({executions:[
  {id:'probe',action:'git_status',source:'stability',status:'completed',exitCode:0,completedAt:Date.now()},
  {id:'seo',action:'repo_change',source:'app',status:'completed',exitCode:0,progressPhase:'completed',completedAt:Date.now()}
],stats:{running:0,queued:0}});
assert.equal(room.model(publisher).task.id,'seo','background probes must not hide the latest real user request');
assert.equal(room.model(publisher).state,'done');

console.log('PASS: fixed desks, sequential real phases, Laya non-blocking, queue ownership, failures and evidence');
