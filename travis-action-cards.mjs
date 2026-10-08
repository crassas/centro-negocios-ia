// Front workspace driven by actual host tool results. Text is always inert.
const hud=document.getElementById('travis-hud');
const deck=document.getElementById('travis-action-deck');
const heading=document.getElementById('travis-action-heading');
const items=document.getElementById('travis-action-items');
let current=null,selected=null;
const menu={kind:'capabilities',title:'Your workspace',items:[
  {title:'Repositories',detail:'Inspect your projects',request:'Mostra os meus repositórios'},
  {title:'Tasks',detail:'Read your real task list',request:'Mostra as minhas tarefas'},
  {title:'Agents',detail:'Current executions',request:'Estado dos agentes'},
  {title:'Sites',detail:'Check availability',request:'Verifica os sites'}
]};
function render(data){
  current=data;
  heading.textContent=String(data.title||'Your workspace');
  items.dataset.kind=String(data.kind||'result');
  const rows=Array.isArray(data.items)?data.items.slice(0,30):[];
  items.replaceChildren(...(rows.length?rows:[{title:data.kind==='tasks'?'No pending tasks':'No results',detail:data.kind==='tasks'?'Tell me what you want to add.':'The tool returned no entries.'}]).map(row=>{
    const actionable=typeof row.request==='string'&&row.request.length<=500;
    const card=document.createElement(actionable?'button':'article');
    card.className='travis-action-card';
    if(actionable)card.type='button';
    if(row.project)card.dataset.project=String(row.project);
    card.setAttribute('aria-current',String(Boolean(row.project&&row.project===selected)));
    if(typeof row.available==='boolean')card.dataset.available=String(row.available);
    const title=document.createElement('strong'),detail=document.createElement('span');
    title.textContent=String(row.title||'Result');detail.textContent=String(row.detail||'');
    card.append(title,detail);
    if(actionable)card.addEventListener('click',()=>{
      if(row.project){selected=row.project;window.TravisVisual?.selectProject(selected);}
      for(const sibling of items.children)sibling.setAttribute('aria-current',String(sibling===card));
      window.TravisVisual?.ask(row.request);
    });
    return card;
  }));
  deck.scrollTop=0;
}
function visibility(open){deck.hidden=!open;hud.classList.toggle('cards-open',open);}
if(deck){
  document.getElementById('travis-action-close').addEventListener('click',()=>window.TravisVisual?.commands(false));
  window.addEventListener('travis:commands',e=>{if(e.detail.open&&!current)render(menu);visibility(e.detail.open);});
  window.addEventListener('travis:result',e=>{
    const data=e.detail?.ui;if(!data)return;
    if(data.project)selected=data.project;
    render(data);window.TravisVisual?.commands(true);visibility(true);
  });
  window.addEventListener('travis:close',()=>{visibility(false);current=null;});
}
