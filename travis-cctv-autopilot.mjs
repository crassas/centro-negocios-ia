/**
 * Travis: one-shot public-camera selection by user command.
 * Only uses camera IDs from the existing approved God's Eye View catalogue.
 * Never accesses private feeds, scans networks or runs unattended monitoring.
 */
import {cameraIntent,rankPublicCameras,AREA_REFERENCES,normalizeCctvText}
  from './travis-cctv-auto-policy.mjs?v=coordination-1';
let selected=null, candidates=[], operation=0, busy=false, lastResult=null;
const tr=(l,pt,en)=>l==='en'?en:pt;
const status=()=>({busy,selected:selected?.id||null,choices:candidates.length,lastResult});
function contextScope(){
  const view=window.TravisGevBridge?.status?.();
  if(view?.coordinates&&Number.isFinite(view.coordinates.lat)){
    return {name:view.coordinates.label||'Globe location',
      lat:view.coordinates.lat,lon:view.coordinates.lon,radiusKm:90,explicit:true};
  }
  if(view?.open&&view.place&&view.place!=='earth'){
    const found=AREA_REFERENCES.find(x=>x.match.test(normalizeCctvText(view.place)));
    if(found)return {...found,explicit:true};
  }
  return null;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verified(camera,token){
  const player=window.TravisCctvPlayer;
  const at=Date.now();
  const result=await player.openCamera(camera.id);
  if(token!==operation||!result?.ok)return null;
  if(result.type==='snapshot'){
    const s=player.status();
    return s.sourceId===camera.id&&s.updatedFrame>=at?'snapshot':null;
  }
  if(result.type!=='hls-requested')return null;
  // DelDOT playlists can take >10 seconds to open on Android; give HLS time to start.
  for(let i=0;i<56;i++){ 
    if(token!==operation||document.hidden)return null;
    const s=player.status();
    if(s.sourceId!==camera.id)return null;
    if(s.mode==='video'&&s.playingVerified)return 'video';
    if(s.mode==='image'&&s.updatedFrame>=at)return 'snapshot';
    if(s.mode==='error')return null;
    await pause(500);
  }
  return null;
}
function focus(camera){
  const view=window.TravisGevBridge;
  if(!view?.navigate)return;
  if(!view.status?.()?.open)view.open?.('earth');
  view.toggleLayer?.('cctv',true);
  view.navigate(null,{lat:camera.lat,lon:camera.lon,
    alt:3600,label:camera.city||camera.name});
}
async function select(intent){
  const token=++operation,lang=intent.lang||'en';
  const net=window.TravisCctv,player=window.TravisCctvPlayer;
  if(!net?.load||!player?.openCamera)return {handled:true,language:lang,
    reply:tr(lang,'As fontes públicas não estão ligadas.','Public sources are not connected.')};
  busy=true;
  try{
    await net.load();
    if(token!==operation)return {handled:true,language:lang,
      reply:tr(lang,'Pedido de câmara interrompido.','Camera request interrupted.')};
    const scope=intent.global?null:intent.scope||contextScope();
    const exclude=new Set(intent.action==='next'&&selected?[selected.id]:[]);
    const ranked=rankPublicCameras(net.locations().filter(c=>!intent.live||c.feedType==='hls'),{
      scope,preferVideo:!!intent.live,exclude,limit:25,random:intent.random?Math.random:null});
    // An explicit video request MUST NOT fall back silently to a JPEG.
    // HLS media playlist + MPEG-TS/H.264 was verified on ncam221. Try this
    // known transport first for a GLOBAL user-requested video test only;
    // actual visual playback still requires the browser "playing" event.
    const sources=intent.live?ranked.filter(c=>c.feedType==='hls'):ranked;
    const known=intent.live&&intent.global===true&&!intent.random
      ? new Map([['deldot-ncam221',0],['deldot-ncam214',1]]) : new Map();
    const knownPublic=known.size?net.locations().filter(c=>known.has(c.id)&&c.feedType==='hls'):[];
    const pool=known.size
      ? [...knownPublic,...sources].filter((c,i,list)=>list.findIndex(x=>x.id===c.id)===i)
          .sort((a,b)=>(known.get(a.id)??100)-(known.get(b.id)??100))
      : sources;
    if(intent.action!=='next'||!candidates.length||intent.scope)candidates=pool;
    const choices=(intent.action==='next'&&candidates.length
      ? [...candidates.filter(c=>c.id!==selected?.id),...pool]
      : pool).filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i).slice(0,intent.live?2:3);
    if(!choices.length)return {handled:true,language:lang,verified:false,
      reply:tr(lang,
        intent.live?'Não encontrei fontes HLS públicas de vídeo nesta zona. As fotografias não são transmissões.':
          'Não encontrei câmaras públicas registadas nesta zona.',
        intent.live?'No registered public HLS video sources were found in this area. Still images are not video.':
          'No registered public cameras were found in this area.')};
    for(const camera of choices){
      if(token!==operation)return {handled:true,language:lang,
        reply:tr(lang,'Pedido interrompido.','Request interrupted.')};
      const kind=await verified(camera,token);
      if(!kind || (intent.live && kind!=='video'))continue;
      selected=camera;
      lastResult={verified:true,kind,sourceId:camera.id,source:camera.name,city:camera.city,at:Date.now()};
      focus(camera);
      const name=camera.name+', '+(camera.city||camera.pack);
      return {handled:true,language:lang,...lastResult,
        reply:kind==='video'
          ?tr(lang,'A câmara pública '+name+' está a reproduzir vídeo. A actualidade das imagens depende do operador.',
            'The public camera '+name+' is playing video. The operator controls how current the images are.')
          :tr(lang,'Encontrei uma imagem da câmara pública '+name+
            '. É uma fotografia, não vídeo em directo.',
            'I found a real public camera image from '+name+
            '. This is a still frame, not live video.')};
    }
    lastResult={verified:false,requested:intent.live?'video':'any',at:Date.now()};
    // A request specifically for moving video must not leave a JPEG fallback
    // onscreen after failing to verify an HLS stream.
    if(intent.live)player.close?.();
    return {handled:true,language:lang,verified:false,
      reply:tr(lang,
        intent.live?'As fontes públicas HLS testadas não deram vídeo verificável. Não substituí por fotografias.':
          'Encontrei câmaras no catálogo, mas não consegui confirmar uma imagem disponível.',
        intent.live?'The public HLS sources did not produce verified video. I did not substitute still images.':
          'I found registered cameras but could not verify a working image.')};
  }catch(e){
    console.warn('[Travis public camera selection]',e);
    return {handled:true,language:lang,verified:false,
      reply:tr(lang,'O serviço de câmaras não respondeu.','The camera service did not respond.')};
  }finally{if(token===operation)busy=false;}
}
async function routeCommand(raw,options={}){
  const view=window.TravisCctvPlayer?.status?.();
  if(view?.open&&view.sourceId&&/^(?:what am i looking at|what are we looking at|which camera is this|what camera is this)[?.!]*$/i.test(String(raw).trim())){
    const kind=view.mode==='video'&&view.playingVerified?'video':view.mode==='image'&&view.updatedFrame?'a still image':'an unverified camera source';
    return {handled:true,language:'en',reply:'You are viewing '+kind+' from '+(view.sourceName||view.sourceId)+(view.city?', '+view.city:'')+'. This identifies the source; I have not analysed the objects in the image.'};
  }
  const intent=cameraIntent(raw);
  if(!intent)return {handled:false};
  if(['en','pt'].includes(options.language))intent.lang=options.language;
  if(intent.action==='close'){
    operation++;busy=false;window.TravisCctvPlayer?.close?.();
    return {handled:true,language:intent.lang,
      reply:tr(intent.lang,'Câmara fechada.','Camera closed.')};
  }
  if(intent.action==='stopTour'||intent.action==='tour'){
    return {handled:true,language:intent.lang,
      reply:tr(intent.lang,
        'Posso escolher automaticamente uma câmara pública de cada vez. Diz-me a cidade.',
        'I can select an available public camera on request. Name a city.')};
  }
  const requestId=options.requestId||crypto.randomUUID();
  window.dispatchEvent(new CustomEvent('travis:cctv-auto-request',{detail:{id:requestId,text:String(raw)}}));
  const pending=select(intent),token=operation;
  void pending.then(result=>{
    const detail={...result,id:requestId,cancelled:token!==operation};
    if(!detail.cancelled){
      const region=document.getElementById('travis-gev-status');
      if(region)region.textContent=String(result.reply||'Public camera check completed.').slice(0,220);
    }
    window.dispatchEvent(new CustomEvent('travis:cctv-auto-result',{detail}));
  }).catch(error=>console.warn('[Travis CCTV] Selection error',error));
  return {handled:true,language:intent.lang,verified:false,pending:true,id:requestId,
    reply:tr(intent.lang,
      intent.live?'Vou procurar uma transmissão pública HLS e confirmar se o vídeo reproduz.':
        'Vou procurar uma câmara pública disponível e verificar a imagem.',
      intent.live?'I will look for public HLS video and confirm actual playback.':
        'I will look for a public camera and verify its image.')};
}
function setup(){
  const bar=document.querySelector('#travis-gev-official .travis-gev-toolbar');
  if(!bar||document.getElementById('travis-cctv-auto'))return;
  const button=document.createElement('button');
  button.id='travis-cctv-auto';button.type='button';
  button.textContent='AUTO CCTV';
  button.title='Find one registered public camera without choosing from the list';
  button.addEventListener('click',async()=>{
    if(busy)return;
    button.disabled=true;button.textContent='SEARCHING';
    const region=document.getElementById('travis-gev-status');
    if(region)region.textContent='CHECKING PUBLIC CAMERA';
    try{
      const result=await routeCommand('Show a random public camera',{language:'en'});
      if(region)region.textContent=String(result.reply||'PUBLIC CAMERA SEARCH COMPLETE').slice(0,160);
    }finally{button.disabled=false;button.textContent='AUTO CCTV';}
  });
  bar.appendChild(button);
  const videoButton=document.createElement('button');
  videoButton.id='travis-cctv-video-auto';videoButton.type='button';
  videoButton.textContent='LIVE VIDEO';
  videoButton.title='Tentar vídeo HLS público real. Sem fotografias fingidas.';
  videoButton.addEventListener('click',async()=>{
    if(busy)return;
    videoButton.disabled=true;videoButton.textContent='CHECKING VIDEO';
    const region=document.getElementById('travis-gev-status');
    if(region)region.textContent='A verificar vídeo público HLS · aguarda confirmação';
    try{
      const result=await routeCommand('Show a public video camera anywhere',{language:'en'});
      if(region)region.textContent=String(result.reply||'Public HLS check ended').slice(0,220);
    }finally{videoButton.disabled=false;videoButton.textContent='LIVE VIDEO';}
  });
  bar.appendChild(videoButton);
}
setup();
window.TravisCctvAutopilot=Object.freeze({routeCommand,select,status});
window.addEventListener('travis:close',()=>{operation++;busy=false;});
