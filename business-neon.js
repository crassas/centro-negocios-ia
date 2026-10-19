/* Centro de Negócios · carteira Neon de consulta protegida.
 * Sem passwords SQL no navegador, sem mutação das finanças locais.
 * O Telegram autoriza este dispositivo. Estado remoto e local nunca são somados.
 */
(()=>{
  'use strict';
  const TOKEN_KEY='centro_negocios_neon_device_token_v1';
  const byId=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
  let snapshot=null;
  let fresh=false;
  let connecting=false;
  let lastRead=null;

  const cleanText=(v,max=180)=>String(v??'').trim().slice(0,max);
  const safeNumber=v=>{
    const n=Number(v);
    return Number.isFinite(n)&&n>=0&&n<=1e9?n:0;
  };
  const safeHttps=v=>{
    try{
      const u=new URL(String(v||''));
      return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password?u.href:'';
    }catch{return '';}
  };
  function normalize(data){
    if(!data?.ok||!Array.isArray(data.clients)||data.clients.length>100){
      throw new Error('Resposta comercial inválida.');
    }
    const clients=data.clients.slice(0,40).map(row=>({
      name:cleanText(row.name),
      siteTitle:cleanText(row.siteTitle||'Website'),
      siteStatus:cleanText(row.siteStatus||'Sem estado',60),
      websiteUrl:safeHttps(row.websiteUrl),
      repositoryUrl:safeHttps(row.repositoryUrl),
      pendingEur:safeNumber(row.pendingEur),
      openTasks:Math.trunc(safeNumber(row.openTasks))
    })).filter(row=>row.name);
    const pendingEur=Math.round(clients.reduce((sum,row)=>sum+row.pendingEur,0)*100)/100;
    return {source:'neon-postgresql',clients,totals:{
      sites:clients.length,pendingEur,openTasks:clients.reduce((sum,row)=>sum+row.openTasks,0)
    }};
  }
  function token(){try{return localStorage.getItem(TOKEN_KEY)||'';}catch{return '';}}
  function saveToken(value){localStorage.setItem(TOKEN_KEY,value);}
  function message(value,state='idle'){
    const el=byId('neon-company-status');
    if(el){el.textContent=value;el.dataset.state=state;}
  }
  function informOtherViews(){
    window.dispatchEvent(new CustomEvent('centro:business-updated'));
  }
  async function request(path,options={}){
    const t=token();
    return aiFetch(path,{...options,headers:{
      ...(t?{authorization:'Bearer '+t}:{}),...(options.headers||{})
    }});
  }
  function render(){
    if(!snapshot)return;
    const total=byId('neon-company-total');
    if(total)total.textContent=snapshot.totals.sites+' sites · '+money(snapshot.totals.pendingEur)+' pendentes';
    const list=byId('neon-company-list');
    if(list){
      const rows=snapshot.clients.map(row=>{
        const item=document.createElement('li');
        item.className='neon-company-row';
        const info=document.createElement('div');
        const name=document.createElement('strong');
        name.textContent=row.name;
        const detail=document.createElement('small');
        detail.textContent=row.siteStatus+' · ';
        if(row.websiteUrl){
          const link=document.createElement('a');
          link.href=row.websiteUrl;
          link.target='_blank';
          link.rel='noopener noreferrer';
          link.textContent='Abrir site ↗';
          link.setAttribute('aria-label','Abrir site de '+row.name+' numa nova janela');
          detail.append(link);
        }else{
          detail.append(document.createTextNode('Domínio por confirmar'));
        }
        info.append(name,detail);
        const amount=document.createElement('span');
        if(row.pendingEur>0)amount.className='neon-has-pending';
        amount.textContent=money(row.pendingEur)+' por receber';
        item.append(info,amount);
        return item;
      });
      list.replaceChildren(...rows);
    }
    const note=byId('neon-company-source');
    if(note)note.textContent=fresh
      ? 'Fonte: Neon · leitura autorizada. O Caixa neste telemóvel é independente; não somar valores iguais.'
      : 'Última consulta Neon guardada no ecrã, mas sem ligação atual. Confirma antes de tomar decisões.';
  }
  async function refresh(){
    const sync=byId('neon-company-refresh');
    if(sync){sync.disabled=true;sync.setAttribute('aria-busy','true');}
    message('A atualizar carteira…','pending');
    try{
      const data=await request('/api/business/overview',{method:'GET'});
      snapshot=normalize(data);
      fresh=true;
      lastRead=new Date();
      render();
      message('Neon ligada · atualizado às '+lastRead.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}),'ready');
    }catch(error){
      fresh=false;
      if(snapshot){
        render();
        message('Sem ligação · valores da última consulta (não atuais)','warning');
      }else{
        const total=byId('neon-company-total');if(total)total.textContent='—';
        const list=byId('neon-company-list');if(list)list.replaceChildren();
        message('Sem dados · verifica a autorização e tenta novamente','error');
      }
    }finally{
      if(sync){sync.disabled=false;sync.removeAttribute('aria-busy');}
      informOtherViews();
    }
  }
  async function check(){
    const auth=byId('neon-company-authorize');
    const sync=byId('neon-company-refresh');
    try{
      const state=await request('/api/business/status',{method:'GET'});
      if(!state.configured){
        if(auth)auth.disabled=true;
        if(sync)sync.disabled=true;
        message('Ligação Neon por configurar no servidor.','warning');
        return;
      }
      if(state.authorized){
        if(auth){auth.hidden=true;auth.disabled=true;}
        if(sync)sync.disabled=false;
        await refresh();
      }else{
        fresh=false;
        if(auth){auth.hidden=false;auth.disabled=false;}
        if(sync)sync.disabled=true;
        message('Autoriza este dispositivo no Telegram para consultar a Neon.','warning');
        informOtherViews();
      }
    }catch{
      message('Falha na verificação do servidor. Tenta novamente.','error');
    }
  }
  async function pair(){
    if(connecting)return;
    connecting=true;
    const button=byId('neon-company-authorize');
    if(button)button.disabled=true;
    try{
      const pair=await request('/api/business/pair',{method:'POST',body:'{}'});
      if(!pair.ok||!pair.pairId)throw new Error('Não foi possível pedir autorização.');
      message('Pedido enviado. Autoriza no Telegram.','pending');
      const until=Math.min(Date.now()+8*60*1000,Number(pair.expiresAt)||Date.now()+8*60*1000);
      while(Date.now()<until){
        await new Promise(resolve=>setTimeout(resolve,2500));
        const result=await request('/api/business/pair-status?id='+encodeURIComponent(pair.pairId),{method:'GET'});
        if(result.status==='rejected')throw new Error('Autorização recusada.');
        if(result.status==='approved'){
          if(typeof result.token!=='string'||!/^[a-f0-9]{64}$/i.test(result.token))throw new Error('Autorização inválida.');
          saveToken(result.token);
          await check();
          return;
        }
        if(result.status==='expired'||result.status==='missing')break;
      }
      throw new Error('A autorização expirou. Pede uma nova.');
    }catch(error){
      message(cleanText(error?.message||'Falha de autorização.',160),'error');
      if(button)button.disabled=false;
    }finally{connecting=false;}
  }
  window.CentroBusinessNeon={
    // Apenas leituras atuais e autorizadas podem alimentar o painel financeiro.
    context:()=>fresh&&snapshot?{
      source:snapshot.source,totals:{...snapshot.totals},
      clients:snapshot.clients.map(c=>({
        name:c.name,siteStatus:c.siteStatus,websiteUrl:c.websiteUrl,
        repositoryUrl:c.repositoryUrl,pendingEur:c.pendingEur,openTasks:c.openTasks
      }))
    }:null,
    refresh
  };
  document.addEventListener('DOMContentLoaded',()=>{
    byId('neon-company-authorize')?.addEventListener('click',pair);
    byId('neon-company-refresh')?.addEventListener('click',refresh);
    check();
  });
})();
