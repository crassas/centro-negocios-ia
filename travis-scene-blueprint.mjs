// Data-only scene construction. No generated JavaScript, URLs, or unbounded meshes.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const definitions=[
 ['Earth','Terra',/\b(?:earth|terra)\b/],['Moon','Lua',/\b(?:moon|lua)\b/],['Mars','Marte',/\b(?:mars|marte)\b/],
 ['Sun','Sol',/\b(?:sun|sol)\b/],['Jupiter','Júpiter',/\bjupiter\b/],['Saturn','Saturno',/\b(?:saturn|saturno)\b/],
 ['Venus','Vénus',/\bvenus\b/],['Mercury','Mercúrio',/\b(?:mercury|mercurio)\b/],['Uranus','Urano',/\b(?:uranus|urano)\b/],['Neptune','Neptuno',/\b(?:neptune|neptuno)\b/],
 ['Meteor','Meteoroide',/\b(?:meteorit[oa]s?|meteoroides?|meteoros?|meteoroids?|meteorites?|meteors?|asteroides?|asteroids?)\b/],
 ['Comet','Cometa',/\b(?:cometas?|comets?)\b/],['Satellite','Satélite',/\b(?:satelites?|satellites?)\b/],['Rocket','Foguetão',/\b(?:foguet(?:ao|oes|es?)|rockets?|spacecraft|naves?)\b/],
 ['House','Casa',/\b(?:casas?|houses?)\b/],['Tree','Árvore',/\b(?:arvores?|trees?)\b/],['Mountain','Montanha',/\b(?:montanhas?|mountains?)\b/],
 ['Motor','Motor',/\b(?:motor(?:es)?|engines?)\b/],['DNA','ADN',/\b(?:dna|adn)\b/],['Hydrogen','Hidrogénio',/\b(?:hidrogenio|hydrogen)\b/],
 ['rain','Chuva',/\b(?:chuva|chover|rain)\b/],['snow','Neve',/\b(?:neve|snow)\b/],['clouds','Nuvens',/\b(?:nuvens|nuvem|clouds?)\b/],
 ['fire','Fogo',/\b(?:fogo|fire)\b/],['ocean','Oceano',/\b(?:oceano|ondas|ocean|waves)\b/],['Aurora','Aurora',/\baurora\b/],
 ['Cube','Cubo',/\b(?:cubos?|cubes?)\b/],['Sphere','Esfera',/\b(?:esferas?|spheres?)\b/],['Pyramid','Pirâmide',/\b(?:piramides?|pyramids?)\b/]
];
export const SCENE_ASSETS=Object.freeze(definitions.map(([asset,pt])=>Object.freeze({asset,pt})));
export const SPACE_ASSETS=Object.freeze(definitions.slice(0,14).map(([asset])=>asset));
export function sceneAsset(text){return definitions.find(([asset,,re])=>fold(text)===fold(asset)||re.test(fold(text)))?.[0]||null;}
export function sceneLabel(asset,language='pt'){const d=definitions.find(x=>x[0]===asset);return language==='pt'?d?.[1]||asset:asset;}
export function validateScenePlan(value){
 if(!value||value.version!==1||!['space','studio','earth'].includes(value.environment)||!['flyby','orbit','tableau'].includes(value.layout)||!Array.isArray(value.nodes)||!value.nodes.length||value.nodes.length>8)return null;
 const ids=new Set(),nodes=[];
 for(const n of value.nodes){
  if(!n||!SCENE_ASSETS.some(x=>x.asset===n.asset)||typeof n.id!=='string'||!/^[-a-z0-9]{1,32}$/i.test(n.id)||ids.has(n.id)||!Number.isFinite(n.scale)||n.scale<.15||n.scale>1.6||!Array.isArray(n.position)||n.position.length!==3||n.position.some(x=>!Number.isFinite(x)||Math.abs(x)>3))return null;
  ids.add(n.id);nodes.push({id:n.id,asset:n.asset,scale:n.scale,position:[...n.position]});
 }
 return {version:1,environment:value.environment,layout:value.layout,duration:24,nodes};
}
export function makeScenePlan(assets,{layout=null}={}){
 const space=assets.every(x=>SPACE_ASSETS.includes(x)),flyby=space&&assets.some(x=>['Meteor','Comet'].includes(x))&&assets.some(x=>['Earth','Mars','Moon','Jupiter','Sun'].includes(x));
 const resolved=layout||(flyby?'flyby':space&&assets.length>1?'orbit':'tableau');
 const ground=assets.some(x=>['House','Tree','Mountain'].includes(x));
 const nodes=assets.slice(0,8).map((asset,i)=>{
  let scale=assets.length===1?1:.72,position=assets.length>3?[(i%3-1)*1.12,(1-Math.floor(i/3))*.95,0]:[(i-(assets.length-1)/2)*1.08,0,0];
  if(space){
   if(i===0){scale=.92;position=[0,0,0];}
   else{scale=asset==='Moon'?.24:asset==='Satellite'?.25:['Meteor','Comet'].includes(asset)?.23:.34;const a=i*2.39996;position=[Math.cos(a)*1.45,Math.sin(a)*1.05,.12];}
  }else if(ground){
   if(asset==='House'){scale=.95;position=[-.35,-.17,0];}
   if(asset==='Tree'){scale=.7;position=[1.05,-.30,-.2];}
   if(asset==='Mountain'){scale=.95;position=[.2,.08,-.9];}
   if(['rain','snow','clouds','Aurora'].includes(asset)){scale=1.5;position=[0,.10,.05];}
  }
  return {id:asset.toLowerCase()+'-'+i,asset,scale,position};
 });
 return validateScenePlan({version:1,environment:space?'space':ground?'earth':'studio',layout:resolved,nodes});
}
export function compositionIntent(text,{plan=null}={}){
 const t=fold(text).trim();
 if(t.length>650||/^(?:nao|nunca|don't|do not|escreve|write)\b/.test(t)||/\b(?:fotos?|fotografias?|photos?|photographs?|imagens? reais|real images?)\b/.test(t))return null;
 if(/\b(?:tarefas?|tasks?|emails?|ficheiros?|files?|repositorios?|repositories|lembretes?|reminders?)\b/.test(t))return null;
 const language=/\b(?:mostra|faz|montanha|constroi|construir|cria|faz|adiciona|acrescenta|junta|tira|retira|terra|lua|meteoroide|meteorito|cometa|arvore|casa)\b/.test(t)?'pt':'en';
 const matches=definitions.map(([asset,,re])=>({asset,match:t.match(re)})).filter(x=>x.match).sort((a,b)=>a.match.index-b.match.index);
 let assets=[...new Set(matches.map(x=>x.asset))];
 const editing=/^(?:adiciona|acrescenta|junta|poe|coloca|tira|retira|remove|add|put|include)\b/.test(t);
 const old=validateScenePlan(plan);
 if(editing&&old){
  if(!assets.length)return /\b(?:tarefa|task|email|ficheiro|file|repositorio|repository|lembrete|reminder)\b/.test(t)?null:{type:'composition-error',language,reason:'unknown'};
  const remove=/^(?:tira|retira|remove)\b/.test(t);
  if(remove){const nodes=old.nodes.filter(n=>!assets.includes(n.asset));if(!nodes.length)return {type:'dismiss',language};if(nodes.length===old.nodes.length)return {type:'composition-error',language,reason:'missing'};plan=validateScenePlan({...makeScenePlan(nodes.map(n=>n.asset)),nodes});}
  else{
   const extra=assets.filter(a=>!old.nodes.some(n=>n.asset===a));
   if(old.nodes.length+extra.length>8)return {type:'composition-error',language,reason:'limit'};
   const draft=makeScenePlan([...old.nodes.map(n=>n.asset),...extra]);
   // Preserve deliberate placements for existing objects while adding new ones.
   plan=validateScenePlan({...draft,nodes:draft.nodes.map(n=>old.nodes.find(o=>o.asset===n.asset)||n)});
  }
 }else{
  if(!/\b(?:mostra|cria|constroi|construir|faz|imagina|simula|explica|show|build|construct|create|imagine|simulate|explain)\b/.test(t))return null;
  // Never silently drop an unknown requested object from a mixed composition.
  const clauses=t.split(/\b(?:com|with|junto a|junto da|junto de|beside|and (?:a|an|the)|e (?:um|uma|o|a))\b/).map(x=>x.trim()).filter(Boolean);
  if(clauses.length>1&&clauses.some(c=>!definitions.some(([, ,re])=>re.test(c))&&!/^(?:detalhes?|pormenor|cores?|particulas?|animacao|detail|colou?rs?|particles?|animation|3d)\b/.test(c)))return null;
  // Preserve the dedicated narrated orbital-transfer path.
  if(assets.includes('Rocket')&&assets.some(a=>['Moon','Mars'].includes(a))&&!/\b(?:junto|lado|cena|composicao|together|beside|scene|composition)\b/.test(t))return null;
  if(assets.length<2&&!assets.some(a=>['Meteor','Comet','Satellite','Tree'].includes(a))&&!(/\b(?:constroi|construir|build|construct)\b/.test(t)&&assets.length))return null;
  if(assets.length>8)return {type:'composition-error',language,reason:'limit'};
  // A flyby centres the named major body, irrespective of sentence order.
  if(assets.some(a=>['Meteor','Comet','Satellite'].includes(a))){const central=assets.find(a=>['Earth','Mars','Moon','Jupiter','Sun'].includes(a));if(central)assets=[central,...assets.filter(a=>a!==central)];}
  if(/\b(?:impacto|colisao|atinge|atingir|colide|colidir|bater|impact|collision|crash|hits?)\b/.test(t)&&assets.includes('Meteor'))return {type:'composition-error',language,reason:'impact'};
  plan=makeScenePlan(assets,{layout:/\b(?:lado|junto|beside|side by side|together)\b/.test(t)?'tableau':null});
 }
 if(!plan)return null;
 // Relative placement is local to the mentioned object, never executable code.
 const target=matches.at(-1)?.asset;
 const placed=plan.nodes.map(n=>{
  if(n.asset!==target)return n;
  const position=[...n.position];let scale=n.scale;
  if(/\b(?:a esquerda|on the left|to the left)\b/.test(t))position[0]=-1.25;
  if(/\b(?:a direita|on the right|to the right)\b/.test(t))position[0]=1.25;
  if(/\b(?:atras|behind)\b/.test(t))position[2]=-.85;
  if(/\b(?:pequeno|pequena|small|smaller)\b/.test(t))scale=Math.max(.15,scale*.65);
  if(/\b(?:grande|maior|large|bigger)\b/.test(t))scale=Math.min(1.6,scale*1.25);
  return {...n,position,scale};
 });
 plan=validateScenePlan({...plan,nodes:placed});
 return {type:'scene',scene:'composition',title:plan.nodes.map(n=>sceneLabel(n.asset,language)).join(' · '),plan,language,schematic:true,autoReturn:true,explain:/\b(?:explica|explain|como|how)\b/.test(t),edit:editing&&Boolean(old)};
}
// Open curved illustration, not an orbit prediction. Clearance stays
// outside the depicted surface; no atmospheric flame for a vacuum flyby.
export function flybyPosition(progress,clearance=.92){const x=(Math.max(0,Math.min(1,progress))-.5)*3.8;return [x,clearance+.14*x*x,.20];}
