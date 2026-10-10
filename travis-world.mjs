/**
 * Travis World Bridge — God's Eye View 0.2.x, lazy mobile/desktop embed.
 * Upstream: https://github.com/bilawalsidhu/gods-eye-view (MIT).
 * No paid API, webcam credentials or WebGL context until explicitly opened.
 */
const hud = document.getElementById('travis-hud');
const WORLD_PORT = 4173;
const WORLD_HOST = ['localhost','127.0.0.1'].includes(location.hostname) ? location.hostname : '127.0.0.1';
const WORLD_ORIGIN = 'http://' + WORLD_HOST + ':' + WORLD_PORT;
const PLACES = Object.freeze({
  earth: { name:'Planeta Terra', lat:28,lon:-18,altitude_m:17800000 },
  newyork: {name:'Nova Iorque',lat:40.7580,lon:-73.9855,altitude_m:18500},
  porto: {name:'Porto',lat:41.1496,lon:-8.6109,altitude_m:16500},
  lisboa: {name:'Lisboa',lat:38.7223,lon:-9.1393,altitude_m:16500},
  london: {name:'Londres',lat:51.5072,lon:-0.1276,altitude_m:23000},
  paris: {name:'Paris',lat:48.8566,lon:2.3522,altitude_m:18000},
  tokyo: {name:'Tóquio',lat:35.6762,lon:139.6503,altitude_m:24500}
});
const allowedLayers = ['flights','earthquakes','cctv','satellites'];
const state = {open:false,ready:false,place:'earth',cameras:false,id:0,pending:null,requestedAt:0,error:null};
function norm(s) {
  return String(s||'').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function findPlace(t) {
  if (/\b(new york|nova iorque|times square|manhattan|nyc)\b/.test(t)) return 'newyork';
  if (/\b(porto|oporto|campanha|boavista)\b/.test(t)) return 'porto';
  if (/\b(lisboa|lisbon)\b/.test(t)) return 'lisboa';
  if (/\b(londres|london)\b/.test(t)) return 'london';
  if (/\b(paris|parisiense)\b/.test(t)) return 'paris';
  if (/\b(toquio|tokyo)\b/.test(t)) return 'tokyo';
  if (/\b(planeta|globo|planeta terra|earth|planet|world|mundo)\b/.test(t)) return 'earth';
  return null;
}
let panel, frame, status, placeLabel, camTray, cameraButton, launchButton, liveLink;
function setStatus(message) {
  if (status) status.textContent=message;
}
function setCameraTray() {
  if (!camTray) return;
  camTray.hidden=!state.cameras;
  cameraButton?.setAttribute('aria-pressed',String(state.cameras));
  if (liveLink) liveLink.hidden=state.place!=='newyork';
}
function viewFor(placeKey,cameras) {
  const p=PLACES[placeKey]||PLACES.earth;
  const layers = (placeKey==='earth' ? ['earthquakes'] : ['earthquakes']);
  if (cameras) layers.push('cctv');
  // Camera movement is geodetic; this does NOT imply real-time satellite video.
  return {
    camera:{lat:p.lat,lon:p.lon,altitude_m:p.altitude_m,heading_deg:0,pitch_deg:-90},
    layers:layers.filter(l=>allowedLayers.includes(l)),
    style:'normal',
    map:'esri-imagery',
    annotations:[]
  };
}
function sendPending() {
  if (!frame || !state.ready || !state.open || !state.pending) return;
  const view=state.pending;
  state.pending=null;
  const id=++state.id;
  try {
    frame.contentWindow?.postMessage({type:'gev:view',id,view},WORLD_ORIGIN);
    setStatus('A posicionar o globo…');
    state.requestedAt=Date.now();
  } catch (error) {
    state.error=String(error?.message||error);
    setStatus('Falha na ligação ao motor geográfico.');
  }
}
function open(placeKey='earth', opts={}) {
  if (!hud || !panel) return false;
  if (hud.getAttribute('aria-hidden')==='true') window.TravisVisual?.open?.();
  if (!PLACES[placeKey]) placeKey='earth';
  state.place=placeKey;
  if (typeof opts.cameras==='boolean') state.cameras=opts.cameras;
  state.open=true;
  state.pending=viewFor(state.place,state.cameras);
  panel.hidden=false;
  hud.dataset.world='open';
  launchButton?.setAttribute('aria-pressed','true');
  if (placeLabel) placeLabel.textContent=PLACES[placeKey].name;
  setCameraTray();
  if (!frame.getAttribute('src') || frame.getAttribute('src')==='about:blank') {
    state.ready=false;
    setStatus('A iniciar o globo terrestre em 3D…');
    frame.src=WORLD_ORIGIN+'/?embed=1';
  } else {
    sendPending();
  }
  window.dispatchEvent(new CustomEvent('travis:world',{detail:{open:true,place:placeKey,cameras:state.cameras}}));
  return true;
}
function close() {
  if (!state.open) return;
  state.open=false;
  state.ready=false;
  state.pending=null;
  state.cameras=false;
  if (panel) panel.hidden=true;
  if (hud) hud.dataset.world='closed';
  if (frame) frame.src='about:blank'; // Release Cesium WebGL on mobile.
  launchButton?.setAttribute('aria-pressed','false');
  window.dispatchEvent(new CustomEvent('travis:world',{detail:{open:false}}));
}
function routeCommand(raw) {
  const t=norm(raw).replace(/\s+/g,' ').trim();
  if (!t) return {handled:false};
  const place=findPlace(t);
  const camWords=/\b(cameras|camera|camara|camaras|webcams|webcam|cctv|traffic cameras|live cameras|ao vivo|live cam)\b/.test(t);
  const closeWords=/\b(fecha|fechar|sair|voltar|esconde|oculta|close|exit|back|hide|return)\b/.test(t);
  const worldWords=/\b(globo|planeta|terra|earth|planet|world|mundo)\b/.test(t);
  const actionWords=/\b(mostra|mostrar|abre|abrir|vai|voa|ver|ve|visita|aproxima|levar|navega|zoom|show|open|go|fly|take|see|visit|navigate|display)\b/.test(t);
  if (closeWords && (/\b(globo|terra|earth|planet|world|mundo|mapa|cameras|camera|camara|camaras)\b/.test(t)||state.open && /\b(voltar ao travis|back to travis|fechar o mapa|close map)\b/.test(t))) {
    close();
    return {handled:true,reply:/\b(close|exit|back|return)\b/.test(t)?'Returning to Travis.':'A regressar ao Travis.'};
  }
  if (camWords && (actionWords||state.open||place)) {
    const target=place|| (state.open?state.place:'newyork');
    open(target,{cameras:true});
    return {handled:true,reply:/\b(show|open|live)\b/.test(t)?'Opening public camera locations near '+(PLACES[target]?.name||'Earth')+'.':'A mostrar as câmaras públicas disponíveis perto de '+(PLACES[target]?.name||'Terra')+'.'};
  }
  if (place && (actionWords || worldWords || state.open || /\btravis\b/.test(t))) {
    open(place,{cameras:state.open?state.cameras:false});
    return {handled:true,reply:/\b(show|open|fly|take|go|earth|planet|world)\b/.test(t)?'Showing '+(place==='earth'?'planet Earth':PLACES[place].name)+' in 3D.':'A mostrar '+(place==='earth'?'o planeta Terra':PLACES[place].name)+' em 3D.'};
  }
  return {handled:false};
}
function mount() {
  if (!hud || document.getElementById('travis-world')) return;
  panel=document.createElement('section');
  panel.id='travis-world';
  panel.className='travis-world';
  panel.setAttribute('aria-label','Globo 3D do Travis');
  panel.hidden=true;
  panel.innerHTML=[
    '<iframe id="travis-world-frame" title="God’s Eye View: globo terrestre 3D" loading="lazy" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>',
    '<header class="travis-world-header"><span class="travis-world-caption">TRAVIS <i> / </i> EARTH INTELLIGENCE</span>',
    '<strong id="travis-world-place">Planeta Terra</strong></header>',
    '<div class="travis-world-foot">',
    '<div id="travis-world-status" class="travis-world-status" role="status">Motor geográfico em repouso.</div>',
    '<div class="travis-world-controls" role="group" aria-label="Controlos da Terra">',
    '<button data-world="earth" type="button">GLOBO</button>',
    '<button data-world="newyork" type="button">NEW YORK</button>',
    '<button data-world="porto" type="button">PORTO</button>',
    '<button data-world="cameras" type="button" id="travis-world-cameras" aria-pressed="false">CÂMARAS</button>',
    '<button data-world="close" type="button" aria-label="Voltar ao Travis">VOLTAR</button>',
    '</div>',
    '<div id="travis-world-camera-tray" class="travis-world-camera-tray" hidden>',
    '<span>Os pontos CCTV provêm de fontes públicas disponíveis. Algumas câmaras apresentam imagens periódicas em vez de vídeo.</span>',
    '<a id="travis-world-live-link" target="_blank" rel="noopener noreferrer" href="https://www.earthcam.com/usa/newyork/timessquare/">Ver Times Square ao vivo ↗</a>',
    '</div></div>'
  ].join('');
  hud.insertBefore(panel,hud.firstChild.nextSibling);
  frame=panel.querySelector('#travis-world-frame');
  status=panel.querySelector('#travis-world-status');
  placeLabel=panel.querySelector('#travis-world-place');
  cameraButton=panel.querySelector('#travis-world-cameras');
  camTray=panel.querySelector('#travis-world-camera-tray');
  liveLink=panel.querySelector('#travis-world-live-link');
  panel.addEventListener('click',e=>{
    const el=e.target.closest('[data-world]');
    if (!el) return;
    const choice=el.dataset.world;
    if (choice==='close') close();
    else if (choice==='cameras')open(state.place,{cameras:!state.cameras});
    else open(choice,{cameras:state.cameras});
  });
  launchButton=document.createElement('button');
  launchButton.type='button';
  launchButton.id='travis-world-toggle';
  launchButton.textContent='EARTH 3D';
  launchButton.setAttribute('aria-label','Abrir globo 3D');
  launchButton.setAttribute('aria-pressed','false');
  launchButton.addEventListener('click',()=>state.open?close():open('earth'));
  hud.appendChild(launchButton);
  window.addEventListener('message',event=>{
    if(event.source!==frame?.contentWindow || event.origin!==WORLD_ORIGIN) return;
    if (event.data?.type==='gev:ready') {
      state.ready=true;
      setStatus('Globo 3D preparado. Dados conforme as fontes disponíveis.');
      sendPending();
    }
    if (event.data?.type==='gev:view-applied') {
      setStatus(event.data?.ok?'Vista 3D atualizada · Cartografia Esri':'Vista parcial: algumas camadas de dados indisponíveis.');
    }
  });
  frame.addEventListener('error',()=>{setStatus('O serviço geográfico local não respondeu.');state.ready=false;});
  window.addEventListener('travis:close',close);
  addEventListener('pagehide',close);
}
mount();
window.TravisWorld=Object.freeze({
  open,close,routeCommand,
  status(){return {open:state.open,ready:state.ready,place:state.place,cameras:state.cameras,origin:WORLD_ORIGIN,error:state.error};},
  locations:Object.keys(PLACES)
});
