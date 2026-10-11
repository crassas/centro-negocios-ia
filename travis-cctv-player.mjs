/**
 * GOD'S EYE / Global Public Camera Viewer.
 * Independent of upstream-updated Camera Cinema and of the heavy Cesium UI.
 * Reuses only vetted camera IDs supplied by the original CCTV catalog.
 * Genuine upstream snapshots or source-provided HLS; no simulated video.
 */
const HUD=document.getElementById('travis-hud');
const regionCoords=Object.freeze({
  earth:[30.2672,-97.7431],newyork:[40.758,-73.9855],
  porto:[41.1496,-8.6109],lisboa:[38.7223,-9.1393],
  london:[51.5072,-.1276],paris:[48.8566,2.3522],
  tokyo:[35.6762,139.6503]
});
const regions=Object.freeze({
  all:null,austin:'austin',california:'caltrans',
  london:'tfl',texas:'txdot',finland:'fintraffic',norway:'vegvesen',
  delaware:'deldot',canada:'ontario',britishcolumbia:'drivebc',
  estonia:'tallinn',australia:'nsw'
});
const nodes={};
let open=false,selected=null,mode='picker',seq=0,refreshTimer=null;
let hls=null,lease=null,activeVideoId=null,blobUrl=null,playing=false;
let lastFetchEpoch=0,searchTimer=null,hlsLoader=null;
function cleanText(t){return String(t??'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[’‘']/g,'').replace(/[.,!?;:]+/g,' ').replace(/\s+/g,' ').trim();}
function snap(){
 const source=window.TravisCctv?.get?.(selected);
 return {open,mode,sourceId:selected,sourceName:source?.name||'',city:source?.city||'',playingVerified:playing,
   catalogue:window.TravisCctv?.status?.()||null};
}
function report(){window.dispatchEvent(new CustomEvent('travis:cctv-player',{detail:snap()}));}
function message(t,good=false){
 if(nodes.status){nodes.status.textContent=t;nodes.status.dataset.good=String(good);}
}
function clearVideo(){
 clearTimeout(refreshTimer);refreshTimer=null;
 playing=false;
 if(hls){try{hls.destroy();}catch{}hls=null;}
 const id=activeVideoId,oldLease=lease;
 activeVideoId=lease=null;
 if(id&&oldLease){
   const url=window.TravisCctv?.mediaUrl?.(id,oldLease);
   if(url)void fetch(url,{method:'DELETE',credentials:'omit',keepalive:true}).catch(()=>{});
 }
 if(nodes.video){
   try{nodes.video.pause();}catch{}
   nodes.video.removeAttribute('src');
   nodes.video.load?.();
   nodes.video.hidden=true;
 }
 if(nodes.image){nodes.image.hidden=true;nodes.image.removeAttribute('src');}
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}
}
function changeMode(next,camera=null){
 mode=next;
 selected=camera?.id||null;
 if(nodes.wrap)nodes.wrap.dataset.mode=next;
 if(nodes.headline)nodes.headline.textContent=camera?.name||'PUBLIC CAMERAS';
 if(nodes.origin)nodes.origin.textContent=camera
   ?camera.provider+' · '+camera.city+' · '+(camera.feedType==='hls'?'Video candidate':'Image source')
   :'Registered public sources only';
 if(nodes.video)nodes.video.hidden=next!=='video';
 if(nodes.image)nodes.image.hidden=next!=='image';
 if(nodes.empty)nodes.empty.hidden=next==='image'||next==='video';
 if(nodes.indicator)nodes.indicator.textContent=next==='video'?'CHECKING VIDEO'
   :next==='image'?'PUBLIC SNAPSHOT':next==='error'?'SOURCE OFFLINE':'CAMERA RADAR';
 report();
}
function mount(){
 if(!HUD||document.getElementById('travis-cctv-viewer'))return;
 const section=document.createElement('section');
 section.id='travis-cctv-viewer';
 section.className='travis-cctv-viewer';
 section.hidden=true;
 section.innerHTML=[
  '<header class="cctv-head">',
  '<div><small>TRAVIS / GOD’S EYE / CCTV</small><strong id="cctv-title">PUBLIC CAMERAS</strong></div>',
  '<span id="cctv-indicator">CAMERA RADAR</span>',
  '<button id="cctv-close" type="button" aria-label="Close CCTV viewer">×</button>',
  '</header>',
  '<div class="cctv-media">',
  '<img id="cctv-image" alt="Original public camera image" hidden>',
  '<video id="cctv-video" aria-label="Original public camera stream" playsinline muted autoplay controls hidden></video>',
  '<div id="cctv-empty"><strong>SELECT A PUBLIC CAMERA</strong><span>Locations on the globe do not guarantee an active feed.</span></div>',
  '</div>',
  '<div class="cctv-control">',
  '<label for="cctv-region">REGION</label>',
  '<select id="cctv-region" aria-label="Choose public camera region">',
  '<option value="nearest">NEAREST TO MAP VIEW</option>',
  '<option value="all">ALL PROVIDERS</option>',
  '<option value="austin">AUSTIN</option>',
  '<option value="california">CALIFORNIA</option>',
  '<option value="texas">TEXAS</option>',
  '<option value="delaware">DELAWARE</option>',
  '<option value="london">LONDON</option>',
  '<option value="finland">FINLAND</option>',
  '<option value="norway">NORWAY</option>',
  '<option value="canada">ONTARIO</option>',
  '<option value="britishcolumbia">BRITISH COLUMBIA</option>',
  '<option value="estonia">ESTONIA</option>',
  '<option value="australia">AUSTRALIA</option>',
  '</select>',
  '<input id="cctv-search" type="search" placeholder="Search by name or city…" autocomplete="off" aria-label="Search public camera">',
  '<select id="cctv-list" aria-label="Select a registered public CCTV camera">',
  '<option value="">Choose a registered camera…</option></select>',
  '<div class="cctv-commands">',
  '<button id="cctv-refresh" type="button">REFRESH IMAGE</button>',
  '<button id="cctv-map" type="button">BACK TO GLOBE</button>',
  '</div>',
  '<div id="cctv-origin">Registered public sources only</div>',
  '<p id="cctv-status" role="status" aria-live="polite">Camera catalogue is idle.</p>',
  '</div>'
 ].join('');
 HUD.appendChild(section);
 // querySelector searches descendants, so the section cannot find itself.
 nodes.wrap=section;
 const ids={headline:'cctv-title',
  indicator:'cctv-indicator',image:'cctv-image',video:'cctv-video',
  empty:'cctv-empty',region:'cctv-region',list:'cctv-list',search:'cctv-search',
  origin:'cctv-origin',status:'cctv-status',refresh:'cctv-refresh'};
 for(const [k,id] of Object.entries(ids))nodes[k]=section.querySelector('#'+id);
 section.querySelector('#cctv-close').addEventListener('click',close);
 section.querySelector('#cctv-map').addEventListener('click',close);
 nodes.region.addEventListener('change',listChoices);
 nodes.search.addEventListener('input',()=>{
   clearTimeout(searchTimer);
   searchTimer=setTimeout(listChoices,160);
 });
 nodes.list.addEventListener('change',()=>{
   const id=nodes.list.value;
   if(id)void openCamera(id);
 });
 nodes.refresh.addEventListener('click',()=>{
   if(selected)void showImage(selected,{manual:true});
 });
 nodes.video.addEventListener('playing',()=>{
   if(mode==='video'){
     playing=true;
     nodes.indicator.textContent='VIDEO PLAYING';
     message('Public video is playing. Stream is provided by the registered operator.',true);
     report();
   }
 });
 nodes.video.addEventListener('error',()=>{
   if(mode==='video'&&!playing&&selected)
     void showImage(selected,{reason:'HLS could not play; checking a genuine snapshot.'});
 });
 window.addEventListener('travis:cctv-catalog',listChoices);
 window.addEventListener('travis:world',listChoices);
 window.addEventListener('travis:cctv-select',e=>{
   if(e.detail?.id)void openCamera(String(e.detail.id));
 });
 window.addEventListener('travis:close',close);
 window.addEventListener('pagehide',close);
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden&&open){
     if(mode==='video')nodes.video.pause();
     clearTimeout(refreshTimer);refreshTimer=null;
   }
 });
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&open){e.stopImmediatePropagation();close();}
 },true);
}
function listChoices(){
 if(!nodes.list||!window.TravisCctv)return;
 const net=window.TravisCctv;
 const all=net.locations();
 const region=nodes.region.value||'nearest';
 const query=cleanText(nodes.search.value||'');
 let candidates=[];
 if(query.length>=2){
   candidates=all.filter(c=>cleanText([c.name,c.city,c.provider,c.pack].join(' ')).includes(query)).slice(0,50);
 }else if(region==='nearest'){
   const place=window.TravisWorld?.status?.()?.place||'earth';
   const [lat,lon]=regionCoords[place]||regionCoords.earth;
   candidates=net.nearest(lat,lon,{limit:35,radiusKm:20000}).map(row=>row.camera);
 }else if(region==='all'){
   candidates=all.slice(0,50);
 }else{
   candidates=all.filter(c=>c.pack===regions[region]).slice(0,50);
 }
 const old=nodes.list.value;
 nodes.list.replaceChildren();
 const placeholder=document.createElement('option');
 placeholder.value='';
 placeholder.textContent=all.length
   ?('Select from '+all.length.toLocaleString('en-US')+' public cameras…')
   :'Waiting for public camera list…';
 nodes.list.appendChild(placeholder);
 for(const c of candidates){
   const option=document.createElement('option');
   option.value=c.id;
   option.textContent=(c.feedType==='hls'?'▶ ':'◉ ')+c.name.slice(0,62)
     +' · '+(c.city||c.pack).slice(0,26);
   nodes.list.appendChild(option);
 }
 if(candidates.some(c=>c.id===old))nodes.list.value=old;
 if(mode==='picker'){
   const n=net.status();
   message(n.state==='ready'?
     n.count.toLocaleString('en-US')+' camera locations loaded. Select a source or tap a globe marker.'
    :n.state==='error'?'Camera catalogue offline: '+n.error:'Connecting to the public CCTV catalogue…');
 }
}
async function openPicker({region=null,search=null}={}){
 mount();
 if(!nodes.wrap)return false;
 if(HUD?.getAttribute('aria-hidden')==='true')window.TravisVisual?.open?.();
 if(!open)window.TravisCameraCinema?.close?.();
 open=true;nodes.wrap.hidden=false;
 if(region&&region in regions)nodes.region.value=region;
 if(search!==null)nodes.search.value=String(search).slice(0,150);
 if(mode!=='image'&&mode!=='video')changeMode('picker');
 listChoices();
 void window.TravisCctv?.load?.().then(()=>{if(open)listChoices();}).catch(()=>{});
 report();
 return true;
}
function close(){
 if(!open)return;
 seq++;
 clearTimeout(searchTimer);
 clearVideo();
 open=false;
 nodes.wrap.hidden=true;
 changeMode('picker');
 report();
}
function hlsLibrary(){
 if(window.Hls?.isSupported?.())return Promise.resolve(window.Hls);
 if(hlsLoader)return hlsLoader;
 hlsLoader=new Promise((resolve,reject)=>{
   const tag=document.createElement('script');
   tag.src='./vendor/cctv/hls.min.js?v=1.7.3';tag.async=true;
   tag.onload=()=>window.Hls?.isSupported?.()?resolve(window.Hls)
      :reject(new Error('HLS not supported on this browser'));
   tag.onerror=()=>reject(new Error('Local HLS decoder unavailable'));
   document.head.appendChild(tag);
 }).catch(e=>{hlsLoader=null;throw e;});
 return hlsLoader;
}
async function showImage(cameraId,{reason='',manual=false,timeoutMs=20000}={}){
 const net=window.TravisCctv,camera=net?.get?.(cameraId);
 if(!camera||!open)return {ok:false,error:'Camera not registered'};
 seq++;
 const mine=seq;
 clearVideo();lastFetchEpoch=0;
 changeMode('image',camera);
 nodes.image.hidden=true;
 message(reason||'Requesting registered public camera image…');
 const url=net.frameUrl(cameraId);
 if(!url)return {ok:false};
 try{
   const res=await fetch(url,{credentials:'omit',cache:'no-store',
     signal:AbortSignal.timeout(Math.max(3000,Math.min(20000,timeoutMs)))});
   if(seq!==mine||!open)return {ok:false,cancelled:true};
   const realSource=res.headers.get('X-CCTV-Source');
   const type=res.headers.get('Content-Type')||'';
   if(!res.ok||realSource!=='upstream-image'||!/^image\/(?:jpeg|png|webp)/i.test(type))
     throw new Error('No genuine upstream camera image available');
   const data=await res.blob();
   if(seq!==mine||!open)return {ok:false,cancelled:true};
   if(data.size>5*1024*1024)throw new Error('Image exceeds memory limit');
   blobUrl=URL.createObjectURL(data);
   nodes.image.src=blobUrl;
   await nodes.image.decode();
   if(seq!==mine||!open)return {ok:false,cancelled:true};
   if(!nodes.image.naturalWidth)throw new Error('Camera image could not be decoded');
   nodes.image.hidden=false;
   lastFetchEpoch=Date.now();
   nodes.indicator.textContent='PUBLIC SNAPSHOT';
   message('Actual '+camera.provider+' camera image retrieved at '
     +new Date(lastFetchEpoch).toLocaleTimeString()+'. Not continuous video.',true);
   report();
   refreshTimer=setTimeout(()=>{
     if(open&&selected===cameraId&&!document.hidden)void showImage(cameraId);
   },60000);
   return {ok:true,type:'snapshot'};
 }catch(err){
   if(seq!==mine)return {ok:false,cancelled:true};
   nodes.image.hidden=true;
   changeMode('error',camera);
   message('Source unavailable: '+String(err?.message||err));
   return {ok:false,error:String(err?.message||err)};
 }
}
async function showVideo(cameraId){
 const camera=window.TravisCctv?.get?.(cameraId);
 if(!camera)return {ok:false};
 seq++;
 const mine=seq;
 clearVideo();changeMode('video',camera);
 message('Checking the operator’s HLS stream; not confirmed live.');
 try{
   const net=window.TravisCctv;
   const infoRes=await fetch(net.streamInfoUrl(cameraId),{
     credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!infoRes.ok)throw new Error('Stream description unavailable');
   const meta=await infoRes.json();
   if(mine!==seq||!open)return {ok:false,cancelled:true};
   if(meta.feedType!=='hls')throw new Error('This camera has no HLS video');
   lease=crypto.randomUUID();activeVideoId=cameraId;
   const media=net.mediaUrl(cameraId,lease);
   if(!media)throw new Error('Stream not registered');
   const player=nodes.video;
   player.muted=true;player.playsInline=true;
   if(player.canPlayType('application/vnd.apple.mpegurl')){
     player.src=media;player.load();
   }else{
     const Hls=await hlsLibrary();
     if(mine!==seq||!open)return {ok:false,cancelled:true};
     // TRAVIS_HLS_PUBLIC_VIDEO_V1 · give slow Android HLS playlists time to start.
     hls=new Hls({
       enableWorker:false,maxBufferLength:9,maxMaxBufferLength:18,
       maxBufferSize:10*1024*1024,
       liveSyncDurationCount:2,liveMaxLatencyDurationCount:6,
       manifestLoadingTimeOut:19000,fragLoadingTimeOut:21000
     });
     let hlsRetried=false;
     hls.on(Hls.Events.ERROR,(_event,e)=>{
       if(!e?.fatal||mine!==seq||mode!=='video'||playing)return;
       if(!hlsRetried&&e.type===Hls.ErrorTypes.NETWORK_ERROR){
         hlsRetried=true;
         message('Public HLS stream slow; one reconnect attempt. Not yet verified.');
         try{hls?.startLoad(-1);}catch{}
         return;
       }
       void showImage(cameraId,{reason:'Video could not be verified; checking a genuine still image.'});
     });
     hls.attachMedia(player);
     hls.on(Hls.Events.MEDIA_ATTACHED,()=>hls?.loadSource(media));
     hls.on(Hls.Events.MANIFEST_PARSED,()=>{
       if(open&&mine===seq)void player.play().catch(()=>{});
     });
   }
   void player.play().catch(()=>{});
   refreshTimer=setTimeout(()=>{
     if(open&&mine===seq&&mode==='video'&&!playing)
       void showImage(cameraId,{reason:'Public HLS did not start; checking a genuine still image.'});
   },33000);
   return {ok:true,type:'hls-requested',liveVerified:false};
 }catch(e){
   if(mine!==seq)return {ok:false,cancelled:true};
   return showImage(cameraId,{reason:'Video unavailable; requesting a real snapshot.'});
 }
}
async function openCamera(id,options={}){
 await openPicker();
 const mine=++seq;
 message('Finding the selected registered camera…');
 const net=window.TravisCctv;
 if(!net){message('CCTV catalog module unavailable');return {ok:false};}
 await net.load();
 if(mine!==seq||!open)return {ok:false,cancelled:true};
 const camera=net.get(id);
 if(!camera){
   message('The selected camera is not in the public catalog.');
   return {ok:false,error:'Unknown camera'};
 }
 nodes.list.value=id;
 return camera.feedType==='hls'?showVideo(id):showImage(id,{timeoutMs:options.timeoutMs});
}
function routeCommand(raw){
 const t=cleanText(raw),worldOpen=Boolean(window.TravisWorld?.status?.()?.open);
 if(!t)return {handled:false};
 const physical=/\b(rear|front|back camera|selfie|traseira|frontal|camera do telemovel|phone camera)\b/.test(t);
 if(physical)return {handled:false}; // Preserve existing on-device camera controls.
 const cameras=/\b(camera|cameras|camara|camaras|cctv|webcam|webcams|video feed)\b/.test(t);
 const explicitPublic=/\b(public|publicas|publica|street|streetview|traffic|trafego|mundo|worldwide|godseye|gods eye)\b/.test(t);
 const action=/\b(show|open|see|watch|activate|select|mostra|abre|ver|liga|ativa|seleciona)\b/.test(t);
 const stopping=/\b(close|hide|stop|fecha|desliga|oculta)\b/.test(t);
 const lang=/\b(mostra|abre|ver|liga|ativa|seleciona|fecha|camaras|camara|publicas)\b/.test(t)?'pt':'en';
 if(open&&stopping&&cameras){
   close();return {handled:true,language:lang,
     reply:lang==='pt'?'Câmara pública fechada.':'Public camera closed.'};
 }
 if(cameras&&action&&(worldOpen||explicitPublic||/\b(london|londres|austin|california|finland|finlandia|norway|noruega|delaware|texas)\b/.test(t))){
   let region=null;
   for(const [name] of Object.entries(regions))
     if(name!=='all'&&t.includes(name))region=name;
   if(t.includes('londres'))region='london';
   if(t.includes('finlandia'))region='finland';
   if(t.includes('noruega'))region='norway';
   void openPicker({region});
   return {handled:true,language:lang,reply:lang==='pt'
     ?'Radar de câmaras públicas aberto. Escolhe uma no globo ou na lista.'
     :'Public camera radar activated. Select a location on the globe or from the list.'};
 }
 return {handled:false};
}
mount();
window.TravisCctvPlayer=Object.freeze({
 openPicker,openCamera,close,routeCommand,status:()=>({...snap(),updatedFrame:lastFetchEpoch})
});
