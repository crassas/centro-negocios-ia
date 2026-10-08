// Front workspace driven by actual host tool results. Text is always inert.
import {hologramPresentation as projection} from './travis-presence.mjs?v=2';
import {mountYouTube,closeYouTube,controlYouTube,youtubeState} from './travis-youtube.mjs?v=2';
const hud=document.getElementById('travis-hud');
const deck=document.getElementById('travis-action-deck');
const heading=document.getElementById('travis-action-heading');
const items=document.getElementById('travis-action-items');
let current=null,selected=null,frame=0,wasVisible=false;
const clock=()=>performance.now()/1000;
const menu={kind:'capabilities',title:'Your workspace',items:[
  {title:'Repositories',detail:'Inspect your projects',request:'Mostra os meus repositórios'},
  {title:'Tasks',detail:'Read your real task list',request:'Mostra as minhas tarefas'},
  {title:'Agents',detail:'Current executions',request:'Estado dos agentes'},
  {title:'Sites',detail:'Check availability',request:'Verifica os sites'}
]};
function render(data){
  // Keep the real search choices available if a selected video cannot be embedded.
  if(data.kind==='youtube'&&data.videoId&&current?.kind==='youtube'){
    data={...data,query:current.query||data.query,items:data.items?.length?data.items:current.items};
  }
  closeYouTube();
  current=data;
  heading.textContent=String(data.title||'Your workspace');
  items.dataset.kind=String(data.kind||'result');
  const rows=Array.isArray(data.items)?data.items.slice(0,30):[];
  items.replaceChildren();
  if(data.kind==='youtube')mountYouTube(data,items);
  const entries=rows.length?rows:data.kind==='youtube'?[]:[{title:data.kind==='tasks'?'No pending tasks':'No results',detail:data.kind==='tasks'?'Tell me what you want to add.':'The tool returned no entries.'}];
  items.append(...entries.map((row,index)=>{
    const actionable=typeof row.request==='string'&&row.request.length<=500;
    const card=document.createElement(actionable?'button':'article');
    card.className='travis-action-card';
    if(actionable)card.type='button';
    if(row.project)card.dataset.project=String(row.project);
    card.setAttribute('aria-current',String(Boolean(row.project&&row.project===selected)));
    if(typeof row.available==='boolean')card.dataset.available=String(row.available);
    const number=document.createElement('span');number.className='travis-holo-number';number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
    const title=document.createElement('strong'),detail=document.createElement('span');
    title.textContent=String(row.title||'Result');detail.textContent=String(row.detail||'');
    card.append(number,title,detail);
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
  if(wasVisible&&!view.visible){
    if(deck.contains(document.activeElement))document.getElementById('travis-hud-close')?.focus({preventScroll:true});
    window.TravisVisual?.commands(false,{automatic:true});
  }
  wasVisible=view.visible;
  if(view.visible)frame=requestAnimationFrame(paint);
}
function refresh(){if(!frame)frame=requestAnimationFrame(paint);}
function show(){
  projection.present(clock());
  refresh();
}
if(deck){
  document.getElementById('travis-action-close').addEventListener('click',()=>window.TravisVisual?.commands(false));
  window.addEventListener('travis:commands',e=>{
    if(e.detail.open){if(!current)render(menu);show(Boolean(e.detail.automatic));}
    else{closeYouTube();projection.close(clock());refresh();}
  });
  window.addEventListener('travis:result',e=>{
    const data=e.detail?.ui;if(!data)return;
    if(data.project)selected=data.project;
    render(data);window.TravisVisual?.commands(true,{automatic:true});
    show(true);
  });
  window.addEventListener('travis:close',()=>{
    closeYouTube();cancelAnimationFrame(frame);frame=0;projection.reset();wasVisible=false;current=null;paint();
  });
  window.TravisProjection=Object.freeze({
    media:youtubeState,
    action(result){
      if(result?.action==='close_projection'){
        closeYouTube();window.TravisVisual?.commands(false);return {reply:'Back with you.'};
      }
      const receipt=controlYouTube(result?.action);
      if(result?.action==='close_youtube'&&receipt){
        if(current?.kind==='youtube'){window.TravisVisual?.commands(false);current=null;}
      }
      return receipt;
    },
    select(text){
      const t=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      const match=t.match(/^(?:travis[, ]+)?(?:abre|seleciona|selecciona|escolhe|quero|open|select|choose)\s+(?:o |a |the )?(primeiro|primeira|first|segundo|segunda|second|terceiro|terceira|third|quarto|quarta|fourth|quinto|quinta|fifth|[1-9])(?:\s+(?:video|resultado|projeto))?[.!?]*$/);
      if(!match||deck.hidden)return null;
      const words=['primeiro primeira first','segundo segunda second','terceiro terceira third','quarto quarta fourth','quinto quinta fifth'];
      const index=/^[1-9]$/.test(match[1])?Number(match[1])-1:words.findIndex(s=>s.split(' ').includes(match[1]));
      const row=current?.items?.[index];if(!row?.request)return null;
      if(row.project){selected=row.project;window.TravisVisual?.selectProject(selected);}
      const cards=[...items.querySelectorAll('.travis-action-card')];cards.forEach((card,i)=>card.setAttribute('aria-current',String(i===index)));
      return row.request;
    }
  });
}
