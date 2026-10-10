import {anatomySubject,anatomyPart} from './travis-anatomy.mjs?v=figures-1';
import {figureSubject,figureLabel} from './travis-figure-catalog.mjs?v=figures-1';
import {compositionIntent,sceneAsset} from './travis-scene-blueprint.mjs?v=figures-1';
// Explicit, bounded procedural scenes. Unknown assets still use the research path.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const bodyNames={mercury:'Mercury',mercurio:'Mercury',venus:'Venus',terra:'Earth',earth:'Earth',mars:'Mars',marte:'Mars',jupiter:'Jupiter',saturn:'Saturn',saturno:'Saturn',uranus:'Uranus',urano:'Uranus',neptune:'Neptune',neptuno:'Neptune',moon:'Moon',lua:'Moon',sun:'Sun',sol:'Sun'};
export function cinematicIntent(text,{active=false}={}){
 const t=fold(text).trim();
 if(/^(?:nao|nunca|don't|do not)\b/.test(t)||/^(?:escreve|write)\b/.test(t))return null;
 const language=/\b(?:mostra|explica|pessoa|humano|humana|astronauta|traje espacial|esqueleto|corpo|pulmoes|coracao|cerebro|chuva|foguetao|terra|lua|marte|aconteceria|como|isola|gota|neve|fogo|pausa|continua)\b/.test(t)?'pt':'en';
 if(active){
  for(const [action,re] of [['pause-motion',/^(?:pausa|para|congela)(?: a animacao| o movimento| isso)?$|^(?:pause|freeze)(?: the animation| animation| it)?$/],['resume-motion',/^(?:continua|retoma|anima)(?: a animacao| o movimento| isso)?$|^(?:resume|animate)(?: the animation| animation| it)?$/],['slow-motion',/^(?:mais devagar|abranda|slow(?:er| down)|slow motion)$/],['normal-motion',/^(?:velocidade normal|normal speed)$/],['wide-view',/^(?:mostra tudo|mostra todos|vista geral|volta a vista geral|show all|show everything|wide view)$/]])if(re.test(t))return {type:'control',action,language};
  if(/\b(?:isola|isolar|isole|isolate|focus on|foca|foca-te|aproxima.*planeta)\b/.test(t)&&!/\b(?:apenas|so|somente|only|alone)\b/.test(t)){
   const target=Object.entries(bodyNames).find(([key])=>new RegExp('\\b'+key+'\\b').test(t))?.[1]||anatomySubject(t)||(/\b(?:rotor|eixo|estator|stator|bobinas|ventoinha|fan)\b/.exec(t)?.[0])||sceneAsset(t)||(/gota|drop/.test(t)?'Drop':t.replace(/^.*?(?:isola(?:r|-me)?|isole|isolate|focus on|foca(?:-te)?)\s*/,'').replace(/^(?:(?:me|ai|o|a|os|as|the|planeta|planet)\s+)*/,''));
   return {type:'focus',target:/^(?:esse|este|aquele|this|that|it)(?: (?:planeta|objeto|planet|object))?$/.test(target||'')?null:target,language};
  }
 }
 const only=/\b(?:mostra(?:-me)?|show(?: me)?|isola|isolate)\b.*\b(?:apenas|so|somente|only|alone)\b/.test(t);
 if(only){
  const target=Object.entries(bodyNames).find(([key])=>new RegExp('\\b'+key+'\\b').test(t))?.[1]||anatomySubject(t)||sceneAsset(t);
  if(target)return {type:'solo',target,language};
 }
 const anatomy=anatomySubject(t);
 const photoRequest=/\b(?:fotos?|fotografias?|photos?|photographs?|pictures?|images?|imagens?)\b/.test(t);
 const bareAnatomy=Boolean(anatomyPart(t))||/^(?:(?:o|a|the) )?(?:corpo humano|human body|anatomia|anatomy|anatomia interna|internal anatomy|esqueleto|skeleton|human skeleton)$/.test(t);
 if(anatomy&&!photoRequest&&(/\b(?:mostra|ver|cria|projeta|explica|show|explain|display)\b/.test(t)||bareAnatomy))return {type:'scene',scene:'anatomy',title:anatomy,explain:/\b(?:explica|explain)\b/.test(t),language};
 const figure=!photoRequest&&figureSubject(t.replace(/^(?:mostra(?:-me)?|show(?: me)?|cria|create|projeta|display|explica|explain)\s+/,'').replace(/\s+(?:em 3d|in 3d)$/,''));
 if(figure)return {type:'scene',scene:'figure',title:figureLabel(figure,language),figureId:figure,autoReturn:true,schematic:false,source:'local-reference-catalog',explain:/\b(?:explica|explain)\b/.test(t),language};
 const composed=compositionIntent(text);if(composed)return composed;
 const explicit=/\b(?:mostra|ver|cria|faz|projeta|imagina|simula|explica|aconteceria|chegaria|viajaria|show|create|imagine|simulate|explain|what if|would happen|would .*reach|how.*(?:get|travel|reach))\b/.test(t);
 const photo=/\b(?:fotos?|fotografias?|photos?|photographs?|imagens? reais|real images?)\b/.test(t);
 const bare=/^(?:chuva|neve|fogo|ondas|oceano|nuvens|tempestade|rain|snow|fire|waves|ocean|clouds|storm)$/.test(t);
 if((!explicit&&!bare)||photo)return null;
 const mission=/\b(?:foguetao|foguete|rocket|spacecraft|nave|viagem|journey|viajar|voar|travel|mission|missao)\b/.test(t)&&/\b(?:lua|moon|marte|mars)\b/.test(t);
 if(mission)return {type:'scene',scene:'journey',title:/\b(?:mars|marte)\b/.test(t)?'Earth to Mars':'Earth to Moon',explain:!/^(?:mostra|show)\b/.test(t)||/\b(?:explica|explain|como|how|aconteceria|what if)\b/.test(t),language};
 const weather=[['storm',/trovoada|tempestade|storm|thunder|relampago|lightning/],['snow',/neve|snow/],['rain',/chuva|chover|rain/],['fire',/fogo|chama|fire|flame/],['ocean',/ondas|oceano|ocean|waves/],['clouds',/nuvens|nuvem|clouds?/]].find(([,re])=>re.test(t));
 if(weather)return {type:'scene',scene:'weather',title:weather[0],explain:/explica|explain|como|how/.test(t),language};
 if(/\b(?:foguetao|rocket)\b/.test(t))return {type:'scene',scene:'vehicle',title:'Rocket',explain:/explica|explain/.test(t),language};
 return null;
}
// Kepler ellipse between circular coplanar orbits. Normalised units; no ephemeris,
// atmosphere, launch vehicle dynamics or gravity-assist manoeuvres are implied.
export function transferState(progress,r1=1,r2=1.524){
 const p=Math.max(0,Math.min(1,progress)),a=(r1+r2)/2,e=(r2-r1)/(r2+r1),M=Math.PI*p;
 let E=M;for(let i=0;i<7;i++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
 const duration=Math.PI*Math.pow(a,1.5),outerRate=1/Math.pow(r2,1.5),phase=Math.PI-outerRate*duration;
 return {rocket:[a*(Math.cos(E)-e),a*Math.sqrt(1-e*e)*Math.sin(E)],originAngle:duration*p/Math.pow(r1,1.5),destinationAngle:phase+outerRate*duration*p,progress:p};
}

// Streaming audio has no final duration yet. Preserve progress across chunks;
// explicit arrival language can finish it, otherwise reserve arrival for speech-end.
export function journeyCueTarget(text,current,duration){
 const t=fold(text),arrival=/\b(?:chega|chegamos|pousa|pousamos|aterragem|arrives?|arrival|lands?|landing)\b/.test(t);
 const transfer=/\b(?:transferencia|transfer|cruzeiro|cruise|trajeto|trajectory|orbita de transferencia)\b/.test(t);
 return Math.max(current,arrival?1:Math.min(.88,Math.max(transfer?.65:0,current+Math.max(.04,Math.min(.22,duration/22)))));
}
