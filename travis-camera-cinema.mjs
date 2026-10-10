/* Travis Camera Cinema — mobile/desktop, local device + authorized public media.
 * No hidden recording, no private CCTV discovery, no bypassing providers.
 * Reuses the EXISTING on-device vision stream and video element.
 * Public video embeds are YouTube's documented embed player, with fallback links.
 */
const HUD=document.getElementById('travis-hud');
const SOURCES=Object.freeze({
  rear:{name:'Device • Rear camera',kind:'device',facing:'environment'},
  front:{name:'Device • Front camera',kind:'device',facing:'user'},
  timesSquare:{name:'New York • Times Square (EarthCam)',kind:'youtube',
    videoId:'Lr-u3vIZ3KE',url:'https://www.youtube.com/watch?v=Lr-u3vIZ3KE',
    owner:'EarthCam / YouTube'},
  timesSquare2:{name:'New York • Times Square alternate (EarthCam)',kind:'youtube',
    videoId:'Q0uLV52xGZE',url:'https://www.youtube.com/watch?v=Q0uLV52xGZE',
    owner:'EarthCam / YouTube'},
  nycTraffic:{name:'New York • Public traffic cameras',kind:'external',
    url:'https://webcams.nyctmc.org/',owner:'NYC DOT TMC'},
  nasaISS:{name:'International Space Station • Views',kind:'external',
    url:'https://www.nasa.gov/live/',owner:'NASA'}
});
const el={};
let isOpen=false,mode='picker',activeSource=null,requestId=0;
let cameraPromise=null;
let originalParent=null,originalNextSibling=null;
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[’‘']/g,'').replace(/[.,!?;:]+/g,' ')
  .replace(/\s+/g,' ').trim();}
