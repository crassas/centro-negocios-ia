const hud=document.querySelector('#travis-hud');
const $=id=>document.getElementById(id);
let gmailRequested=new URLSearchParams(location.search).get('connect')==='gmail';
let timer=0,active=false,paused=false,controller=null;
const statusNames={queued:'Na fila',running:'Em execução',completed:'Concluído',failed:'Falhou'};
async function api(path,body={}) {
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Ligação indisponível.');
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
    if(!response.ok)throw new Error('Centro indisponível');
    const data=await response.json();if(!active)return;
    $('travis-link-state').textContent=data.centro?'CENTRO LIGADO':'CENTRO SEM RESPOSTA';
    $('travis-link-state').dataset.online=String(data.centro);
    $('travis-agent-state').textContent=data.agent?'Agente ativo':'Agente sem ligação';
    $('travis-memory-state').textContent=data.memory.ok?`${data.memory.events||0} eventos registados`:'Memória por confirmar';
    const jobs=data.jobs.slice().reverse();
    $('travis-jobs').replaceChildren(...jobs.map(j=>item(j.tool||'Pedido',statusNames[j.status]||j.status,j.status)));
    if(!jobs.length)$('travis-jobs').append(item('Sem pedidos de voz','Os próximos pedidos aparecem aqui.'));
    $('travis-history').replaceChildren(...data.history.slice().reverse().slice(0,5).map(r=>
      item(`${r.action} · ${r.target||'Centro'}`,Number(r.exitCode)===0?'Execução concluída':r.error||'Execução falhou',Number(r.exitCode)===0?'completed':'failed')));
    if(!data.history.length)$('travis-history').append(item('Sem histórico disponível','Ainda não há execuções confirmadas.'));
    $('travis-gmail-disconnect').hidden=!data.gmail.authorized;
    $('travis-gmail-connect').textContent=data.gmail.authorized?'Abrir caixa de entrada':data.gmail.configured?'Autorizar conta Google':'Preparar ligação Gmail';
    $('travis-observed').textContent='Verificado às '+new Date(data.observedAt*1000).toLocaleTimeString('pt-PT');
  } catch(error) {
    if(!active)return;
    $('travis-link-state').textContent='LIGAÇÃO INTERROMPIDA';$('travis-link-state').dataset.online='false';
    $('travis-agent-state').textContent='Estado por confirmar';
    $('travis-observed').textContent='Dados anteriores — atualização indisponível.';
  } finally {controller=null;if(active)timer=setTimeout(refresh,6000);}
}
function transcript(role,text) {
  if(!text)return;
  $('travis-transcript').append(item(role==='user'?'Tu':'Travis',String(text)));
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
  $('travis-pause').textContent=paused?'Retomar voz':'Pausar voz';
});
$('travis-command')?.addEventListener('submit',event=>{
  event.preventDefault();const input=$('travis-command-text');const text=input.value.trim();
  if(text){window.TravisVisual?.ask(text);input.value='';paused=false;$('travis-pause').textContent='Pausar voz';}
});
$('travis-open-agents')?.addEventListener('click',()=>{
  window.TravisVisual?.close();document.querySelector('[data-panel-target="agentes"]')?.click();
  location.hash='agentes';
});
function openGmail(){
  hud.classList.add('room-open');$('travis-room-toggle').setAttribute('aria-expanded','true');
  window.TravisVisual?.pause();paused=true;$('travis-pause').textContent='Retomar voz';
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
