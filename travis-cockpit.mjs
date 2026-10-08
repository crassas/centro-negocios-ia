import './travis-action-cards.mjs?v=voice-flow-3';
const hud=document.querySelector('#travis-hud');
const $=id=>document.getElementById(id);
let gmailRequested=new URLSearchParams(location.search).get('connect')==='gmail';
let timer=0,active=false,paused=false,controller=null;
const statusNames={queued:'Queued',running:'Running',completed:'Completed',failed:'Failed'};
async function api(path,body={}) {
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Connection unavailable.');
  return data;
}
function item(primary,secondary,kind='') {
  const row=document.createElement('li');row.dataset.kind=kind;
  const title=document.createElement('strong');title.textContent=primary;
  const description=document.createElement('span');description.textContent=secondary;
  row.append(title,description);return row;
}
async function refresh() {
  if(!active)return;
  controller=new AbortController();
  try {
    const response=await fetch('/cockpit',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(9000)]),cache:'no-store'});
    if(!response.ok)throw new Error('Centro unavailable');
    const data=await response.json();if(!active)return;
    $('travis-link-state').textContent=data.centro?'CENTRO ONLINE':'CENTRO UNAVAILABLE';
    $('travis-link-state').dataset.online=String(data.centro);
    $('travis-agent-state').textContent=data.agent?'Agent active':'Agent offline';
    $('travis-memory-state').textContent=data.memory.ok?`${data.memory.events||0} events recorded`:'Memory pending confirmation';
    const jobs=data.jobs.slice().reverse();
    $('travis-jobs').replaceChildren(...jobs.map(j=>item(j.tool||'Request',statusNames[j.status]||j.status,j.status)));
    if(!jobs.length)$('travis-jobs').append(item('No voice tasks','New requests will appear here.'));
    $('travis-history').replaceChildren(...data.history.slice().reverse().slice(0,5).map(r=>
      item(`${r.action} · ${r.target||'Centro'}`,Number(r.exitCode)===0?'Execution completed':r.error||'Execution failed',Number(r.exitCode)===0?'completed':'failed')));
    if(!data.history.length)$('travis-history').append(item('No history available','There are no confirmed executions yet.'));
    $('travis-gmail-disconnect').hidden=!data.gmail.authorized;
    $('travis-gmail-connect').textContent=data.gmail.authorized?'Open inbox':data.gmail.configured?'Authorize Google account':'Set up Gmail connection';
    $('travis-observed').textContent='Verified at '+new Date(data.observedAt*1000).toLocaleTimeString('en-GB');
  } catch(error) {
    if(!active)return;
    $('travis-link-state').textContent='CONNECTION INTERRUPTED';$('travis-link-state').dataset.online='false';
    $('travis-agent-state').textContent='Status pending confirmation';
    $('travis-observed').textContent='Previous data — update unavailable.';
  } finally {controller=null;if(active)timer=setTimeout(refresh,6000);}
}
function transcript(role,text) {
  if(!text)return;
  $('travis-transcript').append(item(role==='user'?'You':'Travis',String(text)));
  while($('travis-transcript').children.length>12)$('travis-transcript').firstElementChild.remove();
  $('travis-transcript').scrollTop=$('travis-transcript').scrollHeight;
}
window.addEventListener('travis:transcript',e=>transcript(e.detail.role,e.detail.text));
window.addEventListener('travis:open',()=>{active=true;paused=false;clearTimeout(timer);refresh();if(gmailRequested){gmailRequested=false;setTimeout(openGmail,80);}});
window.addEventListener('travis:close',()=>{active=false;clearTimeout(timer);controller?.abort();});
$('travis-room-toggle')?.addEventListener('click',()=>{
  const open=hud.classList.toggle('room-open');$('travis-room-toggle').setAttribute('aria-expanded',String(open));
});
$('travis-pause')?.addEventListener('click',()=>{
  paused=!paused;window.TravisVisual?.[paused?'pause':'resume']();
  $('travis-pause').textContent=paused?'Resume voice':'Pause voice';
});
$('travis-command')?.addEventListener('submit',event=>{
  event.preventDefault();const input=$('travis-command-text');const text=input.value.trim();
  if(text){window.TravisVisual?.ask(text);input.value='';paused=false;$('travis-pause').textContent='Pause voice';}
});
$('travis-open-agents')?.addEventListener('click',()=>{
  window.TravisVisual?.close();document.querySelector('[data-panel-target="agentes"]')?.click();
  location.hash='agentes';
});
function openGmail(){
  hud.classList.add('room-open');$('travis-room-toggle').setAttribute('aria-expanded','true');
  window.TravisVisual?.pause();paused=true;$('travis-pause').textContent='Resume voice';
  $('travis-gmail-section').scrollIntoView({block:'start'});$('travis-gmail-section').focus({preventScroll:true});
  $('travis-gmail-connect').click();
}
$('room-gmail')?.addEventListener('click',()=>{
  if(!['127.0.0.1','localhost'].includes(location.hostname)||location.port!=='8770'){
    location.assign('http://127.0.0.1:8770/?travis=1&connect=gmail');return;
  }
  gmailRequested=true;window.TravisVisual?.open();
});
$('travis-gmail-connect')?.addEventListener('click',async()=>{
  const button=$('travis-gmail-connect');button.disabled=true;
  try {
    const snapshot=await api('/cockpit');
    if(snapshot.gmail.authorized) {
      const data=await api('/gmail/inbox');
      $('travis-mail-list').replaceChildren(...data.messages.map(m=>item(m.subject,m.from,m.unread?'unread':'')));
      $('travis-gmail-note').textContent='Leitura confirmada · '+new Date(data.verifiedAt*1000).toLocaleTimeString('pt-PT');
      if(!data.messages.length)$('travis-mail-list').append(item('Caixa vazia','Sem mensagens na entrada.'));
    } else {
      const data=await api('/gmail/start');
      if(data.requiresConfiguration) {
        $('travis-gmail-setup').hidden=false;
        $('travis-gmail-section').scrollIntoView({block:'start'});
        $('travis-gmail-note').textContent='Ainda não existe configuração Google neste Centro. Segue os quatro passos abaixo.';
      } else if(data.url && new URL(data.url).origin==='https://accounts.google.com')location.assign(data.url);
    }
  } catch(error){$('travis-gmail-note').textContent=error.message;}
  finally{button.disabled=false;}
});
$('travis-gmail-file')?.addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>32000)throw new Error('JSON demasiado grande.');
    await api('/gmail/configure',JSON.parse(await file.text()));
    $('travis-gmail-note').textContent='Configuração pronta. Carrega em Autorizar conta Google e escolhe a tua conta.';
    $('travis-gmail-setup').hidden=true;
    $('travis-gmail-connect').textContent='Autorizar conta Google';
  } catch(error){$('travis-gmail-note').textContent=error.message;}
  event.target.value='';
});
$('travis-gmail-disconnect')?.addEventListener('click',async()=>{
  try {await api('/gmail/disconnect');$('travis-mail-list').replaceChildren();$('travis-gmail-note').textContent='Conta desligada deste dispositivo.';$('travis-gmail-connect').textContent='Ligar Gmail';}
  catch(error){$('travis-gmail-note').textContent=error.message;}
});

