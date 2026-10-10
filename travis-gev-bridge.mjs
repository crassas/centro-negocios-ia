/*
 * Travis ⇄ official God's Eye View (GEV 0.2.x).
 * Local-only, keyless, lazy Cesium iframe. Only upstream's documented
 * postMessage view contract is used. Existing Travis voice and native globe
 * remain operational as a fallback. No key or server management in the browser.
 */
import {GEO_LAYERS,GEO_PLACES,interpretGeoRequest} from './travis-gev-intents.mjs?v=gev-17';

const hud=document.getElementById('travis-hud');
const original=window.TravisWorld;
const local=['127.0.0.1','localhost'].includes(location.hostname) && location.port==='8770';
const targetOrigin='http://'+(location.hostname==='localhost'?'localhost':'127.0.0.1')+':4173';
const frameUrl=targetOrigin+'/?embed=1&welcome=0';
const originalToggle=document.getElementById('travis-world-toggle');
const groups=new Map(GEO_LAYERS.map(x=>[x.key,x]));
const state={
  mode:'closed',ready:false,place:'earth',coordinates:null,
  layers:new Set(['earthquakes']),style:'normal',map:'esri-imagery',
  changed:0,sent:0,ack:0,inFlight:false,pending:false,
  frame:null,panel:null,drawer:null,status:null,placeName:null,more:null,
  bootTimer:0,queueTimer:0,openedAt:0,error:null,lastOk:null
};
const t=(text)=>document.createTextNode(text);
const labelOf=()=>state.coordinates?.label||GEO_PLACES[state.place]?.label||'Planet Earth';
const activeIds=()=>[...new Set(GEO_LAYERS.filter(g=>state.layers.has(g.key)).flatMap(g=>g.ids))];
const within=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
const active=()=>state.mode==='official';
const emit=()=>window.dispatchEvent(new CustomEvent('travis:gev',{detail:status()}));

