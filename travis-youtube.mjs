// Official YouTube player stays in Travis' document; the microphone session survives.
let player=null,active=false,playing=false,ready=false,generation=0,apiPromise=null;
let lastError='',status=null;
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
  player=null;status=null;lastError='';return wasOpen;
}
export function youtubeState(){return {open:active,playing,error:lastError,ready};}
export function controlYouTube(action){
  if(action==='close_youtube'){return {handled:true,reply:closeYouTube()?'YouTube closed. I’m here.':'YouTube is already closed.'};}
  if(!['pause_youtube','resume_youtube'].includes(action))return null;
  if(!ready||!player?.getPlayerState)return {handled:true,reply:'Choose a YouTube video and let it load first.'};
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
  status.textContent=validId(data.videoId)?'A ligar ao YouTube…':'Diz o que queres ver. Continuo aqui.';
  container.append(status);
  if(!validId(data.videoId))return;
  const screen=document.createElement('div');screen.className='travis-youtube-screen';
  const slot=document.createElement('div');screen.append(slot);container.append(screen);
  api().then(YT=>{
    if(session!==generation||!slot.isConnected)return;
    player=new YT.Player(slot,{host:'https://www.youtube-nocookie.com',videoId:data.videoId,
      width:'100%',height:'100%',playerVars:{playsinline:1,autoplay:1,origin:location.origin,rel:0},
      events:{
        onReady:event=>{if(session!==generation)return;ready=true;event.target.setVolume(45);status.textContent='Diz “fecha o YouTube” para regressar.';screen.dataset.ready='true';},
        onStateChange:event=>{if(session!==generation)return;playing=event.data===1;screen.dataset.playing=String(playing);},
        onAutoplayBlocked:()=>{if(session===generation)status.textContent='Toca em reproduzir no vídeo. O Travis continua ligado.';},
        onError:event=>{
          if(session!==generation)return;lastError=String(event.data);playing=false;
          status.textContent=[101,150].includes(event.data)?'O YouTube bloqueou a reprodução deste vídeo aqui. Podes escolher outro resultado abaixo.':event.data===153?'O YouTube não conseguiu validar este leitor. A pesquisa e a voz continuam ligadas.':'Este vídeo não ficou disponível aqui. Podes escolher outro resultado abaixo.';
          screen.dataset.error=lastError;
        }
      }});
  }).catch(error=>{if(session===generation&&status){lastError=error.message;status.textContent=error.message;}});
}
window.addEventListener('travis:state',event=>{
  try{if(active&&player?.setVolume)player.setVolume(event.detail.state==='speaking'?12:45);}catch{}
});
