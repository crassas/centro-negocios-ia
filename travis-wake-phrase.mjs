/**
 * Travis spoken-address recovery, version 1.
 *
 * Sherpa can hear "Travis" as "para VIS", "pra vís", "atraviz" or "Avis".
 * Recover only an ADDRESS at the beginning of a spoken utterance. Do not
 * modify the ASR transcript itself or grant permission to execute commands.
 * Pure offline function; no microphone, network, timers or storage.
 */
const EXACT = /^\s*(?:(?:hey|ei|ol[aá]|oi|oh|olha|hello)[\s,.:;!-]+)?(?:travis|jarvis)(?=$|[\s,.:;!?-])[\s,.:;!?-]*/iu;
const EXPLICIT_WAKE = /^(?:acorda|wake[\s-]+up)(?=$|[\s,.:;!?-])[\s,.:;!?-]*$/iu;

// Stronger acoustic variants have to appear first, optionally after a greeting.
const STRONG = /^\s*(?:(?:hey|ei|ol[aá]|oi|oh|olha|hello|o|ou)[\s,.:;!-]+)?(?:para[\s-]*v[íi]s|pra[\s-]*v[íi]s|pravis|paravis|a[\s-]*trav[íi]s|atrav[íi]z|atrav[eé]s)(?=$|[\s,.:;!?-])[\s,.:;!?-]*/iu;
// "Avis" is ambiguous. It must be followed by a non-mutating intent.
const WEAK = /^\s*(?:avis|a[\s-]+vis)(?=$|[\s,.:;!?-])[\s,.:;!?-]*/iu;
const GREETING = /^(?:hey|ei|ol[aá]|oi|oh|olha|hello)[\s,.:;!-]+/iu;
const LOW_RISK = /^(?:verific\w*|confirm\w*|consult\w*|mostr\w*|explic\w*|compar\w*|pesquis\w*|procur\w*|encontr\w*|abre|abrir|abro|fecha|fechar|pausa|pausar|retoma|retomar|diz|dizer|fala|falar|conversa|olha|est[aá]s?|como|qual|quais|onde|quando|porque|que|o\s+que|podes|consegues|quero|queria|gostava|apetece|v[eê]|sabes|estado|check|show|explain|compare|find|search|open|close|pause|resume|tell|speak|what|how|where|when)(?=$|[\s,.;:!?-])/iu;
const MUTATING = /(?:^|[\s,.;:!?-])(?:apag\w*|elimin\w*|remov\w*|public\w*|pag\w*|compr\w*|envi\w*|instal\w*|desinstal\w*|alter\w*|edit\w*|execut\w*|destr\w*|modific\w*|mud\w*|escrev\w*|guard\w*|grav\w*|substitu\w*|transf\w*|adicion\w*|cri\w*|delete\w*|publish\w*|deploy\w*|pay\w*|purchase\w*|buy\w*|send\w*|install\w*|modify\w*|edit\w*|write\w*|execute\w*|upload\w*|commit\w*|push\w*|merge\w*)(?=$|[\s,.;:!?-])/iu;
const NONE = Object.freeze({matched:false,kind:'none',corrected:false,command:'',canonical:''});

export function resolveWakePhrase(value,{allowFuzzy=true}={}) {
  if(typeof value!=='string')return NONE;
  const phrase=value.trim();
  if(!phrase || phrase.length>1300)return NONE;
  const exact=phrase.match(EXACT);
  if(exact){
    const remainder=phrase.slice(exact[0].length).trim();
    return {matched:true,kind:'exact',corrected:false,
      command:remainder,canonical:remainder?'Travis, '+remainder:'Travis'};
  }
  if(EXPLICIT_WAKE.test(phrase)){
    return {matched:true,kind:'explicit',corrected:false,
      command:'acorda',canonical:phrase};
  }
  if(!allowFuzzy)return NONE;
  for(const [pattern,kind] of [[STRONG,'strong'],[WEAK,'weak']]){
    const match=phrase.match(pattern);
    if(!match)continue;
    const rest=phrase.slice(match[0].length).trim();
    const hasGreeting=GREETING.test(match[0]);
    // A recognisable greeting plus strong acoustic shape may wake by itself.
    // The ambiguous standalone "Avis" never does.
    if(!rest && !(kind==='strong' && hasGreeting))return NONE;
    const plain=rest.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(rest && (!LOW_RISK.test(rest) || MUTATING.test(plain)))return NONE;
    return {matched:true,kind,corrected:true,
      command:rest,canonical:rest?'Travis, '+rest:'Travis'};
  }
  return NONE;
}
