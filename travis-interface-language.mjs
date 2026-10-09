/**
 * Cinematic, bilingual interface. English presentation is the default,
 * independent from the language of spoken replies. No visible toggle.
 * Language can be changed by an explicit voice/text command or API.
 */
export const INTERFACE_COPY=Object.freeze({
  en:Object.freeze({
    command:'Speak to me, or type a request…',
    cameraEnable:'Enable camera',cameraDisable:'Disable camera',
    cameraOff:'Camera off',cameraRequest:'Requesting permission…',
    cameraInterrupted:'Camera interrupted · tap to resume',
    cameraLoading:'Loading on-device vision…',
    cameraFull:'Camera on · face, gestures & objects',
    cameraBasic:'Camera on · gestures & face',
    cameraPaused:'Camera paused · tap to resume',
    cameraPermission:'Permission denied',
    enableVoice:'Enable voice',
    hint:'TOUCH TRAVIS',
    room:'Command room',
    pause:'Pause voice',
    close:'Close Travis',
    send:'Send request',
    inputLabel:'Your request to Travis',
    preview:'On-device camera preview',
    canvas:'Interactive 3D presence of Travis',
    applied:'Interface switched to English.',
  }),
  pt:Object.freeze({
    command:'Fala comigo ou escreve o teu pedido…',
    cameraEnable:'Ligar câmara',cameraDisable:'Desligar câmara',
    cameraOff:'Câmara desligada',cameraRequest:'A pedir autorização…',
    cameraInterrupted:'Câmara interrompida · toca para retomar',
    cameraLoading:'A carregar visão local…',
    cameraFull:'Câmara ativa · rosto, gestos e objetos',
    cameraBasic:'Câmara ativa · gestos e rosto',
    cameraPaused:'Câmara em pausa · toca para retomar',
    cameraPermission:'Permissão recusada',
    enableVoice:'Ativar conversa por voz',
    hint:'TOCA NO TRAVIS',
    room:'Sala de comando',
    pause:'Pausar voz',
    close:'Fechar Travis',
    send:'Enviar pedido',
    inputLabel:'Pedido ao Travis',
    preview:'Pré-visualização da câmara local',
    canvas:'Núcleo 3D interativo do Travis',
    applied:'Interface em português de Portugal.',
  }),
});

export function interfaceLanguage(language='en'){
  return language==='pt'?'pt':'en';
}

export function languageFromInterfaceCommand(value){
  const words=String(value||'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[.!?]+$/,'').trim()
    .replace(/^(?:(?:hey|ola|oi|travis|jarvis)[,\s:]+)+/,'')
    .replace(/\s+/g,' ');
  // Only explicit INTERFACE instructions: never capture "speak English"
  // because that already changes the conversation language independently.
  const matches=[
    /^(?:(?:muda|mete|poe|troca|altera|coloca)\s+(?:a\s+)?interface\s+(?:para|em)\s+|interface\s+(?:em|para)\s+)(portugues(?:\s+de\s+portugal)?|ingles)$/,
    /^(?:(?:switch|change|set)\s+(?:the|your)?\s*interface\s+(?:to|into)\s+|interface\s+in\s+)(portuguese|english)$/,
  ];
  const token=matches.map(pattern=>words.match(pattern)?.[1]).find(Boolean);
  return token?(/^(?:portugues|portuguese)/.test(token)?'pt':'en'):null;
}

export function visionStatusCopy(message,language='en'){
  if(interfaceLanguage(language)==='pt')return String(message??'');
  const raw=String(message??'');
  const translate={
    'Câmara desligada':'cameraOff',
    'A pedir autorização…':'cameraRequest',
    'Câmara interrompida · toca para retomar':'cameraInterrupted',
    'A carregar visão local…':'cameraLoading',
    'Câmara activa · rosto, gestos e objetos':'cameraFull',
    'Câmara activa · gestos e rosto':'cameraBasic',
    'Câmara ativa · rosto, gestos e objetos':'cameraFull',
    'Câmara ativa · gestos e rosto':'cameraBasic',
    'Câmara em pausa · toca para retomar':'cameraPaused',
  };
  if(translate[raw])return INTERFACE_COPY.en[translate[raw]];
  if(raw.startsWith('Câmara: '))return 'Camera: '+(raw.slice(8)==='permissão recusada'
    ?INTERFACE_COPY.en.cameraPermission:raw.slice(8));
  return raw;
}

export function applyInterfaceLanguage(language,doc=globalThis.document){
  const locale=interfaceLanguage(language),copy=INTERFACE_COPY[locale];
  if(!doc)return locale;
  const element=id=>doc.getElementById(id);
  const setText=(id,value)=>{const e=element(id);if(e)e.textContent=value;};
  const setAria=(id,value)=>{const e=element(id);if(e)e.setAttribute('aria-label',value);};
  const hud=element('travis-hud');
  if(hud){hud.dataset.uiLanguage=locale;hud.lang=locale==='pt'?'pt-PT':'en';}
  const input=element('travis-command-text');
  if(input)input.placeholder=copy.command;
  setText('travis-voice-start',copy.enableVoice);
  setText('travis-room-toggle',copy.room);
  setText('travis-pause',copy.pause);
  setText('travis-camera-toggle',
    element('travis-camera-toggle')?.getAttribute('aria-pressed')==='true'
    ?copy.cameraDisable:copy.cameraEnable);
  const hint=doc.querySelector?.('.travis-hint');
  if(hint)hint.textContent=copy.hint;
  const inputLabel=doc.querySelector?.('label[for="travis-command-text"]');
  if(inputLabel)inputLabel.textContent=copy.inputLabel;
  setAria('travis-hud-close',copy.close);
  setAria('travis-camera-preview',copy.preview);
  setAria('travis-three-canvas',copy.canvas);
  const submit=doc.querySelector?.('#travis-command button[type="submit"]');
  if(submit)submit.setAttribute('aria-label',copy.send);
  return locale;
}
