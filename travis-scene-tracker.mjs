// Adapted from Vision Tracker v1: target association, temporal confirmation,
// normalized pointing and pinch hysteresis. Uses Travis's existing MediaPipe
// models and camera; no second inference runtime, simulated depth or sensors.
export const OBJECT_NAMES_PT = Object.freeze(Object.fromEntries([
  ['person','pessoa'],['bicycle','bicicleta'],['car','carro'],['motorcycle','mota'],['airplane','avião'],
  ['bus','autocarro'],['train','comboio'],['truck','camião'],['boat','barco'],['traffic light','semáforo'],
  ['fire hydrant','boca de incêndio'],['stop sign','sinal de paragem'],['parking meter','parquímetro'],['bench','banco'],
  ['bird','pássaro'],['cat','gato'],['dog','cão'],['horse','cavalo'],['sheep','ovelha'],['cow','vaca'],
  ['elephant','elefante'],['bear','urso'],['zebra','zebra'],['giraffe','girafa'],['backpack','mochila'],
  ['umbrella','guarda-chuva'],['handbag','mala'],['tie','gravata'],['suitcase','mala de viagem'],['frisbee','disco'],
  ['skis','esquis'],['snowboard','prancha de snowboard'],['sports ball','bola'],['kite','papagaio de papel'],
  ['baseball bat','taco de basebol'],['baseball glove','luva de basebol'],['skateboard','skate'],
  ['surfboard','prancha de surf'],['tennis racket','raquete de ténis'],['bottle','garrafa'],['wine glass','copo de vinho'],
  ['cup','chávena'],['fork','garfo'],['knife','faca'],['spoon','colher'],['bowl','tigela'],['banana','banana'],
  ['apple','maçã'],['sandwich','sandes'],['orange','laranja'],['broccoli','brócolos'],['carrot','cenoura'],
  ['hot dog','cachorro-quente'],['pizza','pizza'],['donut','donut'],['cake','bolo'],['chair','cadeira'],
  ['couch','sofá'],['potted plant','planta'],['bed','cama'],['dining table','mesa'],['toilet','sanita'],
  ['tv','televisão'],['laptop','portátil'],['mouse','rato'],['remote','comando'],['keyboard','teclado'],
  ['cell phone','telemóvel'],['microwave','micro-ondas'],['oven','forno'],['toaster','torradeira'],
  ['sink','lava-loiça'],['refrigerator','frigorífico'],['book','livro'],['clock','relógio'],['vase','vaso'],
  ['scissors','tesoura'],['teddy bear','urso de peluche'],['hair drier','secador'],['toothbrush','escova de dentes']
]));
export const OBSERVATION_TTL = 3200;
export const objectName = (name,locale='en') => locale==='pt' ? OBJECT_NAMES_PT[name] || name : name;
const clamp = x => Math.max(0,Math.min(1,x));
const center = b => ({x:b.x+b.width/2,y:b.y+b.height/2});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function overlap(a,b) {
  const w=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
  const h=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return w*h/(a.width*a.height+b.width*b.height-w*h || 1);
}
export function normalizedDetections(result,width,height) {
  if(!(width>0&&height>0))return [];
  return (result?.detections||[]).flatMap(d=>{
    const c=d?.categories?.[0], b=d?.boundingBox;
    const name=String(c?.categoryName||'').toLowerCase();
    if(!Object.hasOwn(OBJECT_NAMES_PT,name)||!Number.isFinite(c.score)||c.score<.5||c.score>1||!b)return [];
    if(![b.originX,b.originY,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)return [];
    const x=clamp(b.originX/width),y=clamp(b.originY/height);
    const right=clamp((b.originX+b.width)/width),bottom=clamp((b.originY+b.height)/height);
    if(right<=x||bottom<=y)return [];
    return [{name,score:c.score,box:{x,y,width:right-x,height:bottom-y}}];
  }).slice(0,12);
}

export class SceneTracker {
  constructor(){this.reset();}
  reset(){this.tracks=[];this.nextId=1;this.selectedId=null;this.observedAt=0;this.pinchHeld=false;this.pinchSince=0;this.lastPinchAt=-Infinity;this.pointedId=null;this.pointedAt=0;}
  update(detections,now=Date.now()) {
    if(now<=this.observedAt)return this.snapshot(now);
    this.observedAt=now;
    this.tracks=this.tracks.filter(t=>now-t.observedAt<OBSERVATION_TTL);
    const used=new Set();
    for(const detection of detections){
      let match=null,best=0;
      for(const t of this.tracks){
        if(used.has(t.id)||t.name!==detection.name)continue;
        const iou=overlap(t.box,detection.box),d=distance(center(t.box),center(detection.box));
        const score=iou+.15*(1-d);
        if((iou>=.2||d<.10)&&score>best){best=score;match=t;}
      }
      if(!match){
        match={...detection,box:{...detection.box},id:'vision-'+this.nextId++,hits:0,observedAt:now,confirmed:false};
        this.tracks.push(match);
      }
      // Confirmation requires two actual detector observations, not render frames.
      match.hits=now-match.observedAt>2000?1:match.hits+1;
      match.score=detection.score;
      match.box={...detection.box};match.observedAt=now;
      match.confirmed=match.confirmed||match.hits>=2;
      used.add(match.id);
    }
    // One missing detection is tolerated briefly, but stale boxes never persist.
    if(this.selectedId&&!this.tracks.some(t=>t.id===this.selectedId))this.selectedId=null;
    return this.snapshot(now);
  }
  snapshot(now=Date.now()){
    const objects=this.tracks.filter(t=>t.confirmed&&now-t.observedAt<=OBSERVATION_TTL)
      .map(t=>({id:t.id,name:t.name,score:Math.round(t.score*100)/100,box:{...t.box},observedAt:t.observedAt}));
    return {observedAt:this.observedAt,objects,selectedTarget:objects.find(t=>t.id===this.selectedId)||null};
  }
  selectAt(x,y,now=Date.now()){
    const target=this.snapshot(now).objects.filter(t=>x>=t.box.x&&y>=t.box.y&&x<=t.box.x+t.box.width&&y<=t.box.y+t.box.height)
      .sort((a,b)=>a.box.width*a.box.height-b.box.width*b.box.height)[0];
    this.selectedId=target?.id||null;return target||null;
  }
  release(){this.selectedId=null;this.pointedId=null;}
  hand(landmarks,now=Date.now()){
    if(!Array.isArray(landmarks)||landmarks.length<21){this.pinchHeld=false;this.pinchSince=0;return null;}
    if(!landmarks.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
    const wrist=landmarks[0],mcp=landmarks[5],tip=landmarks[8],thumb=landmarks[4];
    const scale=Math.max(.025,distance(wrist,mcp)),pinch=distance(tip,thumb)/scale;
    const objects=this.snapshot(now).objects;
    // Remember the last pointed object while the index bends to complete a pinch.
    if(pinch>.45&&distance(wrist,tip)>distance(wrist,landmarks[6])*1.12){
      const len=distance(tip,mcp);let best=null,bestScore=-Infinity;
      if(len>.025)for(const target of objects){
        const c=center(target.box),dx=c.x-tip.x,dy=c.y-tip.y;
        const along=(dx*(tip.x-mcp.x)+dy*(tip.y-mcp.y))/len;
        const perpendicular=Math.abs(dx*(tip.y-mcp.y)-dy*(tip.x-mcp.x))/len;
        const inside=tip.x>=target.box.x&&tip.x<=target.box.x+target.box.width&&tip.y>=target.box.y&&tip.y<=target.box.y+target.box.height;
        const tolerance=Math.min(.16,Math.hypot(target.box.width,target.box.height)*.45);
        if(inside||(along>=0&&along<.85&&perpendicular<tolerance)){
          const score=(inside?2:1)-perpendicular-along*.2;
          if(score>bestScore){best=target;bestScore=score;}
        }
      }
      this.pointedId=best?.id||null;this.pointedAt=now;
    }
    if(pinch>.48){this.pinchHeld=false;this.pinchSince=0;return null;}
    if(pinch>=.28||this.pinchHeld){this.pinchSince=0;return null;}
    if(!this.pinchSince){this.pinchSince=now;return null;}
    if(now-this.pinchSince<100||now-this.lastPinchAt<900)return null;
    this.pinchHeld=true;this.lastPinchAt=now;
    const target=now-this.pointedAt<1400?objects.find(t=>t.id===this.pointedId):null;
    if(target){this.selectedId=target.id;return target;}
    return null;
  }
}

export function describeScene(snapshot,locale='en',{selectedOnly=false}={}){
  const pt=locale==='pt',now=Date.now();
  if(!snapshot?.active)return pt?'Liga a câmara para eu observar o que tens à frente.':'Turn on the camera so I can look at what is in front of you.';
  const items=(snapshot.objects||[]).filter(o=>now-o.observedAt>=0&&now-o.observedAt<=OBSERVATION_TTL);
  const selected=items.find(o=>o.id===snapshot.selectedTarget?.id);
  if(selectedOnly&&!selected)return pt?'Ainda não há um alvo selecionado. Aponta e junta o polegar ao indicador, ou toca no objeto.':'No target is selected yet. Point and pinch, or tap an object.';
  const targets=selected?[selected]:items;
  if(!targets.length){
    if(snapshot.objectModel==='unavailable')return pt?'A câmara está ligada, mas o detetor de objetos não ficou disponível.':'The camera is on, but the object detector is unavailable.';
    if(snapshot.objectModel!=='ready')return pt?'A câmara está ligada. Estou a preparar a deteção de objetos.':'The camera is on. Object detection is starting.';
    return pt?'Ainda não confirmei nenhum objeto. Mantém a câmara estável e aproxima o que queres mostrar.':'I have not confirmed an object yet. Hold the camera steady and bring it into view.';
  }
  const phrases=targets.slice(0,4).map(o=>{
    const cameraX=o.box.x+o.box.width/2;
    const x=snapshot.facingMode==='user'?1-cameraX:cameraX;
    const position=pt?(x<.34?'à esquerda':x>.66?'à direita':'ao centro'):(x<.34?'on the left':x>.66?'on the right':'in the centre');
    const uncertainty=o.score<.7?(pt?'possivelmente ':'possibly '):'';
    return uncertainty+objectName(o.name,locale)+' '+position;
  });
  return (selected?(pt?'Alvo selecionado: ':'Selected target: '):(pt?'Deteto ':'I can detect '))+phrases.join('; ')+'.';
}

export function sceneSignature(snapshot){
  if(!snapshot?.active)return '';
  const objects=snapshot.objects||[];
  return objects.length?objects.map(o=>{
    const cameraX=o.box.x+o.box.width/2,x=snapshot.facingMode==='user'?1-cameraX:cameraX;
    return o.name+':'+(x<.34?'left':x>.66?'right':'centre');
  }).sort().join('|')+'#'+(snapshot.selectedTarget?.id||''):'';
}
