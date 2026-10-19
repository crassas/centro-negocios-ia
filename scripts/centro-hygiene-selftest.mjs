// Centro de Negócios — ensaios da higienização sem rede nem credenciais.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const load=async file=>readFile(new URL(file,root),'utf8');

test('no arranque não gera pagamentos ou leads e não duplica o site Beatriz',async()=>{
 const script=await load('app.js');
 assert.doesNotMatch(script,/seedLeadDefaults\(\);/);
 assert.doesNotMatch(script,/seedPaymentDefaults\(\);/);
 const initial={clients:{},leads:[],transactions:[],pendingPayments:[{
   id:'old-pending',client:'Engomadoria Beatriz',projectId:'engomadoria',
   amount:25,status:'pending'
 }],company:{profile:{name:'Quasi Norte',monthlyTarget:0,safetyReserve:0},tasks:[],recurringCosts:[]},agent:{}};
 const remote={source:'neon-postgresql',totals:{sites:4,pendingEur:25,openTasks:0},
  clients:[{name:'Engomadoria Beatriz',repositoryUrl:'https://github.com/crassas/engomadoria-beatriz',pendingEur:25}]};
 const ctx=vm.createContext({
  window:{addEventListener(){},CentroBusinessNeon:{context:()=>remote}},
  document:{addEventListener(){},getElementById(){return null;}},
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  localStorage:{getItem(k){return k==='centro_negocios_v3'?JSON.stringify(initial):null;},setItem(){}},
  location:{href:'https://crassas.github.io/centro-negocios-ia/',hash:'#empresa',hostname:'crassas.github.io',port:''},
  console,Intl,Date,URL,setTimeout,clearTimeout
 });
 vm.runInContext(script,ctx);
 vm.runInContext("sites=[{id:'engomadoria-beatriz',name:'Engomadoria Beatriz',repo:'https://github.com/crassas/engomadoria-beatriz',url:'https://engomadoriabeatriz.pt/'}]",ctx);
 assert.equal(vm.runInContext('allProjects().length',ctx),1,'não duplicar engomadoria antiga');
 assert.equal(vm.runInContext('projectById("engomadoria").id',ctx),'engomadoria-beatriz');
 assert.equal(vm.runInContext('matchingNeonPending(state.pendingPayments[0])?.name',ctx),'Engomadoria Beatriz');
 const focuses=vm.runInContext('companyFocusItems().filter(x=>x.kind==="payment")',ctx);
 assert.equal(focuses.length,1,'pendência do mesmo valor/cliente aparece só uma vez no foco');
 assert.match(focuses[0].meta,/também registada localmente/);
 assert.equal(vm.runInContext('state.pendingPayments.length',ctx),1,'não apagar histórico local');
 assert.equal(vm.runInContext('state.pendingPayments[0].status',ctx),'pending','não marcar recebido');
});

class FakeElement{
 constructor(tag='div'){
  this.tagName=tag;this.attributes={};this.dataset={};this.children=[];
  this.disabled=false;this.hidden=false;this.value='';this.className='';
  this._text='';
 }
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}
 setAttribute(k,v){this.attributes[k]=String(v);}
 removeAttribute(k){delete this.attributes[k];}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this._text='';this.children=[...children];}
 addEventListener(event,callback){this['on'+event]=callback;}
}

test('Neon: leitura autorizada, texto sanitizado e sem injeção HTML',async()=>{
 const file=await load('business-neon.js');
 const names=['neon-company-status','neon-company-total','neon-company-source','neon-company-list','neon-company-refresh','neon-company-authorize'];
 const elements=Object.fromEntries(names.map(k=>[k,new FakeElement()]));
 const callbacks=[];
 const events=[];
 const malicious='<img src=x onerror=alert(1)>';
 const sample={ok:true,clients:[
   {name:'Engomadoria Beatriz',siteStatus:'publicado',
    websiteUrl:'https://engomadoriabeatriz.pt/',repositoryUrl:'https://github.com/crassas/engomadoria-beatriz',
    pendingEur:'25.00',openTasks:0,secret:'NUNCA MOSTRAR'},
   {name:malicious,siteStatus:'publicado',websiteUrl:'javascript:alert(1)',
    pendingEur:-10,openTasks:0,email:'outro@example.com'}
 ]};
 const context=vm.createContext({
  document:{
   getElementById:id=>elements[id]||null,
   addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')callbacks.push(fn);},
   createElement:tag=>new FakeElement(tag),
   createTextNode:text=>({textContent:String(text)})
  },
  window:{dispatchEvent:evt=>events.push(evt.type)},
  CustomEvent:class{constructor(type){this.type=type;}},
  aiFetch:async path=>path==='/api/business/status'?{ok:true,configured:true,authorized:true}:sample,
  localStorage:{getItem(){return 'a'.repeat(64)},setItem(){}},
  Intl,URL,Date,setTimeout,clearTimeout
 });
 vm.runInContext(file,context);
 callbacks.forEach(fn=>fn());
 await new Promise(resolve=>setTimeout(resolve,25));
 const data=context.window.CentroBusinessNeon.context();
 assert.equal(data.totals.sites,2);
 assert.equal(data.totals.pendingEur,25);
 assert.equal(data.clients[1].websiteUrl,'','bloqueia javascript:');
 assert.equal(data.clients[1].pendingEur,0,'não permite valores negativos');
 assert.doesNotMatch(JSON.stringify(data),/NUNCA MOSTRAR|outro@example.com/);
 const rendered=elements['neon-company-list'].children;
 assert.equal(rendered.length,2);
 assert.equal(rendered[1].children[0].children[0].textContent,malicious,
   'valor suspeito é apresentado como texto, nunca interpretado como HTML');
 assert.ok(rendered[0].children[0].children[1].children.some(n=>n.tagName==='a'));
 assert.ok(!rendered[1].children[0].children[1].children.some(n=>n.tagName==='a'));
 assert.equal(elements['neon-company-status'].dataset.state,'ready');
 assert.ok(events.includes('centro:business-updated'));
});

test('interface legível e rotulagem das fontes',async()=>{
 const html=await load('index.html');
 const css=await load('business-hygiene.css');
 assert.match(html,/id="main-content" tabindex="-1"/);
 assert.match(html,/class="skip-link"/);
 assert.match(html,/id="company-pending-source"/);
 assert.match(html,/id="neon-finance-notice"/);
 assert.match(html,/data-sources-note/);
 assert.match(html,/id="dashboard-priority-list"/);
 assert.doesNotMatch(html,/class="priority-check done"/,
   'não inventar tarefas concluídas');
 assert.match(css,/min-height:44px/);
 assert.match(css,/focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/\.command-nav a/);
});
