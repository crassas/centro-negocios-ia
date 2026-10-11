/* TRAVIS | Cinema voice-first control; no simulated public video. */
const world=document.getElementById('travis-gev-official');
const toolbar=world?.querySelector('.travis-gev-toolbar');
let dock=null,controls=null,notice=null,timer=0;
const fold=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[’']/g,'').replace(/[,!?;:.]+/g,' ').replace(/\s+/g,' ').trim()
 .replace(/^(?:hey |hello |please )?(?:travis|jarvis) /,'');
function setTools(open){
 if(!dock)return;
 dock.dataset.open=open?'true':'false';
 controls?.setAttribute('aria-expanded',String(open));
 if(toolbar)toolbar.hidden=!open;
}
function toast(message,kind='info'){
 if(!notice)return;
 notice.hidden=false;notice.textContent=String(message||'').slice(0,240);notice.dataset.kind=kind;
 clearTimeout(timer);timer=setTimeout(()=>{notice.hidden=true;},13000);
}
function hideOverlays(){
 window.TravisCctvAutopilot?.cancel?.();
 window.TravisLondonMission?.hide?.();
 const mission=document.getElementById('travis-london-mission');if(mission)mission.hidden=true;
 window.TravisCctvPlayer?.close?.();
 if(window.TravisRoadLive?.status?.()?.open)window.TravisRoadLive.hidePanel?.();
 const roads=document.getElementById('travis-road-live');if(roads)roads.hidden=true;
 const camera=document.getElementById('travis-camera-cinema');if(camera)camera.hidden=true;
 setTools(false);
}
function focusGlobe({camera=null}={}){
 const gev=window.TravisGevBridge;
 if(!gev?.status?.()?.open)gev?.open?.('earth');
 hideOverlays();
 if(camera&&Number.isFinite(Number(camera.lat))&&Number.isFinite(Number(camera.lon))){
   gev?.navigate?.(null,{lat:Number(camera.lat),lon:Number(camera.lon),
     alt:2700,label:String(camera.label||camera.name||'Public camera').slice(0,95)});
   toast('GLOBE / '+(camera.label||camera.name||'PUBLIC CAMERA'));
 }else toast('GLOBE FOCUS / PANELS CLEARED');
 return true;
}
function routeCommand(raw){
 const s=fold(raw),open=window.TravisGevBridge?.status?.()?.open;
 const flightCase=/(?:france|franca|paris)/.test(s)
   &&/\b(?:fictitious|fictional|ficticio|ficticia|simulate|simulation|simulacao|scenario|cenario|exercise|exercicio|imagine|imagina)\b/.test(s)
   &&/\b(?:airport|aeroporto|aircraft|flight|flights|voo|aviao|plane)\b/.test(s);
 if(flightCase){
   const g=window.TravisGevBridge;
   g?.open?.('paris');g?.navigate?.('paris');g?.toggleLayer?.('flights',true);
   g?.setExternalAnnotations?.([
     {type:'pin',latitude:49.0097,longitude:2.5479,label:'Paris CDG / LFPG · airport',color:'amber'},
     {type:'pin',latitude:48.7262,longitude:2.3652,label:'Paris Orly / LFPO · airport',color:'amber'},
     {type:'pin',latitude:49.4544,longitude:2.1128,label:'Paris Beauvais / LFOB · airport',color:'amber'}]);
   hideOverlays();toast('AIR EXERCISE / REAL PUBLIC FLIGHT LAYER');
   window.TravisExperience?.record?.({type:'flight-view',name:'Paris public airspace',
     city:'Paris',provider:'Gods Eye',kind:'unknown',
     info:'Opened flight layer and airport reference points; no specific passenger detected'});
   return {handled:true,language:'en',reply:'Of course, sir. Paris airspace is in view. I can show public aircraft and airports. A fictional passenger cannot be linked to a real aircraft, and destinations need verified flight information.'};
 }
 const go=/^(?:focus (?:on )?(?:the )?(?:globe|world|map)|show me the world|take me there|back to (?:the )?(?:globe|world)|return to (?:the )?(?:globe|world)|clear (?:the )?(?:screen|view|cards|panels)|hide (?:the )?(?:cards|panels)|volta ao globo|foca (?:no |o )?globo|fecha os paineis)$/;
 if(!open||!go.test(s))return {handled:false};
 focusGlobe();
 return {handled:true,language:'en',reply:'Of course, sir. Globe in focus. The panels are out of your way.'};
}
function cameraMore(){
 const viewer=document.getElementById('travis-cctv-viewer');
 const head=viewer?.querySelector('.cctv-head');
 if(!head||head.querySelector('#travis-cinema-camera-more'))return;
 viewer.dataset.cinemaExpanded='false';
 const b=document.createElement('button');b.id='travis-cinema-camera-more';b.type='button';
 b.textContent='⋯';b.setAttribute('aria-label','Camera controls');
 b.onclick=()=>{viewer.dataset.cinemaExpanded=String(viewer.dataset.cinemaExpanded!=='true');};
 head.appendChild(b);
}
function mount(){
 if(!world||!toolbar||document.getElementById('travis-cinema-dock'))return;
 dock=document.createElement('div');dock.id='travis-cinema-dock';
 controls=document.createElement('button');controls.id='travis-cinema-tools';
 controls.type='button';controls.textContent='TOOLS';controls.setAttribute('aria-expanded','false');
 controls.onclick=()=>setTools(dock.dataset.open!=='true');
 world.insertBefore(dock,toolbar);dock.append(controls,toolbar);setTools(false);
 notice=document.createElement('div');notice.id='travis-cinema-notice';notice.hidden=true;
 notice.setAttribute('role','status');world.appendChild(notice);
 toolbar.querySelector('[data-gev-layer="earthquakes"]')?.setAttribute('hidden','');
 const sim=world.querySelector('#travis-gev-grid [data-gev-layer="traffic"]');
 if(sim)sim.textContent='TRAFFIC · SIMULATION';
 cameraMore();
 window.addEventListener('travis:gev',e=>{if(!e.detail?.open)setTools(false);cameraMore();});
 window.addEventListener('travis:cctv-auto-request',()=>{toast('CHECKING PUBLIC CAMERAS');setTools(false);});
 window.addEventListener('travis:cctv-probe',event=>{
   const p=event.detail||{};
   const location=String(p.name||p.city||p.pack||'public camera').slice(0,80);
   const batch=String(p.number||'?')+'/'+String(p.total||'?');
   if(p.stage==='checking')toast('SOURCE '+batch+' · '+location+' · verifying real image');
   else if(p.stage==='unavailable')toast('SOURCE '+batch+' unavailable · checking alternatives','warning');
   else if(p.stage==='verified')toast('SOURCE '+batch+' verified · '+location,'ok');
 });
 window.addEventListener('travis:cctv-auto-result',e=>{
   const r=e.detail||{};if(r.cancelled)return;
   toast(r.verified
     ?(r.kind==='video'?'VERIFIED PUBLIC VIDEO · ':'PUBLIC CAMERA STILL · ')+(r.source||r.city||'')
     :'CAMERA CHECK COMPLETE · '+(r.reply||'No verified image'),r.verified?'ok':'warning');
   cameraMore();
   void window.TravisCameraFeedback?.announce?.(r);
 });
 window.addEventListener('travis:transcript',e=>{if(e.detail?.role==='user')setTools(false);});
 window.addEventListener('travis:close',()=>{setTools(false);clearTimeout(timer);});
}
mount();
window.TravisCinemaUI=Object.freeze({focusGlobe,hideOverlays,setTools,toast,routeCommand,
 status:()=>({ready:!!dock,toolsOpen:dock?.dataset.open==='true'})});
