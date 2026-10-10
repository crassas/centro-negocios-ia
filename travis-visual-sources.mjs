// Source attribution stays available without covering the hologram. Keep the
// recent sequence too: a narrated scene may change before someone opens Sources.
export function createVisualSources(host,{onInteract=()=>{}}={}){
 const records=new Map();
 const trigger=document.createElement('button');trigger.type='button';trigger.className='travis-sources-toggle';
 trigger.textContent='Fontes';trigger.hidden=true;trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','travis-sources');
 const panel=document.createElement('dialog');panel.id='travis-sources';panel.className='travis-sources';panel.setAttribute('aria-labelledby','travis-sources-title');
 const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');
 title.id='travis-sources-title';title.textContent='Fontes e créditos';close.type='button';close.textContent='×';close.setAttribute('aria-label','Fechar fontes');
 header.append(title,close);const list=document.createElement('div');list.className='travis-sources-list';panel.append(header,list);host?.append(trigger,panel);
 const safeURL=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
 function paint(){
  list.replaceChildren();
  for(const record of [...records.values()].reverse()){
   const item=document.createElement('article'),name=document.createElement('h3');name.textContent=record.title;item.append(name);
   const note=document.createElement('p');note.textContent=record.scene==='model'?'Objeto 3D · '+record.modelName:record.scene==='reference'?'Fotografia com relevo · não é uma reconstrução 3D':'Referência da explicação';item.append(note);
   for(const [label,url] of [[record.sourceName||'Fonte original',record.sourceUrl],['Crédito original',record.creditUrl]]){
    if(!url)continue;const link=document.createElement('a');link.href=url;link.textContent=label;link.target='_blank';link.rel='noopener noreferrer';item.append(link);
   }
   const credit=document.createElement('p');credit.textContent=[record.imageAuthor,record.imageLicense].filter(Boolean).join(' · ');item.append(credit);list.append(item);
  }
 }
 trigger.addEventListener('click',()=>{onInteract();paint();panel.showModal();});
 close.addEventListener('click',()=>panel.close());
 panel.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
 panel.addEventListener('close',()=>{onInteract();if(!trigger.hidden)trigger.focus({preventScroll:true});});
 panel.addEventListener('pointerdown',onInteract,{passive:true});
 return {
  remember(data){
   const sourceUrl=safeURL(data?.sourceUrl),creditUrl=safeURL(data?.creditUrl);if(!sourceUrl&&!creditUrl)return;
   const record={sourceUrl,creditUrl};for(const key of ['title','scene','modelName','sourceName','imageAuthor','imageLicense'])record[key]=String(data[key]||'').slice(0,1400);
   const key=sourceUrl+'|'+creditUrl+'|'+record.title;records.delete(key);records.set(key,record);
   while(records.size>24)records.delete(records.keys().next().value);
   trigger.hidden=false;if(panel.open)paint();
  },
  close(){if(panel.open)panel.close();}
 };
}
