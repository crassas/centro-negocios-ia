const STORE_KEY='centro_negocios_v3';
const LEGACY_KEY='centro_ia_real_v2';
const VAULT_KEY='centro_negocios_vault_v1';
const AI_ENDPOINT_KEY='centro_negocios_ai_endpoint_v1';
const AI_DEFAULT_ENDPOINT='https://centro-negocios-ai.travisthejarvis.workers.dev';
const GSC_DEVICE_TOKEN_KEY='centro_negocios_gsc_device_token_v1';
const GSC_SITE_KEY='centro_negocios_gsc_site_v1';
const APP_VERSION=3;
const VAULT_LOCK_MS=5*60*1000;
const EXTRA_PROJECTS=[
  {id:'engomadoria',name:'Engomadoria Beatriz',area:'Praça das Flores',url:''}
];

let sites=[];
let live={generatedAt:null,sites:[]};
let state=loadState();
let vaultSession=null;
let vaultPassphrase=null;
let vaultTimer=null;
let installPrompt=null;
let toastTimer=null;
let gscPairPollTimer=null;

function defaultState(){return {clients:{},leads:[],gsc:null,transactions:[],pendingPayments:[],agent:{opportunities:[],decisions:[],reports:[],telegramOffset:0}};}
function loadState(){
  try{
    const current=localStorage.getItem(STORE_KEY);
    if(current)return normalizeState(JSON.parse(current));
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy){const migrated=normalizeState(JSON.parse(legacy));localStorage.setItem(STORE_KEY,JSON.stringify(migrated));return migrated;}
  }catch{}
  return defaultState();
}
function normalizeState(value){
  const d=defaultState();
  if(!value||typeof value!=='object')return d;
  return {
    clients:value.clients&&typeof value.clients==='object'?value.clients:{},
    leads:Array.isArray(value.leads)?value.leads:[],
    gsc:value.gsc&&typeof value.gsc==='object'?value.gsc:null,
    transactions:Array.isArray(value.transactions)?value.transactions:[],
    pendingPayments:Array.isArray(value.pendingPayments)?value.pendingPayments:[],
    agent:{
      opportunities:Array.isArray(value.agent?.opportunities)?value.agent.opportunities:[],
      decisions:Array.isArray(value.agent?.decisions)?value.agent.decisions:[],
      reports:Array.isArray(value.agent?.reports)?value.agent.reports:[],
      telegramOffset:Number(value.agent?.telegramOffset)||0
    }
  };
}
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state));renderLocalSummary();if($('decision-list'))renderAgentState();}
function seedCRMDefaults(){
  const defaults={
    pentehouse:{stage:'Activo',note:'Acompanhar ranking Marquês / Constituição e rever posições locais.'},
    'best-pizza':{stage:'Activo',note:'Acompanhar ranking Campanhã / São Roque e validar menu, pesquisa e experiência mobile.'},
    'dois-irmaos':{stage:'Activo',note:'Acompanhar ranking Campanhã / São Roque e consolidar presença local e ficha Google.'},
    engomadoria:{stage:'Activo',note:'Negócio fechado. Recolher a folha da cliente, morada, contacto, horário, serviços, preços e fotografias. Iniciar construção do site da Engomadoria Beatriz. Valor do trabalho: 25 € + custo real do domínio pago pela cliente. Lavandaria separada: possível segundo trabalho de +25 € se avançar.'}
  };
  let changed=false;
  for(const [id,value] of Object.entries(defaults)){
    if(!state.clients[id]){
      state.clients[id]=value;
      changed=true;
      continue;
    }
    if(!state.clients[id].stage){
      state.clients[id].stage=value.stage;
      changed=true;
    }
    if(!String(state.clients[id].note||'').trim()){
      state.clients[id].note=value.note;
      changed=true;
    }
  }
  if(changed)localStorage.setItem(STORE_KEY,JSON.stringify(state));
}

function seedPaymentDefaults(){
  if(!Array.isArray(state.pendingPayments))state.pendingPayments=[];
  const id='payment_engomadoria_20261002';
  if(!state.pendingPayments.some(item=>item&&item.id===id)){
    state.pendingPayments.push({
      id,
      client:'Engomadoria Beatriz',
      amount:25,
      projectId:'engomadoria',
      description:'Site da Engomadoria Beatriz — pagamento apenas após conclusão e validação da cliente.',
      dueDate:'',
      status:'pending',
      createdAt:'2026-10-02T07:57:00.000Z'
    });
    localStorage.setItem(STORE_KEY,JSON.stringify(state));
  }
}

function seedLeadDefaults(){
  const id='lead_engomadoria_20261001';
  const legacyId='lead_lavandaria_20261001';
  const data={
    id,
    name:'Engomadoria Beatriz',
    url:'',
    contact:'Cliente confirmado e negócio fechado. Site da Engomadoria Beatriz a iniciar. Valor do trabalho: 25 € + custo real do domínio pago pela cliente. A morada e restantes dados serão confirmados a partir da folha entregue pela cliente. Lavandaria é um negócio separado e pode avançar depois como segundo site por +25 €.',
    status:'Fechado',
    createdAt:'2026-10-01T18:19:00.000Z'
  };
  let lead=state.leads.find(item=>item&&(item.id===id||item.id===legacyId));
  if(lead)Object.assign(lead,data);
  else state.leads.push(data);
  state.leads=state.leads.filter((item,index,list)=>item&&item.id!==id||list.findIndex(x=>x&&x.id===id)===index);
  localStorage.setItem(STORE_KEY,JSON.stringify(state));
}

function $(id){return document.getElementById(id);}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeUrl(value){
  try{const u=new URL(String(value||''),location.href);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}
}
function fmtDate(value){
  if(!value)return 'sem leitura';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);
  return new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short'}).format(d);
}
function fmtDateOnly(value){
  if(!value)return '—';
  const d=new Date(value+'T12:00:00');if(Number.isNaN(d.getTime()))return value;
  return new Intl.DateTimeFormat('pt-PT',{dateStyle:'short'}).format(d);
}
function fmtNum(value,digits=0){
  if(value==null||Number.isNaN(Number(value)))return '—';
  return new Intl.NumberFormat('pt-PT',{maximumFractionDigits:digits}).format(Number(value));
}
function fmtMoney(value){return new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(value)||0);}
function humanMs(value){return value==null?'—':fmtNum(value,0)+' ms';}
function siteResult(id){return (live.sites||[]).find(x=>x.id===id);}
function allProjects(){return [...sites,...EXTRA_PROJECTS];}
function projectById(id){return allProjects().find(project=>project.id===id);}
function uid(prefix='id'){return prefix+'_'+Date.now().toString(36)+'_'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36);}
function toast(message){
  const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
}
function ageMinutes(value){const t=new Date(value).getTime();return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null;}
function ageLabel(value){
  const m=ageMinutes(value);if(m==null)return 'sem leitura';if(m<1)return 'agora';if(m<60)return 'há '+m+' min';
  const h=Math.floor(m/60);return 'há '+h+' h'+(h===1?'':'');
}


const PANEL_NAMES={
  agentes:'SALA DOS AGENTES',visao:'PAINEL',assistente:'AUTOMAÇÃO & IA',radar:'OPORTUNIDADES',sites:'SITES',crm:'CLIENTES',
  leads:'LEADS',caixa:'FINANCEIRO',seo:'OPORTUNIDADES SEO',cofre:'COFRE',ferramentas:'DEFINIÇÕES'
};
function openPanel(id,options={}){
  const target=document.querySelector('[data-panel="'+id+'"]');
  if(!target)id='visao';
  document.querySelectorAll('.panel-view').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.panel===id));
  document.querySelectorAll('[data-panel-target]').forEach(control=>control.classList.toggle('active',control.dataset.panelTarget===id));
  if($('active-panel-name'))$('active-panel-name').textContent=PANEL_NAMES[id]||String(id).toUpperCase();
  if(location.hash!=='#'+id){
    if(options.history===false||options.instant)history.replaceState({panel:id},'','#'+id);
    else history.pushState({panel:id},'','#'+id);
  }
  window.scrollTo({top:0,behavior:options.instant?'auto':'smooth'});
  if(options.focusDecisions&&id==='assistente')setTimeout(()=>document.querySelector('#decisions')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
}
function setupPanelNavigation(){
  document.querySelectorAll('[data-panel-target]').forEach(control=>control.addEventListener('click',event=>{
    event.preventDefault();
    openPanel(control.dataset.panelTarget,{focusDecisions:control.dataset.focusDecisions==='1'});
  }));
  $('nav-home')?.addEventListener('click',()=>openPanel('visao'));
  $('return-top')?.addEventListener('click',()=>openPanel('visao'));
  window.addEventListener('popstate',()=>{
    const id=location.hash.replace('#','');
    openPanel(PANEL_NAMES[id]?id:'visao',{instant:true,history:false});
  });
  const initial=location.hash.replace('#','');
  openPanel(PANEL_NAMES[initial]?initial:'visao',{instant:true,history:false});
}
function startDictation(targetId){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){toast('Ditado por voz não é suportado neste navegador.');return;}
  const target=$(targetId);if(!target)return;
  const rec=new Recognition();
  rec.lang='pt-PT';rec.interimResults=false;rec.maxAlternatives=1;
  rec.onstart=()=>toast('A ouvir…');
  rec.onerror=()=>toast('Não consegui ouvir. Tenta novamente.');
  rec.onresult=e=>{
    const text=e.results?.[0]?.[0]?.transcript||'';
    target.value=(target.value?target.value.trim()+' ':'')+text;
    target.focus();
  };
  rec.start();
}

