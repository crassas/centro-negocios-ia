/**
 * Travis public ROAD observations, independent of God's Eye simulated cars.
 * Strict upstream allowlist, no credentials, no arbitrary URL proxy.
 * Routes: /api/road-live/london | finland | nyc | status.
 *
 * TfL: current London road disruptions; never called vehicle speeds.
 * Fintraffic: measured 5-minute average speeds at fixed Finnish stations.
 * NYC DOT: measured link speeds ONLY if timestamps remain within 30 min.
 *
 * Each feed is polled lazily, with in-memory cache; no hidden monitoring.
 * Geographic points may be station coordinates or approximate link centroids.
 */
const BASE="/api/road-live/";
export const PROVIDERS=Object.freeze({
  london:Object.freeze({
    source:"Transport for London · Road Disruptions",
    sourceUrl:"https://api.tfl.gov.uk/Road/all/Disruption",
    documentUrl:"https://api.tfl.gov.uk/",
    kind:"road-disruption",ttl:180000,cap:3000000
  }),
  finland:Object.freeze({
    source:"Fintraffic Digitraffic · TMS 5-min sensor data",
    sourceUrl:"https://tie.digitraffic.fi/api/tms/v1/stations/data",
    metadataUrl:"https://tie.digitraffic.fi/api/tms/v1/stations",
    documentUrl:"https://www.digitraffic.fi/en/road-traffic/",
    kind:"measured-speed",ttl:85000,cap:6500000
  }),
  nyc:Object.freeze({
    source:"NYC DOT · Traffic Speeds",
    sourceUrl:"https://data.cityofnewyork.us/resource/i4gi-tjb9.json?$order=data_as_of%20DESC&$limit=600",
    documentUrl:"https://data.cityofnewyork.us/d/i4gi-tjb9",
    kind:"measured-link-speed",ttl:120000,cap:1100000
  })
});
const cache=new Map();
const pending=new Map();
const valid=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
const clip=(x,n=135)=>String(x??"").replace(/<[^>]*>/g," ").replace(/[\x00-\x1f\x7f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const isof=(x)=> {
  if(!x||typeof x!=="string")return null;
  const n=Date.parse(x);
  return Number.isFinite(n)?new Date(n).toISOString():null;
};
const coord=(a,b)=>{
  const lat=Number(a),lon=Number(b);
  return valid(lat,-90,90)&&valid(lon,-180,180)?{lat,lon}:null;
};
const kmBetween=(a,b,c,d)=>{
  const rad=Math.PI/180,phi1=a*rad,phi2=c*rad;
  const h=Math.sin((c-a)*rad/2)**2+Math.cos(phi1)*Math.cos(phi2)*Math.sin((d-b)*rad/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
};
const nowUtc=()=>new Date().toISOString();

export function parseLondonDisruptions(input){
  if(!Array.isArray(input))throw new Error("Invalid TfL disruption dataset");
  const parsed=[];
  for(const x of input.slice(0,2200)){
    let point=x?.point;
    if(typeof point==="string"){
      try{point=JSON.parse(point)}catch{continue}
    }
    // TfL WGS84 point JSON is [longitude, latitude], not [lat, lon].
    const xy=Array.isArray(point)?coord(point[1],point[0]):null;
    if(!xy)continue;
    if(x.status && !/active|current|open|ongoing/i.test(String(x.status)))continue;
    const title=clip(x.location||x.category||"London road",100);
    const severity=clip(x.severity||"",32);
    const category=clip(x.category||"",40);
    const detail=clip(x.currentUpdate||x.comments||x.subCategory||"",220);
    if(!title&&!detail)continue;
    parsed.push({
      id:"tfl-"+clip(x.id||String(parsed.length),75),
      type:"incident",label:title,detail,
      provider:"TfL",category,severity,
      observedAt:isof(x.currentUpdateDateTime)||isof(x.lastModifiedTime)||isof(x.startDateTime),
      sourceUrl:PROVIDERS.london.documentUrl,...xy
    });
  }
  // Current feed is listed live; individual reports may be old. Preserve age.
  const priority={Severe:0,Serious:1,Moderate:2,Minimal:3};
  parsed.sort((a,b)=>(priority[a.severity]??4)-(priority[b.severity]??4)
    || Date.parse(b.observedAt||0)-Date.parse(a.observedAt||0));
  return parsed.slice(0,300);
}

export function parseFintrafficMeasurements(metadata,observations,{now=Date.now()}={}){
  if(!Array.isArray(metadata?.features)||!Array.isArray(observations?.stations))
    throw new Error("Invalid Fintraffic datasets");
  const points=new Map();
  for(const feature of metadata.features.slice(0,1500)){
    const xy=feature?.geometry?.coordinates;
    const p=Array.isArray(xy)?coord(xy[1],xy[0]):null;
    if(!p || feature?.properties?.collectionStatus!=="GATHERING")continue;
    points.set(Number(feature.id??feature.properties.id),
      {...p,name:clip(feature.properties.name||"TMS station",100)});
  }
  const rows=[];
  for(const station of observations.stations.slice(0,1500)){
    const point=points.get(Number(station.id));
    if(!point)continue;
    const vals=new Map((station.sensorValues||[]).filter(s=>Number.isFinite(Number(s.id))).map(s=>[Number(s.id),s]));
    for(const dir of [1,2]){
      const speed=vals.get(dir===1?5122:5125);
      const ratio=vals.get(dir===1?5158:5161);
      if(!speed)continue;
      const measured=isof(speed.measuredTime||station.dataUpdatedTime);
      if(!measured||Math.abs(now-Date.parse(measured))>30*60*1000)continue;
      const kph=Number(speed.value);
      if(!valid(kph,1,180))continue; // 0 often means NO vehicles: never infer standstill.
      const pct=Number(ratio?.value);
      rows.push({
        id:"fin-"+station.id+"-"+dir,
        type:"measured-speed",label:point.name+" · "+(dir===1?"direcção 1":"direcção 2"),
        detail:"Média dos últimos 5 minutos; posto fixo. Não são posições de veículos.",
        provider:"Fintraffic",speedKph:Math.round(kph),
        pctFreeFlow:valid(pct,1,170)?Math.round(pct):null,
        direction:dir,observedAt:measured,
        sourceUrl:PROVIDERS.finland.documentUrl,lat:point.lat,lon:point.lon
      });
    }
  }
  rows.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)
    || a.id.localeCompare(b.id));
  return rows.slice(0,1100);
}

export function nycLocalAgeMs(timestamp,now=Date.now()){
  if(typeof timestamp!=="string")return Infinity;
  // NYC Socrata DATETIME fields have no timezone. Compare with wall time
  // explicitly in America/New_York, rather than labelling them UTC.
  const parts=timestamp.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/);
  if(!parts)return Infinity;
  const localNow=new Intl.DateTimeFormat("en-CA",{
    timeZone:"America/New_York",hour12:false,
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"
  }).formatToParts(new Date(now));
  const map=Object.fromEntries(localNow.map(p=>[p.type,p.value]));
  const observed=Date.UTC(...[
    Number(parts[1]),Number(parts[2])-1,Number(parts[3]),
    Number(parts[4]),Number(parts[5]),Number(parts[6])]);
  const current=Date.UTC(Number(map.year),Number(map.month)-1,Number(map.day),
    Number(map.hour)%24,Number(map.minute),Number(map.second));
  return current-observed;
}
export function parseNYCSpeeds(raw,{now=Date.now()}={}){
  if(!Array.isArray(raw))throw new Error("Invalid NYC speed dataset");
  const entries=[];
  for(const x of raw.slice(0,1200)){
    const age=nycLocalAgeMs(x.data_as_of,now);
    if(age< -3*60000||age>30*60000)continue;
    const mph=Number(x.speed);
    if(!valid(mph,1,120))continue;
    if(x.status != null && !["0","1"].includes(String(x.status)))continue;
    const rawCoordinates=String(x.link_points||"").trim().split(/\s+/);
    const pair=rawCoordinates[Math.floor(rawCoordinates.length/2)]?.split(",");
    const xy=pair?.length===2?coord(pair[0],pair[1]):null;
    if(!xy)continue;
    entries.push({
      id:"nyc-"+clip(x.link_id||x.id||"",65),
      type:"measured-link-speed",provider:"NYC DOT",
      label:clip(x.link_name||x.owner||"NYC road",115),
      detail:"Velocidade observada num segmento rodoviário; posição aproximada.",
      speedKph:Math.round(mph*1.609344),
      speedMph:Math.round(mph),observedAtLocal:clip(x.data_as_of,35),
      ageMinutes:Math.max(0,Math.round(age/60000)),...xy,
      sourceUrl:PROVIDERS.nyc.documentUrl
    });
  }
  return entries.slice(0,600);
}