let connectionsBusy=false;
async function refreshConnections(){
  if(connectionsBusy)return;
  connectionsBusy=true;$('travis-connections-refresh').disabled=true;
  try{
    const data=await api('/connections');
    $('travis-connections').replaceChildren(...data.connections.map(c=>{
      const row=item(c.name,c.detail,c.state==='connected'?'completed':c.state==='attention'?'failed':'');
      if(c.action==='gmail'){const button=document.createElement('button');button.type='button';button.textContent='Open Gmail connection';button.addEventListener('click',openGmail);row.append(button);}
      return row;
    }));
    const sites=data.business.sites||[];
    $('travis-projects').replaceChildren(...data.projects.map(p=>{
      const site=sites.find(s=>String(s.repo||'').includes(p.project==='centro'?'centro-negocios':p.project==='beatriz'?'beatriz':p.project==='2-irmaos'?'2-irmaos':p.project==='best-pizza'?'best-pizza':'pente'));
      return item(p.name,(p.available?'Código acessível':'Código indisponível')+(site?' · '+site.status:'')+(p.changedFiles?' · '+p.changedFiles+' alterações locais':''),p.available?'completed':'failed');
    }));
    $('travis-connections-note').textContent='Verified at '+new Date(data.observedAt*1000).toLocaleTimeString('en-GB')+'. Autorizações guardadas não confirmam uma sessão ativa.';
  }catch(error){$('travis-connections-note').textContent='Verificação indisponível. Os estados anteriores podem estar desatualizados.';}
  finally{connectionsBusy=false;$('travis-connections-refresh').disabled=false;}
}
$('travis-connections-refresh')?.addEventListener('click',refreshConnections);
window.addEventListener('travis:open',refreshConnections);

if(window.TravisVisual?.diagnostics().opened){active=true;refresh();refreshConnections();}