async function loadLive(){
  const stamp=Date.now();
  $('refresh-btn').disabled=true;$('refresh-btn').textContent='…';
  try{
    const [sitesRes,liveRes]=await Promise.all([
      fetch('./data/sites.json?v='+stamp,{cache:'no-store'}),
      fetch('./data/live.json?v='+stamp,{cache:'no-store'})
    ]);
    if(!sitesRes.ok)throw new Error('Configuração dos sites: HTTP '+sitesRes.status);
    sites=await sitesRes.json();
    if(!liveRes.ok)throw new Error('Auditoria: HTTP '+liveRes.status);
    live=await liveRes.json();
    renderAll();
    toast('Leitura recarregada.');
  }catch(err){
    $('monitor-label').textContent='falha ao ler auditoria';$('monitor-pill').className='rail-health bad';
    $('site-grid').innerHTML='<div class="empty">'+esc(err.message)+'</div>';
    $('sys-monitor').textContent='Falha de leitura';
  }finally{$('refresh-btn').disabled=false;$('refresh-btn').textContent='↻';}
}

function renderAll(){
  fillProjectSelects();
  renderMonitorStatus();renderKpis();renderSites();renderAlerts();renderConnections();renderCRM();renderLeads();renderGsc();renderPayments();renderFinance();renderSystem();renderAIStatus();setupVaultState();
}
function renderMonitorStatus(){
  const pill=$('monitor-pill'),label=$('monitor-label'),meta=$('audit-meta');
  if(!live.generatedAt){pill.className='rail-health bad';label.textContent='sem auditoria';meta.textContent='Sem leitura';$('headline-status').textContent='Sem auditoria técnica disponível.';return;}
  const age=ageMinutes(live.generatedAt);const stale=age!=null&&age>40;
  pill.className='rail-health '+(stale?'bad':'ok');
  label.textContent=(stale?'leitura atrasada · ':'auditoria · ')+ageLabel(live.generatedAt);
  meta.textContent=fmtDate(live.generatedAt)+' · '+ageLabel(live.generatedAt);
  const online=(live.sites||[]).filter(r=>r.online).length;
  const issues=(live.sites||[]).reduce((n,r)=>n+(r.issues||[]).length,0);
  $('headline-status').textContent=online+'/'+(live.sites||[]).length+' sites online · '+issues+' alerta'+(issues===1?'':'s')+' · auditoria '+ageLabel(live.generatedAt)+'.';
}
function renderKpis(){
  const results=live.sites||[];
  const online=results.filter(r=>r.online).length;
  const issues=results.reduce((n,r)=>n+(r.issues||[]).length,0);
  $('kpi-online').textContent=results.length?online+'/'+results.length:'—';
  $('kpi-issues').textContent=results.length?issues:'—';
  $('kpi-online-note').textContent=results.length?(online===results.length?'Todos responderam':(results.length-online)+' com falha'):'Sem auditoria';
  $('kpi-issues-note').textContent=results.length?(issues?'Ver alertas abaixo':'Sem falhas nesta leitura'):'Sem auditoria';
  renderLocalSummary();
}
function renderLocalSummary(){
  if(!$('kpi-leads'))return;
  const open=state.leads.filter(l=>!['Fechado','Perdido'].includes(l.status)).length;
  const totals=financeTotals();
  $('kpi-leads').textContent=open;
  $('kpi-leads-note').textContent=state.leads.length+' total';
  $('kpi-balance').textContent=fmtMoney(totals.balance);
  $('kpi-balance-note').textContent=state.transactions.length+' movimento'+(state.transactions.length===1?'':'s');
}
function yesNo(ok,label){return '<span class="check '+(ok?'yes':'no')+'">'+esc(label)+'</span>';}
function renderSites(){
  const grid=$('site-grid');
  if(!sites.length){grid.innerHTML='<div class="empty">Sem sites configurados.</div>';return;}
  grid.innerHTML=sites.map(s=>{
    const r=siteResult(s.id);
    if(!r)return '<article class="site-card"><div class="site-top"><div><h3>'+esc(s.name)+'</h3><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.area||s.url)+'</a></div><span class="status wait">SEM LEITURA</span></div></article>';
    const c=r.checks||{};
    return '<article class="site-card">'+
      '<div class="site-top"><div><h3>'+esc(s.name)+'</h3><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.area||s.url)+'</a></div><span class="status '+(r.online?'ok':'bad')+'">'+(r.online?'ONLINE':'FALHA')+'</span></div>'+
      '<div class="fact-grid">'+
      '<div class="fact"><span>HTTP</span><b>'+esc(r.status==null?'—':r.status)+'</b></div>'+
      '<div class="fact"><span>Resposta</span><b>'+humanMs(r.responseTimeMs)+'</b></div>'+
      '<div class="fact"><span>H1</span><b>'+esc(r.h1Count==null?'—':r.h1Count)+(r.firstH1?' · '+esc(r.firstH1):'')+'</b></div>'+
      '<div class="fact"><span>Sitemap</span><b>'+esc(r.sitemapUrls==null?'—':r.sitemapUrls)+' URL</b></div>'+
      '<div class="fact"><span>Alteração HTML</span><b>'+esc(r.changed===true?'detectada':r.changed===false?'não':'base inicial')+'</b></div>'+
      '<div class="fact"><span>Leitura</span><b>'+esc(ageLabel(r.checkedAt))+'</b></div></div>'+
      '<div class="technical">'+yesNo(c.title,'title')+yesNo(c.description,'description')+yesNo(c.h1,'H1')+yesNo(c.canonical,'canonical')+yesNo(c.robots,'robots')+yesNo(c.sitemap,'sitemap')+yesNo(c.schema,'schema')+'</div></article>';
  }).join('');
}
function renderAlerts(){
  const rows=[];
  (live.sites||[]).forEach(r=>(r.issues||[]).forEach(issue=>rows.push({name:r.name,text:issue.message||String(issue),level:issue.level||'warn'})));
  if(!rows.length){$('alerts-list').innerHTML=live.generatedAt?'<div class="stack-item good"><b>Sem alertas técnicos</b><p>A última auditoria não encontrou falhas nas verificações activas.</p></div>':'<div class="empty">Sem auditoria.</div>';return;}
  $('alerts-list').innerHTML=rows.map(x=>'<div class="stack-item '+(x.level==='danger'?'danger':'warn')+'"><b>'+esc(x.name)+'</b><p>'+esc(x.text)+'</p></div>').join('');
}
function renderConnections(){
  const signals=[];
  (live.sites||[]).forEach(r=>{
    const c=r.checks||{};
    (r.seoSignals||[]).forEach(signal=>signals.push({
      title:r.name+' · '+(signal.code==='http-duplicate-consolidated'?'canonical consolidado':'sinal SEO'),
      text:signal.message||String(signal),
      level:signal.level||'good'
    }));
    if(r.changed===true)signals.push({title:r.name+' · HTML alterado',text:'O conteúdo da homepage mudou desde a auditoria anterior. Confirma title, H1, canonical e páginas do sitemap.'});
    if(r.responseTimeMs>1800)signals.push({title:r.name+' · resposta '+humanMs(r.responseTimeMs),text:'O servidor ultrapassou 1,8 s nesta leitura. Cruza este sinal com Core Web Vitals e desempenho mobile.'});
    if(r.h1Count>1)signals.push({title:r.name+' · '+r.h1Count+' H1',text:'A homepage tem mais de um H1 detectado. Confirma a hierarquia antes de novas alterações SEO.'});
    if(c.sitemap&&r.sitemapUrls>0&&!c.canonical)signals.push({title:r.name+' · sitemap sem canonical',text:'O sitemap está acessível, mas a homepage não expôs canonical na mesma auditoria.'});
    if(c.schema&&!c.description)signals.push({title:r.name+' · schema sem description',text:'Há dados estruturados, mas falta meta description na homepage.'});
    if(r.robotsMeta&&/noindex/i.test(r.robotsMeta))signals.push({title:r.name+' · noindex detectado',text:'A meta robots contém noindex. Confirma se a exclusão da pesquisa é intencional.'});
  });
  $('connections-list').innerHTML=signals.length?signals.map(s=>'<div class="stack-item '+(s.level==='good'?'good':s.level==='danger'?'danger':s.level==='warn'?'warn':'')+'"><b>'+esc(s.title)+'</b><p>'+esc(s.text)+'</p></div>').join(''):(live.generatedAt?'<div class="stack-item good"><b>Sem sinais cruzados</b><p>Nesta leitura não há combinações técnicas que exijam acção adicional.</p></div>':'<div class="empty">Sem auditoria.</div>');
}