function state(){return {
  open:isOpen,mode,source:activeSource,
  deviceActive:Boolean(window.TravisCameraVision?.snapshot?.()?.active),
  publicPlaybackVerified:false,
  cameraPermissionGranted:Boolean(document.getElementById('travis-camera-preview')?.srcObject),
  sourceName:SOURCES[activeSource]?.name||null
};}
function announce(){window.dispatchEvent(new CustomEvent('travis:camera-cinema',{detail:state()}));}
function status(message,ok=false){
  if(!el.status)return;
  el.status.textContent=message;
  el.status.dataset.good=String(ok);
}
function resetRemote(){
  if(!el.frame)return;
  el.frame.removeAttribute('src');
  el.frame.hidden=true;
  el.provider.hidden=true;
  el.loading.hidden=true;
}
function restoreVisionDock(){
  const d=el.deviceDock;
  if(!d||!originalParent)return;
  if(originalNextSibling?.parentNode===originalParent){
    originalParent.insertBefore(d,originalNextSibling);
  }else{
    originalParent.appendChild(d);
  }
}
function stopVision(){
  try{window.TravisCameraVision?.stop?.();}catch(err){
    console.warn('Travis camera cleanup:',err);
  }
  const preview=document.getElementById('travis-camera-preview');
  // The existing vision controller is the owner of stream tracks.
  // Force-stop only if the controller is missing and a stream remains.
  if(!window.TravisCameraVision && preview?.srcObject){
    preview.srcObject.getTracks?.().forEach(t=>t.stop());
    preview.srcObject=null;
  }
}
function mount(){
  if(!HUD||document.getElementById('travis-camera-cinema'))return;
  const panel=document.createElement('section');
  panel.id='travis-camera-cinema';
  panel.className='travis-camera-cinema';
  panel.hidden=true;
  panel.dataset.mode='picker';
  panel.setAttribute('aria-label','Travis Camera Cinema');
  panel.innerHTML=[
    '<header class="cinema-camera-header">',
    '<div class="cinema-camera-brand"><small>TRAVIS / VISION LINK</small>',
    '<strong id="cinema-camera-title">CAMERA SELECTOR</strong></div>',
    '<span id="cinema-camera-indicator" class="cinema-camera-indicator">STANDBY</span>',
    '<button class="cinema-camera-x" id="cinema-camera-close" type="button" aria-label="Close camera">×</button>',
    '</header>',
    '<div class="cinema-camera-content">',
    '<div id="cinema-camera-device-slot" class="cinema-camera-device-slot" hidden></div>',
    '<iframe id="cinema-camera-public-frame" title="Selected public video provider" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" hidden></iframe>',
    '<div id="cinema-camera-placeholder" class="cinema-camera-placeholder">',
    '<div class="cinema-camera-icon" aria-hidden="true">◉</div><strong>CAMERA OFFLINE</strong>',
    '<span>Select a camera. Device cameras require your permission.</span>',
    '</div>',
    '<div id="cinema-camera-provider" class="cinema-camera-provider" hidden>',
    '<span id="cinema-camera-provider-note">Feed access is controlled by the provider.</span>',
    '<a id="cinema-camera-provider-link" target="_blank" rel="noopener noreferrer">OPEN OFFICIAL SOURCE ↗</a>',
    '</div>',
    '<div id="cinema-camera-loading" class="cinema-camera-loading" hidden>CONNECTING TO SOURCE…</div>',
    '</div>',
    '<footer class="cinema-camera-footer">',
    '<label for="cinema-camera-source">CAMERA</label>',
    '<select id="cinema-camera-source" aria-label="Select camera">',
    '<option value="">Choose a source…</option>',
    '<optgroup label="On-device (permission required)">',
    '<option value="rear">Rear camera</option>',
    '<option value="front">Front camera</option></optgroup>',
    '<optgroup label="Public video via provider">',
    '<option value="timesSquare">NYC · Times Square / EarthCam</option>',
    '<option value="timesSquare2">NYC · Times Square / Alternate</option>',
    '<option value="nycTraffic">NYC · Traffic cameras (official page)</option>',
    '<option value="nasaISS">NASA · Space station (official page)</option>',
    '</optgroup></select>',
    '<div class="cinema-camera-commands">',
    '<button type="button" id="cinema-camera-switch" hidden>SWITCH FRONT / REAR</button>',
    '<button type="button" id="cinema-camera-stop">STOP VIDEO</button>',
    '</div>',
    '<p id="cinema-camera-status" class="cinema-camera-status" role="status" aria-live="polite">',
    'Camera idle. No device camera is active.</p>',
    '</footer>'
  ].join('');
  HUD.appendChild(panel);
  el.panel=panel;
  for(const [key,id] of Object.entries({
    frame:'cinema-camera-public-frame',
    device:'cinema-camera-device-slot',
    placeholder:'cinema-camera-placeholder',provider:'cinema-camera-provider',
    providerLink:'cinema-camera-provider-link',providerNote:'cinema-camera-provider-note',
    loading:'cinema-camera-loading',switchButton:'cinema-camera-switch',
    select:'cinema-camera-source',status:'cinema-camera-status',
    indicator:'cinema-camera-indicator',title:'cinema-camera-title'
  })){el[key]=panel.querySelector('#'+id);}
  el.deviceDock=document.getElementById('travis-camera-dock');
  originalParent=el.deviceDock?.parentNode||null;
  originalNextSibling=el.deviceDock?.nextSibling||null;
  panel.querySelector('#cinema-camera-close').addEventListener('click',close);
  panel.querySelector('#cinema-camera-stop').addEventListener('click',stopCurrent);
  el.select.addEventListener('change',()=>{
    const source=el.select.value;
    if(source)void select(source);
    else stopCurrent();
  });
  el.switchButton.addEventListener('click',()=>void switchDevice());
  el.frame.addEventListener('load',()=>{
    if(mode==='public'){
      el.loading.hidden=true;
      status('Provider player loaded. Stream/live status is not independently verified.');
    }
  });
  el.frame.addEventListener('error',()=>{
    if(mode==='public'){
      el.loading.hidden=true;
      status('Player unavailable. Use the official provider link.');
    }
  });
  window.addEventListener('travis:close',close);
  window.addEventListener('pagehide',close);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&mode==='device'){
      stopVision();status('Device camera paused because the tab is hidden.');
      if(el.indicator)el.indicator.textContent='PAUSED';
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&isOpen){
      e.stopImmediatePropagation();
      close();
    }
  },true);
}
function openPicker(){
  mount();
  if(!el.panel)return false;
  if(HUD?.getAttribute('aria-hidden')==='true')window.TravisVisual?.open?.();
  isOpen=true;
  el.panel.hidden=false;
  if(mode==='picker')status('Choose a camera. No camera is recording or streaming yet.');
  announce();
  return true;
}
function setMode(next,source){
  mode=next;
  activeSource=source||null;
  el.panel.dataset.mode=next;
  el.device.hidden=next!=='device';
  el.frame.hidden=next!=='public';
  el.placeholder.hidden=next!=='picker'&&next!=='external'&&next!=='error';
  el.loading.hidden=next!=='public'&&next!=='device';
  el.provider.hidden=next!=='public'&&next!=='external';
  el.switchButton.hidden=next!=='device';
  el.indicator.textContent=next==='device'?'LOCAL CAMERA':next==='public'?'PROVIDER VIDEO':next==='external'?'PROVIDER LINK':'STANDBY';
  el.title.textContent=source?SOURCES[source]?.name||'CAMERA':'CAMERA SELECTOR';
  if(source)el.select.value=source;
  announce();
}
async function openDevice(key='rear'){
  const face=key==='front'?'user':'environment',id=++requestId;
  openPicker();
  resetRemote();
  setMode('device',face==='user'?'front':'rear');
  el.loading.hidden=false;
  status('Requesting camera access. Approve the browser permission if prompted.');
  if(el.deviceDock)el.device.appendChild(el.deviceDock);
  const controller=window.TravisCameraVision;
  if(!controller?.start){
    setMode('error');status('Travis camera subsystem not ready. Reload Travis.');
    return {ok:false,error:'Camera system unavailable'};
  }
  try{
    // No second getUserMedia: uses the camera already owned by Travis Vision.
    const promise=controller.start(face);
    cameraPromise=promise;
    const ok=await promise;
    if(id!==requestId||!isOpen){
      controller.stop?.();
      return {ok:false,cancelled:true};
    }
    if(!ok||!controller.snapshot?.()?.active){
      throw new Error('Camera preview did not become active');
    }
    const video=document.getElementById('travis-camera-preview');
    if(!video?.srcObject?.getVideoTracks?.().some(t=>t.readyState==='live')){
      throw new Error('The selected camera did not supply a live video track');
    }
    el.loading.hidden=true;
    el.indicator.textContent='DEVICE · LIVE';
    status((face==='user'?'Front':'Rear')+' camera active on this device. Video stays local.',true);
    announce();
    return {ok:true,source:face};
  }catch(err){
    if(id!==requestId)return {ok:false,cancelled:true};
    const reason=err?.name==='NotAllowedError'?'Camera permission denied. Enable access in the browser.'
      :err?.name==='NotFoundError'?'Requested camera is not available.'
      :String(err?.message||err);
    stopVision();
    setMode('error');
    el.loading.hidden=true;
    status(reason);
    return {ok:false,error:reason};
  }finally{
    if(cameraPromise&&id===requestId)cameraPromise=null;
  }
}
async function switchDevice(){
  if(mode!=='device')return {ok:false};
  const next=activeSource==='front'?'rear':'front';
  return openDevice(next);
}
function openPublic(key){
  const source=SOURCES[key];
  if(!source||!['youtube','external'].includes(source.kind))return {ok:false,error:'Unknown provider'};
  const id=++requestId;
  openPicker();
  stopVision();
  restoreVisionDock();
  resetRemote();
  if(source.kind==='external'){
    setMode('external',key);
    el.providerLink.href=source.url;
    el.providerLink.textContent='OPEN '+source.owner.toUpperCase()+' ↗';
    el.providerNote.textContent='This official service does not grant an in-panel stream here.';
    el.provider.hidden=false;
    status('The provider must be opened separately. No private feeds or credentials are used.');
    announce();
    return {ok:true,embedded:false,source:key};
  }
  setMode('public',key);
  el.providerLink.href=source.url;
  el.providerLink.textContent='OPEN '+source.owner.toUpperCase()+' ↗';
  el.providerNote.textContent='Embedded through YouTube. Live status and availability are controlled by the source.';
  el.provider.hidden=false;
  el.loading.hidden=false;
  status('Loading authorized embedded video. Playback may require a tap.');
  // Whitelist only known verified YouTube video IDs, no arbitrary destinations.
  const idSafe=/^[A-Za-z0-9_-]{11}$/.test(source.videoId)?source.videoId:null;
  if(!idSafe){
    setMode('error');status('Invalid public video ID.');
    return {ok:false,error:'Invalid public video'};
  }
  el.frame.src='https://www.youtube-nocookie.com/embed/'+idSafe+'?autoplay=1&mute=1&playsinline=1&rel=0';
  announce();
  return {ok:true,embedded:true,verifiedLive:false,source:key};
}
function stopCurrent(){
  ++requestId;
  stopVision();
  restoreVisionDock();
  resetRemote();
  if(el.panel){
    setMode('picker');
    el.select.value='';
    status('Video stopped. Local camera tracks released.');
  }
  announce();
}
function close(){
  if(!isOpen)return;
  stopCurrent();
  isOpen=false;
  el.panel.hidden=true;
  announce();
}
function select(key){
  const source=SOURCES[key];
  if(!source)return Promise.resolve({ok:false,error:'Unknown camera source'});
  return Promise.resolve(source.kind==='device'?openDevice(key):openPublic(key));
}
function result(handled,language,reply){return {handled,language,reply};}
async function routeCommand(raw){
  const t=normalize(raw);
  if(!t)return {handled:false};
  const pt=/\b(liga|ligar|ativa|abre|abrir|mostra|muda|troca|fecha|fechar|desliga|desligar|camera|camara|camaras|frontal|traseira|mostra-me|selecione)\b/.test(t);
  const language=pt?'pt':'en';
  // Only explicit camera instructions, not requests for images of cameras.
  const camera=/\b(camera|cameras|camara|camaras|webcam|webcams|cctv|camera dock|video feed|camera feed)\b/.test(t);
  const provider=/\b(times square|earthcam|nyc traffic|nasa live|nasa camera|space station camera|camara da estacao espacial)\b/.test(t);
  const device=/\b(rear|back|front|selfie|frontal|traseira|de tras|do telemovel|do telefone|device camera|phone camera)\b/.test(t);
  const stop=/\b(stop|close|hide|turn off|disable|desliga|fecha|fechar|desligar|parar|para)\b/.test(t);
  if(stop&&(camera||isOpen&&/\b(video|feed|camera|camara|janela)\b/.test(t))){
    close();
    return result(true,language,pt?'Painel da câmara fechado. Vídeo desligado.':'Camera panel closed. Video stopped.');
  }
  if(/\b(switch camera|switch lens|flip camera|troca camera|muda camera|trocar camera)\b/.test(t)){
    if(!isOpen||mode!=='device'){
      openPicker();
      return result(true,language,pt?
        'Seleção de câmaras aberta. Escolhe a frontal ou a traseira.':
        'Camera selector open. Choose rear or front.');
    }
    const switched=await switchDevice();
    return result(true,language,switched.ok?
      (pt?'Câmara trocada.':'Camera switched.'):
      (pt?'Não foi possível trocar de câmara.':'Unable to switch camera.'));
  }
  if(camera&&device&&/\b(switch|change|select|choose|troca|muda|seleciona|escolhe)\b/.test(t)){
    const selected=/\b(front|selfie|frontal|da frente)\b/.test(t)?'front':'rear';
    const switched=await openDevice(selected);
    return result(true,language,switched.ok?
      (pt?'Câmara selecionada. Vídeo local ativo.':'Selected camera is on. Local video active.'):
      (pt?'A câmara selecionada não ficou disponível.':'Selected camera unavailable.'));
  }
  if(provider&&(camera||isOpen||t.includes('earthcam')||/\b(live|stream|feed|em direto|ao vivo)\b/.test(t))&&/\b(show|open|view|activate|watch|select|choose|mostra|abre|ver|liga|ativar|ativa|seleciona|escolhe)\b/.test(t)){
    const source=t.includes('earthcam')||t.includes('times square')?'timesSquare'
      :t.includes('nasa')||t.includes('space station')||t.includes('estacao espacial')?'nasaISS':'nycTraffic';
    openPublic(source);
    return result(true,language,pt?
      'Fonte pública selecionada. O vídeo depende do fornecedor.':
      'Public camera source selected. Playback depends on the provider.');
  }
  if((camera||device)&&/\b(open|turn on|start|activate|show|enable|switch on|liga|ligar|ativa|ativar|abre|abrir|mostra)\b/.test(t)
    && !/\b(photograph|photographic|hologram|modelo|model|fotografia|imagem de uma camera|image of a camera)\b/.test(t)){
    // "show cameras" opens the selection panel; "rear/front" actually
    // requests the selected physical camera and permission.
    if(device){
      const key=/\b(front|selfie|frontal|da frente)\b/.test(t)?'front':'rear';
      const x=await openDevice(key);
      return result(true,language,x.ok?
        (pt?'Câmara do telemóvel ligada no painel holográfico.':'Device camera active in the holographic panel.'):
        (pt?'Não foi possível ligar a câmara. Confirma a permissão no navegador.':'Camera unavailable. Check the browser permission.'));
    }
    openPicker();
    return result(true,language,
      pt?'Seleção de câmaras aberta. Escolhe a traseira, a frontal ou uma fonte pública.':
      'Camera selector ready. Choose rear, front or a public source.');
  }
  return {handled:false};
}
mount();
window.TravisCameraCinema=Object.freeze({
  openPicker,openDevice,openPublic,select,stop:stopCurrent,close,
  routeCommand,status:state,sources:Object.keys(SOURCES)
});
