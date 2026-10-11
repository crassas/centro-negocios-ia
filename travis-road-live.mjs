/**
 * Travis × God's Eye View: ACTUAL public road incidents and measured speeds.
 * These are independent of God's Eye's simulated moving vehicle dots.
 * Lazy requests only while the operator has the panel open.
 */
const HUD=document.getElementById('travis-hud');
const HOST=['127.0.0.1','localhost'].includes(location.hostname)?location.hostname:'127.0.0.1';
const API='http://'+HOST+':4187/api/road-live/';
const AREA=Object.freeze({
  porto:{provider:'porto',title:'PORTO · OCORRÊNCIAS REGISTADAS',lat:41.1496,lon:-8.6109,source:'Trânsito Agora',radiusKm:75},
  lisboa:{provider:'lisboa',title:'LISBOA · OCORRÊNCIAS REGISTADAS',lat:38.7223,lon:-9.1393,source:'Trânsito Agora',radiusKm:75},
  london:{provider:'london',title:'LONDRES · OCORRÊNCIAS',lat:51.5072,lon:-.1276,source:'TfL',radiusKm:null},
  finland:{provider:'finland',title:'FINLÂNDIA · VELOCIDADE MEDIDA',lat:61.2,lon:25.0,source:'Fintraffic',radiusKm:null},
  helsinki:{provider:'finland',title:'HELSÍNQUIA · SENSORES',lat:60.1699,lon:24.9384,source:'Fintraffic',radiusKm:80},
  nyc:{provider:'nyc',title:'NOVA IORQUE · VELOCIDADE',lat:40.7128,lon:-74.0060,source:'NYC DOT',radiusKm:null}
});
const KNOWN_UNSUPPORTED=Object.freeze({
 madrid:/\b(?:madrid)\b/,
 tokyo:/\b(?:tokyo|toquio)\b/,
 portugal:/\b(?:portugal|brasil|brazil|espanha|spain|franca|france|alemanha|germany|paris|berlim|berlin|dubai|dublin|india)\b/
});
const normalize=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/\s+/g,' ').trim();
const within=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
const short=(x,n=145)=>String(x??'').slice(0,n);
let panel=null,contentList=null,notice=null,subtitle=null,source=null,button=null;
let activeArea='london',busy=false,open=false,pending=null,epoch=0,refreshes=0;
let refreshTimer=0,lastData=null;
const btn=(label,id)=>{
  const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.roadArea=id;return b;
};
function showStatus(message){if(notice)notice.textContent=short(message,200);}
function stopTimer(){clearInterval(refreshTimer);refreshTimer=0;}
function close(){
  epoch++;open=false;busy=false;stopTimer();pending?.abort?.();pending=null;
  if(panel)panel.hidden=true;
  button?.removeAttribute('aria-busy');button?.setAttribute('aria-pressed','false');
  window.TravisGevBridge?.setExternalAnnotations?.([]);
}
function nearestArea(){
  const geo=window.TravisGevBridge?.status?.()||window.TravisWorld?.status?.();
  const place=geo?.place;
  if(place==='porto'||place==='campanha'||place==='gaia')return 'porto';
  if(place==='lisboa')return 'lisboa';
  if(place==='london')return 'london';
  if(place==='helsinki')return 'helsinki';
  if(place==='nyc')return 'nyc';
  if(place==='tokyo')return 'unsupported';
  return 'london'; // Earth view: default TO EXPLICITLY LABELLED London feed
}
function sourceText(item){
  const speed=Number.isFinite(item.speedKph)
    ?' · '+item.speedKph+' km/h (medidos)':'';
  const ratio=Number.isFinite(item.pctFreeFlow)
    ?' · '+item.pctFreeFlow+'% do fluxo livre':'';
  const origin=item.originalProvider?' · origem: '+item.originalProvider:'';
  return short((item.provider||'')+origin+speed+ratio,165);
}
function timestampText(row){
  const value=row?.observedAt||'';
  if(!value){
    if(row?.observedAtLocal)return 'Hora local: '+short(row.observedAtLocal,35);
    return 'Hora da ocorrência não indicada';
  }
  const n=Date.parse(value);
  return Number.isFinite(n)
    ?'Actualização: '+new Intl.DateTimeFormat('pt-PT',{
       dateStyle:'short',timeStyle:'short'}).format(new Date(n))
    :'Hora não confirmada';
}
function annotate(items,region){
  const rows=items.slice(0,18).filter(item=>within(item.lat,-90,90)&&within(item.lon,-180,180));
  return rows.map(item=>{
    let label=item.provider==='Trânsito Agora'?'OCORRÊNCIA REGISTADA':
      item.provider==='TfL'?'OBRA / OCORRÊNCIA':
      item.provider==='Fintraffic'?'TMS '+item.speedKph+' km/h':
        'NYC '+item.speedKph+' km/h';
    const color=item.type==='incident'?'amber':
      Number.isFinite(item.pctFreeFlow)&&item.pctFreeFlow<=40?'red':
      Number.isFinite(item.pctFreeFlow)&&item.pctFreeFlow<=75?'amber':'green';
    return {type:'pin',latitude:item.lat,longitude:item.lon,
      label:(label+' · '+short(item.label,65)).slice(0,115),color};
  });
}
function renderItems(payload,zone,{applyToGlobe=true}={}){
  if(!panel||!contentList)return;
  contentList.replaceChildren();
  lastData=payload;
  const sourceLabel=zone?.source||payload.source||'Public source';
  const fetched=payload.fetchedAt?new Date(payload.fetchedAt):null;
  const age=Number.isFinite(fetched?.getTime())
    ?' · consulta '+new Intl.DateTimeFormat('pt-PT',{hour:'2-digit',minute:'2-digit'}).format(fetched):'';
  subtitle.textContent=zone?.title||payload.area||'ROAD INTELLIGENCE';
  const temporary=Boolean(payload.temporaryKeylessUntil);
  const licenceNote=temporary?' · fonte gratuita temporária: requer chave desde 14/10/2026':'';
  if(payload.state==='stale'){
    showStatus('DADOS POSSIVELMENTE DESACTUALIZADOS · última resposta em cache');
    window.TravisGevBridge?.setExternalAnnotations?.([]);
  }else if(payload.items?.length){
    showStatus(String(payload.items.length)+' registos apresentados · '+sourceLabel+age+licenceNote);
  }else{
    showStatus((payload.note||'Sem dados rodoviários recentes nesta região.')+licenceNote);
    window.TravisGevBridge?.setExternalAnnotations?.([]);
  }
  if(source){
    source.href=payload.sourceUrl||'https://api.tfl.gov.uk/';
    source.textContent='FONTE: '+sourceLabel;
  }
  const rows=Array.isArray(payload.items)?payload.items.slice(0,60):[];
  for(const item of rows){
    const div=document.createElement('article');div.className='travis-road-row';
    const info=document.createElement('div');info.className='travis-road-copy';
    const heading=document.createElement('strong');heading.textContent=short(item.label||'Road observation',140);
    const measurement=document.createElement('span');measurement.textContent=sourceText(item);
    const detail=document.createElement('small');detail.textContent=short(item.detail||'',160);
    const stamp=document.createElement('time');stamp.textContent=timestampText(item);
    info.append(heading,measurement,detail,stamp);
    const focus=document.createElement('button');
    focus.type='button';focus.textContent='VER';focus.setAttribute('aria-label','Ver no mapa: '+short(item.label,85));
    focus.onclick=()=>{
      window.TravisGevBridge?.navigate?.(null,{
        lat:item.lat,lon:item.lon,alt:4800,label:short(item.label,55)
      });
      showStatus('LOCALIZAÇÃO CARTOGRAFADA · '+short(item.label,85));
    };
    div.append(info,focus);contentList.appendChild(div);
  }
  if(payload.state==='current'&&rows.length&&applyToGlobe){
    window.TravisGevBridge?.setExternalAnnotations?.(annotate(rows,zone));
  }
}
function focusArea(region){
  const bridge=window.TravisGevBridge;
  if(!bridge?.navigate||!region)return;
  if(region===AREA.porto){bridge.navigate('porto');return;}
  if(region===AREA.lisboa){bridge.navigate('lisboa');return;}
  if(region===AREA.london){bridge.navigate('london');return;}
  if(region===AREA.nyc){bridge.navigate('nyc');return;}
  if(region===AREA.helsinki){bridge.navigate('helsinki');return;}
  bridge.navigate(null,{label:'Finlândia · postos TMS',
    lat:region.lat,lon:region.lon,alt:670000});
}
async function loadArea(area,{refresh=false,applyToGlobe=true}={}){
  const region=AREA[area];
  if(!region||!open)return false;
  const token=++epoch;activeArea=area;busy=true;
  if(!refresh)focusArea(region);
  if(button)button.setAttribute('aria-busy','true');
  showStatus('A consultar dados oficiais · '+region.source);
  pending?.abort?.();
  pending=new AbortController();
  try{
    const url=new URL(API+region.provider);
    url.searchParams.set('limit','60');
    if(region.radiusKm){
      url.searchParams.set('lat',String(region.lat));
      url.searchParams.set('lon',String(region.lon));
      url.searchParams.set('radiusKm',String(region.radiusKm));
    }
    const res=await fetch(url,{
      cache:'no-store',credentials:'omit',signal:AbortSignal.any([
        pending.signal,AbortSignal.timeout(16000)])
    });
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(token!==epoch||!open)return false;
    if(data?.schema!=='travis-public-road-observations/v1')throw new Error('Fonte de dados inesperada');
    renderItems(data,region,{applyToGlobe});
    if(refresh)showStatus((data.cache==='hit'?'CACHE DO OPERADOR · ':'ACTUALIZADO · ')
      +(data.items?.length||0)+' medições / ocorrências de '+region.source);
    return true;
  }catch(error){
    if(token!==epoch||!open)return false;
    window.TravisGevBridge?.setExternalAnnotations?.([]);
    contentList.replaceChildren();lastData=null;
    showStatus('SOURCE UNAVAILABLE · '+short(error?.message||'Network',100)+' · Try London, Finland or New York.');
    return false;
  }finally{
    if(token===epoch){busy=false;if(button)button.removeAttribute('aria-busy');}
  }
}
function show({area=null}={}){
  if(!panel)return false;
  window.TravisProjection?.dismiss?.();
  window.TravisCctvAutopilot?.cancel?.();
  if(HUD?.getAttribute('aria-hidden')==='true')window.TravisVisual?.open?.();
  if(!window.TravisGevBridge?.status?.()?.open)window.TravisGevBridge?.open?.('earth');
  window.TravisCctvPlayer?.close?.();
  open=true;panel.hidden=false;button?.setAttribute('aria-pressed','true');
  refreshes=0;
  const chosen=area||nearestArea();
  if(chosen==='unsupported'){
    contentList.replaceChildren();
    showStatus('Não tenho um fornecedor aberto de trânsito medido para esta zona; o trânsito 3D é simulado.');
    return true;
  }
  void loadArea(chosen,{applyToGlobe:true});
  stopTimer();
  refreshTimer=setInterval(()=>{
    if(!open||document.hidden||++refreshes>10){stopTimer();return;}
    if(!busy)void loadArea(activeArea,{refresh:true,applyToGlobe:false});
  },180000);
  return true;
}
function areaFromText(text){
  if(/\b(?:porto|campanha|gaia|matosinhos)\b/.test(text))return 'porto';
  if(/\b(?:lisboa|lisbon|sintra)\b/.test(text))return 'lisboa';
  if(/\b(?:londres|london)\b/.test(text))return 'london';
  if(/\b(?:helsinquia|helsinki|espoo)\b/.test(text))return 'helsinki';
  if(/\b(?:finlandia|finland)\b/.test(text))return 'finland';
  if(/\b(?:nova iorque|new york|nyc|manhattan)\b/.test(text))return 'nyc';
  if(Object.values(KNOWN_UNSUPPORTED).some(exp=>exp.test(text)))return 'unsupported';
  return null;
}
function routeCommand(raw,options={}){
  const t=normalize(raw).replace(/[’']/g,'').replace(/["“”!?.,]/g,' ').replace(/\s+/g,' ').trim();
  const named=/\b(?:road (?:live|life)|live roads?|road intelligence)\b/.test(t);
  const traffic=/\b(?:transito|trafego|traffic|congestionamento|engarrafamento|roadworks?|traffic jams?|incidentes rodoviarios|velocidades? nas estradas)\b/.test(t);
  if(!t||(!named&&!traffic)||/\b(?:air traffic|flights?|planes?|avioes|voos|simulacao|simulado|simulation|simulated)\b/.test(t))return {handled:false};
  const en=options.language==='en'||(options.language!=='pt'&&/\b(?:road|show|open|check|current|live|how|what|close|stop|disable)\b/.test(t));
  if(/\b(?:close|stop|disable|deactivate|hide|off|fecha|desliga|para)\b/.test(t)){
    close();return {handled:true,language:en?'en':'pt',reply:en?'Road Live closed.':'Road Live fechado.'};
  }
  if(!named&&!/\b(?:mostra|mostrar|quero|abre|abrir|ver|estado|esta|estao|agora|real|ao vivo|em direto|show|open|check|current|live|how is|what is)\b/.test(t))return {handled:false};
  const area=areaFromText(t);
  if(area==='unsupported')return {handled:true,language:en?'en':'pt',reply:en
    ?'I do not have a connected provider of measured road data there. You can ask for Road Live in London, Finland or New York.'
    :'Não tenho um fornecedor de medições rodoviárias ligado nessa zona. Podes pedir Road Live em Londres, na Finlândia ou em Nova Iorque.'};
  const shown=show({area:area||null});
  const chosen=area||nearestArea();
  const names={london:'London',finland:'Finland',helsinki:'Helsinki',nyc:'New York',porto:'Porto',lisboa:'Lisbon'};
  return {handled:true,language:en?'en':'pt',reply:!shown
    ?(en?'The Road Live panel is unavailable. Reload Travis and try again.':'O painel Road Live não está disponível. Recarrega o Travis e tenta de novo.')
    :en?'Opening Road Live for '+(names[chosen]||'the selected area')+'. I will show the source, timestamps and any connection error.'
    :'A abrir Road Live para '+(names[chosen]||'a zona selecionada')+'. O painel indicará a fonte, a hora e qualquer erro de ligação.'};
}

function mount(){
  if(!HUD||document.getElementById('travis-road-live'))return;
  panel=document.createElement('section');panel.id='travis-road-live';panel.hidden=true;
  panel.setAttribute('aria-label','Trânsito real · fontes públicas');
  panel.innerHTML=[
    '<header class="travis-road-header"><div><small>TRAVIS · PUBLIC ROAD INTELLIGENCE</small>',
    '<strong id="travis-road-subtitle">DADOS RODOVIÁRIOS REAIS</strong></div>',
    '<button type="button" id="travis-road-close" aria-label="Fechar trânsito real">×</button></header>',
    '<nav class="travis-road-areas" aria-label="Fontes rodoviárias">',
    '<button type="button" data-road-area="porto">PORTO</button>',
    '<button type="button" data-road-area="lisboa">LISBON</button>',
    '<button type="button" data-road-area="london">LONDON</button>',
    '<button type="button" data-road-area="finland">FINLAND</button>',
    '<button type="button" data-road-area="helsinki">HELSINKI</button>',
    '<button type="button" data-road-area="nyc">NEW YORK</button></nav>',
    '<div id="travis-road-status" role="status"></div>',
    '<div id="travis-road-list" class="travis-road-list"></div>',
    '<footer class="travis-road-credit"><a id="travis-road-source" target="_blank" rel="noopener noreferrer">FONTE PÚBLICA</a>',
    '<button id="travis-road-refresh" type="button">REFRESH</button></footer>',
    '<p class="travis-road-disclaimer">Ocorrências de fontes públicas (algumas agregadas), não congestionamento medido. Velocidades apenas onde existem sensores. Porto/Lisboa: fonte keyless temporária até 14/10/2026.</p>'
  ].join('');
  HUD.appendChild(panel);
  contentList=panel.querySelector('#travis-road-list');
  subtitle=panel.querySelector('#travis-road-subtitle');
  notice=panel.querySelector('#travis-road-status');
  source=panel.querySelector('#travis-road-source');
  panel.querySelector('#travis-road-close').onclick=close;
  panel.querySelector('#travis-road-refresh').onclick=()=>void loadArea(activeArea,{refresh:true});
  for(const b of panel.querySelectorAll('[data-road-area]')){
    b.onclick=()=>void loadArea(b.dataset.roadArea,{applyToGlobe:true});
  }
  const toolbar=HUD.querySelector('#travis-gev-official .travis-gev-toolbar');
  if(toolbar){
    button=btn('ROAD LIVE','toggle');button.id='travis-road-toggle';
    button.title='Ocorrências públicas: Porto/Lisboa (até 14/10), TfL; velocidades medidas: Fintraffic/NYC.';
    button.onclick=()=>open?close():show();
    toolbar.appendChild(button);
  }
  window.addEventListener('travis:close',close);
  window.addEventListener('travis:gev',event=>{if(open && event.detail?.open===false)close();});
  window.addEventListener('travis:cctv-player',event=>{if(open && event.detail?.open===true)close();});
  window.addEventListener('pagehide',close);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
}
mount();
window.TravisRoadLive=Object.freeze({show,close,routeCommand,status:()=>({
  open,area:activeArea,busy,count:lastData?.items?.length||0,
  source:lastData?.source||null,state:lastData?.state||'unloaded'
})});