function renderCRM(){
  const grid=$('crm-grid');
  const projects=allProjects();
  if(!projects.length){grid.innerHTML='<div class="empty">Sem projectos configurados.</div>';return;}
  grid.innerHTML=projects.map(s=>{
    const c=state.clients[s.id]||{stage:'Activo',note:''};
    const location=s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.area||s.url)+'</a>':'<span class="section-meta">'+esc(s.area||'Sem morada')+'</span>';
    return '<article class="crm-card" data-client="'+esc(s.id)+'"><h3>'+esc(s.name)+'</h3>'+location+
      '<div class="field"><label>Estado</label><select class="client-stage">'+['Activo','Prospecção','Pausado','Concluído'].map(v=>'<option '+(c.stage===v?'selected':'')+'>'+v+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Próxima acção</label><textarea class="client-note" placeholder="Ex.: rever Search Console sexta-feira">'+esc(c.note||'')+'</textarea></div></article>';
  }).join('');
  grid.querySelectorAll('.crm-card').forEach(card=>{
    const id=card.dataset.client;
    const persist=()=>{state.clients[id]={stage:card.querySelector('.client-stage').value,note:card.querySelector('.client-note').value.trimStart()};saveState();};
    card.querySelector('.client-stage').addEventListener('change',persist);card.querySelector('.client-note').addEventListener('input',persist);
  });
}
function renderLeads(){
  const tbody=$('lead-table');$('lead-count').textContent=state.leads.length+' registo'+(state.leads.length===1?'':'s');
  if(!state.leads.length){tbody.innerHTML='<tr><td colspan="6" class="empty-cell">Sem leads registados.</td></tr>';renderLocalSummary();return;}
  tbody.innerHTML=state.leads.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(l=>{
    const idx=state.leads.indexOf(l);const link=safeUrl(l.url);
    return '<tr><td>'+esc(l.name)+'</td><td>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noreferrer">abrir ↗</a>':'—')+'</td><td>'+esc(l.contact||'—')+'</td><td><select class="inline-status" data-lead-status="'+idx+'">'+['Novo','Contactado','Interessado','Proposta','Fechado','Perdido'].map(v=>'<option '+(l.status===v?'selected':'')+'>'+v+'</option>').join('')+'</select></td><td>'+esc(l.createdAt?fmtDateOnly(l.createdAt.slice(0,10)):'—')+'</td><td><button class="danger-btn" data-remove-lead="'+idx+'" title="Eliminar">×</button></td></tr>';
  }).join('');
  tbody.querySelectorAll('[data-lead-status]').forEach(sel=>sel.addEventListener('change',()=>{state.leads[Number(sel.dataset.leadStatus)].status=sel.value;saveState();renderLeads();}));
  tbody.querySelectorAll('[data-remove-lead]').forEach(btn=>btn.addEventListener('click',()=>{if(confirm('Eliminar este lead?')){state.leads.splice(Number(btn.dataset.removeLead),1);saveState();renderLeads();}}));
  renderLocalSummary();
}

function normalizeHeader(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ');}
function parseLocaleNumber(v){
  let s=String(v==null?'':v).trim().replace(/\s/g,'');if(!s)return NaN;
  if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}
  else if(s.includes(','))s=s.replace(',','.');return Number(s.replace('%',''));
}
function parsePercent(v){const n=parseLocaleNumber(v);if(!Number.isFinite(n))return null;return String(v).includes('%')?n/100:n;}
function gscDeviceToken(){return localStorage.getItem(GSC_DEVICE_TOKEN_KEY)||'';}
async function gscFetch(path,options={}){
  const token=gscDeviceToken();
  return aiFetch(path,{
    ...options,
    headers:{
      ...(options.headers||{}),
      ...(token?{authorization:'Bearer '+token}:{})
    }
  });
}
function setGscLiveStatus(status,note='',mode='idle'){
  const label=$('gsc-live-status'),sub=$('gsc-live-note'),dot=$('gsc-live-dot');
  if(label)label.textContent=status;
  if(sub)sub.textContent=note;
  if(dot){dot.className='';if(mode)dot.classList.add(mode);}
}
function dateYmd(date){return date.toISOString().slice(0,10);}
function shiftDays(date,days){const d=new Date(date);d.setUTCDate(d.getUTCDate()+days);return d;}
async function refreshGscConnection(){
  if(!$('gsc-live-status'))return;
  const pair=$('gsc-pair-btn'),sync=$('gsc-sync-btn'),site=$('gsc-site-select');
  try{
    setGscLiveStatus('A verificar','A testar o Worker.','checking');
    const data=await gscFetch('/api/gsc/status',{method:'GET',headers:{}});
    if(!data.configured){
      setGscLiveStatus('Falta configurar Google','A conta de serviço ainda não está guardada no Worker.','warning');
      if(pair){pair.disabled=true;pair.textContent='Falta conta de serviço';}
      if(sync)sync.disabled=true;if(site)site.disabled=true;
      return;
    }
    if(!data.authorized){
      if(gscDeviceToken())localStorage.removeItem(GSC_DEVICE_TOKEN_KEY);
      setGscLiveStatus('Pronto para autorizar','Confirma este dispositivo através do Telegram.','warning');
      if(pair){pair.disabled=false;pair.textContent='Autorizar este dispositivo';}
      if(sync)sync.disabled=true;if(site)site.disabled=true;
      return;
    }
    setGscLiveStatus('Ligado','Conta de serviço + dispositivo autorizados.','online');
    if(pair){pair.disabled=true;pair.textContent='Dispositivo autorizado';}
    await loadGscSites();
  }catch(err){
    setGscLiveStatus('Sem ligação',String(err.message||err).slice(0,180),'error');
    if(sync)sync.disabled=true;if(site)site.disabled=true;
  }
}
async function pairGscDevice(){
  const btn=$('gsc-pair-btn');if(!btn)return;
  btn.disabled=true;btn.textContent='A enviar para o Telegram…';
  try{
    const data=await aiFetch('/api/gsc/pair',{method:'POST',body:JSON.stringify({})});
    if(!data.pairId)throw new Error('O Worker não devolveu o código de autorização.');
    setGscLiveStatus('Confirma no Telegram','Carrega em Autorizar na mensagem do Centro.','checking');
    btn.textContent='À espera do Telegram…';
    if(gscPairPollTimer)clearInterval(gscPairPollTimer);
    const started=Date.now();
    const poll=async()=>{
      try{
        const status=await aiFetch('/api/gsc/pair-status?id='+encodeURIComponent(data.pairId),{method:'GET',headers:{}});
        if(status.status==='approved'&&status.token){
          clearInterval(gscPairPollTimer);gscPairPollTimer=null;
          localStorage.setItem(GSC_DEVICE_TOKEN_KEY,status.token);
          toast('Dispositivo autorizado para o Search Console.');
          await refreshGscConnection();
          return;
        }
        if(status.status==='rejected'||status.status==='expired'||Date.now()-started>10*60*1000){
          clearInterval(gscPairPollTimer);gscPairPollTimer=null;
          btn.disabled=false;btn.textContent='Autorizar este dispositivo';
          setGscLiveStatus(status.status==='rejected'?'Autorização recusada':'Autorização expirada','Podes tentar novamente.','warning');
        }
      }catch(err){
        clearInterval(gscPairPollTimer);gscPairPollTimer=null;
        btn.disabled=false;btn.textContent='Autorizar este dispositivo';
        setGscLiveStatus('Erro na autorização',String(err.message||err).slice(0,160),'error');
      }
    };
    await poll();
    if(!gscPairPollTimer)gscPairPollTimer=setInterval(poll,1500);
  }catch(err){
    btn.disabled=false;btn.textContent='Autorizar este dispositivo';
    setGscLiveStatus('Falha ao autorizar',String(err.message||err).slice(0,180),'error');
    toast(err.message||'Falha ao autorizar.');
  }
}
async function loadGscSites(){
  const site=$('gsc-site-select'),sync=$('gsc-sync-btn');if(!site)return;
  site.disabled=true;if(sync)sync.disabled=true;
  site.innerHTML='<option value="">A carregar propriedades…</option>';
  try{
    const data=await gscFetch('/api/gsc/sites',{method:'GET',headers:{}});
    const sites=Array.isArray(data.sites)?data.sites:[];
    if(!sites.length){
      site.innerHTML='<option value="">Sem propriedades acessíveis</option>';
      setGscLiveStatus('Ligado, sem propriedades','Adiciona a conta de serviço como proprietária/utilizadora no Search Console.','warning');
      return;
    }
    const saved=localStorage.getItem(GSC_SITE_KEY)||state.gsc?.siteUrl||'';
    site.innerHTML=sites.map(row=>'<option value="'+esc(row.siteUrl)+'">'+esc(row.siteUrl)+' · '+esc(row.permissionLevel||'acesso')+'</option>').join('');
    if(saved&&sites.some(row=>row.siteUrl===saved))site.value=saved;
    else site.value=sites[0].siteUrl;
    localStorage.setItem(GSC_SITE_KEY,site.value);
    site.disabled=false;if(sync)sync.disabled=false;
    setGscLiveStatus('Ligado',sites.length+' propriedade'+(sites.length===1?'':'s')+' disponível'+(sites.length===1?'':'eis')+'.','online');
  }catch(err){
    site.innerHTML='<option value="">Erro ao carregar propriedades</option>';
    setGscLiveStatus('Erro do Search Console',String(err.message||err).slice(0,180),'error');
  }
}
async function syncGscDirect(){
  const site=$('gsc-site-select')?.value||'',projectId=$('gsc-project')?.value||'';
  const days=Math.max(7,Math.min(Number($('gsc-period-select')?.value)||90,365));
  const btn=$('gsc-sync-btn');
  if(!site){toast('Escolhe uma propriedade do Search Console.');return;}
  if(btn){btn.disabled=true;btn.textContent='A sincronizar…';}
  try{
    setGscLiveStatus('A sincronizar','A pedir consultas ao Google e a comparar períodos.','checking');
    const end=shiftDays(new Date(),-2);
    const start=shiftDays(end,-days+1);
    const prevEnd=shiftDays(start,-1);
    const prevStart=shiftDays(prevEnd,-days+1);
    const payloadCurrent={siteUrl:site,startDate:dateYmd(start),endDate:dateYmd(end),rowLimit:5000};
    const payloadPrevious={siteUrl:site,startDate:dateYmd(prevStart),endDate:dateYmd(prevEnd),rowLimit:5000};
    const [current,previous]=await Promise.all([
      gscFetch('/api/gsc/query',{method:'POST',body:JSON.stringify(payloadCurrent)}),
      gscFetch('/api/gsc/query',{method:'POST',body:JSON.stringify(payloadPrevious)})
    ]);
    const rows=Array.isArray(current.rows)?current.rows:[];
    const previousRows=Array.isArray(previous.rows)?previous.rows:[];
    state.gsc={
      source:'api',
      fileName:'API Search Console',
      siteUrl:site,
      importedAt:new Date().toISOString(),
      projectId,
      periodDays:days,
      startDate:payloadCurrent.startDate,
      endDate:payloadCurrent.endDate,
      previousStartDate:payloadPrevious.startDate,
      previousEndDate:payloadPrevious.endDate,
      rows,
      previousRows
    };
    localStorage.setItem(GSC_SITE_KEY,site);
    saveState();renderGsc();renderSystem();
    setGscLiveStatus('Sincronizado',rows.length+' consultas · comparação com o período anterior concluída.','online');
    toast(rows.length+' consultas sincronizadas directamente do Search Console.');
  }catch(err){
    setGscLiveStatus('Falha na sincronização',String(err.message||err).slice(0,180),'error');
    toast(err.message||'Não foi possível sincronizar o Search Console.');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Sincronizar agora';}
  }
}

