// English conversational commands for temporary holographic projections.
// Unknown commands pass unchanged to the real Travis tool router.
const norm=text=>String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/^(?:hey |hello |okay |ok )?(?:travis|jarvis)[ ,:;!]*/,'')
 .replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
const lead=/^(?:(?:hey|please|can you|could you|would you|will you|i want you to|i'd like you to)\s+)*\s*/;
const display=/\b(?:show(?: me| us)?|bring up|pull up|bring out|display|project|render|visualize|visualise|let me see|i want to see|i'd like to see|can i see|could you show|give me a view of|switch to|change to|transform into|turn (?:this|that|it) into|reveal|load up|put (?:it|that) on screen)\b/;
const categories=[
 ['planet',/\b(?:planet|planets|solar system|galaxy|globe|mercury|venus|earth|mars|jupiter|saturn|uranus|neptune|pluto|moon|sun)\b/],
 ['map',/\b(?:map|maps|route|routes|city map|street map|geography|location map)\b/],
 ['house',/\b(?:house|home|building|apartment|floor ?plan|property|architecture|blueprint|room layout)\b/],
 ['person',/\b(?:person|people|human figure|silhouette|portrait|body model|avatar|character|bust)\b/],
 ['object',/\b(?:object|product|item|3d model|model of|wireframe|prototype)\b/]
];
const notConcept=/\b(?:youtube|website|webpage|browser|facebook|instagram|github|google earth|my (?:face|skin)|what do you see|camera|webcam)\b/;
const commands=[
 ['dismiss',/^(?:go back(?: to (?:travis|core|normal|main view))?|back to (?:travis|core|normal|the main view)|return to (?:travis|core|normal|main view)|restore (?:the )?(?:main|original|normal) view|close (?:it|that|this|the (?:view|projection|panel|hologram))|dismiss (?:it|that|this)|hide (?:it|that|this|the projection)|put (?:it|that|this) away|clear (?:it|that|this|the projection|the screen)|reset (?:the )?(?:scene|view)|cancel (?:the )?projection|take (?:it|this|that) (?:off|away))$/],
 ['pin',/^(?:keep (?:this|it|that)(?: open| up| on screen)?|leave (?:it|this|that) (?:up|open|there)|pin (?:this|it|that)(?: view)?|hold (?:this|it|that)(?: view)?|keep showing (?:it|this)|don't close (?:it|this))$/],
 ['unpin',/^(?:unpin|release|let it close|auto close|auto return|resume automatic return|don't pin|do not pin)(?: (?:it|this|the view))?$/],
 ['zoom-in',/^(?:zoom in|closer|move closer|bring it closer|enlarge(?: it)?|make (?:it|that|this) bigger|increase (?:the )?size|magnify(?: it)?|scale (?:it )?up)(?: (?:a bit|some more))?$/],
 ['zoom-out',/^(?:zoom out|pull back|move back|make (?:it|that|this) smaller|shrink(?: it)?|minimi[sz]e(?: it)?|scale (?:it )?down)(?: (?:a bit|some more))?$/],
 ['rotate-right',/^(?:rotate (?:it|that|this|the (?:view|model))|spin (?:it|that|this)|turn (?:it|that|this)(?: around)?|rotate right|turn right|spin right)$/],
 ['rotate-left',/^(?:rotate left|turn left|spin left)$/],
 ['move-left',/^(?:move (?:it|that|this) left|pan left|shift left)$/],
 ['move-right',/^(?:move (?:it|that|this) right|pan right|shift right)$/],
 ['move-up',/^(?:move (?:it|that|this) up|pan up|shift up)$/],
 ['move-down',/^(?:move (?:it|that|this) down|pan down|shift down)$/],
 ['reset-view',/^(?:cent(?:er|re) (?:it|that|this|the view)|reset zoom|reset rotation|reset position|default view|put it back in the middle)$/],
 ['next',/^(?:next|next one|show (?:me )?the next (?:one|result|view)|switch to the next one)$/],
 ['previous',/^(?:previous|previous one|last one|go to the previous (?:one|result|view)|show the previous one)$/]
];
export function parseEnglishProjection(text,{active=false,kind=''}={}){
 const raw=norm(text);
 if(!raw||raw.length>450||/^(?:don't|do not|never|stop me from|not now)\b/.test(raw))return null;
 const phrase=raw.replace(lead,'').replace(/\s+please$/,'');
 if(active){
  for(const [action,pattern] of commands){
   if(pattern.test(phrase)&&!(kind==='youtube'&&['next','previous'].includes(action)))
    return {type:action==='pin'||action==='unpin'||action==='dismiss'?action:'control',action};
  }
 }
 if(notConcept.test(phrase)||!display.test(phrase))return null;
 const chosen=categories.find(([_,pattern])=>pattern.test(phrase));
 if(!chosen)return null;
 const [scene]=chosen;
 const title=phrase.replace(display,'').replace(/^(?:me\s+)?(?:a |an |the |of |for |in |around |at |to )*/,'')
  .replace(/\b(?:in|as) (?:a )?(?:3d|holographic|hologram|wireframe) (?:view|model|projection)?$/,'')
  .replace(/\b(?:please|for me|right now)\s*$/,'').slice(0,100).trim();
 return {type:'scene',scene,title:title||({planet:'Planetary system',map:'Location map',house:'Architectural model',person:'Human figure',object:'3D object'}[scene]),autoReturn:true};
}
export function rewriteEnglishToolRequest(text){
 const raw=norm(text).replace(lead,'').replace(/\s+please$/,'');
 if(!raw||raw.length>450)return text;
 if(/^(?:(?:open|bring up|pull up|take me to|launch|display|show|show me|switch to|go to|load|visit)(?: the)? )?youtube(?: for me| now)?$/.test(raw))return 'Open YouTube';
 if(/^(?:(?:close|shut|exit|leave|hide|dismiss)(?: the)? )youtube$/.test(raw))return 'Close YouTube';
 const video=raw.match(/^(?:find|search for|look up|show me|pull up|bring up) (?:some )?(?:youtube )?videos? (?:on|about|of|for) (.{1,230})$/);
 if(video)return 'Search YouTube '+video[1];
 if(/^(?:open|bring up|pull up|take me to|launch|display|show|show me|switch to|go to|load|visit)(?: the)? google$/.test(raw))return 'Open Google';
 if(/^(?:(?:show|bring up|pull up|display|list)(?: me)? )?(?:my|our|the) (?:tasks|to-?do(?: list)?)$/.test(raw))return 'Show my tasks';
 if(/^(?:show|bring up|pull up|check|display|list)(?: me)? (?:my|our|the) (?:sites|websites|published websites)$/.test(raw))return 'Check the sites';
 const web=raw.match(/^(?:look up|search the web for|search for|find information about) (.{1,230})$/);
 if(web)return 'Search the web for '+web[1];
 return text;
}
