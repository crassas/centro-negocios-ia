// Front workspace driven by actual host tool results. Text is always inert.
import {hologramPresentation as projection} from './travis-presence.mjs?v=3';
import {mountYouTube,closeYouTube,controlYouTube,youtubeState} from './travis-youtube.mjs?v=3';
import {parseVisualIntent,rewriteEnglishToolRequest,mayNeedVisualModel} from './travis-english-intents.mjs?v=2';
const hud=document.getElementById('travis-hud');
const deck=document.getElementById('travis-action-deck');
const heading=document.getElementById('travis-action-heading');
const items=document.getElementById('travis-action-items');
let current=null,selected=null,frame=0,wasVisible=false,returnTimer=0,pinned=false,highlighted=0,renderVersion=0;
const planetSequence=['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'];
function canReturn(){
  if(!current||pinned||current.autoReturn===false)return false;
  return true;
}
function scheduleReturn(delay=13000){
  clearTimeout(returnTimer);returnTimer=0;
  if(!canReturn())return;
  returnTimer=setTimeout(()=>{
    if(!canReturn())return;
    if(youtubeState().playing || hud.dataset.state==='speaking'||hud.dataset.state==='thinking'){
      scheduleReturn(3200);return;
    }
    window.TravisVisual?.commands(false,{automatic:true});
  },Math.max(2200,delay));
}
function touchProjection(){if(current)scheduleReturn(16500);}
function updatePin(){
  hud.dataset.projectionPinned=String(pinned);
  heading.title=pinned?'Pinned until you dismiss it':'Returns to Travis automatically';
}
const schematic=(scene,title)=>{
  const names={planet:'PLANETARY CONCEPT',map:'SCHEMATIC MAP',house:'ARCHITECTURAL WIREFRAME',
    person:'HUMAN FIGURE CONCEPT',vehicle:'VEHICLE CONCEPT',landscape:'NATURE CONCEPT',
    diagram:'CONCEPT DIAGRAM',object:'OBJECT WIREFRAME'};
  const summaries={planet:'Illustrative orbital model, not NASA imagery.',
    map:'Illustrative route grid, not live geography or verified coordinates.',
    house:'Conceptual building geometry, not a survey or architectural plan.',
    person:'Generic holographic figure, not a reconstruction of a real person.',
    vehicle:'Conceptual vehicle form; not a measured vehicle or CAD model.',
    landscape:'Illustrative landscape, not a georeferenced place.',
    diagram:'Conceptual arrangement; not a verified engineering diagram.',
    object:'Generic particle concept, not a scan of a physical object.'};
  const result={kind:'illustration',scene,title:String(title||names[scene]).slice(0,110),
    summary:summaries[scene],autoReturn:true,items:[]};
  if(scene==='map'){
    const query=String(title||'').replace(/^(?:the )?(?:(?:street|city|location) )?maps? (?:of |for |around |in )?/i,'').trim();
    if(query && query.toLowerCase()!=='location map')result.items.push({
      title:'View the actual map',detail:'Open an external, georeferenced map for '+query.slice(0,65),
      url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query.slice(0,120))
    });
  }
  return result;
};
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
  current={...data,autoReturn:data.autoReturn!==false};pinned=false;highlighted=0;renderVersion++;
  clearTimeout(returnTimer);updatePin();
  hud.dataset.projectionKind=String(data.kind||'result');
  window.dispatchEvent(new CustomEvent('travis:illustration',{detail:{
    scene:data.kind==='illustration'?data.scene:null,subject:data.title||''
  }}));
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)deck.animate?.([{opacity:0,filter:'blur(9px)',transform:'translate(-50%, 16px) scale(.97)'},{opacity:1,filter:'blur(0px)',transform:'translate(-50%, 0) scale(1)'}],{duration:750,easing:'cubic-bezier(.16,1,.3,1)'});
  heading.textContent=String(data.title||'Your workspace');
  items.dataset.kind=String(data.kind||'result');
  const rows=Array.isArray(data.items)?data.items.slice(0,30):[];
  items.replaceChildren();
  if(data.summary){const paragraph=document.createElement('p');paragraph.className='travis-projection-summary';paragraph.textContent=String(data.summary);items.append(paragraph);}
  if(data.kind==='illustration'){const label=document.createElement('p');label.className='travis-projection-caption';label.textContent='CINEMATIC · CONCEPTUAL VIEW';items.append(label);}
  if(data.kind==='youtube')mountYouTube(data,items);
  const entries=rows.length?rows:(data.kind==='youtube'||data.kind==='illustration')?[]:[{title:data.kind==='tasks'?'No pending tasks':'No results',detail:data.kind==='tasks'?'Tell me what you want to add.':'The tool returned no entries.'}];
  items.append(...entries.map((row,index)=>{
    const actionable=typeof row.request==='string'&&row.request.length<=500;
    const card=document.createElement(actionable?'button':'article');
    card.className='travis-action-card';
    if(actionable)card.type='button';
    if(row.project)card.dataset.project=String(row.project);
    card.setAttribute('aria-current',String(Boolean(row.project&&row.project===selected)||Boolean(row.videoId&&row.videoId===data.videoId)));
    if(typeof row.available==='boolean')card.dataset.available=String(row.available);
    const number=document.createElement('span');number.className='travis-holo-number';number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
    if(/^[A-Za-z0-9_-]{11}$/.test(String(row.videoId||''))){const image=document.createElement('img');image.src='https://i.ytimg.com/vi/'+row.videoId+'/mqdefault.jpg';image.alt='';image.loading='lazy';image.className='travis-video-preview';card.append(image);}
    const title=document.createElement('strong'),detail=document.createElement('span');
    title.textContent=String(row.title||'Result');detail.textContent=String(row.detail||'');
    card.append(number,title,detail);card.style.setProperty('--entry',String(Math.min(index,7)));
    if(row.url&&!actionable){try{const url=new URL(row.url);if(['https:','http:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='↗';link.setAttribute('aria-label','Open source');link.addEventListener('click',e=>e.stopPropagation());detail.append(' ',link);}}catch{}}
    if(actionable)card.addEventListener('click',()=>{
      if(row.project){selected=row.project;window.TravisVisual?.selectProject(selected);}
      for(const sibling of items.children)sibling.setAttribute('aria-current',String(sibling===card));
      window.TravisVisual?.ask(row.request);
    });
    return card;
  }));
  deck.scrollTop=0;
  scheduleReturn(18000);
}
function paint(){
  frame=0;
  const view=projection.sample(clock());
  const immersive=current?.kind==='illustration';
  // Geometry occupies the centre: never cover planets/houses with repositories.
  deck.hidden=!view.visible||immersive;
  deck.inert=immersive||view.panel<.65;
  hud.dataset.immersive=String(Boolean(view.visible&&immersive));
  deck.style.setProperty('--projection-opacity',view.panel.toFixed(3));
  deck.style.setProperty('--projection-shift',`${((1-view.panel)*18).toFixed(1)}px`);
  hud.style.setProperty('--travis-presence',(1-view.amount).toFixed(3));
  hud.dataset.projection=view.phase;
  hud.classList.toggle('cards-open',view.visible);
  if(wasVisible&&!view.visible){
    if(deck.contains(document.activeElement))document.getElementById('travis-hud-close')?.focus({preventScroll:true});
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
    else{
      clearTimeout(returnTimer);closeYouTube();projection.close(clock());refresh();
      pinned=false;current=null;updatePin();
      const version=++renderVersion;
      setTimeout(()=>{
        if(version===renderVersion&&!projection.sample(clock()).visible)
          window.dispatchEvent(new CustomEvent('travis:illustration',{detail:{scene:null}}));
      },1350);
    }
  });
  window.addEventListener('travis:result',e=>{
    const data=e.detail?.ui;if(!data)return;
    if(data.project)selected=data.project;
    render(data);window.TravisVisual?.commands(true,{automatic:true});
    show(true);
  });
  window.addEventListener('travis:speech-end',()=>scheduleReturn(current?.kind==='illustration'?10500:13500));
  window.addEventListener('travis:user-start',()=>clearTimeout(returnTimer));
  window.addEventListener('travis:state',event=>{
    if(event.detail?.state==='speaking'||event.detail?.state==='thinking')clearTimeout(returnTimer);
    else if(event.detail?.state==='ready'&&current)scheduleReturn(12000);
  });
  for(const event of ['pointerdown','touchstart','scroll','focusin','keydown']){
    deck.addEventListener(event,touchProjection,{passive:true});
  }
  window.addEventListener('travis:close',()=>{clearTimeout(returnTimer);renderVersion++;
    closeYouTube();cancelAnimationFrame(frame);frame=0;projection.reset();wasVisible=false;current=null;pinned=false;paint();
  });
  window.TravisProjection=Object.freeze({
    media:youtubeState,
    mayNeedModel:mayNeedVisualModel,
    applyModelIntent(result,text=''){
      const valid=['planet','map','house','person','vehicle','landscape','diagram','object'];
      if(result?.ok!==true||!valid.includes(result.scene)
          ||typeof result.title!=='string'||result.title.length>110)return null;
      const pt=/\b(?:quero|gostava|apetece|imagina|podes|consegues|como|seria|mostra)\b/i.test(text);
      render(schematic(result.scene,result.title));
      window.TravisVisual?.commands(true,{automatic:true});show();
      return {handled:true,language:pt?'pt':'en',
        reply:pt?'A projetar '+result.title+'.':'Projecting '+result.title+'.',
        kind:'scene',source:'local-language-model'};
    },
    status:()=>({kind:current?.kind||null,scene:current?.scene||null,pinned,
      autoReturn:current?.autoReturn!==false,highlighted}),
    interpret(text){
      // The first-stage router is open-vocabulary for visual requests; unseen
      // subjects become a labelled conceptual particle shape, not a workspace.

      const intent=parseVisualIntent(text,{
        active:Boolean(current&&projection.sample(clock()).visible),
        kind:current?.kind||''
      });
      if(!intent){
        const rewritten=rewriteEnglishToolRequest(text);
        return rewritten!==text?{handled:false,rewritten}:null;
      }
      if(intent.type==='scene'){
        if(intent.scene==='planet'&&/\b(?:random|any|aleatorio|aleatória|aleatoria|qualquer)\b/i.test(String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'')))
          intent.title=planetSequence[Math.floor(Math.random()*planetSequence.length)];
        render(schematic(intent.scene,intent.title));
        window.TravisVisual?.commands(true,{automatic:true});show();
        return {handled:true,reply:intent.language==='pt'
          ?'A projetar '+intent.title+'.':'Projecting '+intent.title+'.',
          language:intent.language||'en',kind:'scene'};
      }
      if(intent.type==='dismiss'){
        window.TravisVisual?.commands(false,{automatic:true});
        return {handled:true,reply:'Returning to core.',kind:'dismiss'};
      }
      if(intent.type==='pin'){
        pinned=true;updatePin();clearTimeout(returnTimer);
        return {handled:true,reply:'I will leave this open.',kind:'pin'};
      }
      if(intent.type==='unpin'){
        pinned=false;updatePin();scheduleReturn(10500);
        return {handled:true,reply:'Automatic return is enabled.',kind:'unpin'};
      }
      if(intent.type==='control'){
        const action=intent.action;
        if((action==='next'||action==='previous')&&current?.scene==='planet'){
          const index=planetSequence.findIndex(name=>current.title?.toLowerCase().includes(name.toLowerCase()));
          const next=(index+(action==='next'?1:-1)+planetSequence.length)%planetSequence.length;
          render(schematic('planet',planetSequence[next]));
          window.TravisVisual?.commands(true,{automatic:true});show();
          return {handled:true,reply:'Projecting '+planetSequence[next]+'.',kind:'scene'};
        }
        if(action==='next'||action==='previous'){
          const rows=current?.items||[];
          if(!rows.length)return {handled:true,reply:'There are no other results in this view.',kind:'control'};
          highlighted=(highlighted+(action==='next'?1:-1)+rows.length)%rows.length;
          const cards=items.querySelectorAll('.travis-action-card');
          cards.forEach((card,index)=>card.setAttribute('aria-current',String(index===highlighted)));
          cards[highlighted]?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
          touchProjection();
          return {handled:true,reply:'Result '+(highlighted+1)+'.',kind:'control'};
        }
        window.dispatchEvent(new CustomEvent('travis:visual-control',{detail:{action}}));
        touchProjection();
        return {handled:true,reply:'',kind:'control'};
      }
      return null;
    },
    action(result){
      if(result?.action==='close_projection'){
        closeYouTube();window.TravisVisual?.commands(false);return {ok:true};
      }
      const receipt=controlYouTube(result?.action);
      if(result?.action==='close_youtube'&&receipt){
        if(current?.kind==='youtube'){window.TravisVisual?.commands(false);current=null;}
      }
      return receipt;
    },
    select(text){
      const t=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      // Media selection is resolved from the server's session-scoped search results.
      if(current?.kind==='youtube')return null;
      if(/^(?:open|select|choose|show)(?: the)? (?:highlighted|selected|current)(?: one| result)?$/.test(t)){
        const row=current?.items?.[highlighted];
        return row?.request||null;
      }
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
