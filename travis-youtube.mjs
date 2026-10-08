// Official YouTube player stays in Travis' document; the microphone session survives.
let player=null,active=false,playing=false,ready=false,generation=0,apiPromise=null;
let lastError='',status=null,pendingControl='',speaking=false,currentVideoId='';
function announce(text){window.dispatchEvent(new CustomEvent('travis:media-notice',{detail:{text}}));}
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{11}$/.test(value);
function api(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
    const previous=window.onYouTubeIframeAPIReady;
    const timer=setTimeout(()=>{apiPromise=null;reject(new Error('YouTube did not respond. Try again.'));},20000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);previous?.();resolve(window.YT);};
    let script=document.getElementById('travis-youtube-api');
    if(!script){script=document.createElement('script');script.id='travis-youtube-api';script.src='https://www.youtube.com/iframe_api';document.head.append(script);}
    script.onerror=()=>{clearTimeout(timer);script.remove();apiPromise=null;reject(new Error('YouTube could not connect. Try again.'));};
  });
  return apiPromise;
}
export function closeYouTube(){
  const wasOpen=active;generation++;active=playing=ready=false;
  try{player?.destroy();}catch{}
  player=null;status=null;lastError='';pendingControl='';currentVideoId='';return wasOpen;
}
export function youtubeState(){return {open:active,playing,error:lastError,ready,videoId:currentVideoId};}
export function controlYouTube(action){
  if(action==='close_youtube'){return {handled:true,reply:closeYouTube()?'YouTube closed. I’m here.':'YouTube is already closed.'};}
  if(!['pause_youtube','resume_youtube'].includes(action))return null;
  if(!ready||!player?.getPlayerState){
    if(active&&currentVideoId){pendingControl=action;return {handled:true,reply:action==='pause_youtube'?'I’ll keep the video paused as it loads.':'I’ll play it as soon as it loads.'};}
    return {handled:true,reply:'Tell me what video to look for first.'};
  }
  if(action==='pause_youtube'){player.pauseVideo();return {handled:true,reply:'Pausing the video.'};}
  player.playVideo();return {handled:true,reply:'Resuming the video.'};
}
export function mountYouTube(data,container){
  closeYouTube();active=true;lastError='';const session=generation;
  const form=document.createElement('form');form.className='travis-youtube-search';
  const input=document.createElement('input');input.type='search';input.placeholder='O que queres ver?';input.value=String(data.query||'');input.maxLength=240;input.setAttribute('aria-label','Pesquisar no YouTube');
  const submit=document.createElement('button');submit.type='submit';submit.textContent='↗';submit.setAttribute('aria-label','Pesquisar');form.append(input,submit);
  form.addEventListener('submit',event=>{event.preventDefault();const q=input.value.trim();if(q)window.TravisVisual?.ask('Pesquisa no YouTube '+q);});
  container.append(form);
  status=document.createElement('p');status.className='travis-youtube-status';status.setAttribute('role','status');
  status.textContent=validId(data.videoId)?'A abrir o vídeo…':data.items?.length?'Diz “o primeiro”, “o segundo” ou pede outra pesquisa.':'Diz, por exemplo, “procura um vídeo sobre bicicletas e abre o primeiro”.';
  container.append(status);
  if(!validId(data.videoId))return;
  currentVideoId=data.videoId;
  const screen=document.createElement('div');screen.className='travis-youtube-screen';
  // Delegate autoplay before navigation, and preserve the actual app referrer.
  const slot=document.createElement('iframe');
  slot.title=String(data.videoTitle||'Vídeo do YouTube');
  slot.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';slot.allowFullscreen=true;
  slot.referrerPolicy='strict-origin-when-cross-origin';
  slot.src='https://www.youtube-nocookie.com/embed/'+data.videoId+'?'+new URLSearchParams({enablejsapi:'1',playsinline:'1',autoplay:'1',origin:location.origin,rel:'0'});
  screen.append(slot);container.append(screen);
  api().then(YT=>{
    if(session!==generation||!slot.isConnected)return;
    player=new YT.Player(slot,{
      events:{
        onReady:event=>{
          if(session!==generation)return;ready=true;event.target.setVolume(speaking?8:38);
          status.textContent='Podes dizer “pausa”, “continua”, “o seguinte” ou “fecha isso”.';screen.dataset.ready='true';
          if(pendingControl==='pause_youtube')event.target.pauseVideo();else event.target.playVideo();
          pendingControl='';
        },
        onStateChange:event=>{if(session!==generation)return;playing=event.data===1;screen.dataset.playing=String(playing);if(playing)lastError='';},
        onAutoplayBlocked:()=>{if(session===generation){lastError='autoplay';status.textContent='O navegador pede um toque em reproduzir para autorizar o vídeo. Depois podes continuar por voz.';announce('The browser needs one tap on play to allow this video. You can then continue by voice.');}},
        onError:event=>{
          if(session!==generation)return;lastError=String(event.data);playing=false;
          status.textContent=[101,150].includes(event.data)?'O YouTube bloqueou a reprodução deste vídeo aqui. Podes escolher outro resultado abaixo.':event.data===153?'O YouTube não conseguiu validar este leitor. A pesquisa e a voz continuam ligadas.':'Este vídeo não ficou disponível aqui. Podes escolher outro resultado abaixo.';
          screen.dataset.error=lastError;
          announce('This video could not play here. Say open the next one, or ask for another search.');
        }
      }});
  }).catch(error=>{if(session===generation&&status){lastError=error.message;status.textContent=error.message;announce('YouTube could not connect. You can still speak to me and try another search.');}});
}
window.addEventListener('travis:state',event=>{
  speaking=event.detail.state==='speaking';
  try{if(active&&player?.setVolume)player.setVolume(speaking?8:38);}catch{}
});
