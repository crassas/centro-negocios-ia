// Front workspace driven by actual host tool results. Text is always inert.
import {hologramPresentation as projection} from './travis-presence.mjs?v=1';
const hud=document.getElementById('travis-hud');
const deck=document.getElementById('travis-action-deck');
const heading=document.getElementById('travis-action-heading');
const items=document.getElementById('travis-action-items');
let current=null,selected=null,frame=0,wasVisible=false;
const clock=()=>performance.now()/1000;
const pin=document.getElementById('travis-action-pin');
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
function paint(){
  frame=0;
  const view=projection.sample(clock());
  deck.hidden=!view.visible;
  deck.inert=view.panel<.65;
  deck.style.setProperty('--projection-opacity',view.panel.toFixed(3));
  deck.style.setProperty('--projection-shift',`${((1-view.panel)*18).toFixed(1)}px`);
  hud.style.setProperty('--travis-presence',(1-view.amount).toFixed(3));
  hud.dataset.projection=view.phase;
  hud.classList.toggle('cards-open',view.visible);
  pin?.setAttribute('aria-pressed',String(view.pinned));
  if(wasVisible&&!view.visible){
    if(deck.contains(document.activeElement))document.getElementById('travis-hud-close')?.focus({preventScroll:true});
    window.TravisVisual?.commands(false,{automatic:true});
  }
  wasVisible=view.visible;
  if(view.visible)frame=requestAnimationFrame(paint);
}
function refresh(){if(!frame)frame=requestAnimationFrame(paint);}
function show(automatic=false){
  const text=items.textContent||'';
  projection.present(clock(),{auto:automatic,readingSeconds:Math.max(10,text.length/28)});
  refresh();
}
if(deck){
  document.getElementById('travis-action-close').addEventListener('click',()=>window.TravisVisual?.commands(false));
  pin?.addEventListener('click',()=>{
    const pinned=projection.pin(pin.getAttribute('aria-pressed')!=='true',clock());
    pin.setAttribute('aria-pressed',String(pinned));refresh();
  });
  for(const event of ['pointerdown','wheel','keydown','focusin'])deck.addEventListener(event,()=>projection.interact(clock()),{passive:true});
  window.addEventListener('travis:state',e=>projection.speaking(e.detail.state==='speaking',clock()));
  window.addEventListener('travis:commands',e=>{
    if(e.detail.open){if(!current)render(menu);show(Boolean(e.detail.automatic));}
    else{projection.close(clock());refresh();}
  });
  window.addEventListener('travis:result',e=>{
    const data=e.detail?.ui;if(!data)return;
    if(data.project)selected=data.project;
    render(data);window.TravisVisual?.commands(true,{automatic:true});
    show(true);
  });
  window.addEventListener('travis:close',()=>{
    cancelAnimationFrame(frame);frame=0;projection.reset();wasVisible=false;current=null;paint();
  });
}
