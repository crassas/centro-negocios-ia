// The personal conversation survives tab/browser restarts. No cross-origin lookup.
const key='travis-dialogue-session';
const valid=value=>/^[a-zA-Z0-9-]{8,80}$/.test(value||'');
export function conversationIdentity(persistent,tab,makeId=()=>crypto.randomUUID()){
  let saved,legacy;
  try{saved=persistent.getItem(key);}catch{}
  try{legacy=tab.getItem(key);}catch{}
  const id=valid(saved)?saved:valid(legacy)?legacy:makeId();
  saveConversationIdentity(id,persistent,tab);return id;
}
export function saveConversationIdentity(id,persistent,tab){
  if(!valid(id))return false;
  for(const storage of [persistent,tab])try{storage.setItem(key,id);}catch{}
  return true;
}
const words=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)||[];
export function isPlaybackEcho(transcript,spoken){
  const a=words(transcript),b=words(spoken);
  if(!a.length)return true;
  // Explicit interruption commands always win, including short commands.
  if(/^(?:travis |jarvis )?(?:stop|pause|wait|cancel|para|pare|pausa|espera|cancela)(?: |$)/.test(a.join(' ')))return false;
  if(a.length<3)return false;
  const phrase=a.join(' '),reference=b.join(' ');
  if(reference.includes(phrase))return true;
  let at=0,matched=0;
  for(const token of a){const i=b.indexOf(token,at);if(i>=0){matched++;at=i+1;}}
  return matched/a.length>=.86;
}
