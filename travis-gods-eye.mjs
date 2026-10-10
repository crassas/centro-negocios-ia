/* TRAVIS | GOD'S EYE — private additive module, not an upstream overwrite.
 * One existing WebGL context on Android, data from USGS / ISS / Open-Meteo.
 */
import {createWorldFeeds} from './travis-world-feeds.mjs?v=eye-4';
const hud=document.getElementById('travis-hud');
const places={
 earth:['Planet Earth',28,-18],
 newyork:['New York City',40.758,-73.9855],
 porto:['Porto',41.1496,-8.6109],
 lisboa:['Lisbon',38.7223,-9.1393],
 london:['London',51.5072,-.1276],
 paris:['Paris',48.8566,2.3522],
 tokyo:['Tokyo',35.6762,139.6503]
};
const s={open:false,ready:false,place:'earth',cameras:false,cameraPins:true,
 layers:new Set(['earthquakes','iss']),error:null};
const els={};
let currentData=null,timeout=0;
const normalized=text=>String(text??'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/['’‘]/g,'')
  .replace(/[,!?;:.]+/g,' ').replace(/\s+/g,' ').trim();
const english=t=>/\b(activate|deactivate|engage|disengage|enable|disable|show|open|close|back|god|gods|eye|iss|earthquakes|fly|flights|weather)\b/.test(t);
const pfind=t=>{
 if(/\b(new york|nova iorque|nyc|times square|manhattan)\b/.test(t))return 'newyork';
 if(/\b(oporto|porto|campanha|boavista)\b/.test(t))return 'porto';
 if(/\b(lisboa|lisbon)\b/.test(t))return 'lisboa';
 if(/\b(london|londres)\b/.test(t))return 'london';
 if(/\b(paris)\b/.test(t))return 'paris';
 if(/\b(tokyo|toquio)\b/.test(t))return 'tokyo';
 if(/\b(globe|globo|planet|planeta|earth|terra|world|mundo)\b/.test(t))return 'earth';
 return null;
};
const geo=p=>({lat:places[p][1],lon:places[p][2]});
const emit=()=>{
 window.dispatchEvent(new CustomEvent('travis:world',{detail:{
   open:s.open,place:s.place,layers:[...s.layers],engine:'native',cameras:s.cameras
 }}));
 window.dispatchEvent(new CustomEvent('travis:world-layers',{
   detail:{layers:[...s.layers],open:s.open}
 }));
};
function updateUI(){
 if(els.place)els.place.textContent=places[s.place][0];
 if(els.tray)els.tray.hidden=!s.cameras;
 if(els.camera)els.camera.hidden=s.place!=='newyork';
 if(els.toggle)els.toggle.setAttribute('aria-pressed',String(s.open));
 for(const el of els.panel?.querySelectorAll('[data-eye]')||[]){
   const a=el.dataset.eye;
   const active= a==='earthquakes'||a==='iss'?s.layers.has(a)
      :a==='cameras'?s.cameras:a===s.place;
   el.setAttribute('aria-pressed',String(active));
 }
}
function updateTelemetry(){
 if(!els.telemetry)return;
 const parts=[],d=currentData;
 if(s.layers.has('earthquakes')){
   const n=d?.earthquakes?.earthquakes?.length;
   parts.push(Number.isInteger(n)?'USGS · '+n+' QUAKES':d?.errors?.earthquakes?'USGS UNAVAILABLE':'USGS CONNECTING');
 }
 if(s.layers.has('iss')){
   const i=d?.iss;
   parts.push(i?'ISS · '+i.lat.toFixed(1)+'°, '+i.lon.toFixed(1)+'°':d?.errors?.iss?'ISS UNAVAILABLE':'ISS CONNECTING');
 }
 const mesh=window.TravisCctv?.status?.();
 if(mesh?.count>0){
   parts.unshift('CCTV · '+mesh.count.toLocaleString('en-US')+' PUBLIC LOCATIONS');
 }else if(mesh?.state==='loading'){
   parts.unshift('CCTV · LOADING PUBLIC SOURCES');
 }else if(mesh?.state==='error'){
   parts.unshift('CCTV · CATALOG UNAVAILABLE');
 }
 if(s.layers.has('weather')){
   const w=d?.weather;
   parts.push(w?'WEATHER · '+Math.round(w.temperature)+'°C':d?.errors?.weather?'WEATHER UNAVAILABLE':'WEATHER CONNECTING');
 }
 els.telemetry.textContent=parts.join('  ·  ')||'3D EARTH · EXPLORE';
}
function status(message){if(els.status)els.status.textContent=message;}
const feeds=createWorldFeeds(data=>{
 currentData=data;updateTelemetry();
 window.dispatchEvent(new CustomEvent('travis:world-data',{detail:data}));
});
function open(place='earth',opts={}){
 if(!els.panel||!hud)return false;
 if(hud.getAttribute('aria-hidden')==='true')window.TravisVisual?.open?.();
 if(!(place in places))place='earth';
 const first=!s.open,old=s.place;
 s.open=true;s.place=place;s.error=null;
 if(place!=='earth')s.layers.add('weather');
 if(typeof opts.cameras==='boolean')s.cameras=opts.cameras;
 hud.dataset.world='open';
 hud.dataset.worldEngine='native';
 hud.dataset.eyeMode='enabled';
 els.panel.hidden=false;
 updateUI();emit();updateTelemetry();
 if(first){
   s.cameraPins=true;
   // Lazy catalog: load public positions only on user activation.
   void window.TravisCctv?.load?.();
   s.ready=false;
   status('GOD’S EYE · INITIALIZING');
   feeds.start(geo(place));
   clearTimeout(timeout);
   timeout=setTimeout(()=>{
     if(s.open&&!s.ready){
       s.error='Native 3D not responding';
       status('3D unavailable · return to Travis and try again');
     }
   },12000);
 }else if(old!==place){
   feeds.setLocation(geo(place));
   status('NAVIGATION · '+places[place][0].toUpperCase());
 }
 return true;
}
function close(){
 if(!s.open)return;
 s.open=false;s.ready=false;s.cameras=false;s.error=null;
 window.TravisCameraCinema?.close?.();
 if(els.panel)els.panel.hidden=true;
 hud.dataset.world='closed';hud.dataset.eyeMode='disabled';
 clearTimeout(timeout);timeout=0;
 feeds.stop();updateUI();emit();
}
function layer(id,on){
 if(!['earthquakes','iss','weather'].includes(id))return;
 if(on===false)s.layers.delete(id);else s.layers.add(id);
 if(!s.open)open('earth');
 updateUI();updateTelemetry();emit();
}
function cameras(on=true,place=s.place){
  if(!s.open)open(place);
  if(on){
    // Camera pins are already mapped; selector loads only chosen media.
    void window.TravisCctv?.load?.();
    const opened=window.TravisCameraCinema?.openPicker?.();
    s.cameras=Boolean(opened);
    status(opened?'CAMERA CINEMA · SELECT A SOURCE':'Camera panel not ready. Refresh Travis.');
  }else{
    window.TravisCameraCinema?.close?.();
    s.cameras=false;
  }
  updateUI();emit();
}
function routeCommand(raw){
 const t=normalized(raw);
 if(!t)return {handled:false};
 const named=/\b(gods?\s+(?:eye|eyes|ai|i)(?:\s+view)?|eye\s+of\s+god|godseye)\b/.test(t);
 const quit=/\b(deactivate|disengage|disable|shutdown|turn off|switch off|stop|exit|close|desativa|desativar|desliga|desligar|fecha|fechar)\b/.test(t);
 const enable=/\b(activate|activation|engage|enable|launch|start|switch on|turn on|open|ativa|ativar|activa|activar|ligar|inicia|iniciar|abre|abrir)\b/.test(t);
 const en=english(t);
 if(named&&quit){
   close();
   return {handled:true,language:en?'en':'pt',reply:en?
     "God's Eye disengaged. Returning to Travis.":'God’s Eye desativado. A regressar ao Travis.'};
 }
 if(named&&enable){
   open('earth');
   return {handled:true,language:en?'en':'pt',reply:en?
     "God's Eye activated. Connecting to public Earth data.":'God’s Eye ativado. A ligar aos dados públicos da Terra.'};
 }
 if(named&&s.open&&/\b(help|capabilities|what can|ajuda|que podes)\b/.test(t)){
   return {handled:true,language:en?'en':'pt',reply:en?
     "God's Eye offers 3D Earth, USGS earthquakes, current ISS position and public weather. Cameras open through authorized providers. Live flights are not connected in mobile mode.":
     'God’s Eye mostra a Terra em 3D, sismos USGS, a posição da ISS e meteorologia. As câmaras abrem nos fornecedores. Os voos ainda não estão ligados no telemóvel.'};
 }
 const p=pfind(t),action=/\b(show|open|fly|go|take|zoom|navigate|move|mostra|abre|voa|vai|ver|aproxima|navega)\b/.test(t);
 if(!s.open){
   if(p&&action){
     open(p);
     return {handled:true,language:en?'en':'pt',reply:en?'Showing '+places[p][0]+' in 3D.':'A mostrar '+places[p][0]+' em 3D.'};
   }
   return {handled:false};
 }
 if(/\b(back to travis|return to travis|voltar ao travis|close globe|fechar o globo|fecha o mapa)\b/.test(t)){
   close();return {handled:true,language:en?'en':'pt',reply:en?'Returning to Travis.':'A regressar ao Travis.'};
 }
 if(p&&action){open(p);return {handled:true,language:en?'en':'pt',
   reply:en?'Flying to '+places[p][0]+'.':'A aproximar de '+places[p][0]+'.'};}
 if(/\b(earthquakes|sismos|terramotos|seismic)\b/.test(t)){
   const on=!/\b(hide|remove|disable|desliga|oculta)\b/.test(t);
   layer('earthquakes',on);return {handled:true,language:en?'en':'pt',
     reply:en?(on?'USGS earthquakes online.':'Earthquake markers hidden.'):(on?'Sismos USGS ativos.':'Sismos ocultos.')};
 }
 if(/\b(iss|space station|estacao espacial)\b/.test(t)){
   const on=!/\b(hide|remove|disable|desliga|oculta)\b/.test(t);
   layer('iss',on);return {handled:true,language:en?'en':'pt',
     reply:en?(on?'ISS position online.':'ISS marker hidden.'):(on?'Posição da ISS disponível.':'Marcador da ISS oculto.')};
 }
 if(/\b(flights|aircraft|airplanes|planes|avioes|aeronaves|voos)\b/.test(t)){
   return {handled:true,language:en?'en':'pt',
     reply:en?'Live flights are not yet connected in mobile mode.':'O rastreio de voos ainda não está ligado no telemóvel.'};
 }
 if(/\b(weather|temperature|meteorologia|temperatura)\b/.test(t)){
   layer('weather',true);return {handled:true,language:en?'en':'pt',
     reply:en?'Showing public weather observations.':'A mostrar as condições meteorológicas disponíveis.'};
 }
 if(/\b(camera|cameras|camara|camaras|webcam|webcams|cctv)\b/.test(t)){
   cameras(true,p||s.place);return {handled:true,language:en?'en':'pt',
     reply:en?'Opening available public camera sources.':'A mostrar fontes de câmaras públicas disponíveis.'};
 }
 return {handled:false};
}
function mount(){
 if(!hud||document.getElementById('travis-world'))return;
 const panel=document.createElement('section');
 panel.id='travis-world';panel.className='travis-world';
 panel.setAttribute('aria-label',"God's Eye");
 panel.hidden=true;
 panel.innerHTML=[
  '<header class="travis-world-header"><span class="travis-world-caption">TRAVIS / GOD’S EYE</span>',
  '<strong id="travis-world-place">Planet Earth</strong></header>',
  '<div class="travis-world-foot">',
  '<div id="travis-world-telemetry" class="travis-world-telemetry">USGS · ISS · PUBLIC DATA</div>',
  '<div id="travis-world-status" class="travis-world-status">GOD’S EYE STANDBY</div>',
  '<div class="travis-world-controls">',
  '<button data-eye="earth" type="button">EARTH</button>',
  '<button data-eye="newyork" type="button">NYC</button>',
  '<button data-eye="porto" type="button">PORTO</button>',
  '<button data-eye="earthquakes" type="button">QUAKES</button>',
  '<button data-eye="iss" type="button">ISS</button>',
  '<button data-eye="cameras" type="button">CAMERAS</button>',
  '<button data-eye="close" type="button">RETURN</button></div>',
  '</div>'
 ].join('');
 hud.insertBefore(panel,hud.firstChild.nextSibling);
 els.panel=panel;
 for(const [k,id] of [['telemetry','travis-world-telemetry'],['status','travis-world-status'],['place','travis-world-place'],['tray','travis-world-camera-tray'],['camera','travis-world-live-link']]){
   els[k]=panel.querySelector('#'+id);
 }
 panel.addEventListener('click',e=>{
   const el=e.target.closest('[data-eye]');if(!el)return;
   const a=el.dataset.eye;
   if(a==='close')close();else if(a==='cameras')cameras(!s.cameras);
   else if(a==='earthquakes'||a==='iss')layer(a,!s.layers.has(a));
   else if(places[a])open(a);
 });
 const toggle=document.createElement('button');
 toggle.id='travis-world-toggle';toggle.type='button';
 toggle.textContent="GOD'S EYE";
 toggle.setAttribute('aria-label',"Activate God's Eye");
 toggle.addEventListener('click',()=>s.open?close():open());
 hud.appendChild(toggle);
 els.toggle=toggle;
 window.addEventListener('travis:world-native-ready',e=>{
   s.ready=true;clearTimeout(timeout);
   if(s.open)status(e.detail?.texture?'GOD’S EYE ONLINE · DRAG / PINCH TO ZOOM':'3D ONLINE · LOADING EARTH TEXTURE');
 });
 window.addEventListener('travis:world-native-error',e=>{
   s.error=String(e.detail?.message||'3D issue').slice(0,120);
   if(s.open)status('WORLD ENGINE · '+s.error);
 });
 window.addEventListener('travis:cctv-catalog',()=>updateTelemetry());
 window.addEventListener('travis:camera-cinema',event=>{
   const active=Boolean(event.detail?.open);
   if(s.cameras!==active){s.cameras=active;updateUI();}
 });
 window.addEventListener('travis:close',close);
 window.addEventListener('pagehide',close);
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&s.open){e.stopImmediatePropagation();close();}
 },true);
 updateUI();
}
mount();
window.TravisWorld=Object.freeze({
 open,close,routeCommand,layer,refresh:()=>feeds.refresh(),
 status:()=>({open:s.open,ready:s.ready,place:s.place,
   layers:[...s.layers],cameras:s.cameras,cameraPins:s.cameraPins,engine:'native',
   error:s.error,data:feeds.status()}),
 locations:Object.keys(places)
});