function setMessage(message){
  if(state.status)state.status.textContent=message;
}
function sync(){
  if(state.placeName)state.placeName.textContent=labelOf();
  for(const b of state.panel?.querySelectorAll('[data-gev-layer]')||[]){
    b.setAttribute('aria-pressed',String(state.layers.has(b.dataset.gevLayer)));
  }
  for(const b of state.panel?.querySelectorAll('[data-gev-place]')||[]){
    b.setAttribute('aria-pressed',String(b.dataset.gevPlace===state.place && !state.coordinates));
  }
  state.panel?.querySelector('#travis-gev-map')?.setAttribute('aria-label',
    'Map imagery: '+(state.map==='osm'?'OpenStreetMap':'Esri satellite')+'. Tap to switch.');
  state.panel?.querySelector('#travis-gev-style')?.setAttribute('aria-label','Visual style: '+state.style+'. Tap to change.');
  state.panel?.querySelector('#travis-gev-map')?.replaceChildren(t(state.map==='osm'?'OSM':'ESRI'));
  const label={normal:'NORMAL',surveillance:'NVG',thermal:'FLIR',retro:'CRT',noir:'NOIR'}[state.style]||state.style.toUpperCase();
  state.panel?.querySelector('#travis-gev-style')?.replaceChildren(t(label));
  originalToggle?.setAttribute('aria-pressed',String(active()));
  emit();
}
function view(){
  const loc=state.coordinates||GEO_PLACES[state.place]||GEO_PLACES.earth;
  return {
    camera:{
      lat:loc.lat,lon:loc.lon,altitude_m:loc.alt,
      heading_deg:0,pitch_deg:-90
    },
    layers:activeIds(),style:state.style,map:state.map,annotations:[]
  };
}
function sendView(){
  if(!active()||!state.ready||!state.frame?.contentWindow)return;
  if(state.inFlight){state.pending=true;return;}
  state.pending=false;state.inFlight=true;
  state.sent=++state.changed;
  try {
    state.frame.contentWindow.postMessage({type:'gev:view',id:state.sent,view:view()},targetOrigin);
    setMessage('UPDATING WORLD VIEW');
    sync();
  } catch(err) {
    state.inFlight=false;
    state.error=String(err?.message||err);
    setMessage('WORLD LINK ERROR · RETRY');
  }
}
function queue(){
  if(!active())return;
  setMessage(state.ready?'PREPARING SCENE':'CONNECTING TO GLOBE');
  clearTimeout(state.queueTimer);
  state.queueTimer=setTimeout(sendView,200);
  sync();
}
function fallback(reason){
  if(!active())return;
  state.error=reason;
  const place=Array.isArray(original?.locations)&&original.locations.includes(state.place)?state.place:'earth';
  teardown(false);
  if(original?.open) {
    original.open(place);
    state.mode='native';
  } else {
    state.mode='closed';
    window.TravisVisual?.setState?.('ready','Official globe unavailable.');
  }
  emit();
}
function teardown(closeNative=true){
  clearTimeout(state.bootTimer);state.bootTimer=0;
  clearTimeout(state.queueTimer);state.queueTimer=0;
  if(state.frame){
    // Explicitly unload Cesium workers/WebGL to release mobile memory.
    state.frame.src='about:blank';
  }
  state.ready=false;state.inFlight=false;state.pending=false;
  state.sent=0;state.ack=0;
  if(state.panel)state.panel.hidden=true;
  if(hud?.dataset.worldEngine==='official'){
    hud.dataset.world='closed';hud.dataset.worldEngine='none';
    hud.dataset.eyeMode='disabled';
  }
  state.mode='closed';
  originalToggle?.setAttribute('aria-pressed','false');
  if(closeNative)original?.close?.();
}
function close(){
  teardown(true);
  emit();
}
function open(place='earth'){
  if(!hud || !state.panel)return false;
  if(!local){
    original?.open?.(place in GEO_PLACES?place:'earth');
    state.mode='native';
    state.error='Local Travis instance required for full globe';
    emit();
    return false;
  }
  if(hud.getAttribute('aria-hidden')==='true')window.TravisVisual?.open?.();
  if(state.mode==='native')original?.close?.();
  if(place in GEO_PLACES){
    state.place=place;state.coordinates=null;
  }
  if(active()){
    queue();
    return true;
  }
  state.mode='official';state.ready=false;state.error=null;state.lastOk=null;
  state.openedAt=Date.now();
  hud.dataset.world='open';
  hud.dataset.worldEngine='official';
  hud.dataset.eyeMode='enabled';
  state.panel.hidden=false;
  state.drawer.hidden=true;
  state.more.setAttribute('aria-expanded','false');
  state.inFlight=false;state.pending=false;state.sent=0;state.ack=0;
  setMessage('CONNECTING TO WORLD ENGINE');
  sync();
  // Load on demand only; no Cesium WebGL while Travis is being used normally.
  state.frame.src=frameUrl;
  state.bootTimer=setTimeout(()=>{
    if(active()&&!state.ready)fallback('No GEV ready message within 28 seconds');
  },28000);
  return true;
}
function navigate(place,coordinates=null){
  if(place in GEO_PLACES){state.place=place;state.coordinates=null;}
  if(coordinates && within(coordinates.lat,-90,90) && within(coordinates.lon,-180,180)){
    state.place='earth';state.coordinates={...coordinates,alt:45000};
  }
  if(!active())open(state.place);
  else queue();
}
function toggleLayer(key,on){
  const g=groups.get(key);if(!g)return false;
  if(on===false)state.layers.delete(key);
  else if(on===true)state.layers.add(key);
  else if(state.layers.has(key))state.layers.delete(key);
  else state.layers.add(key);
  if(!active())open(state.place);
  else queue();
  sync();
  return true;
}
function setMap(map){
  if(!['esri-imagery','osm'].includes(map))return false;
  state.map=map;
  if(active())queue();
  sync();return true;
}
function setStyle(style){
  if(!['normal','surveillance','thermal','retro','noir'].includes(style))return false;
  state.style=style;
  if(active())queue();
  sync();return true;
}
function status(){
  if(state.mode==='native')return {...(original?.status?.()||{}),engine:'native-fallback',officialError:state.error};
  return {open:active(),ready:state.ready,engine:'gods-eye-official',
    place:state.place,coordinates:state.coordinates,layers:activeIds(),
    keylessCategories:17,available:local,mode:state.mode,error:state.error,
    lastApplied:state.lastOk,origin:targetOrigin};
}
function routeCommand(raw){
  const intent=interpretGeoRequest(raw,{active:active()});
  if(!intent){
    if(state.mode==='native')return original?.routeCommand?.(raw)||{handled:false};
    return {handled:false};
  }
  const en=intent.language==='en';
  if(intent.type==='close'){
    close();return {handled:true,language:intent.language,reply:en?'Returning to Travis.':'A regressar ao Travis.'};
  }
  if(intent.type==='open'){
    open();return {handled:true,language:intent.language,reply:en?
      "Opening God's Eye View inside Travis.":'A abrir o globo oficial dentro do Travis.'};
  }
  if(intent.type==='help'){
    return {handled:true,language:intent.language,reply:en?
      'I can show public flights, satellites, earthquakes, weather, cameras and other keyless layers. Ask me to fly to a city or change layers.':
      'Posso mostrar voos públicos, satélites, sismos, meteorologia e câmaras. Pede-me uma cidade ou uma camada.'};
  }
  if(intent.type==='navigate'){
    navigate(intent.place||state.place,intent.coordinates);
    return {handled:true,language:intent.language,reply:en?
      'Preparing a view over '+labelOf()+'.':'A preparar a vista sobre '+labelOf()+'.'};
  }
  if(intent.type==='layers'){
    for(const key of intent.layers)toggleLayer(key,intent.enable);
    if(intent.place||intent.coordinates)navigate(intent.place||state.place,intent.coordinates);
    const groupNames=intent.layers.map(key=>groups.get(key)?.[en?'en':'pt']||key).join(', ');
    return {handled:true,language:intent.language,reply:en?
      (intent.enable?'Preparing ':'Hiding ')+groupNames+' on the world map.':
      (intent.enable?'A preparar ':'A ocultar ')+groupNames+' no mapa.'};
  }
  if(intent.type==='map'){
    setMap(intent.map);
    return {handled:true,language:intent.language,reply:en?
      'Changing map imagery.':'A alterar a cartografia.'};
  }
  if(intent.type==='style'){
    setStyle(intent.style);
    return {handled:true,language:intent.language,reply:en?
      'Changing the world view.':'A alterar o modo visual do globo.'};
  }
  return {handled:false};
}
function onMessage(event){
  if(!active()||!state.frame||event.source!==state.frame.contentWindow||event.origin!==targetOrigin)return;
  const message=event.data;
  if(message?.type==='gev:ready'){
    state.ready=true;clearTimeout(state.bootTimer);state.bootTimer=0;
    setMessage('WORLD ENGINE READY · LOADING DATA');
    state.inFlight=false;state.pending=false;sendView();
  } else if(message?.type==='gev:view-applied' && message.id===state.sent){
    state.inFlight=false;state.ack=message.id;
    state.lastOk=message.ok===true;
    state.error=message.ok===false?String(message.error||'Some requested layers unavailable'):null;
    setMessage(message.ok===true?'LIVE GLOBE · PUBLIC SOURCES':
      'PARTIAL VIEW · CHECK SOURCE AVAILABILITY');
    emit();
    if(state.pending){clearTimeout(state.queueTimer);state.queueTimer=setTimeout(sendView,160);}
  }
}
function mount(){
  if(!hud||document.getElementById('travis-gev-official'))return;
  const panel=document.createElement('section');
  panel.id='travis-gev-official';panel.hidden=true;
  panel.setAttribute('aria-label','Official live 3D world');
  panel.innerHTML=[
    '<iframe id="travis-gev-frame" title="God’s Eye View geospatial globe" loading="eager" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>',
    '<header class="travis-gev-head"><span>TRAVIS <i>/</i> WORLD INTELLIGENCE</span>',
    '<strong id="travis-gev-place">Planet Earth</strong>',
    '<button id="travis-gev-return" type="button" aria-label="Return to Travis">RETURN</button></header>',
    '<nav class="travis-gev-toolbar" aria-label="World controls">',
    '<button type="button" data-gev-place="earth">EARTH</button>',
    '<button type="button" data-gev-place="porto">PORTO</button>',
    '<button type="button" data-gev-layer="flights">FLIGHTS</button>',
    '<button type="button" data-gev-layer="satellites">SATELLITES</button>',
    '<button type="button" data-gev-layer="earthquakes">QUAKES</button>',
    '<button type="button" id="travis-gev-more" aria-expanded="false" aria-controls="travis-gev-drawer">LAYERS 17</button>',
    '</nav>',
    '<div class="travis-gev-drawer" id="travis-gev-drawer" hidden>',
    '<div class="travis-gev-drawer-title">KEYLESS · SELECT DATA SOURCES</div>',
    '<div class="travis-gev-grid" id="travis-gev-grid"></div>',
    '<div class="travis-gev-style-row">',
    '<button type="button" id="travis-gev-map" aria-label="Switch basemap">ESRI</button>',
    '<button type="button" id="travis-gev-style" aria-label="Switch visual style">NORMAL</button>',
    '<button type="button" id="travis-gev-layer-close">DONE</button>',
    '</div></div>',
    '<footer class="travis-gev-footer">',
    '<span class="travis-gev-signal" aria-hidden="true"></span>',
    '<span id="travis-gev-status" role="status">WORLD ENGINE STANDBY</span>',
    '<span class="travis-gev-origin">PUBLIC DATA · KEYLESS</span></footer>'
  ].join('');
  hud.insertBefore(panel,hud.firstChild?.nextSibling||null);
  state.panel=panel;
  state.frame=panel.querySelector('#travis-gev-frame');
  state.drawer=panel.querySelector('#travis-gev-drawer');
  state.more=panel.querySelector('#travis-gev-more');
  state.status=panel.querySelector('#travis-gev-status');
  state.placeName=panel.querySelector('#travis-gev-place');
  const grid=panel.querySelector('#travis-gev-grid');
  // Esri / OSM basemap is the 17th category: the rest are independently toggled.
  const base=document.createElement('div');base.className='travis-gev-keyless-base';
  base.textContent='01 · MAP STACK / ESRI · OSM';
  grid.appendChild(base);
  GEO_LAYERS.forEach((g,index)=>{
    const b=document.createElement('button');b.type='button';
    b.dataset.gevLayer=g.key;
    b.textContent=String(index+2).padStart(2,'0')+' · '+g.en;
    b.title=g.pt;
    b.setAttribute('aria-pressed','false');
    grid.appendChild(b);
  });
  panel.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if(b.dataset.gevLayer){toggleLayer(b.dataset.gevLayer);return;}
    if(b.dataset.gevPlace){navigate(b.dataset.gevPlace);return;}
    if(b.id==='travis-gev-return'){close();return;}
    if(b.id==='travis-gev-more'){
      state.drawer.hidden=!state.drawer.hidden;
      state.more.setAttribute('aria-expanded',String(!state.drawer.hidden));
      return;
    }
    if(b.id==='travis-gev-layer-close'){
      state.drawer.hidden=true;state.more.setAttribute('aria-expanded','false');
      return;
    }
    if(b.id==='travis-gev-map'){setMap(state.map==='osm'?'esri-imagery':'osm');return;}
    if(b.id==='travis-gev-style'){
      const styles=['normal','surveillance','thermal','noir','retro'];
      setStyle(styles[(styles.indexOf(state.style)+1)%styles.length]);
    }
  });
  if(originalToggle){
    // This capture handler substitutes only the button action, not Travis voice.
    originalToggle.addEventListener('click',e=>{
      e.preventDefault();e.stopImmediatePropagation();
      if(active()||state.mode==='native')close();else open();
    },true);
    originalToggle.setAttribute('aria-label','Activate official 3D Earth');
  }
  window.addEventListener('message',onMessage);
  window.addEventListener('travis:close',()=>{teardown(false);emit();});
  window.addEventListener('pagehide',()=>{teardown(false);emit();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&active()){
      if(!state.drawer.hidden){
        state.drawer.hidden=true;state.more.setAttribute('aria-expanded','false');
      }else{close();}
      e.stopImmediatePropagation();e.preventDefault();
    }
  },true);
  state.frame.addEventListener('error',()=>{
    if(active()&&!state.ready)fallback('Frame failed to load');
  });
  sync();
}
mount();
if(original&&local){
  window.TravisWorld=Object.freeze({
    ...original,open,close,routeCommand,
    layer(id,on){
      const g=groups.get(id)||GEO_LAYERS.find(g=>g.ids.includes(id));
      if(g)return toggleLayer(g.key,on);
      return false;
    },
    status,locations:[...Object.keys(GEO_PLACES)],
    refresh:()=>active()?queue():original.refresh?.()
  });
  window.TravisGevBridge=Object.freeze({
    open,close,navigate,toggleLayer,setMap,setStyle,status,routeCommand
  });
} else if(original){
  window.TravisGevBridge=Object.freeze({
    status:()=>({...original.status?.(),mode:'native-only',available:local})
  });
}
