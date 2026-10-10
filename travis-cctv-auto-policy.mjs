/* TRAVIS | public CCTV intent + ranking (PT-PT/EN).
 * Pure functions: only registered, public source IDs can be selected.
 * A catalogue entry is NOT evidence that a video feed is currently live.
 */
export const normalizeCctvText=value=>String(value??'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[’‘']/g,'').replace(/[,!?;:.]+/g,' ').replace(/\s+/g,' ').trim();

export const AREA_REFERENCES=Object.freeze([
  {name:'Londres',match:/\b(?:londres|london)\b/,lat:51.5072,lon:-.1276,city:'london',pack:'tfl',radiusKm:100},
  {name:'Austin',match:/\baustin\b/,lat:30.2672,lon:-97.7431,city:'austin',pack:'austin',radiusKm:100},
  {name:'Califórnia',match:/\b(?:california|california)\b/,pack:'caltrans'},
  {name:'Delaware',match:/\bdelaware\b/,pack:'deldot'},
  {name:'Finlândia',match:/\b(?:finlandia|finland)\b/,pack:'fintraffic'},
  {name:'Noruega',match:/\b(?:noruega|norway|oslo)\b/,pack:'vegvesen'},
  {name:'Estónia',match:/\b(?:estonia|estonia|tallinn)\b/,pack:'tallinn'},
  {name:'Calgary',match:/\bcalgary\b/,city:'calgary',lat:51.0447,lon:-114.0719,pack:'calgary',radiusKm:90},
  {name:'Canadá',match:/\b(?:canada|british columbia|columbia britanica)\b/,pack:'drivebc'},
  {name:'Sydney',match:/\b(?:sydney|sidney)\b/,lat:-33.8688,lon:151.2093,pack:'nsw',radiusKm:110},
  {name:'Austrália',match:/\b(?:australia|nova gales do sul|new south wales)\b/,pack:'nsw'},
  {name:'San Francisco',match:/\b(?:san francisco|sao francisco)\b/,lat:37.7749,lon:-122.4194,pack:'caltrans',radiusKm:100},
  {name:'Los Angeles',match:/\b(?:los angeles)\b/,lat:34.0522,lon:-118.2437,pack:'caltrans',radiusKm:120},
  {name:'San Diego',match:/\bsan diego\b/,lat:32.7157,lon:-117.1611,pack:'caltrans',radiusKm:100},
  {name:'Porto',match:/\b(?:porto|campanha|gaia)\b/,lat:41.1496,lon:-8.6109,radiusKm:80},
  {name:'Lisboa',match:/\b(?:lisboa|lisbon)\b/,lat:38.7223,lon:-9.1393,radiusKm:85},
  {name:'Nova Iorque',match:/\b(?:new york|nova iorque|manhattan)\b/,lat:40.7128,lon:-74.006,radiusKm:100},
  {name:'Tóquio',match:/\b(?:toquio|tokyo)\b/,lat:35.6762,lon:139.6503,radiusKm:100},
]);
const CAMERA=/\b(?:camera|cameras|camara|camaras|cctv|webcam|webcams|public feeds?|live feeds?|cam)\b/;
const DEVICE=/\b(?:camara (?:do |de )?(?:telemovel|telefone|phone)|camera (?:of |on )?(?:my |the )?phone|selfie|camara frontal|front camera|rear camera|camera traseira)\b/;
const START=/\b(?:mostra|mostrar|abre|abrir|liga|ligar|seleciona|selecionar|escolhe|escolher|procura|procurar|encontra|encontrar|quero ver|podes mostrar|show|open|watch|find|choose|pick|select|connect|activate|look for|take me|go to|vejo|ver|auto|automatic)\b/;
const STOP=/\b(?:para|parar|termina|terminar|stop|stop touring|stop tour|desliga|desligar|fecha|fechar|close|cancel|cancela)\b/;
const NEXT=/\b(?:outra|outro|proxima|proximo|seguinte|next|another|different)\b/;
const TOUR=/\b(?:explora|explorar|passeia|passear|tour|roda|rotacao|ciclo|circular|automatica|automatico|cycle)\b/;
const LIVE=/\b(?:ao vivo|em direto|direto|directo|live|stream|streaming|video)\b/;
const QUESTION=/^(?:qual|quais|quantas|quantos|porque|como funciona|o que e|how many|how does|what is|where are)\b/;
const NOAREA=/\b(?:qualquer lugar|qualquer sitio|qualquer camara|qualquer camera|any camera|any webcam|no mundo|pelo mundo|aleatoria|aleatorio|random|anywhere|worldwide|global|em qualquer pais)\b/;
const ENGLISH=/\b(?:show|please|open|watch|find|choose|pick|select|connect|next|another|different|live|stream|tour|camera|cameras|anywhere|worldwide|stop)\b/;

