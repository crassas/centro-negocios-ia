import {bodyNames} from './travis-scene-planner.mjs?v=cinematic-1';
import {createVisualSources} from './travis-visual-sources.mjs?v=sand-1';
// Front workspace driven by actual host tool results. Text is always inert.
import {MOTION,revealCaption,readingHold} from './travis-motion.mjs?v=motion-1';
import {decodeReferenceModel,disposeReferenceModel} from './travis-model-library.mjs?v=sand-1';
import {hologramPresentation as projection} from './travis-presence.mjs?v=motion-1';
import {mountYouTube,closeYouTube,controlYouTube,youtubeState} from './travis-youtube.mjs?v=3';
import {parseVisualIntent,rewriteEnglishToolRequest,mayNeedVisualModel} from './travis-english-intents.mjs?v=cinematic-1';
import {buildNarrationCues,cueAtTime,hasLocalVisual} from './travis-visual-story.mjs?v=cinematic-1';
const hud=document.getElementById('travis-hud');
const deck=document.getElementById('travis-action-deck');
const heading=document.getElementById('travis-action-heading');
const items=document.getElementById('travis-action-items');
let current=null,selected=null,frame=0,wasVisible=false,returnTimer=0,pinned=false,highlighted=0,renderVersion=0;
let narration=null,storyEpoch=0,wideScene=null,selectedVisual=null;
const caption=document.createElement('div');caption.className='travis-visual-caption';caption.hidden=true;hud?.append(caption);
const sources=createVisualSources(hud,{onInteract:touchProjection});
function cancelNarration(){narration=null;storyEpoch++;window.dispatchEvent(new CustomEvent('travis:visual-timeline',{detail:null}));}
function awaitReference(){cancelNarration();clearTimeout(returnTimer);returnTimer=0;renderVersion++;}
const planetSequence=['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'];
function canReturn(){
  if(!current||pinned||current.autoReturn===false)return false;
  return true;
}
function scheduleReturn(delay=13000){
  clearTimeout(returnTimer);returnTimer=0;
  if(!canReturn())return;
  returnTimer=setTimeout(()=>{
    if(!canReturn())return;
    if(youtubeState().playing || hud.dataset.state==='speaking'||hud.dataset.state==='thinking'){
      scheduleReturn(3200);return;
    }
    window.TravisVisual?.commands(false,{automatic:true});
  },Math.max(2200,delay));
}
function touchProjection(){if(current)scheduleReturn(16500);}
function updatePin(){
  hud.dataset.projectionPinned=String(pinned);
  heading.title=pinned?'Pinned until you dismiss it':'Returns to Travis automatically';
}
const schematic=(scene,title)=>{
  const names={weather:'WEATHER',journey:'SPACE JOURNEY',model:'3D MODEL',mechanical:'ELECTRIC MOTOR · CUTAWAY',text:'TEXT',space:'SPACE',reference:'VISUAL REFERENCE',planet:'PLANETARY CONCEPT',map:'SCHEMATIC MAP',house:'ARCHITECTURAL WIREFRAME',
    person:'HUMAN FIGURE CONCEPT',vehicle:'VEHICLE CONCEPT',landscape:'NATURE CONCEPT',
    diagram:'CONCEPT DIAGRAM',object:'OBJECT WIREFRAME'};
  const summaries={weather:'Procedural animated illustration of a natural phenomenon.',journey:'Illustrative orbital transfer; sizes and time are compressed. No launch dynamics, ephemerides or gravity assists are calculated.',model:'Sourced three-dimensional geometry with Travis holographic material.',mechanical:'Generic educational electric motor cutaway; not measured CAD.',text:'Letterforms made of holographic light.',space:'Illustrative star field, not a live sky chart.',reference:'Holographic relief from a sourced image; not a recovered 3D model.',planet:'Illustrative orbital model, not NASA imagery.',
    map:'Illustrative route grid, not live geography or verified coordinates.',
    house:'Conceptual building geometry, not a survey or architectural plan.',
    person:'Generic holographic figure, not a reconstruction of a real person.',
    vehicle:'Conceptual vehicle form; not a measured vehicle or CAD model.',
    landscape:'Illustrative landscape, not a georeferenced place.',
    diagram:'Conceptual arrangement; not a verified engineering diagram.',
    object:'Generic particle concept, not a scan of a physical object.'};
  const result={kind:'illustration',scene,title:String(title||names[scene]||'').slice(0,scene==='text'?650:110),
    summary:summaries[scene],autoReturn:true,items:[]};
  if(scene==='map'){
    const query=String(title||'').replace(/^(?:the )?(?:(?:street|city|location) )?maps? (?:of |for |around |in )?/i,'').trim();
    if(query && query.toLowerCase()!=='location map')result.items.push({
      title:'View the actual map',detail:'Open an external, georeferenced map for '+query.slice(0,65),
      url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query.slice(0,120))
    });
  }
  return result;
};
const clock=()=>performance.now()/1000;
const menu={kind:'capabilities',title:'Your workspace',items:[
  {title:'Estúdio visual',detail:'Percorrer as transformações do Travis',url:new URL('./tools/travis-motion/studio.html',location.href).href},
  {title:'Repositories',detail:'Inspect your projects',request:'Mostra os meus repositórios'},
  {title:'Tasks',detail:'Read your real task list',request:'Mostra as minhas tarefas'},
  {title:'Agents',detail:'Current executions',request:'Estado dos agentes'},
  {title:'Sites',detail:'Check availability',request:'Verifica os sites'}
]};
function render(data,{story=false}={}){
  if(!story)cancelNarration();
  // Keep the real search choices available if a selected video cannot be embedded.
  if(data.kind==='youtube'&&data.videoId&&current?.kind==='youtube'){
    data={...data,query:current.query||data.query,items:data.items?.length?data.items:current.items};
  }
  closeYouTube();
  current={...data,autoReturn:data.autoReturn!==false};pinned=false;highlighted=0;renderVersion++;
  clearTimeout(returnTimer);updatePin();
  hud.dataset.projectionKind=String(data.kind||'result');
  window.dispatchEvent(new CustomEvent('travis:illustration',{detail:{
    scene:data.kind==='illustration'?data.scene:null,subject:data.title||'',reference:data.reference||null
  }}));
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)deck.animate?.([{opacity:0,filter:'blur(9px)',transform:'translate(-50%, 16px) scale(.97)'},{opacity:1,filter:'blur(0px)',transform:'translate(-50%, 0) scale(1)'}],{duration:MOTION.caption*1000,easing:MOTION.entrance});
  heading.textContent=String(data.title||'Your workspace');
  caption.replaceChildren();sources.remember(data);
  if(data.kind==='illustration'&&data.scene!=='text'){const title=document.createElement('span');title.className='travis-motion-title';caption.append(title);revealCaption(title,data.title||'',{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});}
  if(data.scene==='journey'){const note=document.createElement('small');note.textContent='TRAJETO ILUSTRATIVO · SEM ESCALA';caption.append(note);}
  if(data.scene==='mechanical'){
    const note=document.createElement('small');note.textContent='MODELO DIDÁTICO · CORTE';caption.append(note);
    const controls=document.createElement('div');controls.className='travis-reference-navigation travis-mechanical-controls';
    for(const [request,label] of [['Separa as peças','Separar'],['Junta as peças','Montar']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>window.TravisVisual?.ask(request));controls.append(button);}caption.append(controls);
  }
  if(data.scene==='model'){
    const note=document.createElement('small');note.textContent='OBJETO 3D';caption.append(note);
    const controls=document.createElement('div');controls.className='travis-reference-navigation';
    for(const [request,label] of [['Roda para a esquerda','↶'],['Roda para a direita','↷']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',request);button.addEventListener('click',()=>window.TravisVisual?.ask(request));controls.append(button);}caption.append(controls);
  }
  if(data.scene==='reference'){
    const note=document.createElement('small');note.textContent='FOTOGRAFIA · RELEVO';caption.append(note);
    const model=document.createElement('button');model.type='button';model.className='travis-reference-photos';model.textContent='Procurar objeto 3D';
    model.addEventListener('click',()=>window.TravisVisual?.ask('Mostra '+(data.gallery?.query||data.title)+' em 3D'));caption.append(model);
  }
  if(data.gallery?.count>1){
    const navigation=document.createElement('div');navigation.className='travis-reference-navigation';
    navigation.setAttribute('aria-label',data.gallery.language==='pt'?'Imagens de referência':'Reference images');
    for(const [command,label] of [['Previous image','‹'],['Next image','›']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.setAttribute('aria-label',command);button.addEventListener('click',()=>window.TravisVisual?.ask(command));
      navigation.append(button);
      if(command==='Previous image'){const count=document.createElement('span');count.textContent=(data.gallery.index+1)+' / '+data.gallery.count;navigation.append(count);}
    }
    caption.append(navigation);
  }else if(data.kind==='illustration'&&!['text','reference','journey','weather'].includes(data.scene)){
    const photos=document.createElement('button');photos.type='button';photos.className='travis-reference-photos';photos.textContent='Photos';
    photos.addEventListener('click',()=>window.TravisVisual?.ask('Show photos of '+data.title));caption.append(photos);
  }
  items.dataset.kind=String(data.kind||'result');
  const rows=Array.isArray(data.items)?data.items.slice(0,30):[];
  items.replaceChildren();
  if(data.summary){const paragraph=document.createElement('p');paragraph.className='travis-projection-summary';paragraph.textContent=String(data.summary);items.append(paragraph);}
  if(data.kind==='illustration'){const label=document.createElement('p');label.className='travis-projection-caption';label.textContent='CINEMATIC · CONCEPTUAL VIEW';items.append(label);}
  if(data.kind==='youtube')mountYouTube(data,items);
  const entries=rows.length?rows:(data.kind==='youtube'||data.kind==='illustration')?[]:[{title:data.kind==='tasks'?'No pending tasks':'No results',detail:data.kind==='tasks'?'Tell me what you want to add.':'The tool returned no entries.'}];
  items.append(...entries.map((row,index)=>{
    const actionable=typeof row.request==='string'&&row.request.length<=500;
    const card=document.createElement(actionable?'button':'article');
    card.className='travis-action-card';
    if(actionable)card.type='button';
    if(row.project)card.dataset.project=String(row.project);
    card.setAttribute('aria-current',String(Boolean(row.project&&row.project===selected)||Boolean(row.videoId&&row.videoId===data.videoId)));
    if(typeof row.available==='boolean')card.dataset.available=String(row.available);
    const number=document.createElement('span');number.className='travis-holo-number';number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
    if(/^[A-Za-z0-9_-]{11}$/.test(String(row.videoId||''))){const image=document.createElement('img');image.src='https://i.ytimg.com/vi/'+row.videoId+'/mqdefault.jpg';image.alt='';image.loading='lazy';image.className='travis-video-preview';card.append(image);}
    const title=document.createElement('strong'),detail=document.createElement('span');
    title.textContent=String(row.title||'Result');detail.textContent=String(row.detail||'');
    card.append(number,title,detail);card.style.setProperty('--entry',String(Math.min(index,7)));
    if(row.url&&!actionable){try{const url=new URL(row.url);if(['https:','http:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='↗';link.setAttribute('aria-label','Open source');link.addEventListener('click',e=>e.stopPropagation());detail.append(' ',link);}}catch{}}
    if(actionable)card.addEventListener('click',()=>{
      if(row.project){selected=row.project;window.TravisVisual?.selectProject(selected);}
      for(const sibling of items.children)sibling.setAttribute('aria-current',String(sibling===card));
      window.TravisVisual?.ask(row.request);
    });
    return card;
  }));
  deck.scrollTop=0;
  scheduleReturn(data.scene==='journey'?26000:18000);
}
function paint(){
  frame=0;
  const view=projection.sample(clock());
  if(narration&&narration.epoch===storyEpoch){
    const index=cueAtTime(narration.cues,narration.context.currentTime-narration.start,narration.duration);
    if(index>narration.index){narration.index=index;const cue=narration.cues[index];if(cue&&(cue.title!==current?.title||cue.scene!==current?.scene))render({...schematic(cue.scene,cue.title),explaining:true},{story:true});}
  }
  const immersive=current?.kind==='illustration';
  // Geometry occupies the centre: never cover planets/houses with repositories.
  deck.hidden=!view.visible||immersive;
  caption.hidden=!view.visible||!immersive||view.amount<.55;
  deck.inert=immersive||view.panel<.65;
  hud.dataset.immersive=String(Boolean(view.visible&&immersive));
  deck.style.setProperty('--projection-opacity',view.panel.toFixed(3));
  deck.style.setProperty('--projection-shift',`${((1-view.panel)*18).toFixed(1)}px`);
  hud.style.setProperty('--travis-presence',(1-view.amount).toFixed(3));
  hud.dataset.projection=view.phase;
  hud.classList.toggle('cards-open',view.visible);
  if(wasVisible&&!view.visible){
    if(deck.contains(document.activeElement))document.getElementById('travis-hud-close')?.focus({preventScroll:true});
  }
  wasVisible=view.visible;
  if(view.visible)frame=requestAnimationFrame(paint);
}
function refresh(){if(!frame)frame=requestAnimationFrame(paint);}
function show(){
  projection.present(clock());
  refresh();
}
if(deck){
  document.getElementById('travis-action-close').addEventListener('click',()=>window.TravisVisual?.commands(false));
  window.addEventListener('travis:commands',e=>{
    if(e.detail.open){if(!current)render(menu);show(Boolean(e.detail.automatic));}
    else{
      cancelNarration();caption.hidden=true;clearTimeout(returnTimer);closeYouTube();projection.close(clock());refresh();
      pinned=false;current=null;wideScene=null;selectedVisual=null;updatePin();
      const version=++renderVersion;
      setTimeout(()=>{
        if(version===renderVersion&&!projection.sample(clock()).visible)
          window.dispatchEvent(new CustomEvent('travis:illustration',{detail:{scene:null}}));
      },1350);
    }
  });
  window.addEventListener('travis:result',e=>{
    const data=e.detail?.ui;if(!data)return;
    if(current?.explaining&&['web-search','web-page'].includes(data.kind)){
      const source=data.items?.find(item=>item.url)?.url||data.url;
      if(source){current.sourceUrl=source;current.sourceName='Source';sources.remember(current);}
      return;
    }
    if(data.project)selected=data.project;
    render(data);window.TravisVisual?.commands(true,{automatic:true});
    show(true);
  });
  window.addEventListener('travis:visual-select',event=>{selectedVisual=event.detail?.target||null;if(selectedVisual)touchProjection();});
  window.addEventListener('travis:speech-end',()=>{const explained=Boolean(narration);cancelNarration();if(explained&&current?.scene==='journey')window.dispatchEvent(new CustomEvent('travis:visual-timeline',{detail:{finish:true}}));scheduleReturn(explained?Math.max(2800,readingHold(current?.title||'')*1000):current?.scene==='journey'?26000:current?.kind==='illustration'?10500:13500);});
  window.addEventListener('travis:speech-cancel',()=>{cancelNarration();if(current)scheduleReturn(2800);});
  window.addEventListener('travis:user-start',()=>{cancelNarration();clearTimeout(returnTimer);returnTimer=0;});
  window.addEventListener('travis:state',event=>{
    if(event.detail?.state==='speaking'||event.detail?.state==='thinking'){clearTimeout(returnTimer);returnTimer=0;}
    else if(event.detail?.state==='ready'&&current&&!returnTimer)scheduleReturn(12000);
  });
  for(const event of ['pointerdown','touchstart','scroll','focusin','keydown']){
    deck.addEventListener(event,touchProjection,{passive:true});
  }
  window.addEventListener('travis:close',()=>{sources.close();cancelNarration();caption.hidden=true;clearTimeout(returnTimer);renderVersion++;
    closeYouTube();cancelAnimationFrame(frame);frame=0;projection.reset();wasVisible=false;current=null;wideScene=null;selectedVisual=null;pinned=false;paint();
  });
  window.TravisProjection=Object.freeze({
    media:youtubeState,
    mayNeedModel:mayNeedVisualModel,
    applyModelIntent(result,text=''){
      const valid=['planet','map','house','person','vehicle','landscape','diagram','object','text','space','mechanical'];
      if(result?.ok!==true||!valid.includes(result.scene)
          ||typeof result.title!=='string'||result.title.length>110)return null;
      const pt=/\b(?:quero|gostava|apetece|imagina|podes|consegues|como|seria|mostra)\b/i.test(text);
      const needsReference=!hasLocalVisual(result.scene,result.title);
      if(needsReference)awaitReference();else{render(schematic(result.scene,result.title));window.TravisVisual?.commands(true,{automatic:true});show();}
      return {handled:true,language:pt?'pt':'en',
        reply:pt?'A projetar '+result.title+'.':'Projecting '+result.title+'.',
        kind:'scene',source:'local-language-model',title:result.title,needsReference,researchQuery:needsReference?result.title:null,visualVersion:storyEpoch};
    },
    status:()=>({kind:current?.kind||null,scene:current?.scene||null,pinned,
      autoReturn:current?.autoReturn!==false,highlighted,title:current?.title||'',gallery:current?.gallery?{index:current.gallery.index,count:current.gallery.count,query:current.gallery.query}:null,narration:narration?{index:narration.index,cues:narration.cues}:null,sourceUrl:current?.sourceUrl||null}),
    beginNarration({text,context,start,duration,continuous=false}){
      if(!current?.explaining||pinned||!context)return;
      clearTimeout(returnTimer);returnTimer=0;
      const initial={scene:current.scene,title:current.title};
      const cues=current.scene==='journey'?[{...initial,at:0}]:buildNarrationCues(text,initial);
      if(current.scene==='journey')window.dispatchEvent(new CustomEvent('travis:visual-timeline',{detail:{context,start,duration,continuous,text}}));
      narration={cues,context,start,duration,index:0,epoch:storyEpoch};refresh();
    },
    async applyReference(result,intent){
      if(intent?.visualVersion!==storyEpoch)return null;
      if(!result?.ok)return intent.language==='pt'?'Não encontrei uma referência visual fiável para esse pedido.':'I could not find a reliable visual reference for that request.';
      if(!intent.needsReference){current.sourceUrl=result.url;current.sourceName=result.source;sources.remember(current);return null;}
      if(result.representation==='model-3d'&&result.model){
        let model;
        try{model=await decodeReferenceModel(result.model);}catch{return intent.language==='pt'?'Não consegui abrir este modelo 3D. Podes pedir fotografias do objeto.':'I could not open this 3D model. You can request photos of the object.';}
        if(intent.visualVersion!==storyEpoch){disposeReferenceModel(model);return null;}
        render({...schematic('model',intent.title),reference:{model},modelName:result.model.name,sourceUrl:result.url,sourceName:result.source,imageAuthor:result.author,imageLicense:result.license,explaining:Boolean(intent.explain)});
        window.TravisVisual?.commands(true,{automatic:true});show();
        return intent.language==='pt'?'A projetar '+intent.title+' em três dimensões.':'Projecting '+intent.title+' in three dimensions.';
      }
      let image=null;
      if(/^data:image\/(?:jpeg|png|webp);base64,/.test(result.imageData||'')){
        image=new Image();image.src=result.imageData;try{await image.decode();if(image.naturalWidth*image.naturalHeight>12000000)image=null;}catch{image=null;}
      }
      if(intent.visualVersion!==storyEpoch)return null;
      const title=result.title||intent.title;
      if(!image)return intent.language==='pt'?'Encontrei informação sobre '+title+', mas ainda não tenho uma representação visual para este tema.':'I found information about '+title+', but do not yet have a visual representation for this subject.';
      const gallery=image?{query:intent.researchQuery||result.query||intent.title,language:intent.language||'en',index:result.imageIndex||0,count:result.imageCount||1}:null;
      render({...schematic(image?'reference':'text',title),reference:image?{image}:null,sourceUrl:image?(result.creditUrl||result.url):result.url,sourceName:image?(result.imageSource||result.source):result.source,imageAuthor:result.author,imageLicense:result.license,gallery,explaining:Boolean(intent.explain)});
      window.TravisVisual?.commands(true,{automatic:true});show();
      if(image&&intent.kind==='reference-next')return intent.language==='pt'?'Imagem '+(gallery.index+1)+' de '+gallery.count+'.':'Image '+(gallery.index+1)+' of '+gallery.count+'.';
      if(image&&result.modelUnavailable)return intent.language==='pt'?'Não encontrei um modelo 3D compatível. Esta é uma fotografia de referência de '+title+'.':'I could not find a compatible 3D model. This is a reference photograph of '+title+'.';
      return intent.language==='pt'?(image?'Encontrei uma imagem de referência de '+title+'.':'Encontrei informação sobre '+title+', mas sem imagem disponível.'):(image?'I found a visual reference for '+title+'.':'I found information about '+title+', but no image was available.');
    },
    interpret(text){
      // The first-stage router is open-vocabulary for visual requests; unseen
      // unfamiliar subjects request a sourced reference instead of a generic solid.

      const intent=parseVisualIntent(text,{
        active:Boolean(current&&projection.sample(clock()).visible),
        kind:current?.kind||''
      });
      if(!intent){
        const rewritten=rewriteEnglishToolRequest(text);
        return rewritten!==text?{handled:false,rewritten}:null;
      }
      if(intent.type==='sound'){window.dispatchEvent(new CustomEvent('travis:motion-sound',{detail:{enabled:intent.enabled}}));return {handled:true,language:intent.language,kind:'control',reply:intent.language==='pt'?(intent.enabled?'Sons de movimento ligados.':'Sons de movimento desligados.'):(intent.enabled?'Motion sounds enabled.':'Motion sounds disabled.')};}
      if(intent.type==='focus'){
        const raw=intent.target||selectedVisual||(current?.scene==='planet'&&!/system/i.test(current.title)?current.title:null);
        const target=bodyNames[String(raw||'').toLowerCase()]||(/rocket/i.test(raw||'')?'Rocket':/drop/i.test(raw||'')?'Drop':null);
        if(!target)return {handled:true,kind:'control',language:intent.language,reply:intent.language==='pt'?'Qual objeto queres isolar? Diz o nome ou toca num planeta.':'Which object should I isolate? Say its name or tap a planet.'};
        if(!wideScene)wideScene=current;
        render(schematic(target==='Rocket'?'vehicle':target==='Drop'?'weather':'planet',target));
        selectedVisual=target;window.TravisVisual?.commands(true,{automatic:true});show();
        return {handled:true,kind:'control',language:intent.language,reply:intent.language==='pt'?'Objeto isolado. Podes aproximar ou pedir a vista geral.':'Object isolated. You can zoom in or return to the wide view.'};
      }
      if(intent.type==='scene'){
        wideScene=null;selectedVisual=null;
        if(intent.scene==='planet'&&/\b(?:random|any|aleatorio|aleatória|aleatoria|qualquer)\b/i.test(String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'')))
          intent.title=planetSequence[Math.floor(Math.random()*planetSequence.length)];
        const needsReference=Boolean(intent.referenceRequested)||!hasLocalVisual(intent.scene,intent.title);
        if(needsReference)awaitReference();else{render({...schematic(intent.scene,intent.title),explaining:Boolean(intent.explain)});window.TravisVisual?.commands(true,{automatic:true});show();}
        return {...intent,handled:!intent.explain,reply:intent.language==='pt'
          ?'A projetar '+intent.title+'.':'Projecting '+intent.title+'.',
          language:intent.language||'en',kind:'scene',needsReference,
          researchQuery:needsReference||intent.research?intent.title:null,visualVersion:storyEpoch};
      }
      if(intent.type==='dismiss'){
        window.TravisVisual?.commands(false,{automatic:true});
        return {handled:true,reply:'Returning to core.',kind:'dismiss'};
      }
      if(intent.type==='pin'){
        cancelNarration();pinned=true;updatePin();clearTimeout(returnTimer);
        return {handled:true,reply:'I will leave this open.',kind:'pin'};
      }
      if(intent.type==='unpin'){
        pinned=false;updatePin();scheduleReturn(10500);
        return {handled:true,reply:'Automatic return is enabled.',kind:'unpin'};
      }
      if(intent.type==='control'){
        const action=intent.action;
        if(action==='wide-view'){
          if(wideScene){const original=wideScene;wideScene=null;selectedVisual=null;render({...original,explaining:false});window.TravisVisual?.commands(true,{automatic:true});show();}
          else window.dispatchEvent(new CustomEvent('travis:visual-control',{detail:{action:'reset-view'}}));
          return {handled:true,kind:'control',language:intent.language,reply:''};
        }
        if(['explode','assemble'].includes(action)&&current?.scene!=='mechanical')return {handled:true,reply:'Este controlo está disponível no modelo de motor elétrico.',language:'pt',kind:'control'};
        if(['explode','assemble'].includes(action)){cancelNarration();}
        if(action==='next'&&!current?.gallery&&current?.kind==='illustration'&&/\b(?:image|images|photo|imagem|imagens|foto)\b/i.test(text)){
          cancelNarration();clearTimeout(returnTimer);
          return {handled:true,kind:'scene',language:/imagem|imagens|foto|mais/i.test(text)?'pt':'en',title:current.title,reply:'',needsReference:true,referenceRequested:true,
            researchQuery:current.title,imageIndex:0,visualVersion:storyEpoch};
        }
        if((action==='next'||action==='previous')&&current?.gallery){
          const gallery=current.gallery;
          if(gallery.count<2)return {handled:true,reply:gallery.language==='pt'?'Só encontrei uma imagem para este tema.':'I found only one image for this subject.',kind:'control'};
          cancelNarration();clearTimeout(returnTimer);
          return {handled:true,kind:'reference-next',language:gallery.language,title:current.title,reply:'',needsReference:true,referenceRequested:true,
            researchQuery:gallery.query,imageIndex:(gallery.index+(action==='next'?1:-1)+gallery.count)%gallery.count,visualVersion:storyEpoch};
        }
        if((action==='next'||action==='previous')&&current?.scene==='planet'){
          const index=planetSequence.findIndex(name=>current.title?.toLowerCase().includes(name.toLowerCase()));
          const next=(index+(action==='next'?1:-1)+planetSequence.length)%planetSequence.length;
          render(schematic('planet',planetSequence[next]));
          window.TravisVisual?.commands(true,{automatic:true});show();
          return {handled:true,reply:'Projecting '+planetSequence[next]+'.',kind:'scene'};
        }
        if(action==='next'||action==='previous'){
          const rows=current?.items||[];
          if(!rows.length)return {handled:true,reply:'There are no other results in this view.',kind:'control'};
          highlighted=(highlighted+(action==='next'?1:-1)+rows.length)%rows.length;
          const cards=items.querySelectorAll('.travis-action-card');
          cards.forEach((card,index)=>card.setAttribute('aria-current',String(index===highlighted)));
          cards[highlighted]?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
          touchProjection();
          return {handled:true,reply:'Result '+(highlighted+1)+'.',kind:'control'};
        }
        window.dispatchEvent(new CustomEvent('travis:visual-control',{detail:{action}}));
        touchProjection();
        return {handled:true,reply:'',kind:'control'};
      }
      return null;
    },
    action(result){
      if(result?.action==='close_projection'){
        closeYouTube();window.TravisVisual?.commands(false);return {ok:true};
      }
      const receipt=controlYouTube(result?.action);
      if(result?.action==='close_youtube'&&receipt){
        if(current?.kind==='youtube'){window.TravisVisual?.commands(false);current=null;}
      }
      return receipt;
    },
    select(text){
      const t=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      // Media selection is resolved from the server's session-scoped search results.
      if(current?.kind==='youtube')return null;
      if(/^(?:open|select|choose|show)(?: the)? (?:highlighted|selected|current)(?: one| result)?$/.test(t)){
        const row=current?.items?.[highlighted];
        return row?.request||null;
      }
      const match=t.match(/^(?:travis[, ]+)?(?:abre|seleciona|selecciona|escolhe|quero|open|select|choose)\s+(?:o |a |the )?(primeiro|primeira|first|segundo|segunda|second|terceiro|terceira|third|quarto|quarta|fourth|quinto|quinta|fifth|[1-9])(?:\s+(?:video|resultado|projeto))?[.!?]*$/);
      if(!match||deck.hidden)return null;
      const words=['primeiro primeira first','segundo segunda second','terceiro terceira third','quarto quarta fourth','quinto quinta fifth'];
      const index=/^[1-9]$/.test(match[1])?Number(match[1])-1:words.findIndex(s=>s.split(' ').includes(match[1]));
      const row=current?.items?.[index];if(!row?.request)return null;
      if(row.project){selected=row.project;window.TravisVisual?.selectProject(selected);}
      const cards=[...items.querySelectorAll('.travis-action-card')];cards.forEach((card,i)=>card.setAttribute('aria-current',String(i===index)));
      return row.request;
    }
  });
}
