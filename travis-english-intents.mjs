import {cinematicIntent} from './travis-scene-planner.mjs?v=cinematic-1';
// Universal conversational projection intent for PT-PT and English.
// Explicitly requested conceptual imagery is routed to local particle shapes;
// unrecognised real-world facts and private data stay with the normal tools.
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// A pasted command may include the opening quotation mark from a suggested
// example. Remove only wrappers around the request, never quotes inside it:
// “Mostra um motor elétrico -> command; Escreve “motor elétrico” -> literal text.
const quoteEnds={'"':'"',"'":"'",'“':'“”','”':'“”','„':'„“”','«':'»','‘':'‘’','’':'‘’','`':'`'};
function requestText(value){
 let text=String(value??'').trim();
 for(let i=0;i<3&&quoteEnds[text[0]];i++){
  const ends=quoteEnds[text[0]];text=text.slice(1).trim();
  const tail=text.match(/(["'“”„«»‘’`])([.!?,;:]*)$/);
  if(tail&&ends.includes(tail[1]))text=(text.slice(0,tail.index)+tail[2]).trim();
 }
 return text;
}
const compact=s=>fold(requestText(s)).replace(/\s+/g,' ').trim()
 .replace(/^(?:(?:hey|hello|olha|okay|ok|bem|entao|well|please|por favor)[ ,:;.!-]+){0,4}/,'')
 .replace(/^(?:(?:travis|jarvis)[,:;.! ]+){0,2}/,'')
 .replace(/^(?:(?:olha|well|hey|please|por favor|entao|now|agora)[,:;.! ]+){0,4}/,'')
 .replace(/[.!?]+$/,'').trim()
 .replace(/(?:[,;:]?\s+)(?:por favor|se faz favor|please)$/,'')
 .replace(/[,;:.!?]+$/,'').trim();
const excludes=/\b(?:youtube|instagram|tiktok|facebook|google|github|reddit|website|webpage|browser|internet|email|emails|gmail|repository|repositories|repositorio|repositorios|file|ficheiro|document|documento|my camera|minha camara|camera feed|what do you see|o que ves|can you see me|consegues ver-me|my face|a minha cara|a minha pele|my skin|customer|cliente|bank|payment|pagamento|code|codigo|api|account|conta)\b/;
const negatives=/(?:^|\b)(?:nao|nunca|nem|sem|don't|do not|never|without)\s+(?:quero\s+|want\s+to\s+|show\s+|mostrar\s+|mostres\s+|ver\s+|veja\s+|display\s+|project\s+)?(?:ver|see|show|mostrar|mostres|project|projetar|visualizar|render)\b/;
const cue=/(?:\b(?:see|show|showing|visualize|visualise|project|display|render|imagine|picture|create|build|form|materialize|materialise|hologram|holographic|wireframe|3d|look at|pop up|appear|see what|look like|transform|morph|bring up|pull up|bring out|let me see|i feel like seeing|i fancy seeing|i'd love to see|i would like to see|i want to see|it would be nice to see|i'm curious to see|can we see|could we see|would you show|can you put|put.*in front of me)\b|\b(?:ver|vejo|veja|vermos|mostra|mostrar|mostre|projetar|projetes|projeta|projecao|visualizar|visualiza|imaginar|imagina|criar|cria|forma|aparecer|apareca|faz surgir|faz aparecer|faz-me ver|poe|podes por|coloca|consegues|transforma|transformes|transforma-te|apetece-me|apetecia-me|gostava de|queria|quero ver|deixa-me ver|consegues mostrar|traz-me|holograma|holografico|wireframe|modelo 3d)\b)/;
const directCue=/(?:\b(?:show|display|project|render|visualize|visualise|bring up|pull up|show me|let me see|i feel like seeing|i fancy seeing|i want to see|i'd love to see|i would love to see|i would like to see|please show|can you show|could you show|would you show|make.*appear|turn (?:that|it|this) into|transform.*into)\b|\b(?:mostra|mostrar|mostre|projetar|projeta|visualizar|visualiza|faz surgir|faz aparecer|quero ver|gostava de ver|apetece-me ver|apetecia-me ver|deixa-me ver|podes mostrar|consegues mostrar|consegues por|podes por|poe-me|por.*a minha frente|transforma-te em|traz-me|coloca-me)\b)/;
const visualSpecific=/\b(?:holographic|hologram|3d|wireframe|em holograma|holografico|em 3d|em particulas|nas particulas|transforma-te|transform yourself|turn into|morph into)\b/;
const verbsNoun=/^(?:(?:i(?:'d| would)?|i am|i'm|eu|nos)\s+)?(?:feel like|fancy|wish|would love|want|queria|gostava|apetece(?:-me)?|apetecia(?:-me)?|desejava)\s+/;
const categories=[
 ['text',/\b(?:letters?|letras?|alphabet|alfabeto|word|words|palavra|palavras|texto|text|escreve|write|numero|numeros|numbers?)\b/],
 ['space',/\b(?:space|espaco|galaxy|galaxia|universe|universo|cosmos|via lactea|milky way)\b/],
 ['planet',/(?:\b(?:planet|planets|planetary|solar system|solar|sistema solar|planeta|planetas|estrela|estrela polar|star|stars|galaxy|galaxia|universo|universe|mercury|mercurio|venus|earth|terra|mars|marte|jupiter|saturn|saturno|uranus|urano|neptune|neptuno|neptun[oae]|pluto|plutao|moon|lua|sun|sol|asteroid|asteroide|comet|cometa)\b)/],
 ['map',/\b(?:map|maps|mapa|mapas|routes?|rotas?|rua|avenida|road|street|city|cidade|town|village|aldeia|pais|country|countries|world map|geografia|geography|globo terrestre|google maps|porto|lisboa|lisbon|paris|london|londres|tokyo|toquio|new york|coimbra|campanha|gaia)\b/],
 ['house',/\b(?:house|houses|home|apartment|apartamento|building|buildings|edificio|edificios|casa|casas|moradia|palacio|palace|castle|castelo|architecture|arquitetura|blueprint|planta|floor plan|floorplan|arranha-ceus|skyscraper|room|sala|quarto|kitchen|cozinha|bedroom|fachada|facade|armazem|warehouse|bridge|ponte|temple|templo)\b/],
 ['mechanical',/\b(?:electric motor|motor eletrico|motor|engine|rotor|stator|estator)\b/],
 ['vehicle',/\b(?:car|cars|carro|carros|automovel|vehicle|veiculo|moto|motorcycle|camiao|truck|van|carrinha|bicycle|bicicleta|airplane|aviao|helicopter|helicoptero|spaceship|spacecraft|nave|foguetao|rocket|train|comboio|ship|barco|boat|drone|robot|robo|mecha|jet|satellite|satelite)\b/],
 ['person',/\b(?:person|people|human|humano|humana|pessoa|pessoas|corpo|body|human body|face|rosto|figura humana|silhouette|silhueta|portrait|retrato|bust|busto|anatomy|anatomia|skeleton|esqueleto|muscle|musculo|heart|coracao|brain|cerebro|alien|extraterrestre)\b/],
 ['landscape',/\b(?:landscape|paisagem|forest|floresta|tree|arvore|plant|planta|flower|flor|mountain|montanha|beach|praia|sea|ocean|oceano|waterfall|cascata|river|rio|desert|deserto|nature|natureza|volcano|vulcao|island|ilha|garden|jardim|cave|gruta|clouds|nuvens|animals?|animais?|dog|cao|cat|gato|dragon|dragao|dinossauro|dinosaur)\b/],
 ['diagram',/\b(?:diagram|diagrama|flowchart|fluxograma|network|rede|schema|esquema|molecule|molecula|dna|adn|cell|celula|atom|atomo|timeline|linha temporal|graph|grafico|circuit|circuito|algorithm|algoritmo|system|sistema|process|processo)\b/],
 ['object',/\b(?:object|objects|objeto|objetos|product|produto|item|items|model|modelo|cube|cubo|sphere|esfera|pyramid|piramide|phone|telemovel|telephone|telefone|book|livro|chair|cadeira|table|mesa|lamp|candeeiro|sculpture|escultura|sword|espada|tool|ferramenta|watch|relogio|camera|machine|maquina|key|chave|furniture|mobília|furniture)\b/]
];
const baseNames={mechanical:'Electric motor',text:'ABC',space:'Space',planet:'Planetary system',map:'Schematic map',house:'Architecture',person:'Human figure',vehicle:'Vehicle',landscape:'Landscape',diagram:'Diagram',object:'Object'};
const namedPlanets=new Map(Object.entries({mercurio:'Mercury',venus:'Venus',terra:'Earth',marte:'Mars',jupiter:'Jupiter',saturno:'Saturn',urano:'Uranus',neptuno:'Neptune',plutao:'Pluto',lua:'Moon',sol:'Sun'}));
const asTitle=(raw,scene)=>{
 if(scene==='planet'){
  const planets={mars:'Mars',marte:'Mars',mercury:'Mercury',mercurio:'Mercury',
   venus:'Venus',earth:'Earth',terra:'Earth',jupiter:'Jupiter',saturn:'Saturn',
   saturno:'Saturn',uranus:'Uranus',urano:'Uranus',neptune:'Neptune',neptuno:'Neptune',
   pluto:'Pluto',plutao:'Pluto',moon:'Moon',lua:'Moon',sun:'Sun',sol:'Sun'};
  for(const [key,name] of Object.entries(planets)){
   if(new RegExp('\\b'+key+'\\b').test(raw))return name;
  }
 }
 let cleaned=raw.replace(/^(?:explain|explain to me|explica(?:-me)?|explicar|ensina(?:-me)?|how does|como funciona|como se forma)\s+/,'').replace(/^(?:hey |hello |olha |please |por favor )?(?:travis|jarvis)[,\s]*/,'')
  .replace(/^(?:(?:i(?:'d| would)?|i am|i'm|eu|nos)\s+)?(?:feel like|fancy|wish|would love|want|queria|gostava|apetece(?:-me)?|apetecia(?:-me)?|desejava)\s+/,'')
  .replace(/^(?:can you|could you|would you|please|podes|podias|consegues|queria|gostava de|i want to|i'd like to|i would like to|quero|apetece-me|apetecia-me)\s+/,'')
  .replace(/^(?:me |to |a |um |uma |o |a |the )*/,'')
  .replace(/^(?:see|show|showing|seeing|look at|view|watch|visualize|visualise|project|display|render|imagine|create|form|materialize|materialise|transform|ver|veja|mostrar(?:-me)?|mostra|mostra-me|projeta|projetar|visualiza|imagina|cria|faz aparecer|faz surgir|deixa-me ver|deixa-me|poe-me|bring up|pull up|put|por|find|search for|procura|pesquisa|arranja)\s+/,'')
  .replace(/^(?:change to|switch to|what about|how about|e agora|agora|and now|now|que tal|muda para|troca para|passa para)\s+/,'')
  .replace(/^(?:me |of |um |uma |the |a |an |o |a |ao |da |de |do |em |no |na )+/,'')
  .replace(/\b(?:holographic|hologram|em holograma|holografico|as a hologram|in 3d|em 3d|por favor|please|right now|agora|in front of me)\b/g,'')
  .replace(/\s+/g,' ').trim().replace(/^[,;:!?]+|[,;:!?]+$/g,'').trim();
 if(scene==='mechanical'&&/^(?:motor(?: elec?trico)?|(?:electric )?(?:motor|engine))$/.test(cleaned))return 'Electric motor';
 for(const [pt,en] of namedPlanets.entries())cleaned=cleaned.replace(new RegExp('\\b'+pt+'\\b','g'),en);
 return (cleaned.replace(/^(?:a|an|the|um|uma|o|as|os)\s+/,'').slice(0,100)||baseNames[scene]).replace(/^./,c=>c.toUpperCase());
};
const controlRules=[
 ['explode',/^(?:separa (?:as )?pecas|abre (?:o )?motor|vista explodida|explode(?: the engine| it)?|separate (?:the )?parts|exploded view)$/],
 ['assemble',/^(?:junta (?:as )?pecas|monta(?: o motor| outra vez)?|volta a montar|assemble(?: it| the engine)?|reassemble)$/],
 ['dismiss',/^(?:(?:can|could|would) you )?(?:close (?:it|that|this|the (?:view|projection|panel|hologram))|dismiss (?:it|that|this)|hide (?:it|that|this|the projection)|clear (?:the screen|it|this|that)|go back|back to (?:core|travis|normal|the main view)|return to (?:core|travis|normal|main view)|restore (?:the )?(?:original|main|normal) view|volta (?:ao )?(?:travis|normal|inicio|nucleo)?|regressa (?:ao )?(?:travis|nucleo)?|fecha (?:isso|isto|a projecao|o holograma)|limpa (?:o ecra|isso)|desfaz(?: a projecao)?|voltar ao nucleo)$/],
 ['pin',/^(?:keep (?:this|it|that)(?: open| up)?|pin (?:this|it|that)|leave (?:it|that|this) (?:there|open)|hold (?:this|that) view|mantem (?:isso|isto|a projecao)(?: aberto)?|mantem aberto|deixa (?:isso|isto|aberto|ai)|fixa(?: isso| isto| o holograma)?)$/],
 ['unpin',/^(?:unpin(?: it)?|auto return|let it close|resume automatic return|desafixa(?: isso| isto)?|podes fechar automaticamente|retoma o regresso automatico)$/],
 ['zoom-in',/^(?:zoom in|closer|bring it closer|make (?:it|that) bigger|enlarge(?: it)?|aproxima(?:-o|-me)?|amplia(?: isso| isto)?|aumenta(?: isso| isto)?|mais perto)$/],
 ['zoom-out',/^(?:zoom out|pull back|make (?:it|that) smaller|afasta(?:-o)?|diminui(?: isso| isto)?|mais longe)$/],
 ['rotate-right',/^(?:rotate (?:it|that|this)|spin (?:it|that)|turn (?:it|that) around|rotate right|turn right|roda(?: isso| isto)?|gira(?: isso| isto)?|roda para a direita)$/],
 ['rotate-left',/^(?:rotate left|turn left|roda para a esquerda|gira para a esquerda)$/],
 ['move-left',/^(?:move (?:it|that) left|pan left|move left|move-o para a esquerda|move para a esquerda)$/],
 ['move-right',/^(?:move (?:it|that) right|pan right|move right|move para a direita)$/],
 ['move-up',/^(?:move (?:it|that) up|pan up|move up|sobe(?: isso| isto)?|move para cima)$/],
 ['move-down',/^(?:move (?:it|that) down|pan down|move down|desce(?: isso| isto)?|move para baixo)$/],
 ['reset-view',/^(?:reset (?:the )?view|reset zoom|center it|centre it|repor vista|centra(?: isso| isto)?|recomeca a vista)$/],
 ['next',/^(?:next|next one|next image|next photo|another image|more images|show me (?:the next one|another image|more images)|proximo|seguinte|mais imagens|outra imagem|outra foto|proxima imagem|mostra (?:o proximo|outra imagem|mais imagens|a proxima imagem))$/],
 ['previous',/^(?:previous|previous one|previous image|previous photo|last one|anterior|imagem anterior|foto anterior|mostra (?:o anterior|a imagem anterior))$/]
];
const spokenPortuguese=t=>/\b(?:quero|queria|gostava|apetece|apetecia|ver|mostra|mostrar|faz|por|poe|poe-me|podes|consegues|casa|carro|mapa|cidade|saturno|marte|planeta|agora|deixa|esquerda|direita|mais|explica|explicar|ensina|escreve|espaco|letras|sol|terra|elec?trico)\b/.test(t);
export function parseVisualIntent(text,{active=false,kind=''}={}){
 const input=requestText(text),raw=compact(input);
 const literalRequest=/^(?:escreve|write)\s|^(?:mostra(?:-me)?|show(?: me)?|projeta)\s+(?:(?:as?|os?|the)\s+)?(?:letras?|letters?|palavras?|words?|texto|text|numeros?|numbers?)\b/.test(raw);
 if(raw.length<2||raw.length>650||!literalRequest&&(negatives.test(raw)||/^(?:don't|do not|never|nao|nunca)\b/.test(raw)))return null;
 if(/^(?:desliga|desativa|liga|ativa) (?:os )?(?:sons|efeitos sonoros)$|^(?:enable|disable|mute|unmute) (?:motion )?(?:sounds|sound effects)$/.test(raw))return {type:'sound',enabled:!(/^(?:desliga|desativa|disable|mute)\b/.test(raw)),language:/^(?:desliga|desativa|liga|ativa)/.test(raw)?'pt':'en'};
 if(active)for(const [action,re] of controlRules)if(re.test(raw) &&
   !(kind==='youtube'&&['next','previous'].includes(action)))
   return {type:action==='pin'||action==='unpin'||action==='dismiss'?action:'control',action};
 if(/^(?:show (?:me )?(?:you|yourself)|mostra(?:-me)? (?:a ti|quem es)|volta a ti)$/.test(raw))return {type:'dismiss',action:'dismiss'};
 if(!literalRequest&&excludes.test(raw))return null;
 if(!literalRequest){const cinematic=cinematicIntent(raw,{active});if(cinematic)return {...cinematic,referenceRequested:false,research:false,query:String(text)};}
 const request=cues=>cues.test(raw);
 const known=categories.find(([,re])=>re.test(raw));
 const followup=active&&kind==='illustration'&&Boolean(known)&&
    (/^(?:and|and now|now|what about|how about|switch to|change to|next show|e|e agora|agora|entao|que tal|muda para|troca para|passa para)\b/.test(raw)
     ||raw.split(' ').length<=4);
 const explain=!literalRequest&&/\b(?:explain|explica|explicar|ensina|teach|how does|como funciona|como se forma)\b/.test(raw);
 const referenceRequested=!literalRequest&&/\b(?:photos?|photographs?|pictures?|images?|fotos?|fotografias?|imagens?|references?|referencias?)\b/.test(raw)&&!/\b(?:imagina|imagine)\b/.test(raw);
 const research=!literalRequest&&/\b(?:pesquisa|research|search|procura)\b/.test(raw);
 const bare=/^(?:(?:o|a|the) )?(?:mercury|mercurio|venus|earth|terra|mars|marte|jupiter|saturn|saturno|uranus|urano|neptune|neptuno|sun|sol|moon|lua|space|espaco|universe|universo|galaxy|galaxia|letras|letters|alfabeto|alphabet|sistema solar|solar system|motor(?: elec?trico)?|electric motor)$/.test(fold(input).replace(/[.!?]+$/,'').trim());
 const visual=/^(?:escreve|write)\b/.test(raw)||explain||bare||(referenceRequested&&/\b(?:find|get|procura|pesquisa|arranja)\b/.test(raw))||(research&&Boolean(known))||directCue.test(raw)||visualSpecific.test(raw)||followup||
    (request(verbsNoun)&&request(cue)&&/\b(?:see|ver|mostrar|show|look|visualiz|projet|hologram)\b/.test(raw));
 if(!visual)return null;
 // The request is explicitly visual. Any unfamiliar subject can at least be
 // represented by a generically labelled local particle concept.
 const entry=categories.find(([,re])=>re.test(raw));
 const scene=entry?.[0]||'object';
 let title=asTitle(raw,scene);
 if(referenceRequested)title=title.replace(/^(?:(?:some|more|real|actual|umas?|algumas?|mais)\s+)*(?:photos?|photographs?|pictures?|images?|fotos?|fotografias?|imagens?|references?|referencias?)\s*(?:(?:of|about|de|da|do|das|dos|sobre)\s+)?(?:(?:a|an|the|uma?|o|a)\s+)?/i,'').trim()||title;
 if(scene==='text'){
  const quoted=input.match(/[\"“«]([^\"”»]{1,640})[\"”»]/);
  title=quoted?.[1]||input.replace(/^(?:escreve|write)\s+/i,'').replace(/^(?:(?:mostra|mostra-me|show me|show|write|escreve|projeta)\s+)?(?:(?:a|as|o|os|the|uma|umas)\s+)?(?:letters?|letras?|palavra|palavras|word|words|text|texto|numero|numeros|number|numbers)\s*/i,'').trim();
  if(!title||/^(?:alfabeto|alphabet|letras|letters)$/i.test(title))title='ABC';
 }
 return {type:'scene',scene,title,subject:title,explain,research,referenceRequested,query:String(text),
  autoReturn:true,source:'local-language-router',schematic:true,language:spokenPortuguese(fold(text))?'pt':'en'};
}
export const parseEnglishProjection=parseVisualIntent;
export function mayNeedVisualModel(text){
 const raw=compact(text);
 if(!raw||excludes.test(raw)||negatives.test(raw))return false;
 if(parseVisualIntent(text))return false;
 return /(imagina|imagine|i wonder what|how would .* look|como seria(?: .*?)? visualmente|como seria visualmente|como ficaria|i(?:'d| would) love (?:an|a) image|transforma-te|morph into|make it look like|draw me|faz uma imagem)/.test(raw);
}
export function rewriteEnglishToolRequest(text){
 const raw=compact(text).replace(/^(?:please|could you|can you|would you|will you|i'd like you to|i want you to)\s+/,'')
  .replace(/\s+please$/,'');
 if(!raw||raw.length>500)return text;
 if(/^(?:(?:open|bring up|pull up|take me to|launch|display|show|show me|switch to|go to|load|visit)(?: the)? )?youtube(?: for me| now)?$/.test(raw))return 'Open YouTube';
 if(/^(?:(?:close|shut|exit|leave|hide|dismiss)(?: the)? )youtube$/.test(raw))return 'Close YouTube';
 const video=raw.match(/^(?:find|search for|look up|show me|pull up|bring up) (?:(?:some|a|the) )?(?:youtube )?videos? (?:on|about|of|for) (.{1,230})$/);
 if(video)return 'Search YouTube '+video[1];
 if(/^(?:open|bring up|pull up|take me to|launch|display|show|show me|switch to|go to|load|visit)(?: the)? google$/.test(raw))return 'Open Google';
 if(/^(?:(?:show|bring up|pull up|display|list)(?: me)? )?(?:my|our|the) (?:tasks|to-?do(?: list)?)$/.test(raw))return 'Show my tasks';
 if(/^(?:show|bring up|pull up|check|display|list)(?: me)? (?:my|our|the) (?:sites|websites|published websites)$/.test(raw))return 'Check the sites';
 const web=raw.match(/^(?:look up|search the web for|search for|find information about) (.{1,230})$/);
 if(web)return 'Search the web for '+web[1];
 return text;
}
