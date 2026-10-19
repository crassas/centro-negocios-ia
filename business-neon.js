/* Leitura segura do Neon para o Centro existente.
 * Sem credenciais PostgreSQL no navegador, sem alterar o Caixa/CRM local,
 * sem enviar dados ao GitHub. Autoriza via Telegram.
 */
(()=>{
  'use strict';
  const TOKEN_KEY='centro_negocios_neon_device_token_v1';
  const byId=id=>document.getElementById(id);
  let snapshot=null,connecting=false;

  const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const money=value=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(value)||0);
  function token(){try{return localStorage.getItem(TOKEN_KEY)||'';}catch{return '';}}
  function saveToken(value){localStorage.setItem(TOKEN_KEY,value);}
  function message(value,state='idle'){
    const el=byId('neon-company-status');if(!el)return;
    el.textContent=value;el.dataset.state=state;
  }
  async function request(path,options={}){
    const t=token();
    return aiFetch(path,{...options,headers:{...(t?{authorization:'Bearer '+t}:{}),...(options.headers||{})}});
  }
  function render(){
    if(!snapshot?.clients)return;
    const total=byId('neon-company-total');
    if(total)total.textContent=snapshot.totals.sites+' sites · '+money(snapshot.totals.pendingEur)+' por receber';
    const tbody=byId('neon-company-list');
    if(!tbody)return;
    tbody.innerHTML=snapshot.clients.map(row=>{
      const site=(row.websiteUrl&&row.websiteUrl.startsWith('https://'))?row.websiteUrl:'';
      return '<li class="neon-company-row"><div><strong>'+escapeText(row.name)+'</strong>'+
        '<small>'+escapeText(row.siteStatus||'Sem estado')+' · '+(site?'<a href="'+escapeText(site)+'" target="_blank" rel="noopener noreferrer">Abrir site ↗</a>':'Domínio por confirmar')+'</small></div>'+
        '<span class="'+(row.pendingEur?'neon-has-pending':'')+'">'+money(row.pendingEur)+' pendentes</span></li>';
    }).join('');
    const note=byId('neon-company-source');
    if(note)note.textContent='Fonte: Neon PostgreSQL · apenas leitura. O Caixa local mantém os seus registos até à migração validada.';
  }
  async function refresh(){
    const sync=byId('neon-company-refresh');
    if(sync)sync.disabled=true;
    try{
      const data=await request('/api/business/overview',{method:'GET'});
      if(!data.ok||!Array.isArray(data.clients))throw new Error('Resposta da Neon inválida.');
      snapshot=data;
      render();
      message('Neon ligada · dados reais atualizados','ready');
    }catch(error){
      snapshot=null;
      const total=byId('neon-company-total');if(total)total.textContent='—';
      const list=byId('neon-company-list');if(list)list.innerHTML='';
      message('Sem dados: '+(error?.message||'falha de ligação'),'error');
    }finally{if(sync)sync.disabled=false;}
  }
  async function check(){
    const auth=byId('neon-company-authorize');
    const sync=byId('neon-company-refresh');
    try{
      const state=await request('/api/business/status',{method:'GET'});
      if(!state.configured){
        message('Ligação à base de dados por configurar no Worker.','warning');
        if(auth)auth.disabled=true;
        if(sync)sync.disabled=true;
        return;
      }
      if(state.authorized){
        if(auth){auth.disabled=true;auth.hidden=true;}
        if(sync)sync.disabled=false;
        await refresh();
      }else{
        if(auth){auth.disabled=false;auth.hidden=false;}
        if(sync)sync.disabled=true;
        message('Autoriza este dispositivo por Telegram para veres os dados comerciais.','warning');
      }
    }catch(error){
      message('Não foi possível verificar o Worker: '+(error?.message||'falha'),'error');
    }
  }
  async function pair(){
    if(connecting)return;
    connecting=true;
    const button=byId('neon-company-authorize');if(button)button.disabled=true;
    try{
      const pair=await request('/api/business/pair',{method:'POST',body:'{}'});
      if(!pair.ok||!pair.pairId)throw new Error('Pedido de autorização indisponível.');
      message('Abre o Telegram e autoriza a consulta à Neon.','pending');
      const until=Math.min(Date.now()+8*60*1000,Number(pair.expiresAt)||Date.now()+8*60*1000);
      while(Date.now()<until){
        await new Promise(resolve=>setTimeout(resolve,2500));
        const s=await request('/api/business/pair-status?id='+encodeURIComponent(pair.pairId),{method:'GET'});
        if(s.status==='rejected')throw new Error('Autorização recusada.');
        if(s.status==='approved'){
          if(typeof s.token!=='string'||!/^[a-f0-9]{64}$/i.test(s.token))throw new Error('Autorização inválida.');
          saveToken(s.token);await check();return;
        }
        if(s.status==='expired'||s.status==='missing')break;
      }
      throw new Error('O código expirou. Pede uma nova autorização.');
    }catch(error){
      message(error?.message||'Falha de autorização.','error');
      if(button)button.disabled=false;
    }finally{connecting=false;}
  }
  window.CentroBusinessNeon={
    context:()=> snapshot? {
      source:snapshot.source, totals:snapshot.totals,
      clients:snapshot.clients.map(c=>({name:c.name,siteStatus:c.siteStatus,
        websiteUrl:c.websiteUrl,pendingEur:c.pendingEur,openTasks:c.openTasks}))
    }:null,
    refresh
  };
  document.addEventListener('DOMContentLoaded',()=>{
    byId('neon-company-authorize')?.addEventListener('click',pair);
    byId('neon-company-refresh')?.addEventListener('click',refresh);
    check();
  });
})();
