// Local, curated journeys. These are educational illustrations, not live data,
// generated research, physical measurements or predictions of the future.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const discoveries={
 blackhole:{scene:'science',title:'Black hole',sourceName:'NASA · Black holes',sourceUrl:'https://science.nasa.gov/universe/black-holes/',
  pt:'Um buraco negro. O brilho vem da matéria quente à sua volta. Para lá do horizonte de acontecimentos, nem a luz consegue escapar. Esta é uma ilustração, com escalas e movimento simplificados.',
  en:'A black hole. The glow comes from hot matter around it. Beyond the event horizon, even light cannot escape. This is an illustration, with simplified scales and motion.'},
 aurora:{scene:'science',title:'Aurora',sourceName:'NASA · Auroras',sourceUrl:'https://science.nasa.gov/sun/auroras/',
  pt:'Uma aurora. Partículas energéticas excitam gases na atmosfera, que libertam luz. Estas cortinas ondulam em dourado para conservar a minha forma; as auroras reais também têm outras cores.',
  en:'An aurora. Energetic particles excite gases in the atmosphere, which release light. These curtains ripple in gold to preserve my visual identity; real auroras also have other colours.'},
 dna:{scene:'science',title:'DNA',sourceName:'NHGRI · Double helix',sourceUrl:'https://www.genome.gov/genetics-glossary/Double-Helix',
  pt:'Agora, a dupla hélice do ADN. Duas cadeias, unidas por pares de bases, guardam informação genética. Podes rodá-la com o dedo e aproximar com dois dedos. O desenho simplifica a estrutura molecular.',
  en:'Now, the DNA double helix. Two strands, joined by base pairs, carry genetic information. Drag to turn it, and pinch to zoom. This drawing simplifies the molecular structure.'},
 atom:{scene:'science',title:'Hydrogen',sourceName:'Department of Energy · Electrons',sourceUrl:'https://www.energy.gov/science/doe-explainselectrons',
  pt:'Chegámos ao átomo de hidrogénio. Os pontos representam a probabilidade de encontrar o seu único eletrão, não milhares de eletrões. O núcleo está ampliado. A nuvem substitui a ideia de uma órbita como a de um planeta.',
  en:'We have reached a hydrogen atom. The dots represent the probability of finding its single electron, not thousands of electrons. The nucleus is enlarged. This cloud replaces the idea of a planet-like orbit.'},
 galaxy:{scene:'space',title:'Milky way',sourceName:'NASA · Galaxies',sourceUrl:'https://science.nasa.gov/universe/galaxies/',
  pt:'Vamos viajar. Começamos numa galáxia em espiral, uma representação da nossa Via Láctea. Cada grão de luz ajuda a desenhar a sua forma.',
  en:'Let us travel. We begin in a spiral galaxy, an illustration of our Milky Way. Each grain of light helps reveal its form.'},
 earth:{scene:'planet',title:'Earth',sourceName:'NASA · Earth',sourceUrl:'https://science.nasa.gov/earth/',
  pt:'Regressamos à Terra. A rotação revela lentamente o nosso planeta. Agora, vamos mudar de escala: do mundo que habitamos para a estrutura da vida.',
  en:'We return to Earth. Its rotation slowly reveals our planet. Now we change scale: from the world we inhabit to the structure of life.'}
};
const patterns=[['blackhole',/\b(?:buraco negro|black hole)\b/],['aurora',/\b(?:aurora(?: boreal| austral)?|northern lights|southern lights)\b/],['dna',/\b(?:dna|adn|dupla helice|double helix)\b/],['atom',/\b(?:atomos?|atoms?|hidrogenio|hydrogen|nuvem eletronica|electron cloud|orbital 1s)\b/]];
export function discoveryIntent(text){
 const t=fold(text).trim().replace(/[.!?]+$/,'');
 if(/\b(?:fotografias?|fotos?|photos?|images?|imagens?|pesquisa|research|procura|search)\b/.test(t))return null;
 const language=/\b(?:surpreende|surpreenda|leva|viaja|vamos|viagem|mostra|explica|atomo|atomos|buraco|adn|helice|hidrogenio|invisivel|quero|podes|futuro)\b/.test(t)?'pt':'en';
 const tour=/^(?:surpreende-me|surpreende me|surpreende|surprise me|leva-me ao futuro|leva me ao futuro|vamos viajar|viaja comigo|take me to the future|take me on a journey|explora o invisivel|explore the invisible)$/.test(t);
 if(tour){const ids=/invisivel|invisible/.test(t)?['dna','atom']:['galaxy','blackhole','earth','aurora','dna','atom'];return {type:'discovery',language,ids};}
 const match=patterns.find(([,re])=>re.test(t));if(!match)return null;
 if(!/\b(?:mostra|ver|cria|projeta|imagina|explica|show|see|create|explain|visualise|visualize)\b/.test(t)&&t.split(/\s+/).length>3)return null;
 const id=match[0];
 // A named element must never be silently replaced with hydrogen.
 if(id==='atom'){
  const detail=t.replace(/\b(?:mostra|mostrar|show|me|um|uma|o|a|an|the|of|de|do|atomo|atomos|atom|atoms|hidrogenio|hydrogen|explica|explain|ver|see|cria|create|projeta|project|imagina|imagine|em|in|3d|nuvem|eletronica|electron|cloud|orbital|1s)\b/g,'').replace(/[\s-]/g,'');
  if(detail)return null;
 }
 if(/\b(?:explica|explain)\b/.test(t))return {type:'discovery',language,ids:[id]};
 return {type:'scene',scene:'science',title:discoveries[id].title,language,explain:false};
}
export function discoveryChapters(ids,language='en'){
 return ids.filter(id=>Object.hasOwn(discoveries,id)).slice(0,6).map(id=>{
  const entry=discoveries[id];return {id,scene:entry.scene,title:entry.title,text:entry[language==='pt'?'pt':'en'],sourceName:entry.sourceName,sourceUrl:entry.sourceUrl};
 });
}
export function scienceReference(title){return Object.values(discoveries).find(x=>x.title===title)||null;}

// One prepared chapter ahead, bounded to the current session. Scenes change
// only when their own audio is ready. Rejected prefetches never leak promises.
export async function playDiscovery(chapters,{prepare,present,play,valid,finish}){
 const load=chapter=>Promise.resolve().then(()=>valid()?prepare(chapter):null).then(audio=>({audio}),error=>({error}));
 let pending=load(chapters[0]);
 for(let i=0;i<chapters.length;i++){
  const result=await pending;if(!valid())return false;if(result.error)throw result.error;
  if(i+1<chapters.length)pending=load(chapters[i+1]);
  present(chapters[i],i,chapters.length);
  await play(result.audio,chapters[i]);if(!valid())return false;
 }
 finish();return true;
}
