/**
 * Travis: one-shot public-camera selection by user command.
 * Only uses camera IDs from the existing approved God's Eye View catalogue.
 * Never accesses private feeds, scans networks or runs unattended monitoring.
 */
import {cameraIntent,rankPublicCameras,AREA_REFERENCES,normalizeCctvText}
  from './travis-cctv-auto-policy.mjs?v=auto-1';
let selected=null, candidates=[], operation=0, busy=false;
const tr=(l,pt,en)=>l==='en'?en:pt;
const status=()=>({busy,selected:selected?.id||null,choices:candidates.length});
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
  for(let i=0;i<20;i++){
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
  const token=++operation,lang=intent.lang||'pt';
  const net=window.TravisCctv,player=window.TravisCctvPlayer;
  if(!net?.load||!player?.openCamera)return {handled:true,language:lang,
    reply:tr(lang,'As fontes públicas não estão ligadas.','Public sources are not connected.')};
  busy=true;
  try{
    await net.load();
    if(token!==operation)return {handled:true,language:lang,
      reply:tr(lang,'Pedido de câmara interrompido.','Camera request interrupted.')};
    const scope=intent.scope||contextScope();
    const exclude=new Set(intent.action==='next'&&selected?[selected.id]:[]);
    const pool=rankPublicCameras(net.locations(),{
      scope,preferVideo:!!intent.live,exclude,limit:25});
    if(intent.action!=='next'||!candidates.length)candidates=pool;
    const choices=(intent.action==='next'&&candidates.length
      ? [...candidates.filter(c=>c.id!==selected?.id),...pool]
      : pool).filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i).slice(0,3);
    if(!choices.length)return {handled:true,language:lang,
      reply:tr(lang,
        'Não encontrei câmaras públicas registadas nesta zona.',
        'No registered public cameras were found in this area.')};
    for(const camera of choices){
      if(token!==operation)return {handled:true,language:lang,
        reply:tr(lang,'Pedido interrompido.','Request interrupted.')};
      const kind=await verified(camera,token);
      if(!kind)continue;
      selected=camera;
      focus(camera);
      const name=camera.name+', '+(camera.city||camera.pack);
      return {handled:true,language:lang,verified:true,
        reply:kind==='video'
          ?tr(lang,'Encontrei vídeo público em directo de '+name+'.',
            'I found verified public live video from '+name+'.')
          :tr(lang,'Encontrei uma imagem da câmara pública '+name+
            '. É uma fotografia, não vídeo em directo.',
            'I found a real public camera image from '+name+
            '. This is a still frame, not live video.')};
    }
    return {handled:true,language:lang,verified:false,
      reply:tr(lang,
        'Encontrei câmaras no catálogo, mas não consegui confirmar uma imagem disponível.',
        'I found registered cameras but could not verify a working image.')};
  }catch(e){
    console.warn('[Travis public camera selection]',e);
    return {handled:true,language:lang,verified:false,
      reply:tr(lang,'O serviço de câmaras não respondeu.','The camera service did not respond.')};
  }finally{busy=false;}
}
async function routeCommand(raw){
  const intent=cameraIntent(raw);
  if(!intent)return {handled:false};
  if(intent.action==='close'){
    operation++;window.TravisCctvPlayer?.close?.();
    return {handled:true,language:intent.lang,
      reply:tr(intent.lang,'Câmara fechada.','Camera closed.')};
  }
  if(intent.action==='stopTour'||intent.action==='tour'){
    return {handled:true,language:intent.lang,
      reply:tr(intent.lang,
        'Posso escolher automaticamente uma câmara pública de cada vez. Diz-me a cidade.',
        'I can select an available public camera on request. Name a city.')};
  }
  return select(intent);
}
function setup(){
  const bar=document.querySelector('#travis-gev-official .travis-gev-toolbar');
  if(!bar||document.getElementById('travis-cctv-auto'))return;
  const button=document.createElement('button');
  button.id='travis-cctv-auto';button.type='button';
  button.textContent='AUTO CCTV';
  button.title='Find one registered public camera without choosing from the list';
  button.addEventListener('click',()=>{void select({action:'select',lang:'pt'});});
  bar.appendChild(button);
}
setup();
window.TravisCctvAutopilot=Object.freeze({routeCommand,select,status});
window.addEventListener('travis:close',()=>{operation++;});