function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0]||'';const delim=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(ch===delim&&!quote){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[];}else cell+=ch;}
  row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);if(rows.length<2)return [];
  const headers=rows[0].map(normalizeHeader);const find=names=>headers.findIndex(h=>names.some(n=>h===n||h.includes(n)));
  const qi=find(['query','consulta','termo']),ci=find(['clicks','cliques']),ii=find(['impressions','impressoes']),ti=find(['ctr']),pi=find(['position','posicao']);
  if(qi<0)throw new Error('Este CSV não tem a coluna Consulta/Query. No Search Console abre Desempenho > Consultas e exporta essa tabela.');
  if(ci<0||ii<0||pi<0)throw new Error('O CSV não tem as colunas de cliques, impressões e posição.');
  return rows.slice(1).map(r=>({query:String(r[qi]||'').trim(),clicks:parseLocaleNumber(r[ci]),impressions:parseLocaleNumber(r[ii]),ctr:ti>=0?parsePercent(r[ti]):null,position:parseLocaleNumber(r[pi])})).filter(r=>r.query&&Number.isFinite(r.clicks)&&Number.isFinite(r.impressions)&&Number.isFinite(r.position));
}
function gscSummary(){
  const g=state.gsc;if(!g||!Array.isArray(g.rows)||!g.rows.length)return null;
  const t=g.rows.reduce((a,r)=>{a.clicks+=r.clicks||0;a.impressions+=r.impressions||0;a.posWeight+=(r.position||0)*(r.impressions||1);a.weight+=(r.impressions||1);return a;},{clicks:0,impressions:0,posWeight:0,weight:0});
  return {clicks:t.clicks,impressions:t.impressions,ctr:t.impressions?t.clicks/t.impressions:0,position:t.weight?t.posWeight/t.weight:0};
}
const GSC_PROJECT_HINTS={
  pentehouse:{label:'Pentehouse Barbearia',page:'/',focus:'barbearia, Marquês, Constituição, serviços, equipa e FAQs locais'},
  'best-pizza':{label:'Best Pizza & Kebab',page:'/takeaway-campanha/',focus:'takeaway, kebab, pizza, halal, Campanhã e São Roque'},
  'dois-irmaos':{label:'2 Irmãos',page:'/',focus:'comida portuguesa, pratos, Campanhã e intenção local'},
  engomadoria:{label:'Engomadoria Beatriz',page:'/',focus:'engomadoria, packs, prazo, localização e serviços'}
};
function gscProjectHint(){
  const id=(state.gsc&&state.gsc.projectId)||$('gsc-project')?.value||'';
  return {id,label:GSC_PROJECT_HINTS[id]?.label||'Projecto por definir',page:GSC_PROJECT_HINTS[id]?.page||'página que já recebe estas impressões',focus:GSC_PROJECT_HINTS[id]?.focus||'intenção real da pesquisa'};
}
function expectedCtrForPosition(position){
  if(position<=3)return .12;if(position<=5)return .08;if(position<=10)return .04;if(position<=20)return .02;if(position<=30)return .012;if(position<=50)return .007;return .004;
}
function gscActionForRow(row,project){
  const q='"'+row.query+'"',page=project.page;
  if(row.position<=3)return 'Melhorar title, meta description e resposta inicial para '+q+'. A posição já é forte: o ganho está sobretudo no clique.';
  if(row.position<=10)return 'Reforçar '+q+' em '+page+': H2 claro, resposta curta, FAQ útil e ligação interna. Não repetir o termo sem contexto.';
  if(row.position<=20)return 'Criar ou ampliar uma secção específica em '+page+' para '+q+' e ligar essa secção a partir de conteúdo relacionado.';
  if(row.position<=40)return 'Validar se '+q+' encaixa em '+project.focus+'. Se encaixar, criar conteúdo dedicado; se não encaixar, não forçar.';
  return 'Baixa prioridade. Confirmar relevância comercial de '+q+' antes de alterar conteúdo ou criar uma nova página.';
}
function gscOpportunityRows(){
  const rows=state.gsc?.rows||[];if(!rows.length)return [];
  const previousMap=new Map((state.gsc?.previousRows||[]).map(r=>[String(r.query||''),r]));
  const maxImp=Math.max(1,...rows.map(r=>Math.max(0,r.impressions||0))),project=gscProjectHint();
  return rows.map(r=>{
    const ctr=r.ctr==null?(r.impressions?r.clicks/r.impressions:0):r.ctr;
    const expected=expectedCtrForPosition(r.position);
    const gap=expected?Math.max(0,Math.min(1,(expected-ctr)/expected)):0;
    let posScore=.15;
    if(r.position>=4&&r.position<=10)posScore=1;
    else if(r.position>10&&r.position<=20)posScore=.9;
    else if(r.position<=3)posScore=.52;
    else if(r.position<=30)posScore=.66;
    else if(r.position<=50)posScore=.38;
    const impScore=Math.log1p(Math.max(0,r.impressions||0))/Math.log1p(maxImp);
    const score=Math.max(0,Math.min(100,Math.round(100*(.45*posScore+.35*impScore+.20*gap))));
    const quickWin=r.position>=4&&r.position<=20&&score>=60;
    const ctrRisk=r.impressions>=20&&ctr<expected*.65;
    const priority=score>=72?'ALTA':score>=55?'MÉDIA':'OBSERVAR';
    const prev=previousMap.get(String(r.query||''))||null;
    const impressionDelta=prev&&Number(prev.impressions)>0?(Number(r.impressions)-Number(prev.impressions))/Number(prev.impressions):null;
    const clicksDelta=prev&&Number(prev.clicks)>0?(Number(r.clicks)-Number(prev.clicks))/Number(prev.clicks):null;
    const positionDelta=prev&&Number.isFinite(Number(prev.position))?Number(prev.position)-Number(r.position):null;
    let reason='Sinal fraco: precisa de mais dados antes de mexer.';
    if(quickWin)reason='Já está perto do topo e tem procura: pequena melhoria pode produzir ganho mais rápido.';
    else if(ctrRisk&&r.position<=20)reason='Tem visibilidade, mas o CTR está abaixo do esperado para esta posição.';
    else if(r.position<=10)reason='Já está na primeira página; vale reforçar relevância e snippet.';
    else if(r.position<=20)reason='Está perto da primeira página e pode subir com conteúdo e ligações internas.';
    else if(r.impressions>=maxImp*.45)reason='Tem procura relevante, mas ainda está longe; validar intenção antes de investir.';
    return {...r,ctr,expectedCtr:expected,score,quickWin,ctrRisk,priority,reason,project:project.label,page:project.page,action:gscActionForRow({...r,ctr},project),impressionDelta,clicksDelta,positionDelta};
  }).sort((a,b)=>b.score-a.score||b.impressions-a.impressions);
}
function renderGscOpportunities(){
  const all=gscOpportunityRows(),filter=$('gsc-opportunity-filter')?.value||'all';
  const opportunityCount=all.filter(r=>r.score>=50).length,highCount=all.filter(r=>r.score>=72).length,quickCount=all.filter(r=>r.quickWin).length;
  if($('gsc-opportunity-count'))$('gsc-opportunity-count').textContent=all.length?fmtNum(opportunityCount):'—';
  if($('gsc-high-count'))$('gsc-high-count').textContent=all.length?fmtNum(highCount):'—';
  if($('gsc-quick-count'))$('gsc-quick-count').textContent=all.length?fmtNum(quickCount):'—';
  if($('gsc-top-score'))$('gsc-top-score').textContent=all.length?String(all[0].score):'—';
  let rows=all;
  if(filter==='high')rows=all.filter(r=>r.score>=72);
  else if(filter==='quick')rows=all.filter(r=>r.quickWin);
  else if(filter==='ctr')rows=all.filter(r=>r.ctrRisk);
  const list=$('gsc-opportunity-list');if(!list)return;
  if(!state.gsc||!all.length){list.innerHTML='<div class="empty seo-empty">Importa a tabela de Consultas do Search Console para gerar oportunidades.</div>';return;}
  if(!rows.length){list.innerHTML='<div class="empty seo-empty">Nenhuma consulta corresponde a este filtro.</div>';return;}
  list.innerHTML=rows.slice(0,12).map(r=>{
    const cls=r.priority==='ALTA'?'high':r.priority==='MÉDIA'?'medium':'watch';
    const trends=[];
    if(Number.isFinite(r.impressionDelta))trends.push('impressões '+(r.impressionDelta>=0?'+':'')+fmtNum(r.impressionDelta*100,0)+'%');
    if(Number.isFinite(r.positionDelta)&&Math.abs(r.positionDelta)>=.1)trends.push('posição '+(r.positionDelta>0?'+':'')+fmtNum(r.positionDelta,1));
    const trendHtml=trends.length?'<div class="seo-trend">'+trends.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>':'';
    return '<article class="seo-opportunity-card '+cls+'"><div class="seo-opportunity-top"><div><span class="seo-priority">'+r.priority+(r.quickWin?' · QUICK WIN':'')+'</span><h3>'+esc(r.query)+'</h3></div><b class="seo-score">'+r.score+'</b></div><div class="seo-opportunity-metrics"><span><b>'+fmtNum(r.impressions)+'</b> impressões</span><span><b>'+fmtNum(r.position,1)+'</b> posição</span><span><b>'+fmtNum(r.ctr*100,2)+'%</b> CTR</span></div>'+trendHtml+'<p>'+esc(r.reason)+'</p><strong>'+esc(r.action)+'</strong><small>'+esc(r.project)+' · alvo sugerido: '+esc(r.page)+'</small></article>';
  }).join('');
}
function renderGsc(){
  const g=state.gsc,s=gscSummary(),project=$('gsc-project');
  if(project&&g&&g.projectId!=null)project.value=g.projectId;
  $('gsc-file-label').textContent=g?((g.source==='api'?'Ligação directa · '+(g.siteUrl||'Search Console'):g.fileName)+' · '+fmtDate(g.importedAt)):'Nenhum ficheiro carregado';
  if($('gsc-site-select')&&g?.siteUrl&&!$('gsc-site-select').disabled)$('gsc-site-select').value=g.siteUrl;
  $('gsc-clicks').textContent=s?fmtNum(s.clicks):'—';$('gsc-impressions').textContent=s?fmtNum(s.impressions):'—';$('gsc-ctr').textContent=s?fmtNum(s.ctr*100,2)+'%':'—';$('gsc-position').textContent=s?fmtNum(s.position,2):'—';
  renderGscOpportunities();
  const tbody=$('gsc-table');if(!tbody)return;
  if(!g||!g.rows.length){tbody.innerHTML='<tr><td colspan="6" class="empty-cell">Importa a tabela de Consultas do Search Console.</td></tr>';return;}
  const scoreByQuery=new Map(gscOpportunityRows().map(r=>[r.query,r.score]));
  tbody.innerHTML=g.rows.slice().sort((a,b)=>(scoreByQuery.get(b.query)||0)-(scoreByQuery.get(a.query)||0)||b.impressions-a.impressions).slice(0,80).map(r=>'<tr><td>'+esc(r.query||'—')+'</td><td><b class="table-score">'+(scoreByQuery.get(r.query)||0)+'</b></td><td>'+fmtNum(r.clicks)+'</td><td>'+fmtNum(r.impressions)+'</td><td>'+fmtNum((r.ctr==null?(r.impressions?r.clicks/r.impressions:0):r.ctr)*100,2)+'%</td><td>'+fmtNum(r.position,2)+'</td></tr>').join('');
}
function downloadGscOpportunities(){
  const rows=gscOpportunityRows();if(!rows.length){toast('Sincroniza o Search Console ou importa primeiro um CSV de Consultas.');return;}
  const data=[['score','prioridade','quick_win','consulta','cliques','impressoes','ctr','posicao','projecto','pagina_sugerida','motivo','proxima_accao']];
  rows.forEach(r=>data.push([r.score,r.priority,r.quickWin?'sim':'nao',r.query,r.clicks,r.impressions,(r.ctr*100).toFixed(2)+'%',r.position.toFixed(2),r.project,r.page,r.reason,r.action]));
  const csv=data.map(row=>row.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\n');
  download('oportunidades-seo-'+new Date().toISOString().slice(0,10)+'.csv',csv,'text/csv;charset=utf-8');
  toast('Oportunidades SEO exportadas.');
}

function pendingPaymentTotals(){
  const pending=(state.pendingPayments||[]).filter(p=>p.status==='pending');
  return {count:pending.length,total:pending.reduce((sum,p)=>sum+Math.abs(Number(p.amount)||0),0)};
}
function renderPayments(){
  if(!Array.isArray(state.pendingPayments))state.pendingPayments=[];
  const totals=pendingPaymentTotals();
  if($('payment-pending-total'))$('payment-pending-total').textContent=fmtMoney(totals.total);
  if($('payment-pending-count'))$('payment-pending-count').textContent=totals.count+' pendente'+(totals.count===1?'':'s');
  const tbody=$('payment-table');if(!tbody)return;
  if(!state.pendingPayments.length){tbody.innerHTML='<tr><td colspan="7" class="empty-cell">Sem pagamentos pendentes.</td></tr>';return;}
  tbody.innerHTML=state.pendingPayments.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(row=>{
    const idx=state.pendingPayments.indexOf(row),project=projectById(row.projectId);
    const label=row.status==='received'?'Recebido':row.status==='cancelled'?'Cancelado':'Pendente';
    return '<tr><td>'+esc(row.client||'—')+'</td><td>'+esc(project?project.name:'—')+'</td><td>'+esc(row.description||'—')+'</td><td>'+esc(row.dueDate?fmtDateOnly(row.dueDate):'—')+'</td><td>'+fmtMoney(row.amount)+'</td><td><b>'+label+'</b></td><td>'+(row.status==='pending'?'<button class="btn" data-payment-received="'+idx+'" type="button">Recebi</button> <button class="danger-btn" data-payment-cancel="'+idx+'" title="Cancelar">×</button>':'<button class="danger-btn" data-payment-delete="'+idx+'" title="Eliminar">×</button>')+'</td></tr>';
  }).join('');
  tbody.querySelectorAll('[data-payment-received]').forEach(btn=>btn.addEventListener('click',()=>{
    const row=state.pendingPayments[Number(btn.dataset.paymentReceived)];if(!row||row.status!=='pending')return;
    if(!confirm('Confirmar que '+fmtMoney(row.amount)+' foi efectivamente recebido?'))return;
    row.status='received';row.receivedAt=new Date().toISOString();
    state.transactions.push({id:uid('txn'),date:new Date().toISOString().slice(0,10),type:'income',amount:Math.abs(Number(row.amount)||0),category:'Pagamento recebido',projectId:row.projectId||'',description:(row.client||'Cliente')+(row.description?' · '+row.description:''),createdAt:new Date().toISOString()});
    saveState();renderPayments();renderFinance();toast('Pagamento marcado como recebido e adicionado ao Caixa.');
  }));
  tbody.querySelectorAll('[data-payment-cancel]').forEach(btn=>btn.addEventListener('click',()=>{const row=state.pendingPayments[Number(btn.dataset.paymentCancel)];if(!row)return;if(confirm('Cancelar este pagamento pendente?')){row.status='cancelled';saveState();renderPayments();}}));
  tbody.querySelectorAll('[data-payment-delete]').forEach(btn=>btn.addEventListener('click',()=>{if(confirm('Eliminar este registo de pagamento?')){state.pendingPayments.splice(Number(btn.dataset.paymentDelete),1);saveState();renderPayments();}}));
}

function financeTotals(){return state.transactions.reduce((a,t)=>{const n=Math.abs(Number(t.amount)||0);if(t.type==='income')a.income+=n;else a.expense+=n;a.balance=a.income-a.expense;return a;},{income:0,expense:0,balance:0});}
function renderFinance(){
  const t=financeTotals();$('finance-income').textContent=fmtMoney(t.income);$('finance-expense').textContent=fmtMoney(t.expense);$('finance-balance').textContent=fmtMoney(t.balance);
  const tbody=$('finance-table');
  if(!state.transactions.length){tbody.innerHTML='<tr><td colspan="7" class="empty-cell">Sem movimentos registados.</td></tr>';renderLocalSummary();return;}
  tbody.innerHTML=state.transactions.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||'')).map(row=>{
    const idx=state.transactions.indexOf(row);const project=projectById(row.projectId);
    return '<tr><td>'+esc(fmtDateOnly(row.date))+'</td><td>'+(row.type==='income'?'Entrada':'Saída')+'</td><td>'+esc(row.category)+'</td><td>'+esc(project?project.name:'—')+'</td><td>'+esc(row.description||'—')+'</td><td class="'+(row.type==='income'?'row-income':'row-expense')+'">'+(row.type==='income'?'+':'−')+fmtMoney(Math.abs(row.amount))+'</td><td><button class="danger-btn" data-remove-finance="'+idx+'" title="Eliminar">×</button></td></tr>';
  }).join('');
  tbody.querySelectorAll('[data-remove-finance]').forEach(btn=>btn.addEventListener('click',()=>{if(confirm('Eliminar este movimento?')){state.transactions.splice(Number(btn.dataset.removeFinance),1);saveState();renderFinance();}}));renderLocalSummary();
}
function fillProjectSelects(){
  const projects=allProjects();
  const options='<option value="">Sem projecto</option>'+projects.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
  ['finance-project','payment-project','vault-project'].forEach(id=>{const el=$(id);if(el&&el.dataset.ready!==String(projects.length)){const current=el.value;el.innerHTML=options;el.value=current;el.dataset.ready=String(projects.length);}});
}

