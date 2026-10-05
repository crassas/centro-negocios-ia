'use strict';
// Visual roles are linked to recorded tasks; movement does not imply an observed execution substep.
window.CentroRoom=(()=>{
  const roles=[
    {id:'executor',name:'Operit',role:'Execução e Git',color:'#6384eb',home:[15,77],match:r=>!/^laya|^claude/.test(String(r.action||''))},
    {id:'laya',name:'Laya',role:'Decisão e encaminhamento',color:'#ac79cf',home:[38,77],match:r=>String(r.action||'').startsWith('laya')},
    {id:'claude',name:'Claude / fallback',role:'Planeamento e código',color:'#dd9870',home:[62,77],match:r=>/claude|repo_change/.test(String(r.action||''))},
    {id:'queue',name:'Coordenador',role:'Fila de tarefas',color:'#63aa92',home:[85,77],match:()=>true}
  ];
  let rows=[],available=false,selected='executor',mounted=false,finance=null,conversationBusy=false,lastDetailHTML='';
  const el=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short=(s,max=72)=>String(s??'').length>max?String(s).slice(0,max-1)+'…':String(s??'');
  const money=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
  function sprite(color){return '<svg class="room-sprite" viewBox="0 0 24 32" aria-hidden="true" shape-rendering="crispEdges"><ellipse cx="12" cy="30" rx="9" ry="2" fill="#122331" opacity=".18"/><g class="sprite-person"><path d="M7 2h10v3h3v9h-3v3H7v-3H4V5h3z" fill="#e7b99a"/><path d="M7 1h10v2h3v5h-5V5H7v4H4V3h3z" fill="#293747"/><path d="M8 9h2v2H8zm6 0h2v2h-2z" fill="#293747"/><path d="M10 13h4v1h-4z" fill="#a66561"/><path d="M7 17h10v3h3v7H4v-7h3z" fill="'+color+'"/><path d="M4 21h3v5H4zm13 0h3v5h-3z" fill="#e7b99a"/><path d="M7 26h4v5H7zm6 0h4v5h-4z" fill="#293747"/></g></svg>';}
  function destination(role,task){
    if(role.id==='queue')return 'queue';
    const action=String(task?.action||'');
    if(/finance|payment|transaction/.test(action))return 'finance';
    if(role.id==='claude'||role.id==='laya')return 'plan';
    if(/git|repo|publish/.test(action))return 'github';
    return 'queue';
  }
  function model(role){
    if(role.id==='claude'&&conversationBusy)return {state:'working',label:'A analisar o teu pedido',speech:'Estou a analisar.',task:null,zone:'plan'};
    if(!available)return {state:'unknown',label:'Sem ligação',speech:'Não recebo dados.',task:null,zone:'home'};
    const matches=rows.filter(role.match);
    const task=matches.find(r=>r.status==='running')||matches.find(r=>r.status==='queued')||matches[0];
    if(!task)return {state:'idle',label:'Sem tarefas registadas',speech:'Aguardo uma tarefa.',task:null,zone:'home'};
    if(task.status==='running')return {state:'working',label:'A trabalhar',speech:role.id==='queue'?'Tarefa em curso.':destination(role,task)==='github'?'A tratar do projecto.':destination(role,task)==='finance'?'A tratar dos registos.':'A tratar do pedido.',task,zone:destination(role,task)};
    if(task.status==='queued')return {state:'waiting',label:'Na fila',speech:'Aguardo a minha vez.',task,zone:'queue'};
    if(task.status==='completed'&&task.exitCode!=null&&Number(task.exitCode)!==0)return {state:'error',label:'Última tarefa com erro',speech:'Preciso de atenção.',task,zone:'home'};
    return {state:'idle',label:task.status==='completed'?'Tarefa concluída':'A aguardar',speech:task.status==='completed'?'Feito.':'Aguardo confirmação.',task,zone:'home'};
  }
  function mount(){
    if(mounted||!el('room-stations'))return;mounted=true;
    el('room-stations').innerHTML=roles.map(r=>'<button type="button" class="room-actor" data-room-agent="'+r.id+'" style="--agent-color:'+r.color+';left:'+r.home[0]+'%;top:'+r.home[1]+'%"><span class="room-bubble">Aguardo dados.</span>'+sprite(r.color)+'<span class="room-paper" aria-hidden="true">▤</span><span class="room-name">'+r.name+'</span></button>').join('');
    el('room-stations').addEventListener('click',e=>{const b=e.target.closest('[data-room-agent]');if(b){selected=b.dataset.roomAgent;paint();}});
    document.querySelectorAll('[data-room-centre]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.roomCentre;paint();}));
    el('room-detail').addEventListener('click',e=>{const b=e.target.closest('[data-room-open]');if(b)document.dispatchEvent(new CustomEvent('centro-room-open',{detail:b.dataset.roomOpen}));});
  }
  function position(role,m){
    if(m.zone==='home')return role.home;
    const points={github:[17,39],plan:[49,39],finance:[81,39],queue:[50,59]};
    const p=points[m.zone]||role.home;
    return [p[0]+(role.id==='laya'?-7:role.id==='claude'?7:role.id==='queue'?18:0),p[1]+(role.id==='queue'?0:role.id==='claude'?6:0)];
  }
  function detail(){
    if(selected==='github')return '<span class="room-centre-icon">⑂</span><span class="room-eyebrow">ZONA GITHUB</span><h2>Os projectos</h2><p>Acesso directo aos cinco repositórios autorizados.</p><div class="room-repo-links">'+['centro-negocios-ia','pente_houselanding','best-pizza-kebab','restaurante-2-irmaos','engomadoria-beatriz'].map(name=>'<a href="https://github.com/crassas/'+name+'" target="_blank" rel="noopener">'+escape(name)+' ↗</a>').join('')+'</div><p class="room-truth">Os movimentos representam o tipo de tarefa. Não comprovam um commit ou uma publicação.</p>';
    if(selected==='finance')return '<span class="room-centre-icon">€</span><span class="room-eyebrow">CAIXA</span><h2>O teu financeiro</h2><p>Dinheiro registado na aplicação.</p><strong class="room-money">'+(finance?money(finance.balance):'Sem leitura')+'</strong><div class="room-finance-lines"><span>Entradas <b>'+(finance?money(finance.income):'—')+'</b></span><span>Saídas <b>'+(finance?money(finance.expense):'—')+'</b></span><span>Por receber <b>'+(finance?money(finance.pending):'—')+'</b></span></div><button class="btn" data-room-open="caixa" type="button">Abrir financeiro →</button><p class="room-truth">Registos locais. Esta zona não guarda fundos nem movimenta uma conta bancária.</p>';
    if(selected==='plan')return '<span class="room-centre-icon">▤</span><span class="room-eyebrow">MESA DE PLANEAMENTO</span><h2>Do pedido ao plano</h2><p>Diz o projecto e o que queres alcançar. A equipa analisa e apresenta propostas.</p><button class="btn" data-room-open="assistente" type="button">Ver propostas →</button><p class="room-truth">O papel é uma representação visual. Só os resultados registados comprovam a execução.</p>';
    const r=roles.find(r=>r.id===selected)||roles[0],m=model(r),t=m.task;
    return '<div class="room-detail-avatar">'+sprite(r.color)+'</div><span class="room-eyebrow">'+escape(r.role)+'</span><h2>'+r.name+'</h2><strong class="room-detail-state" data-state="'+m.state+'">'+m.speech+'</strong><div class="room-task"><small>'+(t?'TAREFA REGISTADA':'ACTIVIDADE')+'</small><b>'+escape(short(t?.label||t?.action||'A aguardar dados'))+'</b><span>'+escape(t?.target||'')+'</span>'+(t?'<details><summary>Ver resultado</summary><p>'+escape(m.label)+' · '+escape(t.exitCode==null?'Resultado pendente':'exit '+t.exitCode)+'</p><p>'+escape(t.id||'')+'</p></details>':'')+'</div>';
  }
  function paint(){
    mount();if(!mounted)return;
    for(const r of roles){const m=model(r),b=document.querySelector('[data-room-agent="'+r.id+'"]'),p=position(r,m);b.dataset.state=m.state;b.dataset.zone=m.zone;b.style.left=p[0]+'%';b.style.top=p[1]+'%';b.setAttribute('aria-pressed',String(r.id===selected));b.querySelector('.room-bubble').textContent=m.speech;b.setAttribute('aria-label',r.name+': '+m.label);}
    document.querySelectorAll('[data-room-centre]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.roomCentre===selected)));
    const detailHTML=detail(),resultOpen=Boolean(el('room-detail').querySelector('details')?.open);
    if(detailHTML!==lastDetailHTML){
      el('room-detail').innerHTML=detailHTML;lastDetailHTML=detailHTML;
      const result=el('room-detail').querySelector('details');if(result&&resultOpen)result.open=true;
    }
    el('room-feed').innerHTML=rows.slice(0,3).map(t=>'<li><i data-state="'+(t.status==='running'?'working':t.status==='completed'&&t.exitCode!=null&&Number(t.exitCode)!==0?'error':'idle')+'"></i><div><b>'+escape(short(t.label||t.action||'Tarefa',58))+'</b><span>'+escape(t.target||'Centro')+' · '+escape(t.status==='running'?'A executar':t.status==='completed'?(Number(t.exitCode)===0?'Feito':'Erro'):t.status==='queued'?'Na fila':'A aguardar')+'</span></div></li>').join('')||'<li>Sem tarefas recebidas.</li>';
    if(el('room-cash-value'))el('room-cash-value').textContent=finance?money(finance.balance):'Sem leitura';
  }
  function update(payload){rows=Array.isArray(payload?.executions)?payload.executions:[];available=true;paint();if(el('room-sync'))el('room-sync').textContent='Actualizado às '+new Date().toLocaleTimeString('pt-PT');}
  function offline(){available=false;paint();if(el('room-sync'))el('room-sync').textContent='Sem ligação · actividade anterior';}
  function setFinance(value){finance=value;paint();}
  function setConversationBusy(value){conversationBusy=Boolean(value);paint();}
  document.addEventListener('DOMContentLoaded',paint);
  return {update,offline,model,destination,position,setFinance,setConversationBusy};
})();