async function jsonFetch(url,cap,fetchImpl=fetch){
  const ctl=AbortSignal.timeout(11000);
  const response=await fetchImpl(url,{signal:ctl,headers:{
    "User-Agent":"TravisPublicRoadIntelligence/1.0",
    "Digitraffic-User":"Travis/1.0",
    "Accept":"application/json",
    "Accept-Encoding":"gzip"
  }});
  if(!response.ok)throw new Error("Provider response HTTP "+response.status);
  const bytes=Number(response.headers.get("content-length")||0);
  if(bytes>cap)throw new Error("Provider response too large");
  const text=await response.text();
  if(text.length>cap)throw new Error("Provider JSON exceeds safe limit");
  return JSON.parse(text);
}
export async function obtainRoadFeed(key,{now=Date.now(),fetchImpl=fetch}={}){
  const config=PROVIDERS[key];
  if(!config)throw new Error("Unknown road data provider");
  const cached=cache.get(key);
  if(cached && now-cached.at < config.ttl)return {...cached.data,cache:"hit"};
  if(pending.has(key))return pending.get(key);
  const work=(async()=>{
    try{
      const main=await jsonFetch(config.sourceUrl,config.cap,fetchImpl);
      const secondary=key==="finland"
        ?await jsonFetch(config.metadataUrl,1200000,fetchImpl):null;
      const items=key==="london"?parseLondonDisruptions(main)
        :key==="finland"?parseFintrafficMeasurements(secondary,main,{now})
        :parseNYCSpeeds(main,{now});
      const payload={
        schema:"travis-public-road-observations/v1",
        area:key,source:config.source,sourceUrl:config.documentUrl,kind:config.kind,
        fetchedAt:new Date(now).toISOString(),
        reportedAt:key==="finland"?isof(main.dataUpdatedTime):null,
        note:key==="nyc"&&!items.length
          ?"No sufficiently recent NYC road speed measurements; stale readings were excluded."
          :key==="london"
            ?"Current TfL road disruption registry, not measured vehicle speeds."
            :key==="finland"
              ?"5-minute TMS speed averages from fixed stations, not live individual cars."
              :"NYC DOT observed link speeds; timestamp interpreted in New York local time.",
        state:items.length?"current":"no-current-measurements",items
      };
      cache.set(key,{at:now,data:payload});
      return {...payload,cache:"miss"};
    }catch(error){
      if(cached && now-cached.at<600000)
        return {...cached.data,state:"stale",cache:"stale",
          warning:clip(error.message||"Provider unavailable",125)};
      throw error;
    }
  })();
  pending.set(key,work);
  try{return await work}finally{pending.delete(key)}
}
function filterItems(payload,url){
  const limit=Math.max(1,Math.min(90,Number(url.searchParams.get("limit"))||36));
  const lat=Number(url.searchParams.get("lat")),lon=Number(url.searchParams.get("lon"));
  const hasGeo=url.searchParams.has("lat")&&url.searchParams.has("lon")&&valid(lat,-90,90)&&valid(lon,-180,180);
  const radiusKm=Math.min(500,Math.max(5,Number(url.searchParams.get("radiusKm"))||120));
  let list=payload.items;
  if(hasGeo){
    list=list.map(item=>({...item,distanceKm:Math.round(kmBetween(lat,lon,item.lat,item.lon)*10)/10}))
      .filter(item=>item.distanceKm<=radiusKm)
      .sort((a,b)=>a.distanceKm-b.distanceKm);
  }
  return {...payload,totalAvailable:payload.items.length,
    count:Math.min(limit,list.length),items:list.slice(0,limit)};
}
function send(res,code,payload){
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Road-Data-Provenance":"observed-open-data-not-simulation"});
  res.end(JSON.stringify(payload));
}
export async function handleRoadLive(req,res,url,{now=Date.now(),fetchImpl=fetch}={}){
  if(!url.pathname.startsWith(BASE))return false;
  if(req.method!=="GET"){send(res,405,{error:"Only GET is allowed"});return true}
  const key=url.pathname.slice(BASE.length);
  if(key==="status"){
    send(res,200,{ok:true,service:"Travis public road observations",
      providers:Object.fromEntries(Object.entries(PROVIDERS).map(([id,c])=>
        [id,{kind:c.kind,source:c.source,url:c.documentUrl}])),
      mode:"user-requested/cached/no-live-car-position-claims"});
    return true;
  }
  if(!Object.hasOwn(PROVIDERS,key)){send(res,404,{error:"Unknown public road provider"});return true}
  try{
    const payload=await obtainRoadFeed(key,{now,fetchImpl});
    send(res,200,filterItems(payload,url));
  }catch(error){
    send(res,503,{ok:false,area:key,state:"unavailable",items:[],
      error:clip(error.message||"Provider unavailable",140)});
  }
  return true;
}