function download(name,content,type='text/plain;charset=utf-8'){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
function reportObject(){return {exportedAt:new Date().toISOString(),monitor:live,crm:state.clients,leads:state.leads,agent:state.agent,finance:{transactions:state.transactions,pendingPayments:state.pendingPayments,pendingTotals:pendingPaymentTotals(),totals:financeTotals()},gsc:state.gsc?{source:state.gsc.source||'csv',fileName:state.gsc.fileName,siteUrl:state.gsc.siteUrl||'',importedAt:state.gsc.importedAt,projectId:state.gsc.projectId||'',periodDays:state.gsc.periodDays||null,summary:gscSummary(),opportunities:gscOpportunityRows().slice(0,30),rows:state.gsc.rows,previousRows:state.gsc.previousRows||[]}:null};}
function sitesCsv(){
  const rows=[['site','url','online','http','response_ms','changed','title','h1_count','sitemap_urls','issues']];
  sites.forEach(s=>{const r=siteResult(s.id)||{};rows.push([s.name,s.url,r.online,r.status,r.responseTimeMs,r.changed,r.title,r.h1Count,r.sitemapUrls,(r.issues||[]).map(x=>x.message).join(' | ')]);});
  return rows.map(row=>row.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\n');
}
function exportBackup(){
  const vaultRaw=localStorage.getItem(VAULT_KEY);const payload={kind:'centro-negocios-backup',version:APP_VERSION,exportedAt:new Date().toISOString(),state,vault:vaultRaw?JSON.parse(vaultRaw):null};
  download('centro-negocios-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(payload,null,2),'application/json');toast('Backup criado.');
}
async function importBackup(file){
  const parsed=JSON.parse(await file.text());if(!parsed||parsed.kind!=='centro-negocios-backup'||!parsed.state)throw new Error('Ficheiro de backup inválido.');
  state=normalizeState(parsed.state);localStorage.setItem(STORE_KEY,JSON.stringify(state));
  if(parsed.vault)localStorage.setItem(VAULT_KEY,JSON.stringify(parsed.vault));else localStorage.removeItem(VAULT_KEY);
  lockVault(false);renderAll();toast('Backup restaurado.');
}

function b64(bytes){let s='';bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s);}
function unb64(value){const s=atob(value);const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
async function deriveVaultKey(passphrase,salt){
  const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function writeVault(items,passphrase){
  const old=readVaultBlob();const salt=old?unb64(old.salt):crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));const key=await deriveVaultKey(passphrase,salt);
  const plaintext=new TextEncoder().encode(JSON.stringify({version:1,items}));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plaintext));
  const blob={version:1,kdf:'PBKDF2-SHA256',iterations:250000,cipher:'AES-GCM',salt:b64(salt),iv:b64(iv),data:b64(cipher),updatedAt:new Date().toISOString()};localStorage.setItem(VAULT_KEY,JSON.stringify(blob));return blob;
}
function readVaultBlob(){try{const raw=localStorage.getItem(VAULT_KEY);return raw?JSON.parse(raw):null;}catch{return null;}}
async function readVault(passphrase){
  const blob=readVaultBlob();if(!blob)return [];
  const key=await deriveVaultKey(passphrase,unb64(blob.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)},key,unb64(blob.data));const parsed=JSON.parse(new TextDecoder().decode(plain));return Array.isArray(parsed.items)?parsed.items:[];
}
function setupVaultState(){
  const exists=Boolean(readVaultBlob());$('vault-confirm').hidden=exists;$('vault-lock-title').textContent=exists?'Abrir cofre':'Criar cofre';$('vault-unlock-btn').textContent=exists?'Abrir cofre':'Criar cofre';
  $('vault-lock-copy').textContent=exists?'A palavra-passe mestra desbloqueia as credenciais neste dispositivo.':'Define uma palavra-passe mestra com pelo menos 10 caracteres. Ela não é guardada nem incluída no backup.';
  $('sys-vault').textContent=exists?'Configurado':'Por configurar';
}
async function unlockVault(){
  const pass=$('vault-passphrase').value;const exists=Boolean(readVaultBlob());$('vault-error').textContent='';
  if(pass.length<10){$('vault-error').textContent='Usa pelo menos 10 caracteres.';return;}
  if(!exists&&pass!==$('vault-confirm').value){$('vault-error').textContent='A confirmação não corresponde.';return;}
  try{
    if(!exists)await writeVault([],pass);
    vaultSession=await readVault(pass);vaultPassphrase=pass;$('vault-passphrase').value='';$('vault-confirm').value='';$('vault-locked').hidden=true;$('vault-open').hidden=false;$('vault-state-tag').textContent='aberto';renderVault();scheduleVaultLock();toast(exists?'Cofre aberto.':'Cofre criado.');
  }catch{$('vault-error').textContent='Palavra-passe incorrecta ou cofre danificado.';}
}
function scheduleVaultLock(){clearTimeout(vaultTimer);vaultTimer=setTimeout(()=>lockVault(true),VAULT_LOCK_MS);}
function lockVault(showToast=true){clearTimeout(vaultTimer);vaultSession=null;vaultPassphrase=null;if($('vault-open'))$('vault-open').hidden=true;if($('vault-locked'))$('vault-locked').hidden=false;if($('vault-state-tag'))$('vault-state-tag').textContent='bloqueado';setupVaultState();if(showToast)toast('Cofre bloqueado.');}
async function persistVault(){if(!vaultSession||!vaultPassphrase)return;await writeVault(vaultSession,vaultPassphrase);scheduleVaultLock();}
function renderVault(){
  if(!vaultSession)return;$('vault-count').textContent=vaultSession.length+' credencia'+(vaultSession.length===1?'l':'is');const box=$('vault-list');
  if(!vaultSession.length){box.innerHTML='<div class="empty">Cofre vazio.</div>';return;}
  box.innerHTML=vaultSession.map(item=>{const project=projectById(item.projectId);return '<article class="vault-item" data-vault-id="'+esc(item.id)+'"><div><small>Serviço</small><b>'+esc(item.label)+'</b><span>'+esc(project?project.name:'Sem projecto')+'</span></div><div><small>Utilizador</small><span>'+esc(item.user||'—')+'</span></div><div><small>Segredo</small><div class="vault-secret-row"><span class="vault-secret">••••••••••</span><button class="vault-mini" data-vault-reveal="'+esc(item.id)+'" type="button">ver</button><button class="vault-mini" data-vault-copy="'+esc(item.id)+'" type="button">copiar</button></div></div><div class="vault-actions">'+(safeUrl(item.url)?'<a class="vault-mini" href="'+esc(safeUrl(item.url))+'" target="_blank" rel="noreferrer">abrir</a>':'')+'<button class="vault-mini" data-vault-delete="'+esc(item.id)+'" type="button">×</button></div></article>';}).join('');
  box.querySelectorAll('[data-vault-reveal]').forEach(btn=>btn.addEventListener('click',()=>{const item=vaultSession.find(x=>x.id===btn.dataset.vaultReveal);const row=btn.closest('.vault-item').querySelector('.vault-secret');const shown=row.dataset.shown==='1';row.textContent=shown?'••••••••••':item.secret;row.dataset.shown=shown?'0':'1';btn.textContent=shown?'ver':'ocultar';scheduleVaultLock();}));
  box.querySelectorAll('[data-vault-copy]').forEach(btn=>btn.addEventListener('click',async()=>{const item=vaultSession.find(x=>x.id===btn.dataset.vaultCopy);await navigator.clipboard.writeText(item.secret);scheduleVaultLock();toast('Segredo copiado.');}));
  box.querySelectorAll('[data-vault-delete]').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('Eliminar esta credencial?'))return;vaultSession=vaultSession.filter(x=>x.id!==btn.dataset.vaultDelete);await persistVault();renderVault();toast('Credencial eliminada.');}));
}


