(()=>{
 const $=id=>document.getElementById(id),panel=$('travis-panel'),log=$('travis-dialogue'),input=$('travis-input'),status=$('travis-state'),mic=$('travis-mic');
 let listening=null,busy=false,version=0,pendingTask='',controller=null,returnFocus=null,queueTimer=null;
 const continuous=$('travis-continuous'),readAloud=$('travis-read-aloud');
 const setStatus=text=>{status.textContent=text;panel.dataset.state=text.startsWith('Estou a ouvir')?'listening':busy?'thinking':'ready'};
 function add(role,text){const row=document.createElement('p');row.className='travis-message '+role;const label=document.createElement('small');label.textContent=role==='user'?'TU':'TRAVIS';row.append(label,document.createTextNode(String(text)));log.append(row);while(log.children.length>16)log.firstElementChild.remove();log.scrollTop=log.scrollHeight}
 function release(){listening?.abort();listening=null;mic.textContent='Falar';window.speechSynthesis?.cancel()}
 function stop(){version++;controller?.abort();controller=null;release();busy=false;pendingTask='';clearTimeout(queueTimer);$('travis-send').disabled=false;setStatus('Conversa parada. Podes voltar a falar.')}
 function speak(text,force=false){
  if(!panel.open||(!force&&!readAloud.checked)||!window.speechSynthesis){setStatus('Resposta recebida.');return}
  const id=version;const voice=new SpeechSynthesisUtterance(text);voice.lang='en-GB';voice.rate=1;
  voice.voice=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase()==='en-gb')||speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('en-'))||null;
  voice.onstart=()=>{if(id===version)setStatus('O Travis está a falar.')};
  voice.onend=()=>{if(id!==version)return;setStatus('Estou aqui.');if(continuous.checked&&panel.open)startListening()};
  voice.onerror=()=>{if(id===version)setStatus('Resposta pronta. Podes carregar em Ouvir.')};
  speechSynthesis.cancel();speechSynthesis.speak(voice);
 }
 let lastReply='';
 function reply(text){lastReply=String(text);add('assistant',lastReply);$('travis-replay').disabled=false;speak(lastReply)}
 async function submit(text){
  text=String(text||'').trim();if(!text||busy)return;release();const id=++version;busy=true;$('travis-send').disabled=true;add('user',text);input.value='';setStatus('Vou tratar do teu pedido.');controller=new AbortController();
  try{
   const result=await window.TravisBridge.ask(text,controller.signal);if(id!==version)return;
   if(result.error)throw Error(result.error);
   if(result.taskId){pendingTask=result.taskId;setStatus('Pedido entregue ao Centro. A aguardar a execução.');add('assistant',result.reply);queueTimer=setTimeout(()=>{if(pendingTask===result.taskId){busy=false;$('travis-send').disabled=false;setStatus('O trabalho continua no Centro. Podes consultar a actividade.')}},120000);return}
   busy=false;reply(result.reply);
  }catch(e){if(id===version){busy=false;add('assistant',e.name==='AbortError'?'A ligação demorou demasiado. Podes tentar novamente.':e.message);setStatus('Pedido sem confirmação.')}}
  finally{if(id===version&&!pendingTask){busy=false;$('travis-send').disabled=false;controller=null}}
 }
 function startListening(){
  if(busy)return;
  if(listening){listening.stop();return}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){setStatus('Este navegador não tem ditado. Usa Voz no telemóvel ou escreve.');return}
  window.speechSynthesis?.cancel();const id=version,recognition=new Recognition();listening=recognition;let submitted=false;recognition.lang='pt-PT';recognition.interimResults=true;recognition.continuous=false;
  recognition.onstart=()=>{mic.textContent='Terminar';setStatus('Estou a ouvir. Fala naturalmente.')};
  recognition.onresult=e=>{if(id!==version)return;input.value=Array.from(e.results).map(r=>r[0].transcript).join(' ');if(Array.from(e.results).some(r=>r.isFinal)&&!submitted){submitted=true;const text=input.value;listening=null;recognition.stop();submit(text)}};
  recognition.onerror=e=>{if(id===version){listening=null;mic.textContent='Falar';continuous.checked=false;setStatus('Ditado indisponível: '+e.error+'. Podes escrever.')}};
  recognition.onend=()=>{if(id===version){listening=null;mic.textContent='Falar';if(!submitted)setStatus('Não ouvi um pedido. Carrega em Falar para tentar novamente.')}};
  try{recognition.start()}catch{listening=null;setStatus('Não consegui iniciar o microfone. Podes escrever.')}
 }
 function open(){returnFocus=document.activeElement;if(!panel.open)panel.showModal();$('travis-launcher').setAttribute('aria-expanded','true');setStatus(busy?'O Centro está a tratar do pedido.':'Estou aqui.');input.focus()}
 function close(){release();continuous.checked=false;panel.close();$('travis-launcher').setAttribute('aria-expanded','false');returnFocus?.focus()}
 $('travis-launcher').onclick=open;$('travis-close').onclick=close;panel.addEventListener('cancel',e=>{e.preventDefault();close()});
 $('travis-form').onsubmit=e=>{e.preventDefault();submit(input.value)};mic.onclick=startListening;$('travis-stop').onclick=stop;$('travis-replay').onclick=()=>speak(lastReply,true);
 continuous.onchange=()=>{if(continuous.checked)startListening();else release()};
 document.querySelectorAll('[data-travis-prompt]').forEach(b=>b.onclick=()=>submit(b.dataset.travisPrompt));
 window.TravisPanel={open,completeTask(id,text){if(id!==pendingTask)return;pendingTask='';clearTimeout(queueTimer);busy=false;$('travis-send').disabled=false;reply(text)}};
})();
