import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const app=await readFile(process.env.CENTRO_TEST_APP||new URL('app.js',root),'utf8');
const html=await readFile(process.env.CENTRO_TEST_HTML||new URL('index.html',root),'utf8');
const live=JSON.parse(await readFile(new URL('data/live.json',root),'utf8'));
class Element{
  constructor(dataset={}){this.dataset=dataset;this.hidden=false;this.attrs={};this.textContent='';this.innerHTML='';this.listeners={};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(name,value){this.attrs[name]=String(value);}
  removeAttribute(name){delete this.attrs[name];}
  getAttribute(name){return this.attrs[name]??null;}
  focus(){this.focused=true;}
  querySelector(){return this.firstButton||null;}
  querySelectorAll(){return [];}
}
function harness(){
  const names=['crm-grid','site-grid','site-alerts','site-view-all','site-view-alerts','site-alert-count','alerts-list','active-panel-name','nav-more','mobile-more-menu','mobile-more-close','mobile-more-scrim'];
  const els=Object.fromEntries(names.map(name=>[name,new Element()]));
  els['mobile-more-menu'].firstButton=els['mobile-more-close'];
  const panels=['visao','sites','leads','caixa'].map(panel=>new Element({panel}));
  const controls=[...html.matchAll(/<button class="summary-card[^>]*>/g)].map(match=>{
    const tag=match[0];return new Element({panelTarget:tag.match(/data-panel-target="([^"]+)"/)[1],siteView:tag.match(/data-site-view="([^"]+)"/)?.[1]});
  });
  controls.push(new Element({panelTarget:'sites'}));
  const location={hash:'#visao',href:'https://example.test/#visao',hostname:'example.test',port:''};
  const ctx=vm.createContext({console,Intl,Date,URL,setTimeout,clearTimeout,
    localStorage:{getItem(){return null;},setItem(){}},sessionStorage:{getItem(){return null;},setItem(){}},
    location,history:{pushState(a,b,url){location.hash=url;},replaceState(a,b,url){location.hash=url;}},
    window:{addEventListener(){},scrollTo(){}},
    document:{addEventListener(){},getElementById:id=>els[id]||null,
      querySelector(selector){const id=selector.match(/^\[data-panel="([^"]+)"\]$/)?.[1];return panels.find(p=>p.dataset.panel===id)||null;},
      querySelectorAll(selector){return selector==='.panel-view'?panels:selector==='[data-panel-target]'?controls:[];}}
  });
  vm.runInContext(app,ctx);return {ctx,els,panels,controls,location};
}

test('cada resumo é um botão e abre a área correta; alertas abre a lista, não o relatório geral',()=>{
  const h=harness();assert.equal(h.controls.length,5,'quatro resumos mais controlo Todos');
  vm.runInContext('setupPanelNavigation()',h.ctx);
  for(const control of h.controls){
    control.listeners.click({preventDefault(){}});
    assert.equal(h.location.hash,'#'+control.dataset.panelTarget);
    assert.ok(h.panels.find(p=>p.dataset.panel===control.dataset.panelTarget).classes.has('is-active'));
    if(control.dataset.siteView==='alerts'){
      assert.equal(h.els['site-grid'].hidden,true);assert.equal(h.els['site-alerts'].hidden,false);
      assert.equal(h.els['site-view-alerts'].attrs['aria-pressed'],'true');
    }
  }
  assert.equal(h.els['site-grid'].hidden,false,'Todos volta a mostrar os sites');
  assert.equal(h.els['site-alerts'].hidden,true);
});

test('a lista de alertas reconcilia com os dados reais e distingue ausência de leitura de zero',()=>{
  const h=harness();h.ctx.fixture=live;
  vm.runInContext('live=fixture;sites=fixture.sites;renderAlerts()',h.ctx);
  const count=live.sites.reduce((n,s)=>n+(s.issues||[]).length,0);
  assert.equal(Number(h.els['site-alert-count'].textContent),count);
  assert.equal((h.els['site-alerts'].innerHTML.match(/<li>/g)||[]).length,count);
  assert.match(h.els['site-alerts'].innerHTML,/Ver detalhe técnico/);
  vm.runInContext('live={generatedAt:null,sites:[]};renderAlerts()',h.ctx);
  assert.equal(h.els['site-alert-count'].textContent,'—');
  vm.runInContext('live={generatedAt:new Date().toISOString(),sites:[]};renderAlerts()',h.ctx);
  assert.equal(h.els['site-alert-count'].textContent,0);
  assert.match(h.els['site-alerts'].innerHTML,/Sem alertas/);
});

test('texto dos alertas é escapado e o menu Mais abre, fecha e devolve o foco',()=>{
  const h=harness();
  vm.runInContext('live={generatedAt:new Date().toISOString(),sites:[{id:"x",name:"<img onerror=alert(1)>",issues:[{message:"<script>bad()</script>"}]}]};renderAlerts()',h.ctx);
  assert.doesNotMatch(h.els['site-alerts'].innerHTML,/<script>|<img/);
  assert.match(h.els['site-alerts'].innerHTML,/&lt;script&gt;/);
  vm.runInContext('setMobileMenu(true)',h.ctx);
  assert.equal(h.els['mobile-more-menu'].hidden,false);
  assert.equal(h.els['nav-more'].attrs['aria-expanded'],'true');
  assert.equal(h.els['mobile-more-close'].focused,true);
  vm.runInContext('setMobileMenu(false,true)',h.ctx);
  assert.equal(h.els['mobile-more-menu'].hidden,true);
  assert.equal(h.els['nav-more'].focused,true);
});

test('a ficha mostra valores apenas da carteira ligada e não os transforma em recebimentos',()=>{
  const h=harness();
  vm.runInContext('sites=[{id:"example",name:"Exemplo",repo:"https://github.com/example/project",url:"https://example.test"}];renderCRM()',h.ctx);
  assert.match(h.els['crm-grid'].innerHTML,/Liga a carteira/);
  h.ctx.window.CentroBusinessNeon={context:()=>({clients:[{repositoryUrl:'https://github.com/example/project',pendingEur:12.75}]})};
  vm.runInContext('renderCRM()',h.ctx);
  assert.match(h.els['crm-grid'].innerHTML,/12,75/);
  assert.match(h.els['crm-grid'].innerHTML,/Por receber/);
  assert.equal(vm.runInContext('state.transactions.length',h.ctx),0);
  assert.equal(vm.runInContext('state.pendingPayments.length',h.ctx),0,'não semear cópias locais');
  assert.doesNotMatch(vm.runInContext('businessSprite("<script>bad()</script>")',h.ctx),/<script>/);
});
