const STORE_KEY = 'centro_ia_real_v2';
let sites = [];
let live = { generatedAt: null, sites: [] };
let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : { clients:{}, leads:[], gsc:null };
  }catch(e){
    return { clients:{}, leads:[], gsc:null };
  }
}
function saveState(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function esc(value){
  return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
}
function fmtDate(value){
  if(!value) return 'sem leitura';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short'}).format(d);
}
function fmtNum(value, digits){
  if(value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('pt-PT',{maximumFractionDigits:digits == null ? 0 : digits}).format(Number(value));
}
function humanMs(value){ return value == null ? '—' : fmtNum(value,0) + ' ms'; }
function siteResult(id){ return (live.sites || []).find(function(x){return x.id === id;}); }

async function loadLive(){
  const stamp = Date.now();
  try{
    const responses = await Promise.all([
      fetch('./data/sites.json?v='+stamp,{cache:'no-store'}),
      fetch('./data/live.json?v='+stamp,{cache:'no-store'})
    ]);
    if(!responses[0].ok) throw new Error('sites.json ' + responses[0].status);
    sites = await responses[0].json();
    if(responses[1].ok) live = await responses[1].json();
    renderAll();
  }catch(err){
    document.getElementById('monitor-label').textContent = 'erro a carregar monitor';
    document.querySelector('.live-badge').className = 'live-badge bad';
    document.getElementById('site-grid').innerHTML = '<div class="empty">Não foi possível ler o snapshot técnico: '+esc(err.message)+'</div>';
  }
}

function renderAll(){
  renderMonitorStatus();
  renderKpis();
  renderSites();
  renderAlerts();
  renderConnections();
  renderCRM();
  renderLeads();
  renderGsc();
}

function renderMonitorStatus(){
  const badge = document.querySelector('.live-badge');
  const label = document.getElementById('monitor-label');
  if(live.generatedAt){
    badge.className = 'live-badge ok';
    label.textContent = 'dados reais · ' + fmtDate(live.generatedAt);
  }else{
    badge.className = 'live-badge';
    label.textContent = 'à espera da primeira leitura';
  }
}

function renderKpis(){
  const results = live.sites || [];
  if(!live.generatedAt || !results.length){
    ['kpi-online','kpi-issues','kpi-changes','kpi-updated'].forEach(function(id){document.getElementById(id).textContent='—';});
    return;
  }
  const online = results.filter(function(r){return r.online;}).length;
  const issues = results.reduce(function(total,r){return total + ((r.issues||[]).length);},0);
  const changes = results.filter(function(r){return r.changed === true;}).length;
  document.getElementById('kpi-online').textContent = online + '/' + results.length;
  document.getElementById('kpi-issues').textContent = issues;
  document.getElementById('kpi-changes').textContent = changes;
  document.getElementById('kpi-updated').textContent = fmtDate(live.generatedAt);
  document.getElementById('kpi-online-note').textContent = online === results.length ? 'todos responderam' : (results.length-online)+' com falha';
  document.getElementById('kpi-issues-note').textContent = issues ? 'ver detalhes abaixo' : 'sem alertas técnicos';
  document.getElementById('kpi-changes-note').textContent = 'comparação com a leitura anterior';
}

function yesNo(ok,label){
  return '<span class="check '+(ok?'yes':'no')+'">'+esc(label)+'</span>';
}
function renderSites(){
  const grid = document.getElementById('site-grid');
  if(!sites.length){grid.innerHTML='<div class="empty">Não há sites configurados.</div>';return;}
  grid.innerHTML = sites.map(function(s){
    const r = siteResult(s.id);
    if(!r){
      return '<article class="site-card"><div class="site-top"><div><h3>'+esc(s.name)+'</h3><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.url)+'</a></div><span class="status wait">SEM LEITURA</span></div><div class="empty" style="margin-top:12px">A primeira verificação automática ainda não terminou.</div></article>';
    }
    const statusClass = r.online ? 'ok' : 'bad';
    const checks = r.checks || {};
    return '<article class="site-card">'+
      '<div class="site-top"><div><h3>'+esc(s.name)+'</h3><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.url)+'</a></div><span class="status '+statusClass+'">'+(r.online?'ONLINE':'FALHA')+'</span></div>'+
      '<div class="fact-grid">'+
        '<div class="fact"><span>HTTP</span><b>'+esc(r.status == null?'—':r.status)+'</b></div>'+
        '<div class="fact"><span>Resposta</span><b>'+humanMs(r.responseTimeMs)+'</b></div>'+
        '<div class="fact"><span>Title</span><b title="'+esc(r.title||'')+'">'+esc(r.title||'em falta')+'</b></div>'+
        '<div class="fact"><span>H1</span><b>'+esc(r.h1Count == null?'—':r.h1Count)+'</b></div>'+
        '<div class="fact"><span>Sitemap URLs</span><b>'+esc(r.sitemapUrls == null?'—':r.sitemapUrls)+'</b></div>'+
        '<div class="fact"><span>Alterado</span><b>'+esc(r.changed===true?'sim':r.changed===false?'não':'1.ª leitura')+'</b></div>'+
      '</div>'+
      '<div class="technical">'+
        yesNo(checks.title,'title')+yesNo(checks.description,'description')+yesNo(checks.h1,'H1')+yesNo(checks.canonical,'canonical')+yesNo(checks.robots,'robots')+yesNo(checks.sitemap,'sitemap')+yesNo(checks.schema,'schema')+
      '</div>'+
    '</article>';
  }).join('');
}

function renderAlerts(){
  const box = document.getElementById('alerts-list');
  const rows = [];
  (live.sites||[]).forEach(function(r){
    (r.issues||[]).forEach(function(issue){
      rows.push({name:r.name, text:issue.message||String(issue), level:issue.level||'warn'});
    });
  });
  if(!rows.length){
    box.innerHTML = live.generatedAt ? '<div class="stack-item good"><b>Sem alertas técnicos nesta leitura</b><p>O monitor não encontrou falhas nas verificações activas.</p></div>' : '<div class="empty">A aguardar a primeira leitura automática.</div>';
    return;
  }
  box.innerHTML = rows.map(function(x){
    return '<div class="stack-item '+(x.level==='danger'?'danger':'warn')+'"><b>'+esc(x.name)+'</b><p>'+esc(x.text)+'</p></div>';
  }).join('');
}

function renderConnections(){
  const box = document.getElementById('connections-list');
  const signals = [];
  (live.sites||[]).forEach(function(r){
    if(r.changed===true) signals.push({title:r.name+' · conteúdo alterado',text:'O HTML mudou desde a verificação anterior. Confirma se foi uma alteração planeada e compara title, H1, canonical e sitemap.'});
    if(r.responseTimeMs>2000) signals.push({title:r.name+' · resposta lenta',text:'A leitura do servidor ultrapassou 2 segundos ('+humanMs(r.responseTimeMs)+'). Vale a pena cruzar isto com performance e experiência mobile.'});
    if(r.checks && r.checks.sitemap && r.sitemapUrls>0 && !r.checks.canonical) signals.push({title:r.name+' · sitemap sem canonical consistente',text:'O site expõe URLs no sitemap, mas a homepage não apresentou canonical válido nesta leitura.'});
    if(r.checks && r.checks.schema && !r.checks.description) signals.push({title:r.name+' · entidades sem description',text:'Existe dados estruturados, mas falta meta description na homepage. A entidade está marcada, mas o snippet perdeu um sinal básico.'});
  });
  if(!signals.length){
    box.innerHTML = live.generatedAt ? '<div class="stack-item good"><b>Nenhuma ligação anómala detectada</b><p>O motor só cria sinais quando existem dados concretos para cruzar. Não inventa oportunidades.</p></div>' : '<div class="empty">A aguardar dados reais para cruzar.</div>';
    return;
  }
  box.innerHTML = signals.map(function(s){return '<div class="stack-item"><b>'+esc(s.title)+'</b><p>'+esc(s.text)+'</p></div>';}).join('');
}

function renderCRM(){
  const grid=document.getElementById('crm-grid');
  grid.innerHTML=sites.map(function(s){
    const c=state.clients[s.id]||{stage:'Activo',note:''};
    return '<article class="crm-card" data-client="'+esc(s.id)+'">'+
      '<h3>'+esc(s.name)+'</h3><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.url)+'</a>'+
      '<div class="field"><label>Estado</label><select class="client-stage">'+
      ['Activo','Prospecção','Pausado','Concluído'].map(function(v){return '<option '+(c.stage===v?'selected':'')+'>'+v+'</option>';}).join('')+
      '</select></div>'+
      '<div class="field"><label>Próxima acção / nota</label><textarea class="client-note" placeholder="Escreve aqui a próxima acção real.">'+esc(c.note||'')+'</textarea></div>'+
    '</article>';
  }).join('');
  grid.querySelectorAll('.crm-card').forEach(function(card){
    const id=card.getAttribute('data-client');
    const persist=function(){
      state.clients[id]={stage:card.querySelector('.client-stage').value,note:card.querySelector('.client-note').value};
      saveState();
    };
    card.querySelector('.client-stage').addEventListener('change',persist);
    card.querySelector('.client-note').addEventListener('input',persist);
  });
}

function renderLeads(){
  const tbody=document.getElementById('lead-table');
  if(!state.leads.length){
    tbody.innerHTML='<tr><td colspan="5" class="empty-cell">Ainda não adicionaste leads.</td></tr>';return;
  }
  tbody.innerHTML=state.leads.map(function(l,i){
    const link=l.url?'<a href="'+esc(l.url)+'" target="_blank" rel="noreferrer">abrir ↗</a>':'—';
    return '<tr><td>'+esc(l.name)+'</td><td>'+link+'</td><td>'+esc(l.contact||'—')+'</td><td>'+esc(l.status)+'</td><td><button class="danger-btn" data-remove-lead="'+i+'">×</button></td></tr>';
  }).join('');
  tbody.querySelectorAll('[data-remove-lead]').forEach(function(btn){
    btn.addEventListener('click',function(){state.leads.splice(Number(btn.getAttribute('data-remove-lead')),1);saveState();renderLeads();});
  });
}

function normalizeHeader(v){
  return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ');
}
function parseCSV(text){
  const firstLine=(text.split(/\r?\n/)[0]||'');
  const delim=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[];let cell='';let quote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quote && text[i+1]==='"'){cell+='"';i++;}else quote=!quote;
    }else if(ch===delim && !quote){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quote){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(row.some(function(x){return x.trim()!=='';}))rows.push(row);
      row=[];
    }else cell+=ch;
  }
  row.push(cell);if(row.some(function(x){return x.trim()!=='';}))rows.push(row);
  if(rows.length<2)return [];
  const headers=rows[0].map(normalizeHeader);
  function find(names){return headers.findIndex(function(h){return names.some(function(n){return h===n||h.indexOf(n)>=0;});});}
  const qi=find(['query','consulta','termo']);
  const ci=find(['clicks','cliques']);
  const ii=find(['impressions','impressoes']);
  const ti=find(['ctr']);
  const pi=find(['position','posicao']);
  if(ci<0||ii<0||pi<0)throw new Error('Não encontrei as colunas de cliques, impressões e posição.');
  return rows.slice(1).map(function(r){
    return {query:qi>=0?r[qi]:'',clicks:parseLocaleNumber(r[ci]),impressions:parseLocaleNumber(r[ii]),ctr:ti>=0?parsePercent(r[ti]):null,position:parseLocaleNumber(r[pi])};
  }).filter(function(r){return Number.isFinite(r.clicks)&&Number.isFinite(r.impressions)&&Number.isFinite(r.position);});
}
function parseLocaleNumber(v){
  let s=String(v==null?'':v).trim().replace(/\s/g,'');
  if(!s)return NaN;
  if(s.indexOf(',')>=0 && s.indexOf('.')>=0){
    if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(s.indexOf(',')>=0)s=s.replace(',','.');
  return Number(s.replace('%',''));
}
function parsePercent(v){
  const n=parseLocaleNumber(v);if(!Number.isFinite(n))return null;
  return String(v).indexOf('%')>=0?n/100:n;
}
function gscSummary(){
  const g=state.gsc;if(!g||!Array.isArray(g.rows)||!g.rows.length)return null;
  const totals=g.rows.reduce(function(a,r){a.clicks+=r.clicks||0;a.impressions+=r.impressions||0;a.posWeight+=(r.position||0)*(r.impressions||1);a.weight+=(r.impressions||1);return a;},{clicks:0,impressions:0,posWeight:0,weight:0});
  return {clicks:totals.clicks,impressions:totals.impressions,ctr:totals.impressions?totals.clicks/totals.impressions:0,position:totals.weight?totals.posWeight/totals.weight:0};
}
function renderGsc(){
  const g=state.gsc,s=gscSummary();
  document.getElementById('gsc-file-label').textContent=g?(g.fileName+' · '+fmtDate(g.importedAt)):'Nenhum ficheiro importado';
  document.getElementById('gsc-clicks').textContent=s?fmtNum(s.clicks,0):'—';
  document.getElementById('gsc-impressions').textContent=s?fmtNum(s.impressions,0):'—';
  document.getElementById('gsc-ctr').textContent=s?fmtNum(s.ctr*100,2)+'%':'—';
  document.getElementById('gsc-position').textContent=s?fmtNum(s.position,2):'—';
  const tbody=document.getElementById('gsc-table');
  if(!g||!g.rows.length){tbody.innerHTML='<tr><td colspan="5" class="empty-cell">Importa um CSV real para preencher esta tabela.</td></tr>';return;}
  tbody.innerHTML=g.rows.slice().sort(function(a,b){return b.clicks-a.clicks;}).slice(0,30).map(function(r){
    return '<tr><td>'+esc(r.query||'—')+'</td><td>'+fmtNum(r.clicks,0)+'</td><td>'+fmtNum(r.impressions,0)+'</td><td>'+fmtNum((r.ctr==null?(r.impressions?r.clicks/r.impressions:0):r.ctr)*100,2)+'%</td><td>'+fmtNum(r.position,2)+'</td></tr>';
  }).join('');
}
function download(name,content,type){
  const blob=new Blob([content],{type:type||'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function reportObject(){
  return {exportedAt:new Date().toISOString(),monitor:live,crm:state.clients,leads:state.leads,gsc:state.gsc?{fileName:state.gsc.fileName,importedAt:state.gsc.importedAt,summary:gscSummary(),rows:state.gsc.rows}:null};
}
function sitesCsv(){
  const rows=[['site','url','online','http','response_ms','changed','title','h1_count','sitemap_urls','issues']];
  sites.forEach(function(s){const r=siteResult(s.id)||{};rows.push([s.name,s.url,r.online,r.status,r.responseTimeMs,r.changed,r.title,r.h1Count,r.sitemapUrls,(r.issues||[]).map(function(x){return x.message;}).join(' | ')]);});
  return rows.map(function(row){return row.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
}

document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('refresh-btn').addEventListener('click',loadLive);
  document.getElementById('report-btn').addEventListener('click',function(){download('centro-ia-relatorio.json',JSON.stringify(reportObject(),null,2),'application/json');});
  document.getElementById('download-json').addEventListener('click',function(){download('centro-ia-relatorio.json',JSON.stringify(reportObject(),null,2),'application/json');});
  document.getElementById('download-csv').addEventListener('click',function(){download('centro-ia-sites.csv',sitesCsv(),'text/csv;charset=utf-8');});
  document.getElementById('print-report').addEventListener('click',function(){window.print();});
  document.getElementById('lead-form').addEventListener('submit',function(e){
    e.preventDefault();
    const name=document.getElementById('lead-name').value.trim();if(!name)return;
    state.leads.push({name:name,url:document.getElementById('lead-url').value.trim(),contact:document.getElementById('lead-contact').value.trim(),status:document.getElementById('lead-status').value,createdAt:new Date().toISOString()});
    saveState();e.target.reset();renderLeads();
  });
  document.getElementById('gsc-input').addEventListener('change',async function(e){
    const file=e.target.files&&e.target.files[0];if(!file)return;
    try{
      const rows=parseCSV(await file.text());
      if(!rows.length)throw new Error('O CSV não contém linhas de dados reconhecíveis.');
      state.gsc={fileName:file.name,importedAt:new Date().toISOString(),rows:rows};saveState();renderGsc();
    }catch(err){alert('Não foi possível importar: '+err.message);}
  });
  document.getElementById('clear-gsc-btn').addEventListener('click',function(){state.gsc=null;saveState();renderGsc();document.getElementById('gsc-input').value='';});
  document.getElementById('ocr-input').addEventListener('change',async function(e){
    const file=e.target.files&&e.target.files[0];if(!file)return;
    const status=document.getElementById('ocr-status'),prog=document.getElementById('ocr-progress'),out=document.getElementById('ocr-output');
    if(!window.Tesseract){status.textContent='Motor OCR ainda não carregou.';return;}
    status.textContent='A iniciar OCR...';prog.textContent='';out.value='';
    try{
      const result=await window.Tesseract.recognize(file,'por+eng',{logger:function(m){if(m.status)status.textContent=m.status;if(typeof m.progress==='number')prog.textContent=Math.round(m.progress*100)+'%';}});
      out.value=(result.data&&result.data.text)||'';status.textContent='Concluído';prog.textContent='100%';
    }catch(err){status.textContent='Erro: '+err.message;prog.textContent='';}
  });
  document.getElementById('copy-ocr-btn').addEventListener('click',async function(){const value=document.getElementById('ocr-output').value;if(value)await navigator.clipboard.writeText(value);});
  loadLive();
});