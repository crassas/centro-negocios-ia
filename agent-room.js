'use strict';
// Sala operacional: cada posto representa uma fase REAL registada pelo executor.
window.CentroRoom=(()=>{
  const roles=[
    {id:'coordinator',name:'Coordenador',role:'Recepção e fila',color:'#63aa92',home:[12,76],phases:['received'],actions:[]},
    {id:'planner',name:'Planeador',role:'Plano e decisão',color:'#dd9870',home:[31,76],phases:['planning'],actions:['claude_query','jarvis_query']},
    {id:'executor',name:'Operit',role:'Edição e execução',color:'#6384eb',home:[50,76],phases:['editing'],actions:['repo_change','git_pull','git_status','system_info','site_check']},
    {id:'reviewer',name:'Revisor',role:'Testes e controlo',color:'#8b78c9',home:[69,76],phases:['validating'],actions:[]},
    {id:'publisher',name:'Publicador',role:'Commit e publicação',color:'#4d9b78',home:[88,76],phases:['publishing','completed'],actions:[]},
    {id:'scout',name:'Prospector',role:'Novos trabalhos',color:'#c88a52',home:[69,54],phases:[],actions:[]},
    {id:'laya',name:'Laya',role:'Análise rápida · auxiliar',color:'#ac79cf',home:[88,54],phases:[],actions:['laya_status','laya_decide']}
  ];

  const phaseLabels={
    received:'Recepção',
    planning:'Planeamento',
    editing:'Edição',
    validating:'Validação',
    publishing:'Publicação',
    completed:'Concluído',
    blocked:'Bloqueado'
  };

  let taskStats=null,connectionFailed=false,office=null;
  let rows=[],available=false,selected='coordinator',mounted=false,finance=null,conversationBusy=false,lastDetailHTML='',trackedTask='';

  const el=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short=(s,max=72)=>String(s??'').length>max?String(s).slice(0,max-1)+'…':String(s??'');
  const money=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
  const background=t=>['benchmark','stability','selftest','publication-selftest'].includes(String(t.source||''));
  const activeStatus=t=>['pending','queued','running'].includes(String(t?.status||''));
  const phaseOf=t=>{
    const explicit=String(t?.progressPhase||'');
    if(explicit)return explicit;
    if(t?.status==='queued'||t?.status==='pending')return 'received';
    if(t?.status==='running'){
      const a=String(t?.action||'');
      if(a.startsWith('laya_'))return 'laya';
      if(a==='repo_change'||a==='claude_query'||a==='jarvis_query')return 'planning';
      return 'editing';
    }
    if(t?.status==='completed')return Number(t?.exitCode)===0?'completed':'blocked';
    return '';
  };
  const phaseLabel=p=>phaseLabels[p]||p||'Sem fase';

  function sprite(color){
    return '<svg class="room-sprite" viewBox="0 0 24 32" aria-hidden="true" shape-rendering="crispEdges"><ellipse cx="12" cy="30" rx="9" ry="2" fill="#122331" opacity=".18"/><g class="sprite-person"><path d="M7 2h10v3h3v9h-3v3H7v-3H4V5h3z" fill="#e7b99a"/><path d="M7 1h10v2h3v5h-5V5H7v4H4V3h3z" fill="#293747"/><path d="M8 9h2v2H8zm6 0h2v2h-2z" fill="#293747"/><path d="M10 13h4v1h-4z" fill="#a66561"/><path d="M7 17h10v3h3v7H4v-7h3z" fill="'+color+'"/><path d="M4 21h3v5H4zm13 0h3v5h-3z" fill="#e7b99a"/><path d="M7 26h4v5H7zm6 0h4v5h-4z" fill="#293747"/></g></svg>';
  }

  function foregroundRows(){
    const primary=rows.filter(t=>!background(t));
    return primary.length?primary:rows;
  }

  function currentTask(){
    const list=foregroundRows();
    if(trackedTask){
      const tracked=list.find(t=>t.id===trackedTask);
      if(tracked)return tracked;
    }
    return list.find(t=>t.status==='running')
      ||list.find(t=>t.status==='queued')
      ||list.find(t=>t.status==='pending')
      ||list[0]
      ||null;
  }

  function roleForTask(task){
    if(!task)return roles[0];
    const action=String(task.action||'');
    if(action.startsWith('laya_'))return roles.find(r=>r.id==='laya');
    const phase=phaseOf(task);
    return roles.find(r=>r.phases.includes(phase))
      ||roles.find(r=>r.actions.includes(action))
      ||roles.find(r=>r.id==='executor');
  }

  function roleTask(role){
    const list=foregroundRows();
    if(role.id==='laya'){
      return list.find(t=>activeStatus(t)&&String(t.action||'').startsWith('laya_'))
        ||list.find(t=>String(t.action||'').startsWith('laya_'))
        ||null;
    }
    const task=currentTask();
    if(!task)return null;
    return roleForTask(task)?.id===role.id?task:null;
  }

  function model(role){
    if(!available){
      return {state:'unknown',label:connectionFailed?'Sem ligação':'A receber dados',speech:connectionFailed?'Sem ligação':'A ligar',task:null,phase:'',zone:'home'};
    }

    if(role.id==='planner'&&conversationBusy){
      return {state:'working',label:'A analisar o teu pedido',speech:'A analisar',task:null,phase:'planning',zone:'home'};
    }

    const task=roleTask(role);
    if(!task){
      if(role.id==='laya'){
        return {state:'idle',label:'Auxiliar · não bloqueia o fluxo',speech:'',task:null,phase:'',zone:'home'};
      }
      const queued=Number(taskStats?.queued)||0;
      if(role.id==='coordinator'&&queued>0){
        return {state:'waiting',label:queued+' tarefa(s) na fila',speech:queued+' na fila',task:null,phase:'received',zone:'home'};
      }
      if(office?.enabled){
        if(role.id==='coordinator'){
          return {state:'monitoring',label:'Modo autónomo activo · organiza a próxima ronda',speech:'A organizar',task:null,phase:'',zone:'home'};
        }
        if(role.id==='reviewer'){
          return {state:'monitoring',label:'Auditorias técnicas e sites sob vigilância',speech:'A vigiar sites',task:null,phase:'',zone:'home'};
        }
        if(role.id==='scout'){
          const count=Number(office?.opportunityCount)||0;
          return {state:'monitoring',label:'Radar de novos trabalhos · '+count+' sinais guardados',speech:'Radar activo',task:null,phase:'',zone:'home'};
        }
      }
      return {state:'idle',label:'Posto livre',speech:'',task:null,phase:'',zone:'home'};
    }

    const phase=phaseOf(task);
    if(task.status==='pending'){
      return {state:'waiting',label:'Aguarda confirmação importante',speech:'Aguarda decisão',task,phase:'received',zone:'home'};
    }
    if(task.status==='queued'){
      return {state:'waiting',label:'Na fila',speech:'Na fila',task,phase:'received',zone:'home'};
    }
    if(task.status==='running'){
      return {
        state:'working',
        label:task.progressDetail||phaseLabel(phase),
        speech:task.progressDetail?short(task.progressDetail,34):phaseLabel(phase),
        task,phase,zone:'home'
      };
    }
    if(task.status==='completed'&&Number(task.exitCode)!==0){
      return {state:'error',label:'Tarefa bloqueada',speech:'Precisa de atenção',task,phase:'blocked',zone:'home'};
    }

    const fresh=Number(task.completedAt)>0&&Date.now()-Number(task.completedAt)<120000;
    return {
      state:fresh?'done':'idle',
      label:fresh?'Concluído':'Posto livre',
      speech:fresh?'Feito':'',
      task:fresh?task:null,
      phase:'completed',
      zone:'home'
    };
  }

  function mount(){
    if(mounted||!el('room-stations'))return;
    mounted=true;
    el('room-stations').innerHTML=roles.map(r=>
      '<button type="button" class="room-actor" data-room-agent="'+r.id+'" style="--agent-color:'+r.color+';left:'+r.home[0]+'%;top:'+r.home[1]+'%">'+
      '<span class="room-bubble" aria-hidden="true"></span>'+
      sprite(r.color)+
      '<span class="room-paper" aria-hidden="true">▤</span>'+
      '<span class="room-name">'+r.name+'</span>'+
      '<span class="room-role">'+r.role+'</span>'+
      '<span class="room-status"></span>'+
      '</button>'
    ).join('');
    el('room-stations').addEventListener('click',e=>{
      const b=e.target.closest('[data-room-agent]');
      if(b)select(b.dataset.roomAgent);
    });
    document.querySelectorAll('[data-room-centre]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.roomCentre)));
    el('room-detail').addEventListener('click',e=>{
      if(e.target.closest('[data-room-close]')){closeDetail();return;}
      const b=e.target.closest('[data-room-open]');
      if(b)document.dispatchEvent(new CustomEvent('centro-room-open',{detail:b.dataset.roomOpen}));
    });
  }

  function select(id){
    selected=id;
    el('room-detail')?.classList.add('is-open');
    el('room-detail-scrim')?.classList.add('is-open');
    paint();
  }

  function closeDetail(){
    el('room-detail')?.classList.remove('is-open');
    el('room-detail-scrim')?.classList.remove('is-open');
    document.querySelector('[data-room-agent="'+selected+'"], [data-room-centre="'+selected+'"]')?.focus({preventScroll:true});
  }

  // Mantido por compatibilidade. Os postos agora são fixos para não se amontoarem.
  function destination(){return 'home';}
  function position(role){return role.home;}

  function phaseHistoryHTML(task){
    const history=Array.isArray(task?.progressHistory)?task.progressHistory:[];
    if(!history.length)return '';
    return '<div class="room-phase-history">'+history.slice(-6).map(row=>
      '<span><i data-phase="'+escape(row.phase)+'"></i><b>'+escape(phaseLabel(row.phase))+'</b><small>'+escape(short(row.detail||'',72))+'</small></span>'
    ).join('')+'</div>';
  }

  function detail(){
    if(selected==='github'){
      return '<span class="room-centre-icon">⑂</span><span class="room-eyebrow">ZONA GITHUB</span><h2>Os projectos</h2><p>Acesso directo aos cinco repositórios autorizados.</p><div class="room-repo-links">'+['centro-negocios-ia','pente_houselanding','best-pizza-kebab','restaurante-2-irmaos','engomadoria-beatriz'].map(name=>'<a href="https://github.com/crassas/'+name+'" target="_blank" rel="noopener">'+escape(name)+' ↗</a>').join('')+'</div><p class="room-truth">Só commits e resultados registados contam como execução concluída.</p>';
    }
    if(selected==='finance'){
      return '<span class="room-centre-icon">€</span><span class="room-eyebrow">CAIXA</span><h2>O teu financeiro</h2><p>Dinheiro registado na aplicação.</p><strong class="room-money">'+(finance?money(finance.balance):'Sem leitura')+'</strong><div class="room-finance-lines"><span>Entradas <b>'+(finance?money(finance.income):'—')+'</b></span><span>Saídas <b>'+(finance?money(finance.expense):'—')+'</b></span><span>Por receber <b>'+(finance?money(finance.pending):'—')+'</b></span></div><button class="btn" data-room-open="caixa" type="button">Abrir financeiro →</button>';
    }
    if(selected==='plan'){
      return '<span class="room-centre-icon">▤</span><span class="room-eyebrow">FLUXO DE TRABALHO</span><h2>Um pedido, uma fase de cada vez</h2><p>Coordenador → Planeador → Operit → Revisor → Publicador. A Laya é auxiliar e nunca bloqueia este percurso.</p><p class="room-truth">A fase mostrada vem do executor real.</p>';
    }

    if(selected==='scout'){
      const opportunities=Array.isArray(office?.opportunities)?office.opportunities:[];
      const rowsHtml=opportunities.slice(0,6).map(row=>
        '<span><b>'+escape(row.name||'Negócio local')+'</b><small>'+escape(row.category||'')+' · '+escape(row.area||'Porto')+'</small></span>'
      ).join('');
      return '<div class="room-detail-avatar">'+sprite('#c88a52')+'</div>'+
        '<span class="room-eyebrow">NOVOS TRABALHOS</span><h2>Prospector</h2>'+
        '<strong class="room-detail-state" data-state="monitoring">Radar autónomo activo</strong>'+
        '<p>Procura sinais gratuitos em dados públicos. “Sem website registado” não significa “sem website”: cada lead precisa de verificação antes de contacto.</p>'+
        '<div class="room-prospect-list">'+(rowsHtml||'<span><b>Sem sinais guardados</b><small>A próxima ronda volta a procurar.</small></span>')+'</div>'+
        '<p class="room-truth">Fonte actual: OpenStreetMap. Sem outreach automático.</p>';
    }

    const r=roles.find(r=>r.id===selected)||roles[0];
    const m=model(r),t=m.task;
    return '<div class="room-detail-avatar">'+sprite(r.color)+'</div>'+
      '<span class="room-eyebrow">'+escape(r.role)+'</span>'+
      '<h2>'+r.name+'</h2>'+
      '<strong class="room-detail-state" data-state="'+m.state+'">'+escape(m.label)+'</strong>'+
      (r.id==='laya'?'<p class="room-helper-note">Especialista auxiliar. Se estiver indisponível, o trabalho principal continua.</p>':'')+
      '<div class="room-task"><small>'+(t?'TAREFA REGISTADA':'ACTIVIDADE')+'</small><b>'+escape(short(t?.label||t?.action||'Sem tarefa neste posto'))+'</b><span>'+escape(t?.target||'')+'</span>'+
      (t?'<div class="room-current-phase"><em>'+escape(phaseLabel(phaseOf(t)))+'</em><strong>'+escape(t.progressDetail||'')+'</strong></div>'+phaseHistoryHTML(t)+resultHTML(t):'')+
      '</div>';
  }

  function resultHTML(t){
    const output=String(t.output||'');
    const commit=output.match(/Commit: ([a-f0-9]{40})\b/);
    const safeRepo=['centro-negocios-ia','pente_houselanding','best-pizza-kebab','restaurante-2-irmaos','engomadoria-beatriz'].includes(t.target);
    const status=t.status==='pending'?'Aguarda confirmação importante'
      :t.status==='queued'?'Na fila'
      :t.status==='running'?phaseLabel(phaseOf(t))
      :t.status==='rejected'?'Pedido recusado'
      :Number(t.exitCode)===0?'Execução terminada':'Execução com erro';
    return '<details><summary>Ver resultado · '+escape(status)+'</summary><p>ID '+escape(t.id)+' · '+escape(t.exitCode==null?'Resultado pendente':'exit '+t.exitCode)+'</p>'+
      (commit&&safeRepo?'<a href="https://github.com/crassas/'+escape(t.target)+'/commit/'+commit[1]+'" target="_blank" rel="noopener">Ver alteração no GitHub ↗</a>':'')+
      '<pre class="room-result-output">'+escape(output||'Ainda não há resultado final.')+'</pre></details>';
  }

  function summary(){
    if(!available)return {label:connectionFailed?'Actividade sem ligação':'A receber actividade',running:null,queued:null};
    const task=currentTask();
    if(task?.status==='running'){
      return {
        label:phaseLabel(phaseOf(task))+' · '+short(task.target||task.label||'tarefa',42),
        running:Number(taskStats?.running)||1,
        queued:Number(taskStats?.queued)||0
      };
    }
    if(Number(taskStats?.queued)>0)return {label:'Fila pronta para avançar',running:Number(taskStats?.running)||0,queued:Number(taskStats?.queued)||0};
    if(task?.status==='completed'&&Number(task.exitCode)!==0)return {label:'Última tarefa precisa de atenção',running:0,queued:Number(taskStats?.queued)||0};
    if(office?.enabled){
      const mins=office.nextCycleAt?Math.max(0,Math.ceil((Number(office.nextCycleAt)-Date.now())/60000)):null;
      return {
        label:'Escritório autónomo · '+(mins==null?'vigilância activa':'próxima ronda em '+mins+' min'),
        running:Number(taskStats?.running)||0,
        queued:Number(taskStats?.queued)||0
      };
    }
    return {label:'Escritório pronto',running:Number(taskStats?.running)||0,queued:Number(taskStats?.queued)||0};
  }

  function paintPipeline(){
    const task=currentTask();
    const phase=task?phaseOf(task):'';
    const order=['received','planning','editing','validating','publishing'];
    document.querySelectorAll('[data-room-phase]').forEach(node=>{
      const p=node.dataset.roomPhase;
      node.classList.toggle('is-active',Boolean(task&&task.status==='running'&&p===phase));
      node.classList.toggle('is-done',Boolean(task&&(
        task.status==='completed' || (order.includes(phase)&&order.indexOf(p)<order.indexOf(phase))
      )));
    });
    const job=el('room-current-job');
    if(job)job.textContent=task
      ? (short(task.label||task.action||'Tarefa',48)+(task.target?' · '+task.target:''))
      : (office?.enabled?short(office.lastAction||'Vigilância automática activa',68):'Sem tarefa activa');
  }

  function paint(){
    mount();
    if(!mounted)return;

    for(const r of roles){
      const m=model(r);
      const b=document.querySelector('[data-room-agent="'+r.id+'"]');
      if(!b)continue;
      const p=position(r,m);
      b.dataset.state=m.state;
      b.dataset.phase=m.phase||'';
      b.style.left=p[0]+'%';
      b.style.top=p[1]+'%';
      b.setAttribute('aria-pressed',String(r.id===selected));
      const bubble=b.querySelector('.room-bubble');
      bubble.textContent=m.speech||'';
      bubble.hidden=!m.speech;
      b.querySelector('.room-status').textContent=m.state==='working'?phaseLabel(m.phase):m.state==='monitoring'?'Vigilância':m.state==='waiting'?'Na fila':m.state==='error'?'Atenção':m.state==='unknown'?'Sem ligação':m.state==='done'?'Concluído':'Livre';
      b.setAttribute('aria-label',r.name+': '+m.label);
    }

    paintPipeline();
    document.querySelectorAll('[data-room-centre]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.roomCentre===selected)));

    const detailHTML='<button type="button" class="room-detail-close" data-room-close aria-label="Fechar detalhe">×</button>'+detail();
    const resultOpen=Boolean(el('room-detail').querySelector('details')?.open);
    if(detailHTML!==lastDetailHTML){
      el('room-detail').innerHTML=detailHTML;
      lastDetailHTML=detailHTML;
      const result=el('room-detail').querySelector('details');
      if(result&&resultOpen)result.open=true;
    }

    const requests=foregroundRows();
    const feed=trackedTask?[...requests.filter(t=>t.id===trackedTask),...requests.filter(t=>t.id!==trackedTask)]:requests;
    const feedHTML=feed.slice(0,4).map(t=>
      '<li><i data-state="'+(t.status==='running'?'working':t.status==='completed'&&Number(t.exitCode)!==0?'error':'idle')+'"></i><div><b>'+escape(short(t.label||t.action||'Tarefa',58))+'</b><span>'+escape(t.target||'Centro')+' · '+escape(phaseLabel(phaseOf(t)))+'</span>'+resultHTML(t)+'</div></li>'
    ).join('')||'<li>Sem tarefas recebidas.</li>';
    if(el('room-feed').dataset.content!==feedHTML){
      const opened=[...el('room-feed').querySelectorAll('details')].map(d=>d.open);
      el('room-feed').innerHTML=feedHTML;
      el('room-feed').dataset.content=feedHTML;
      el('room-feed').querySelectorAll('details').forEach((d,i)=>{d.open=Boolean(opened[i]);});
    }

    const overview=summary();
    if(el('room-operation-state')){
      el('room-operation-state').textContent=overview.label;
      el('room-operation-state').dataset.connected=String(available);
    }
    if(el('room-running-count'))el('room-running-count').textContent=overview.running??'—';
    if(el('room-queued-count'))el('room-queued-count').textContent=overview.queued??'—';
    if(el('room-cash-value'))el('room-cash-value').textContent=finance?money(finance.balance):'Sem leitura';
  }

  function update(payload){
    connectionFailed=false;
    taskStats=payload?.stats&&typeof payload.stats==='object'?payload.stats:null;
    rows=Array.isArray(payload?.executions)?payload.executions:[];
    office=payload?.office&&typeof payload.office==='object'?payload.office:null;
    available=true;
    if(trackedTask){
      const tracked=rows.find(t=>t.id===trackedTask);
      if(tracked)selected=roleForTask(tracked)?.id||selected;
    }
    paint();
    if(el('room-sync'))el('room-sync').textContent='Actualizado às '+new Date().toLocaleTimeString('pt-PT');
  }

  function offline(){
    available=false;
    connectionFailed=true;
    paint();
    if(el('room-sync'))el('room-sync').textContent='Sem ligação · actividade anterior';
  }

  function setFinance(value){finance=value;paint();}
  function setConversationBusy(value){conversationBusy=Boolean(value);paint();}

  document.addEventListener('DOMContentLoaded',()=>{
    paint();
    el('room-detail-scrim')?.addEventListener('click',closeDetail);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
  });

  function trackTask(id){
    trackedTask=String(id||'');
    const task=rows.find(t=>t.id===trackedTask);
    selected=task?(roleForTask(task)?.id||'coordinator'):'coordinator';
    paint();
  }

  return {update,offline,model,destination,position,setFinance,setConversationBusy,summary,trackTask,resultHTML};
})();
