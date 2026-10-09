export function createBrainPanel(onSnapshot,onGraph=()=>{},onEvents=()=>{}){
  const hud=document.querySelector('#travis-hud');
  const panel=document.createElement('section');panel.className='travis-brain-panel';panel.setAttribute('aria-label','Atividade do cérebro funcional');
  const title=document.createElement('h2');title.textContent='REDE COGNITIVA';
  const state=document.createElement('p');state.className='brain-phase';state.textContent='A ligar ao núcleo funcional…';
  const counts=document.createElement('p');counts.className='brain-counts';
  const activity=document.createElement('p');activity.className='brain-activity';
  const graphCount=document.createElement('p');graphCount.className='brain-graph-count';graphCount.textContent='A verificar memórias persistidas…';
  const selected=document.createElement('p');selected.className='brain-selected-memory';selected.setAttribute('aria-live','polite');
  panel.append(title,state,counts,activity,graphCount,selected);hud.append(panel);
  const journalButton=document.createElement('button');journalButton.type='button';journalButton.className='travis-brain-journal-button';journalButton.textContent='DIÁRIO DOS CICLOS';journalButton.hidden=true;hud.append(journalButton);
  const dialog=document.createElement('dialog');dialog.className='travis-brain-journal';dialog.setAttribute('aria-labelledby','brain-journal-title');
  const header=document.createElement('header'),heading=document.createElement('h2');heading.id='brain-journal-title';heading.textContent='Diário do cérebro';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Fechar diário');header.append(heading,close);
  const note=document.createElement('p');note.className='brain-journal-note';note.textContent='Simulações e reflexão sobre experiências registadas. As hipóteses ficam separadas da memória factual.';
  const functions=document.createElement('details'),functionsTitle=document.createElement('summary'),modules=document.createElement('dl');
  functions.className='brain-functions';functionsTitle.textContent='Funções e regiões';functions.append(functionsTitle,modules);
  const records=document.createElement('div');records.className='brain-journal-records';
  const pause=document.createElement('button');pause.type='button';pause.className='brain-cycle-pause';pause.textContent='Pausar ciclos automáticos';
  dialog.append(header,note,functions,records,pause);hud.append(dialog);
  let shown=false,disposed=false,timer=0,controller=null,snapshot=null,recordKey='',lastGraphPoll=0,lastEventsPoll=0;
  const phases={awake:'DISPONÍVEL',consolidating:'A CONSOLIDAR MEMÓRIA',dreaming:'SIMULAÇÃO AUTÓNOMA',resting:'EM REPOUSO'};
  const date=value=>new Date(value*1000).toLocaleString('pt-PT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  function journal(data){
    const key=JSON.stringify((data.journal||[]).map(x=>x.id));if(key===recordKey)return;recordKey=key;records.replaceChildren();
    if(!data.journal?.length){const p=document.createElement('p');p.textContent='O primeiro registo aparece após um ciclo autónomo de repouso.';records.append(p);return;}
    for(const item of data.journal){
      const article=document.createElement('article'),meta=document.createElement('small'),h=document.createElement('h3');
      meta.textContent=date(item.created)+' · '+(item.kind==='dream'?'SONHO SIMULADO':'REFLEXÃO FILOSÓFICA');h.textContent=item.title;article.append(meta,h);
      const keys=item.kind==='dream'?['scenario','alternative','test','draft']:['question','thesis','objection','test','draft'];
      const labels={scenario:'Cenário',alternative:'Alternativa',test:'Como testar',question:'Pergunta',thesis:'Argumento',objection:'Objeção',draft:'Exploração pelo modelo local'};
      for(const key of keys)if(item.body?.[key]){const p=document.createElement('p'),b=document.createElement('strong');b.textContent=labels[key]+': ';p.append(b,document.createTextNode(item.body[key]));article.append(p);}
      const sources=document.createElement('small');sources.textContent=(item.source_ids?.length||0)+' experiências de origem · hipótese por verificar';article.append(sources);records.append(article);
    }
  }
  async function poll(){
    clearTimeout(timer);if(disposed||!shown||document.hidden)return;
    controller?.abort();controller=new AbortController();const expiry=setTimeout(()=>controller?.abort(),4500);
    try{
      const response=await fetch('/brain/state',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(!data.ok||!data.modules)throw Error('Invalid brain state');
      snapshot=data;onSnapshot(data);
      modules.replaceChildren();for(const module of data.modules){const name=document.createElement('dt'),description=document.createElement('dd');name.textContent=module.name;description.textContent=module.function+(module.active?' · atividade recente':'');modules.append(name,description);}
      state.textContent=data.paused?'CICLOS EM PAUSA':(phases[data.phase]||data.phase);
      counts.textContent=data.counts.episodes+' experiências · '+data.counts.associations+' associações · '+data.counts.cycles+' ciclos';
      const recent=data.modules.filter(m=>m.active).sort((a,b)=>(b.at||0)-(a.at||0));
      activity.textContent=recent.length?recent[0].function:data.reason;
      panel.dataset.connected='true';pause.textContent=data.paused?'Retomar ciclos automáticos':'Pausar ciclos automáticos';pause.setAttribute('aria-pressed',String(data.paused));journal(data);
      if(Date.now()-lastGraphPoll>6500){
        lastGraphPoll=Date.now();
        try{
          const result=await fetch('/brain/graph',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal});
          if(!result.ok)throw Error('HTTP '+result.status);
          const saved=await result.json();
          if(!saved.ok||saved.source!=='local-sqlite'||!Array.isArray(saved.nodes)||!Array.isArray(saved.links))throw Error('Invalid persisted graph');
          onGraph(saved);
          graphCount.textContent=saved.nodes.length+' memórias verificadas · '+saved.links.length+' ligações persistidas';
        }catch(error){
          onGraph(null);graphCount.textContent='REDE LOCAL INDISPONÍVEL';
        }
      }

      if(Date.now()-lastEventsPoll>2100){
        lastEventsPoll=Date.now();
        try{
          const response=await fetch('/brain/events',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal});
          if(!response.ok)throw Error('HTTP '+response.status);
          const observed=await response.json();
          if(!observed.ok||observed.source!=='brain-sqlite'||!Array.isArray(observed.events))throw Error('Invalid event telemetry');
          onEvents(observed);
        }catch{onEvents(null);}
      }
    }catch(error){
      if(disposed)return;snapshot=null;onSnapshot(null);onGraph(null);onEvents(null);counts.textContent='Sem dados atuais';graphCount.textContent='REDE LOCAL INDISPONÍVEL';state.textContent='SEM LIGAÇÃO AO NÚCLEO';activity.textContent='A aguardar dados atuais do servidor.';panel.dataset.connected='false';
    }finally{clearTimeout(expiry);if(shown&&!disposed)timer=setTimeout(poll,2400);}
  }
  const openJournal=()=>{if(!dialog.open)dialog.showModal();};
  const closeJournal=()=>{dialog.close();journalButton.focus();};
  const togglePause=async()=>{
    if(!snapshot)return;pause.disabled=true;
    try{const response=await fetch('/brain/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!snapshot.paused}),signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();await poll();}
    catch{note.textContent='Não foi possível alterar o estado dos ciclos. Tenta novamente.';}finally{pause.disabled=false;}
  };
  const visibility=()=>{if(document.hidden){controller?.abort();clearTimeout(timer);}else if(shown)poll();};
  const closeHud=()=>{shown=false;onEvents(null);controller?.abort();clearTimeout(timer);if(dialog.open)dialog.close();};
  journalButton.addEventListener('click',openJournal);close.addEventListener('click',closeJournal);pause.addEventListener('click',togglePause);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('travis:close',closeHud);
  return {
    setSelectedMemory(memory){
      selected.textContent=memory?('MEMÓRIA: '+memory.title+' · '+memory.kind+' · origem '+memory.sourceType):'';
    },
    setVisible(value){panel.hidden=!value;journalButton.hidden=!value;if(value===shown)return;shown=value;if(value)poll();else{controller?.abort();clearTimeout(timer);if(dialog.open)dialog.close();}},
    dispose(){disposed=true;controller?.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('travis:close',closeHud);panel.remove();journalButton.remove();dialog.remove();}
  };
}