function remainingArea(s){
  const m=s.match(/\b(?:em|no|na|nas|nos|de|do|da|perto de|around|in|at|near|from|over)\s+([\p{L}][\p{L} ]{1,42})$/u);
  if(!m)return null;
  const area=m[1].replace(/\b(?:por favor|please|agora|now|ao vivo|em direto|live|para mim|for me|aqui|here)\b.*$/,'').trim();
  if(!area||/^(?:uma|a|o|cameras?|camara|cctv|direto|directo|vivo|video|mundo|world|anywhere|qualquer lugar|todas?)$/.test(area))return null;
  return area.slice(0,42);
}

export function cameraIntent(raw){
  const s=normalizeCctvText(raw);
  if(!s||DEVICE.test(s)||!CAMERA.test(s)||QUESTION.test(s))return null;
  const lang=/\b(?:mostra|abre|liga|seleciona|escolhe|procura|encontra|quero|camara|camaras|publicas|qualquer|proxima|outra|podes)\b/.test(s)?'pt':ENGLISH.test(s)?'en':'pt';
  const location=AREA_REFERENCES.find(x=>x.match.test(s))||null;
  const unknown=NOAREA.test(s)?null:location?null:remainingArea(s);
  const scope=location||unknown?{...location||{},...(unknown?{name:unknown,city:unknown}:{}),explicit:true}:null;
  const global=NOAREA.test(s);
  const live=LIVE.test(s);
  if(STOP.test(s)&&TOUR.test(s))return {action:'stopTour',lang};
  if(NEXT.test(s)&&(!scope||START.test(s)||s.includes('camara')))return {action:'next',lang,live,scope,global};
  if(TOUR.test(s)&&!STOP.test(s))return {action:'tour',lang,live,scope};
  if(STOP.test(s)&&!START.test(s))return {action:'close',lang};
  if(START.test(s)||live||global)return {action:'select',lang,live,scope,global};
  return null;
}

export function kmBetween(a,b,c,d){
  const rad=Math.PI/180,rlat=(c-a)*rad,rlon=(d-b)*rad;
  const q=Math.sin(rlat/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(rlon/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(q)));
}
const safeCamera=c=>c && typeof c.id==='string' && Number.isFinite(c.lat)&&Number.isFinite(c.lon)
  && Math.abs(c.lat)<=90&&Math.abs(c.lon)<=180
  && ['hls','image'].includes(c.feedType);

export function rankPublicCameras(cameras,{scope=null,preferVideo=false,exclude=new Set(),limit=16}={}){
  if(!Array.isArray(cameras))return [];
  const city=normalizeCctvText(scope?.city||''),pack=normalizeCctvText(scope?.pack||'');
  const hasCoordinates=Number.isFinite(scope?.lat)&&Number.isFinite(scope?.lon);
  const radiusKm=Math.max(10,Math.min(400,Number(scope?.radiusKm)||95));
  const explicit=scope?.explicit===true;
  const scored=[];
  for(const c of cameras){
    if(!safeCamera(c)||exclude.has(c.id))continue;
    const text=normalizeCctvText([c.name,c.city,c.provider,c.pack].join(' '));
    const packMatches=!!pack&&normalizeCctvText(c.pack)===pack;
    const cityMatches=!!city&&(
      normalizeCctvText(c.city).includes(city)||text.includes(city)
    );
    const distance=hasCoordinates?kmBetween(scope.lat,scope.lon,c.lat,c.lon):null;
    const near=distance!==null&&distance<=radiusKm;
    // A city request may NEVER fall back to a camera in an unrelated city.
    if(explicit&&!cityMatches&&!near&&!(!hasCoordinates&&packMatches))continue;
    if(explicit && !hasCoordinates && pack && !cityMatches && !packMatches)continue;
    let score=0;
    if(cityMatches)score+=200;
    if(packMatches)score+=50;
    if(near)score+=Math.max(0,100-distance);
    if(!scope && c.feedType==='image')score+=10;
    if(preferVideo && c.feedType==='hls')score+=300;
    if(/portable|closed|inactive|test camera|temporary/i.test(c.name))score-=30;
    if(c.feedType==='hls')score+=2;
    scored.push({camera:c,score,distanceKm:distance});
  }
  scored.sort((a,b)=>b.score-a.score
    || ((a.distanceKm??Infinity)-(b.distanceKm??Infinity))
    || a.camera.id.localeCompare(b.camera.id));
  // A global request should not try three cameras from one failing operator.
  // Spread the first candidates across registered public-source providers.
  const diversified=!explicit
    ? (()=>{const seen=new Set(),front=[],rest=[];
        for(const item of scored){
          const pack=item.camera.pack||item.camera.provider||'unknown';
          if(!seen.has(pack)){seen.add(pack);front.push(item);}
          else rest.push(item);
        }
        return [...front,...rest];
      })()
    : scored;
  return diversified.slice(0,Math.max(1,Math.min(30,Math.trunc(limit))))
    .map(x=>x.camera);
}
