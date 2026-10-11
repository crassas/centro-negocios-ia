/*
 * Travis London Mission - pure, independently testable simulation selectors.
 * PUBLIC TfL traffic snapshots only. No people/plate detection or tracking.
 */
export const ORIGIN=Object.freeze({name:'Oxford Circus',lat:51.5152,lon:-0.1419});
const STREETS=Object.freeze([
  {name:'Oxford Street',match:/\boxford (?:st|street)\b/i},
  {name:'Regent Street',match:/\bregent (?:st|street)\b/i},
  {name:'Piccadilly',match:/\bpiccadilly\b/i},
  {name:'Tottenham Court Road',match:/\btottenham court (?:rd|road)\b/i},
  {name:'Marylebone Road',match:/\bmarylebone (?:rd|road)\b/i}
]);
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[\u2018\u2019']/g,'').replace(/[,!?;:.]+/g,' ').replace(/\s+/g,' ').trim();
export function missionCommand(raw){
  const s=fold(raw).replace(/^(?:travis|jarvis) /,'').replace(/ please$/,'');
  if(/^(?:start|run|begin|launch) (?:the )?(?:london (?:mission|exercise|drill|scenario)|traffic drill in london|london traffic exercise)$/.test(s))
    return {type:'start',language:'en'};
  if(/^(?:inicia|iniciar|comeca|executa) (?:a |o )?(?:missao|simulacao|exercicio) (?:de |em )?(?:londres|london)$/.test(s))
    return {type:'start',language:'pt'};
  if(/^(?:end|close|stop|finish) (?:the )?london (?:mission|exercise|drill)$/.test(s))
    return {type:'close',language:'en'};
  return null;
}
export function kmBetween(a,b,c,d){
  if(![a,b,c,d].every(Number.isFinite))return Infinity;
  const r=Math.PI/180;
  const x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(x)));
}
const isLondonCamera=c=>c&&String(c.pack).toLowerCase()==='tfl'
  &&String(c.city).toLowerCase()==='london'&&c.feedType==='image'
  &&typeof c.id==='string'&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)
  &&kmBetween(ORIGIN.lat,ORIGIN.lon,c.lat,c.lon)<=5;
export function selectLondonCameras(rows){
  if(!Array.isArray(rows))return [];
  const valid=rows.filter(isLondonCamera);
  const taken=new Set(),selected=[];
  for(const street of STREETS){
    const candidates=valid.filter(c=>!taken.has(c.id)&&street.match.test(c.name||''))
      .sort((a,b)=>kmBetween(ORIGIN.lat,ORIGIN.lon,a.lat,a.lon)-kmBetween(ORIGIN.lat,ORIGIN.lon,b.lat,b.lon));
    const found=candidates[0];
    if(found){taken.add(found.id);selected.push({camera:found,street:street.name,match:'street'});}
  }
  if(selected.length<5){
    const nearby=valid.filter(c=>!taken.has(c.id))
      .sort((a,b)=>kmBetween(ORIGIN.lat,ORIGIN.lon,a.lat,a.lon)-kmBetween(ORIGIN.lat,ORIGIN.lon,b.lat,b.lon));
    for(const c of nearby){
      if(selected.length>=5)break;
      taken.add(c.id);selected.push({camera:c,street:'Nearby intersection',match:'proximity'});
    }
  }
  return selected;
}
export function routeTableUrl(selected){
  if(!Array.isArray(selected)||selected.length===0||selected.length>5)return null;
  const rows=[ORIGIN,...selected.map(row=>row.camera)];
  if(rows.some(r=>!Number.isFinite(r.lat)||!Number.isFinite(r.lon)))return null;
  const coords=rows.map(r=>r.lon.toFixed(6)+','+r.lat.toFixed(6)).join(';');
  return 'https://router.project-osrm.org/table/v1/driving/'+coords+
    '?sources=0&annotations=duration,distance';
}
export function routeRows(payload,selected,horizonMinutes=20){
  if(payload?.code!=='Ok'||!Array.isArray(payload?.durations?.[0])
    ||!Array.isArray(payload?.distances?.[0]))return [];
  const duration=payload.durations[0],distance=payload.distances[0];
  return selected.map((row,i)=>{
    const seconds=duration[i+1],metres=distance[i+1];
    if(!Number.isFinite(seconds)||!Number.isFinite(metres)||seconds<0||metres<0)
      return {id:row.camera.id,verified:false};
    return {id:row.camera.id,verified:true,minutes:seconds/60,km:metres/1000,
      inBaselineEnvelope:seconds/60<=horizonMinutes};
  });
}
export function nearbyRoadEvents(payload,limit=5){
  if(payload?.state!=='current'||!Array.isArray(payload.items))return [];
  return payload.items.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon))
    .map(x=>({...x,km:kmBetween(ORIGIN.lat,ORIGIN.lon,x.lat,x.lon)}))
    .filter(x=>x.km<=5).sort((a,b)=>a.km-b.km).slice(0,limit);
}