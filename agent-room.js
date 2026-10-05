'use strict';
// The room visualises execution records, not unobserved process health.
window.CentroRoom=(()=>{
  const roles=[
    {id:'executor',name:'Operit',role:'Execução e Git',color:'#6384eb',match:r=>!String(r.action||'').startsWith('laya')&&!String(r.action||'').startsWith('claude')},
    {id:'laya',name:'Laya',role:'Decisão e encaminhamento',color:'#ac79cf',match:r=>String(r.action||'').startsWith('laya')},
    {id:'claude',name:'Claude / fallback',role:'Planeamento e código',color:'#dd9870',match:r=>/claude|repo_change/.test(String(r.action||''))},
    {id:'queue',name:'Coordenador',role:'Fila de tarefas',color:'#63aa92',match:()=>true}
  ];
  let rows=[],available=false,selected='executor',mounted=false;
  const el=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function sprite(color){return '<svg class="room-sprite" viewBox="0 0 24 32" aria-hidden="true" shape-rendering="crispEdges"><ellipse cx="12" cy="30" rx="9" ry="2" fill="#122331" opacity=".18"/><g class="sprite-person"><path d="M7 2h10v3h3v9h-3v3H7v-3H4V5h3z" fill="#e7b99a"/><path d="M7 1h10v2h3v5h-5V5H7v4H4V3h3z" fill="#293747"/><path d="M8 9h2v2H8zm6 0h2v2h-2z" fill="#293747"/><path d="M10 13h4v1h-4z" fill="#a66561"/><path d="M7 17h10v3h3v7H4v-7h3z" fill="'+color+'"/><path d="M4 21h3v5H4zm13 0h3v5h-3z" fill="#e7b99a"/><path d="M7 26h4v5H7zm6 0h4v5h-4z" fill="#293747"/></g></svg>';}
  function model(role){
    if(!available)return {state:'unknown',label:'Sem ligação',task:null};
    const matches=rows.filter(role.match);
    const task=matches.find(r=>r.status==='running')||matches.find(r=>r.status==='queued')||matches[0];
    if(!task)return {state:'idle',label:'Sem tarefas registadas',task:null};
    if(task.status==='running')return {state:'working',label:'A trabalhar',task};
    if(task.status==='queued')return {state:'waiting',label:'Na fila',task};
    if(task.status==='completed'&&task.exitCode!=null&&Number(task.exitCode)!==0)return {state:'error',label:'Última tarefa com erro',task};
    return {state:'idle',label:task.status==='completed'?'Tarefa concluída':'A aguardar',task};
  }
  function mount(){
    if(mounted||!el('room-stations'))return;mounted=true;
    el('room-stations').innerHTML=roles.map((r,i)=>'<button type="button" class="room-station station-'+i+'" data-room-agent="'+r.id+'" style="--agent-color:'+r.color+'"><span class="room-bubble">Sem leitura</span><span class="room-desk"><span class="room-monitor"><i></i></span><span class="room-keyboard"></span><span class="room-mug"></span></span>'+sprite(r.color)+'<span class="room-name">'+r.name+'</span></button>').join('');
    el('room-stations').addEventListener('click',e=>{const b=e.target.closest('[data-room-agent]');if(b){selected=b.dataset.roomAgent;paint();}});
  }
  function paint(){
    mount();if(!mounted)return;
    for(const r of roles){const m=model(r),b=document.querySelector('[data-room-agent="'+r.id+'"]');b.dataset.state=m.state;b.setAttribute('aria-pressed',String(r.id===selected));b.querySelector('.room-bubble').textContent=m.label;b.setAttribute('aria-label',r.name+': '+m.label);}
    const r=roles.find(r=>r.id===selected),m=model(r),t=m.task;
    el('room-detail').innerHTML='<div class="room-detail-avatar" style="--agent-color:'+r.color+'">'+sprite(r.color)+'</div><span class="room-eyebrow">AGENTE SELECCIONADO</span><h2>'+r.name+'</h2><p>'+r.role+'</p><strong class="room-detail-state" data-state="'+m.state+'">'+m.label+'</strong><div class="room-task"><small>'+(t?'TAREFA REGISTADA':'ACTIVIDADE')+'</small><b>'+escape(t?.label||t?.action||'A aguardar dados de execução')+'</b><span>'+escape(t?.target||'')+'</span>'+(t?'<dl><dt>Tentativas</dt><dd>'+escape(t.attempt??'—')+'</dd><dt>Resultado</dt><dd>'+escape(t.exitCode==null?'Pendente':'exit '+t.exitCode)+'</dd></dl>':'')+'</div><p class="room-truth">Estado baseado nas tarefas recebidas. Não comprova, por si só, a saúde do serviço ou o modelo usado no fallback.</p>';
    el('room-feed').innerHTML=rows.slice(0,5).map(t=>'<li><i data-state="'+(t.status==='running'?'working':t.status==='completed'&&Number(t.exitCode)!==0?'error':'idle')+'"></i><div><b>'+escape(t.label||t.action||'Tarefa')+'</b><span>'+escape(t.target||'Centro')+' · '+escape(t.status==='running'?'A executar':t.status==='completed'?'Concluída · exit '+t.exitCode:t.status==='queued'?'Na fila':'A aguardar')+'</span></div></li>').join('')||'<li>Sem tarefas recebidas.</li>';
  }
  function update(payload){rows=Array.isArray(payload?.executions)?payload.executions:[];available=true;paint();el('room-sync').textContent='Actualizado às '+new Date().toLocaleTimeString('pt-PT');}
  function offline(){available=false;paint();if(el('room-sync'))el('room-sync').textContent='Sem ligação · actividade anterior';}
  document.addEventListener('DOMContentLoaded',paint);
  return {update,offline,model};
})();
