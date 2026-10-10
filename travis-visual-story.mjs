// Audio-clock cues: noun positions approximate section timing, never claim
// phoneme alignment. Source audio completion remains authoritative.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const topics=[
 ['science','Black hole',/\b(?:black hole|buraco negro)\b/g],
 ['science','Aurora',/\b(?:aurora|northern lights)\b/g],
 ['weather','rain',/\b(?:chuva|chover|rain|rainfall)\b/g],
 ['weather','snow',/\b(?:neve|snow)\b/g],
 ['weather','fire',/\b(?:fogo|chama|fire|flames)\b/g],
 ['weather','ocean',/\b(?:oceano|ondas|ocean|waves)\b/g],
 ['mechanical','Electric motor',/\b(?:electric motor|motor eletrico|rotor|estator|stator)\b/g],
 ['space','Space',/\b(?:space|espaco|galaxy|galaxia|universe|universo)\b/g],
 ['planet','Solar system',/\b(?:solar system|sistema solar)\b/g],
 ...Object.entries({Mercury:'mercury|mercurio',Venus:'venus',Earth:'earth|terra',Mars:'mars|marte',Jupiter:'jupiter',Saturn:'saturn|saturno',Uranus:'uranus|urano',Neptune:'neptune|neptuno',Moon:'moon|lua',Sun:'sun|sol'}).map(([name,terms])=>['planet',name,new RegExp('\\b(?:'+terms+')\\b','g')]),
 ['science','DNA',/\b(?:dna|adn|double helix|dupla helice)\b/g],
 ['science','Hydrogen',/\b(?:atom|atoms|atomo|atomos)\b/g],
 ['house','House',/\b(?:house|houses|casa|casas)\b/g],
 ['vehicle','Car',/\b(?:car|cars|carro|carros)\b/g]
];
export function buildNarrationCues(text,initial=null){
 const raw=fold(text),hits=[];
 for(const [scene,title,re] of topics){re.lastIndex=0;let m;while((m=re.exec(raw)))hits.push({scene,title,index:m.index});}
 hits.sort((a,b)=>a.index-b.index);
 const cues=initial?[{scene:initial.scene,title:initial.title,at:0}]:[];
 for(const hit of hits){
  if(cues.at(-1)?.title===hit.title)continue;
  if(cues.some(c=>c.title===hit.title))continue;
  const at=Math.min(.88,hit.index/Math.max(raw.length,1));
  if(cues.length&&at-cues.at(-1).at<.08){if(at<.10&&cues.length===1&&initial?.scene==='planet')continue;}
  cues.push({scene:hit.scene,title:hit.title,at});if(cues.length>=6)break;
 }
 // Keep the illustrated subject when no visual topic is recognised. Never
 // replace an explanation with arbitrary fragments of the spoken sentences.
 return cues.slice(0,6);
}
export function cueAtTime(cues,elapsed,duration){
 if(!Number.isFinite(elapsed)||!Number.isFinite(duration)||duration<=0||elapsed<0)return -1;
 let chosen=-1;for(let i=0;i<cues.length;i++)if(elapsed>=Math.max(cues[i].at*duration,i*2.1))chosen=i;
 return chosen;
}
export function hasLocalVisual(scene,title){
 const t=fold(title).replace(/[.!?]/g,'').trim();
 if(scene==='science')return /^(?:black hole|aurora|dna|hydrogen)$/.test(t);
 if(scene==='text')return true;
 if(scene==='journey')return /^(?:earth to mars|earth to moon)$/.test(t);
 if(scene==='weather')return /^(?:rain|storm|snow|fire|ocean|clouds|drop)$/.test(t);
 if(scene==='planet')return /\b(?:mercury|mercurio|venus|earth|terra|mars|marte|jupiter|saturn|saturno|uranus|urano|neptune|neptuno|pluto|plutao|moon|lua|sun|sol)\b/.test(t)||/^(?:planet|planeta|planets|planetas|planetary system|sistema solar|solar system)$/.test(t);
 if(scene==='space')return /^(?:space|espaco|universe|universo|galaxy|galaxia|cosmos|via lactea|milky way|stars|estrelas)$/.test(t);
 // People and anatomy require the reference-asset resolver, never primitives.
 const known={mechanical:/^(?:electric motor|motor elec?trico|motor|engine|rotor|estator|stator)$/,house:/^(?:house|casa|uma casa|architecture|arquitetura|moradia|modern house|casa moderna|moradia moderna|building|buildings|edificio|edificios|apartment building|predio)$/,
 vehicle:/^(?:car|carro|vehicle|veiculo|drone|rocket|foguetao|nave|spaceship)$/,
 landscape:/^(?:landscape|paisagem|forest|floresta|mountain|montanha)$/,
 diagram:/^(?:dna|adn|atom|atomo|diagram|diagrama|network|rede)$/,
 object:/^(?:cube|cubo|sphere|esfera|pyramid|piramide)$/};
 return Boolean(known[scene]?.test(t));
}
