/*
 * Travis London Mission / public traffic exercise.
 * Fictitious vehicle. Real, attributed public camera snapshots + TfL road records.
 * OSRM demo routes are reference estimates WITHOUT live congestion.
 * Does not track, identify or infer the location of any real person or vehicle.
 */
import {ORIGIN,missionCommand,selectLondonCameras,routeTableUrl,routeRows,
        nearbyRoadEvents,kmBetween} from './travis-london-mission-core.mjs?v=london-mission-1';
const HOST=['localhost','127.0.0.1'].includes(location.hostname)?location.hostname:'127.0.0.1';
const ROAD='http://'+HOST+':4187/api/road-live/london';
const GEV=()=>window.TravisGevBridge;
const CAM=()=>window.TravisCctv;
let panel=null,grid=null,logBox=null,roadBox=null,routeBox=null,statusBox=null;
let selected=[],routes=[],roadData=null,active=false,epoch=0,controllers=[],timer=0,horizon=20,received=0;
const cut=(x,n=170)=>String(x??'').slice(0,n);
const ukTime=date=>{
  const d=new Date(date);
  return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-GB',
    {timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(d):'time unknown';
};
function setStatus(message){if(statusBox)statusBox.textContent=cut(message,240);}
function log(message){
  if(!logBox)return;
  const row=document.createElement('li');
  row.textContent=ukTime(Date.now())+' · '+cut(message,180);
  logBox.prepend(row);
  while(logBox.children.length>9)logBox.lastElementChild.remove();
}
function cancelRequests(){for(const c of controllers)c.abort();controllers=[];}
function scopedFetch(url,timeout=9500){
  const ctl=new AbortController();controllers.push(ctl);
  const task=setTimeout(()=>ctl.abort(),timeout);
  return fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
    signal:ctl.signal}).then(async r=>{
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.json();
  }).finally(()=>{clearTimeout(task);controllers=controllers.filter(c=>c!==ctl);});
}
function stopRefresh(){clearInterval(timer);timer=0;}
function startRefresh(){
  stopRefresh();
  if(document.hidden||!active)return;
  // TfL Jam Cams are periodic stills; do not poll faster than their refresh cadence.
  timer=setInterval(()=>{if(active&&!document.hidden){refreshFrames();void checkRoad(epoch);}},180000);
}
function annotations(){
  const pins=selected.map((row,i)=>({type:'pin',latitude:row.camera.lat,
    longitude:row.camera.lon,color:'amber',label:'CAM '+String(i+1).padStart(2,'0')+
    ' · '+cut(row.camera.name,85)}));
  for(const r of nearbyRoadEvents(roadData,5))pins.push({type:'pin',
    latitude:r.lat,longitude:r.lon,color:'red',label:'TfL: '+cut(r.label,85)});
  GEV()?.setExternalAnnotations?.(pins);
}
function cameraCard(row,i,session){
  const camera=row.camera;
  const card=document.createElement('article');card.className='travis-mission-camera';
  const head=document.createElement('div');head.className='travis-mission-camhead';
  const num=document.createElement('b');num.textContent='CAM '+String(i+1).padStart(2,'0');
  const street=document.createElement('small');street.textContent=cut(row.street,35);
  head.append(num,street);
  const frame=document.createElement('div');frame.className='travis-mission-frame';
  const image=document.createElement('img');image.alt='TfL public traffic camera · '+camera.name;
  image.loading='eager';image.decoding='async';image.referrerPolicy='no-referrer';
  // object-fit:contain only: never crop TfL watermark/time/branding.
  const pending=document.createElement('span');pending.className='travis-mission-image-state';
  pending.textContent='REQUESTING PUBLIC SNAPSHOT';
  frame.append(image,pending);
  const name=document.createElement('strong');name.textContent=cut(camera.name,110);
  const foot=document.createElement('div');foot.className='travis-mission-camfoot';
  const kind=document.createElement('span');kind.textContent='TfL · PERIODIC STILL';
  const shot=document.createElement('time');shot.textContent='NOT CHECKED';
  foot.append(kind,shot);
  const actions=document.createElement('div');actions.className='travis-mission-actions';
  const focus=document.createElement('button');focus.type='button';focus.textContent='FOCUS ON GLOBE';
  focus.onclick=()=>{
    if(!active)return;
    panel.hidden=true;
    GEV()?.navigate?.(null,{lat:camera.lat,lon:camera.lon,
      alt:2800,label:camera.name});
    log('Map focus: '+camera.name);
  };
  actions.appendChild(focus);
  card.append(head,frame,name,foot,actions);
  grid.appendChild(card);
  function loadImage(){
    if(!active||session!==epoch)return;
    image.hidden=true;pending.hidden=false;
    pending.textContent='CONNECTING TO PUBLIC CAMERA';shot.textContent='CHECKING';
    const url=CAM()?.frameUrl?.(camera.id);
    if(!url){pending.textContent='SOURCE UNAVAILABLE';shot.textContent='NO SOURCE';return;}
    image.onload=()=>{
      if(!active||session!==epoch)return;
      received++;image.hidden=false;pending.hidden=true;
      shot.textContent='FETCHED '+ukTime(Date.now());
      log('Image received: '+camera.name);
      setStatus(received+' / '+selected.length+' TfL camera images received · no person detection');
    };
    image.onerror=()=>{
      if(!active||session!==epoch)return;
      pending.hidden=false;pending.textContent='IMAGE UNAVAILABLE';shot.textContent='NOT VERIFIED';
      log('Camera unavailable: '+camera.name);
    };
    image.src=url+(url.includes('?')?'&':'?')+'at='+Date.now();
  }
  row.loadImage=loadImage;
  loadImage();
}
function renderCameras(session){
  grid.replaceChildren();
  received=0;
  selected.forEach((row,i)=>cameraCard(row,i,session));
}
function refreshFrames(){
  if(!active||!selected.length)return;
  received=0;log('Refreshing actual public snapshots');
  for(const row of selected)row.loadImage?.();
}
function renderRoutes(){
  if(!routeBox)return;
  routeBox.replaceChildren();
  const h=document.createElement('h3');h.textContent='ROAD REACHABILITY · REFERENCE ONLY';
  routeBox.appendChild(h);
  const explanation=document.createElement('p');
  explanation.textContent='Departure: Oxford Circus (fictional). OSRM road distances and baseline times do not include current traffic. Arriving within the time window is possible, not observed.';
  routeBox.appendChild(explanation);
  if(!routes.length){
    const empty=document.createElement('p');empty.textContent='No verified road-route estimates available.';
    routeBox.appendChild(empty);return;
  }
  const list=document.createElement('ol');list.className='travis-mission-routes';
  for(const [i,row] of selected.entries()){
    const result=routes.find(r=>r.id===row.camera.id);
    const li=document.createElement('li');
    const name=document.createElement('strong');name.textContent='CAM '+(i+1)+' · '+row.camera.name;
    const detail=document.createElement('span');
    detail.textContent=result?.verified
      ? result.km.toFixed(1)+' km road · '+result.minutes.toFixed(1)+' min baseline · '+
        (result.minutes<=horizon?'within '+horizon+'-min reference window':'beyond '+horizon+'-min reference window')
      :'Route not verified';
    li.append(name,detail);list.appendChild(li);
  }
  routeBox.appendChild(list);
}
function renderRoad(payload){
  roadBox.replaceChildren();
  const title=document.createElement('h3');title.textContent='TfL · PUBLIC ROAD REPORTS';
  roadBox.appendChild(title);
  if(!payload||payload.state!=='current'){
    const n=document.createElement('p');n.textContent='No current verified TfL road report available. No traffic speed inferred.';
    roadBox.appendChild(n);return;
  }
  const intro=document.createElement('p');
  intro.textContent=String(payload.items?.length||0)+' reported London road records · gateway fetched '+
    ukTime(payload.fetchedAt)+'. These are disruptions, not measured traffic speeds.';
  roadBox.appendChild(intro);
  const events=nearbyRoadEvents(payload,5);
  if(!events.length){
    const none=document.createElement('p');none.textContent='No reports within 5 km of Oxford Circus in this response; this does not mean traffic is clear.';
    roadBox.appendChild(none);return;
  }
  const list=document.createElement('ul');list.className='travis-mission-events';
  for(const item of events){
    const li=document.createElement('li');
    const strong=document.createElement('strong');strong.textContent=cut(item.label,100);
    const desc=document.createElement('span');desc.textContent=cut(item.detail||item.category||'Road report',170);
    const meta=document.createElement('small');
    meta.textContent=item.km.toFixed(1)+' km from Oxford Circus · '+cut(item.severity||item.category||'TfL report',40)+
      ' · source time '+ukTime(item.observedAt);
    li.append(strong,desc,meta);list.appendChild(li);
  }
  roadBox.appendChild(list);
}
async function checkRoad(session){
  try{
    const data=await scopedFetch(ROAD,12000);
    if(!active||session!==epoch)return;
    roadData=data;renderRoad(data);annotations();
    log(data.state==='current'?'TfL road reports received ('+data.items.length+')':'TfL reports are not current');
  }catch(e){
    if(!active||session!==epoch)return;
    roadData=null;renderRoad(null);log('TfL road report unavailable: '+cut(e.message,60));
  }
}
async function checkRoutes(session){
  const url=routeTableUrl(selected);
  if(!url){renderRoutes();return;}
  try{
    const data=await scopedFetch(url,12000);
    if(!active||session!==epoch)return;
    routes=routeRows(data,selected,horizon);renderRoutes();
    log('OSRM road-reference calculations received; traffic not included');
  }catch(e){
    if(!active||session!==epoch)return;
    routes=[];renderRoutes();
    log('Road-route reference unavailable: '+cut(e.message,60));
  }
}
async function start(){
  mount();if(!panel)return false;
  const session=++epoch;active=true;cancelRequests();stopRefresh();
  panel.hidden=false;grid.replaceChildren();logBox.replaceChildren();
  selected=[];routes=[];roadData=null;received=0;
  setStatus('CHECKING LONDON PUBLIC SOURCES');
  GEV()?.open?.('london');GEV()?.navigate?.('london');GEV()?.toggleLayer?.('cctv',true);
  log('Simulation only: fictional vehicle left Oxford Circus '+horizon+' minutes ago');
  log('Selecting TfL public cameras; no person or vehicle identification');
  try{
    const report=await CAM()?.load?.();
    if(!active||session!==epoch)return false;
    if(report?.state!=='ready')log('CCTV catalogue warning: '+cut(report?.error||report?.state,80));
    selected=selectLondonCameras(CAM()?.locations?.()||[]);
    if(!selected.length){
      setStatus('NO APPROVED TfL PUBLIC CAMERAS IN THE CATALOGUE');
      log('No registered TfL images available; no substitutes inserted');
    }else{
      log('Selected '+selected.length+' named public cameras within 5 km of Oxford Circus');
      renderCameras(session);annotations();
      setStatus('VERIFYING '+selected.length+' REAL TfL IMAGES');
    }
    renderRoutes();renderRoad(null);startRefresh();
    // Independently fail-able sources: a missing route never blocks public snapshots.
    void checkRoad(session);if(selected.length)void checkRoutes(session);
    return true;
  }catch(e){
    if(session===epoch&&active){setStatus('PUBLIC CAMERA CATALOGUE UNAVAILABLE');log('Catalogue error: '+cut(e.message,70));}
    return false;
  }
}
function close(){
  epoch++;active=false;stopRefresh();cancelRequests();
  if(panel)panel.hidden=true;
  GEV()?.setExternalAnnotations?.([]);
}
function routeCommand(text){
  const intent=missionCommand(text);
  if(!intent)return {handled:false};
  if(intent.type==='close'){
    close();return {handled:true,language:intent.language,
      reply:'London exercise closed. Returning to the world map.'};
  }
  void start();
  return {handled:true,language:intent.language,reply:intent.language==='pt'
    ?'Vou abrir o exercício de Londres e verificar cinco câmaras públicas e as ocorrências rodoviárias reais.'
    :'Of course, sir. Opening the London exercise. I will check five public traffic cameras and current road reports.'};
}
function mount(){
  if(panel)return;
  const world=document.getElementById('travis-gev-official');
  const toolbar=world?.querySelector('.travis-gev-toolbar');
  if(!world||!toolbar)return;
  const button=document.createElement('button');button.id='travis-london-mission-toggle';
  button.type='button';button.textContent='LONDON MISSION';
  button.setAttribute('aria-label','Run London public camera exercise');
  button.onclick=()=>{if(active&&panel.hidden)panel.hidden=false;else if(active)close();else void start();};
  toolbar.appendChild(button);
  panel=document.createElement('section');panel.id='travis-london-mission';panel.hidden=true;
  panel.setAttribute('aria-label','London public camera exercise · fictional case');
  panel.innerHTML=[
    '<header class="travis-mission-header"><div><small>TRAVIS / GODS EYE / EXERCISE 001</small>',
    '<h2>LONDON <em>INTELLIGENCE</em></h2>',
    '<p>FICTIONAL VEHICLE · VERIFIED PUBLIC SOURCES · NO IDENTIFICATION</p></div>',
    '<button type="button" id="travis-mission-close" aria-label="Close London mission">CLOSE ×</button></header>',
    '<div class="travis-mission-controls"><span id="travis-mission-status" role="status">STANDBY</span>',
    '<label>MINUTES ELAPSED <input id="travis-mission-minutes" type="number" min="5" max="90" step="5" value="20"></label>',
    '<button type="button" id="travis-mission-refresh">REFRESH IMAGES</button>',
    '<button type="button" id="travis-mission-globe">SHOW GLOBE</button></div>',
    '<div class="travis-mission-scroll">',
    '<div class="travis-mission-grid" id="travis-mission-grid"></div>',
    '<div class="travis-mission-analysis">',
    '<section class="travis-mission-box" id="travis-mission-routes"></section>',
    '<section class="travis-mission-box" id="travis-mission-roads"></section></div>',
    '<section class="travis-mission-log"><h3>REAL OPERATIONS LOG</h3><ol id="travis-mission-log"></ol></section>',
    '<p class="travis-mission-credit">PUBLIC TfL JAM CAM SNAPSHOTS: PERIODIC STILLS, NOT LIVE VIDEO. ORIGINAL TfL BRANDING PRESERVED. TfL ROAD DATA: INCIDENTS, NOT CONTINUOUS SPEEDS. ROUTING: OSRM PUBLIC DEMO / OPENSTREETMAP, NOT LIVE-TRAFFIC ADJUSTED. NO PERSON OR VEHICLE TRACKING.</p></div>'
  ].join('');
  world.appendChild(panel);
  grid=panel.querySelector('#travis-mission-grid');
  logBox=panel.querySelector('#travis-mission-log');
  roadBox=panel.querySelector('#travis-mission-roads');
  routeBox=panel.querySelector('#travis-mission-routes');
  statusBox=panel.querySelector('#travis-mission-status');
  panel.querySelector('#travis-mission-close').onclick=close;
  panel.querySelector('#travis-mission-globe').onclick=()=>{panel.hidden=true;};
  panel.querySelector('#travis-mission-refresh').onclick=()=>{
    if(!active)return;refreshFrames();void checkRoad(epoch);
  };
  panel.querySelector('#travis-mission-minutes').onchange=e=>{
    horizon=Math.min(90,Math.max(5,Number(e.target.value)||20));
    e.target.value=String(horizon);
    renderRoutes();log('Fictional time horizon changed to '+horizon+' minutes');
  };
  window.addEventListener('travis:close',close);
  window.addEventListener('travis:gev',e=>{if(active&&!e.detail?.open)close();});
  window.addEventListener('pagehide',close);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)stopRefresh();else if(active)startRefresh();
  });
}
mount();
window.TravisLondonMission=Object.freeze({
  start,close,routeCommand,status:()=>({active,selected:selected.map(x=>x.camera.id),
    received,roadState:roadData?.state||null,routeCount:routes.filter(r=>r.verified).length})
});