function normalizeAIEndpoint(value){
  const raw=String(value||'').trim().replace(/\/+$/,'');
  if(!raw)return '';
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')return '';
    return url.href.replace(/\/+$/,'');
  }catch{return '';}
}
function getAIEndpoint(){return normalizeAIEndpoint(localStorage.getItem(AI_ENDPOINT_KEY)||AI_DEFAULT_ENDPOINT);}
function renderAIStatus(){
  if(!$('ai-status'))return;
  const endpoint=getAIEndpoint();
  $('ai-status').textContent=endpoint?'ONLINE':'OFFLINE';
  if(endpoint&&!$('ai-endpoint').value)$('ai-endpoint').value=endpoint;
}
function aiContext(){
  const projects=allProjects().map(project=>{
    const technical=siteResult(project.id);
    return {
      id:project.id,
      name:project.name,
      area:project.area||'',
      crm:state.clients[project.id]||null,
      technical:technical?{
        online:technical.online,status:technical.status,responseTimeMs:technical.responseTimeMs,
        title:technical.title,description:technical.description,h1Count:technical.h1Count,
        firstH1:technical.firstH1,canonical:technical.canonical,sitemapUrls:technical.sitemapUrls,
        issues:technical.issues||[]
      }:null
    };
  });
  const g=gscSummary();
  return {
    generatedAt:new Date().toISOString(),
    auditGeneratedAt:live.generatedAt||null,
    projects,
    leads:state.leads.slice(-50).map(lead=>({name:lead.name,status:lead.status,contact:lead.contact||'',createdAt:lead.createdAt||null})),
    finance:{...financeTotals(),movements:state.transactions.length,pending:pendingPaymentTotals(),pendingPayments:(state.pendingPayments||[]).filter(p=>p.status==='pending')},
    searchConsole:g?{summary:g,project:gscProjectHint(),topQueries:(state.gsc.rows||[]).slice().sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,20),opportunities:gscOpportunityRows().slice(0,20)}:null,
    opportunities:(state.agent?.opportunities||[]).slice(-50),
    pendingDecisions:(state.agent?.decisions||[]).filter(x=>x.status==='pending').slice(-30).map(x=>({type:x.type,title:x.title,reason:x.reason,payload:x.payload}))
  };
}
async function aiFetch(path,options={}){
  const endpoint=getAIEndpoint();
  if(!endpoint)throw new Error('Worker da IA indisponível.');
  const response=await fetch(endpoint+path,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw new Error((data&&data.error)||('Erro HTTP '+response.status));
  return data||{};
}
async function testAIEndpoint(){
  const candidate=normalizeAIEndpoint($('ai-endpoint').value);
  if(!candidate){toast('URL do Worker inválido.');return;}
  localStorage.setItem(AI_ENDPOINT_KEY,candidate);
  $('ai-status').textContent='TESTE';
  try{
    const data=await aiFetch('/health',{method:'GET',headers:{}});
    $('ai-status').textContent=data.ok?'ONLINE':'ERRO';
    toast(data.ok?'Núcleo IA ligado.':'Worker sem confirmação.');
  }catch(err){$('ai-status').textContent='ERRO';toast('Falha na IA: '+err.message);}
}
function queueAgentActions(actions,sourceQuestion=''){
  const allowed=new Set(['create_lead','update_crm','create_opportunity','create_note']);
  const created=[];
  for(const action of Array.isArray(actions)?actions:[]){
    if(!action||!allowed.has(action.type))continue;
    const item={
      id:uid('decision'),type:action.type,title:String(action.title||'Acção proposta').slice(0,120),
      reason:String(action.reason||'').slice(0,500),payload:action.payload&&typeof action.payload==='object'?action.payload:{},
      sourceQuestion:String(sourceQuestion||'').slice(0,500),status:'pending',telegramSent:false,createdAt:new Date().toISOString()
    };
    state.agent.decisions.push(item);created.push(item);
  }
  if(created.length)localStorage.setItem(STORE_KEY,JSON.stringify(state));
  renderAgentState();
  created.forEach(item=>sendDecisionTelegram(item.id,true));
  return created.length;
}
function renderAgentState(){
  if(!state.agent)state.agent={opportunities:[],decisions:[],reports:[],telegramOffset:0};
  const pending=state.agent.decisions.filter(x=>x.status==='pending').slice().reverse();
  if($('decision-count'))$('decision-count').textContent=pending.length;
  if($('decision-count-secondary'))$('decision-count-secondary').textContent=pending.length;
  if($('opportunity-count'))$('opportunity-count').textContent=state.agent.opportunities.length;

  if($('decision-list')){
    $('decision-list').innerHTML=pending.length?pending.map(item=>
      '<article class="decision-card">'+
      '<div class="decision-type">'+esc(item.type.replaceAll('_',' ').toUpperCase())+'</div>'+
      '<h3>'+esc(item.title)+'</h3>'+
      '<p>'+esc(item.reason||'Sem justificação adicional.')+'</p>'+
      '<div class="decision-actions">'+
      '<button type="button" class="approve" data-decision-approve="'+esc(item.id)+'">CONFIRMAR</button>'+
      '<button type="button" data-decision-telegram="'+esc(item.id)+'">TELEGRAM</button>'+
      '<button type="button" class="reject" data-decision-reject="'+esc(item.id)+'">RECUSAR</button>'+
      '</div></article>'
    ).join(''):'<div class="empty">Nenhuma decisão pendente.</div>';

    $('decision-list').querySelectorAll('[data-decision-approve]').forEach(btn=>btn.addEventListener('click',()=>applyAgentDecision(btn.dataset.decisionApprove)));
    $('decision-list').querySelectorAll('[data-decision-reject]').forEach(btn=>btn.addEventListener('click',()=>rejectAgentDecision(btn.dataset.decisionReject)));
    $('decision-list').querySelectorAll('[data-decision-telegram]').forEach(btn=>btn.addEventListener('click',()=>sendDecisionTelegram(btn.dataset.decisionTelegram)));
  }

  if($('opportunity-list')){
    const rows=state.agent.opportunities.slice().reverse();
    $('opportunity-list').innerHTML=rows.length?rows.map(item=>
      '<article class="opportunity-card"><div><span>'+esc(item.niche||'SINAL')+'</span><h3>'+esc(item.title||'Oportunidade')+'</h3></div>'+
      '<p>'+esc(item.note||'')+'</p><small>'+esc(item.area||'Zona por confirmar')+' · '+esc(fmtDate(item.createdAt))+'</small></article>'
    ).join(''):'<div class="empty">Ainda não há sinais guardados.</div>';
  }
}
function applyAgentDecision(id){
  const item=state.agent.decisions.find(x=>x.id===id&&x.status==='pending');if(!item)return;
  const p=item.payload||{};
  if(item.type==='create_lead'){
    const name=String(p.name||item.title||'Lead').trim();
    if(!state.leads.some(x=>x.name.toLowerCase()===name.toLowerCase())){
      state.leads.push({id:uid('lead'),name,url:String(p.url||''),contact:String(p.contact||item.reason||''),status:['Novo','Contactado','Interessado','Proposta','Fechado','Perdido'].includes(p.status)?p.status:'Novo',createdAt:new Date().toISOString()});
    }
  }else if(item.type==='update_crm'){
    const project=allProjects().find(x=>x.id===p.projectId);
    if(project&&String(p.note||'').trim()){
      const current=state.clients[project.id]||{stage:'Activo',note:''};
      state.clients[project.id]={...current,note:String(p.note).trim()};
    }
  }else if(item.type==='create_opportunity'||item.type==='create_note'){
    state.agent.opportunities.push({
      id:uid('opp'),title:String(p.title||item.title||'Sinal').trim(),area:String(p.area||''),niche:String(p.niche||item.type==='create_note'?'Nota':'Oportunidade'),
      note:String(p.note||item.reason||'').trim(),createdAt:new Date().toISOString(),source:'agent'
    });
  }
  item.status='approved';item.resolvedAt=new Date().toISOString();
  saveState();renderCRM();renderLeads();toast('Acção confirmada e aplicada.');
}
function rejectAgentDecision(id){
  const item=state.agent.decisions.find(x=>x.id===id&&x.status==='pending');if(!item)return;
  item.status='rejected';item.resolvedAt=new Date().toISOString();saveState();toast('Proposta recusada.');
}
async function sendDecisionTelegram(id,silent=false){
  const item=state.agent.decisions.find(x=>x.id===id);if(!item||item.status!=='pending')return;
  try{
    await aiFetch('/api/telegram/decision',{method:'POST',body:JSON.stringify({decision:{id:item.id,title:item.title,reason:item.reason}})});
    item.telegramSent=true;item.telegramSentAt=new Date().toISOString();localStorage.setItem(STORE_KEY,JSON.stringify(state));
    if(!silent)toast('Pedido enviado para o Telegram.');
  }catch(err){if(!silent)toast(err.message);}
}
async function pollTelegramApprovals(showToast=false){
  if(!state.agent)return;
  const offset=Number(state.agent.telegramOffset)||0;
  try{
    const data=await aiFetch('/api/telegram/poll?offset='+encodeURIComponent(offset),{method:'GET',headers:{}});
    if(Number(data.maxUpdateId)>offset){state.agent.telegramOffset=Number(data.maxUpdateId);localStorage.setItem(STORE_KEY,JSON.stringify(state));}
    let applied=0,rejected=0;
    for(const remote of Array.isArray(data.decisions)?data.decisions:[]){
      const item=state.agent.decisions.find(x=>x.id===remote.decisionId&&x.status==='pending');
      if(!item)continue;
      if(remote.status==='approved'){applyAgentDecision(item.id);applied++;}
      if(remote.status==='rejected'){rejectAgentDecision(item.id);rejected++;}
    }
    if(showToast&&(applied||rejected))toast('Telegram: '+applied+' confirmada(s), '+rejected+' recusada(s).');
  }catch{}
}
async function checkTelegramStatus(showToast=true){
  if(!$('telegram-status'))return;
  $('telegram-status').textContent='A VERIFICAR';
  try{
    const data=await aiFetch('/api/telegram/status',{method:'GET',headers:{}});
    $('telegram-status').textContent=data.configured?'LIGADO':'POR LIGAR';
    if(data.configured)pollTelegramApprovals(false);
    if(showToast)toast(data.configured?'Telegram ligado.':'Telegram ainda precisa do bot.');
  }catch{$('telegram-status').textContent='ERRO';if(showToast)toast('Não consegui verificar o Telegram.');}
}
async function askAI(questionOverride){
  const question=String(questionOverride||$('ai-question').value||'').trim();
  if(!question){toast('Diz à IA o que queres analisar.');return;}
  $('ai-question').value=question;
  const btn=$('ai-ask-btn'),answer=$('ai-answer');
  btn.disabled=true;btn.textContent='A PROCESSAR';
  answer.classList.add('loading');answer.textContent='A cruzar sinais da operação…';
  try{
    const data=await aiFetch('/api/agent',{method:'POST',body:JSON.stringify({question,context:aiContext()})});
    const added=queueAgentActions(data.actions,question);
    answer.textContent=(data.summary||'Análise concluída.')+(added?'\\n\\n'+added+' proposta'+(added===1?'':'s')+' aguarda'+(added===1?'':'m')+' confirmação.':'');
    $('ai-status').textContent='ONLINE';
  }catch(err){
    answer.textContent='Falha: '+err.message;$('ai-status').textContent='ERRO';
  }finally{answer.classList.remove('loading');btn.disabled=false;btn.textContent='EXECUTAR';}
}
async function captureOpportunity(){
  const input=$('prospect-capture');const raw=String(input.value||'').trim();
  if(!raw){toast('Diz ou escreve o sinal que encontraste.');return;}
  const captured={id:uid('opp'),title:raw.slice(0,100),area:'',niche:'Sinal capturado',note:raw,createdAt:new Date().toISOString(),source:'capture'};
  state.agent.opportunities.push(captured);saveState();input.value='';toast('Sinal guardado no radar.');
  openPanel('assistente');
  await askAI('Analisa este novo sinal de prospecção: "'+raw+'". Se houver dados suficientes, propõe apenas as acções concretas que devo confirmar. Não inventes nome, morada ou contacto.');
}

function executionStatus(row){
  if(row.status==='running')return {label:'A EXECUTAR',cls:'running'};
  if(row.status==='queued')return {label:'NA FILA',cls:'queued'};
  if(row.status==='pending')return {label:'A AGUARDAR',cls:'pending'};
  if(row.status==='rejected')return {label:'RECUSADO',cls:'rejected'};
  if(row.status==='completed'&&Number(row.exitCode)===0)return {label:'CONCLUÍDO',cls:'done'};
  if(row.status==='completed')return {label:'ERRO',cls:'error'};
  return {label:String(row.status||'—').toUpperCase(),cls:'pending'};
}
function executionClock(ms){
  if(!ms)return '—';
  try{return new Date(ms).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return '—';}
}
function renderExecutions(payload){
  const list=$('execution-list');const summary=$('execution-summary');
  if(!list||!summary)return;
  const rows=Array.isArray(payload?.executions)?payload.executions:[];
  const stats=payload?.stats||{};
  const active=(Number(stats.running)||0)+(Number(stats.queued)||0)+(Number(stats.pending)||0);
  summary.textContent=active?active+' ACTIVAS':'EM REPOUSO';
  summary.classList.toggle('is-live',Boolean(active));
  if(!rows.length){list.innerHTML='<div class="empty">Ainda não há execuções registadas.</div>';return;}
  list.innerHTML=rows.slice(0,12).map(row=>{
    const st=executionStatus(row);
    const duration=row.durationMs?Math.max(1,Math.round(row.durationMs/1000))+'s':'—';
    const output=String(row.output||'').replace(/\s+/g,' ').trim().slice(0,220);
    return '<article class="execution-row '+st.cls+'">'+
      '<div class="execution-main"><div><span>'+esc(row.target||row.source||'Centro')+'</span><b>'+esc(row.label||row.action||'Execução')+'</b></div>'+
      '<em class="execution-state">'+esc(st.label)+'</em></div>'+
      '<div class="execution-meta"><span>'+executionClock(row.startedAt||row.createdAt)+'</span><span>'+esc(duration)+'</span><span>exit '+(row.exitCode==null?'—':esc(row.exitCode))+'</span></div>'+
      (output?'<p>'+esc(output)+'</p>':'')+
      '</article>';
  }).join('');
}
async function loadExecutions(){
  if(!$('execution-list'))return;
  try{
    const data=await aiFetch('/api/executions?limit=20',{method:'GET',headers:{}});
    renderExecutions(data);
    window.CentroRoom?.update(data);
  }catch(err){
    window.CentroRoom?.offline();
    const summary=$('execution-summary');if(summary)summary.textContent='SEM LIGAÇÃO';
  }
}

function renderSystem(){
  const age=ageMinutes(live.generatedAt);$('sys-monitor').textContent=live.generatedAt?(age!=null&&age>40?'Leitura atrasada':'Activo · '+ageLabel(live.generatedAt)):'Sem leitura';
  try{const t='__centro_test';localStorage.setItem(t,'1');localStorage.removeItem(t);$('sys-storage').textContent='Disponível';}catch{$('sys-storage').textContent='Bloqueado';}
  $('sys-gsc').textContent=state.gsc?((state.gsc.source==='api'?'API · ':'')+fmtDate(state.gsc.importedAt)):'Sem dados';$('sys-ocr').textContent=window.Tesseract?'Disponível':'Motor indisponível';$('sys-pwa').textContent=('serviceWorker'in navigator)?'Suportado':'Não suportado';setupVaultState();
}

function setupEvents(){
  setupPanelNavigation();
  $('room-refresh')?.addEventListener('click',loadExecutions);
  $('refresh-btn').addEventListener('click',loadLive);
  $('backup-top-btn').addEventListener('click',exportBackup);
  $('export-backup').addEventListener('click',exportBackup);
  $('ai-save-endpoint').addEventListener('click',()=>{
    const endpoint=normalizeAIEndpoint($('ai-endpoint').value);
    if(!endpoint){toast('URL do Worker inválido.');return;}
    localStorage.setItem(AI_ENDPOINT_KEY,endpoint);renderAIStatus();toast('Ligação IA guardada.');
  });
  $('ai-test-endpoint').addEventListener('click',testAIEndpoint);
  $('ai-ask-btn').addEventListener('click',()=>askAI());
  $('ai-clear-btn').addEventListener('click',()=>{$('ai-question').value='';$('ai-answer').innerHTML='<div class="empty">Pronto para analisar a operação.</div>';});
  $('ai-question').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')askAI();});
  $('ai-voice-btn').addEventListener('click',()=>startDictation('ai-question'));
  $('prospect-voice-btn').addEventListener('click',()=>startDictation('prospect-capture'));
  $('prospect-analyse').addEventListener('click',captureOpportunity);
  $('prospect-capture').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();captureOpportunity();}});
  $('payment-form')?.addEventListener('submit',e=>{
    e.preventDefault();
    const amount=Math.abs(Number($('payment-amount').value)||0);
    if(!amount){toast('Indica um valor válido.');return;}
    state.pendingPayments.push({id:uid('payment'),client:$('payment-client').value.trim(),amount,projectId:$('payment-project').value,description:$('payment-description').value.trim(),dueDate:$('payment-due-date').value,status:'pending',createdAt:new Date().toISOString()});
    saveState();e.target.reset();renderPayments();toast('Pagamento pendente adicionado.');
  });
  $('finance-form')?.addEventListener('submit',e=>{
    e.preventDefault();
    const amount=Math.abs(Number($('finance-amount').value)||0);if(!amount){toast('Indica um valor válido.');return;}
    state.transactions.push({id:uid('txn'),date:$('finance-date').value,type:$('finance-type').value,amount,category:$('finance-category').value.trim(),projectId:$('finance-project').value,description:$('finance-description').value.trim(),createdAt:new Date().toISOString()});
    saveState();e.target.reset();$('finance-date').value=new Date().toISOString().slice(0,10);renderFinance();toast('Movimento registado.');
  });
  $('gsc-pair-btn')?.addEventListener('click',pairGscDevice);
  $('gsc-sync-btn')?.addEventListener('click',syncGscDirect);
  $('gsc-site-select')?.addEventListener('change',event=>{if(event.target.value)localStorage.setItem(GSC_SITE_KEY,event.target.value);});
  $('gsc-input')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      const rows=parseCSV(await file.text());if(!rows.length)throw new Error('O CSV não tem consultas válidas.');
      state.gsc={source:'csv',fileName:file.name,importedAt:new Date().toISOString(),projectId:$('gsc-project')?.value||'',rows,previousRows:[]};
      saveState();renderGsc();renderSystem();toast(rows.length+' consultas importadas. O radar SEO já está calculado.');
    }catch(err){event.target.value='';toast(err.message||'Não foi possível ler o CSV.');}
  });
  $('gsc-project')?.addEventListener('change',event=>{
    if(state.gsc){state.gsc.projectId=event.target.value;saveState();}
    renderGsc();
  });
  $('gsc-opportunity-filter')?.addEventListener('change',renderGscOpportunities);
  $('gsc-export-opportunities')?.addEventListener('click',downloadGscOpportunities);
  $('clear-gsc-btn')?.addEventListener('click',()=>{
    if(!state.gsc)return;
    if(!confirm('Remover a importação actual do Search Console?'))return;
    state.gsc=null;saveState();if($('gsc-input'))$('gsc-input').value='';renderGsc();renderSystem();toast('Importação removida.');
  });
  $('telegram-check-btn').addEventListener('click',async()=>{await checkTelegramStatus(true);await pollTelegramApprovals(true);});
  document.querySelectorAll('[data-ai-question]').forEach(btn=>btn.addEventListener('click',()=>{
    if(btn.dataset.openAi==='1')openPanel('assistente');
    askAI(btn.dataset.aiQuestion);
  }));

}

function setupDashboardChrome(){
  const dateEl=$('dashboard-date');
  if(dateEl){
    const label=new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
    dateEl.textContent=label.charAt(0).toUpperCase()+label.slice(1);
  }
  const search=$('global-search');
  if(search){
    search.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      const q=search.value.trim().toLowerCase();
      if(!q)return;
      const routes=[
        {terms:['cliente','clientes','projeto','projecto','pentehouse','pizza','kebab','irmãos','irmaos','beatriz'],panel:'crm'},
        {terms:['site','sites','online','auditoria'],panel:'sites'},
        {terms:['seo','google','search','posição','posicao','ranking'],panel:'seo'},
        {terms:['automação','automacao','ia','inteligência','inteligencia','agente'],panel:'assistente'},
        {terms:['oportunidade','oportunidades','radar','prospeção','prospecao'],panel:'radar'},
        {terms:['lead','leads'],panel:'leads'},
        {terms:['financeiro','caixa','saldo','pagamento','pagamentos'],panel:'caixa'},
        {terms:['cofre','senha','password'],panel:'cofre'},
        {terms:['definições','definicoes','sistema','backup'],panel:'ferramentas'}
      ];
      const route=routes.find(item=>item.terms.some(term=>q.includes(term)));
      if(route){openPanel(route.panel);search.blur();return;}
      toast('Não encontrei esse módulo. Pesquisa por cliente, site, SEO, IA, financeiro ou definições.');
    });
  }
}

function setupPWA(){
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install-btn').hidden=false;});
  $('install-btn').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install-btn').hidden=true;});
}

document.addEventListener('DOMContentLoaded',()=>{
  seedCRMDefaults();seedLeadDefaults();seedPaymentDefaults();setupEvents();setupDashboardChrome();setupPWA();
  $('finance-date').value=new Date().toISOString().slice(0,10);
  renderLeads();renderPayments();renderFinance();renderGsc();renderAgentState();setupVaultState();renderSystem();renderAIStatus();refreshGscConnection();
  checkTelegramStatus(false);pollTelegramApprovals(false);loadExecutions();
  setInterval(()=>pollTelegramApprovals(false),30000);
  setInterval(()=>loadExecutions(),3000);
  loadLive();
});
