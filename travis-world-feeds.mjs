// Public, no-key data sources for the lightweight God's Eye voice mode.
// Each feed has an explicit provenance and failure state. Nothing fabricated.
const SOURCES=Object.freeze({
  earthquakes:'USGS Earthquake Hazards Program',
  iss:'Where The ISS At API',
  weather:'Open-Meteo'
});
const USGS='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const ISS='https://api.wheretheiss.at/v1/satellites/25544';
const WEATHER='https://api.open-meteo.com/v1/forecast';
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const numeric=n=>Number.isFinite(Number(n))?Number(n):null;
async function readJSON(url,signal){
  const controller=new AbortController();
  const relay=()=>controller.abort();
  signal?.addEventListener('abort',relay,{once:true});
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const res=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',signal:controller.signal,cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    return await res.json();
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener('abort',relay);
  }
}
function parseUSGS(source){
  if(!Array.isArray(source.features))throw new Error('Invalid USGS GeoJSON');
  const earthquakes=source.features.map(item=>{
    const c=item?.geometry?.coordinates;
    const lat=numeric(c?.[1]),lon=numeric(c?.[0]),mag=numeric(item?.properties?.mag);
    if(lat===null||lon===null||mag===null||Math.abs(lat)>90||Math.abs(lon)>180)return null;
    return {
      lat,lon,mag:clamp(mag,0,10),
      time:Number(item.properties?.time)||0,
      place:String(item.properties?.place||'Unknown location').slice(0,120)
    };
  }).filter(Boolean).sort((a,b)=>b.time-a.time);
  return {earthquakes,updated:Number(source.metadata?.generated)||Date.now(),source:SOURCES.earthquakes};
}
function parseISS(s){
  const lat=numeric(s.latitude),lon=numeric(s.longitude),alt=numeric(s.altitude);
  if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Invalid ISS coordinates');
  return {lat,lon,altKm:alt,time:Date.now(),source:SOURCES.iss};
}
function parseWeather(data){
  const c=data?.current;
  if(!c||!Number.isFinite(Number(c.temperature_2m)))throw new Error('Weather unavailable');
  return {temperature:Number(c.temperature_2m),wind:Number(c.wind_speed_10m)||0,
    units:data.current_units||{},observation:c.time||null,source:SOURCES.weather};
}
export function createWorldFeeds(onUpdate){
  let started=false;
  let place={lat:40.758,lon:-73.9855};
  let controller=null;
  let nextTimer=null;
  let sequence=0;
  let snapshot={
    loading:false,earthquakes:null,iss:null,weather:null,
    errors:{},updated:{},sources:SOURCES
  };
  function emit(){onUpdate?.({...snapshot,errors:{...snapshot.errors},updated:{...snapshot.updated}});}
  async function refresh(){
    if(!started)return;
    controller?.abort();
    const token=++sequence;
    controller=new AbortController();
    const current=controller;
    snapshot.loading=true;
    emit();
    const conditions=[
      ['earthquakes',USGS,parseUSGS],
      ['iss',ISS,parseISS],
      ['weather',WEATHER+'?'+new URLSearchParams({
        latitude:String(place.lat),longitude:String(place.lon),
        current:'temperature_2m,wind_speed_10m',
        timezone:'auto'
      }),parseWeather]
    ];
    const result=await Promise.all(conditions.map(async([key,url,parse])=>{
      try{return {key,value:parse(await readJSON(url,current.signal))};}
      catch(err){return {key,error:String(err?.message||err).slice(0,100)};}
    }));
    if(!started||token!==sequence)return;
    for(const row of result){
      if(row.error){
        snapshot.errors[row.key]=row.error;
      }else{
        snapshot[row.key]=row.value;
        snapshot.updated[row.key]=Date.now();
        delete snapshot.errors[row.key];
      }
    }
    snapshot.loading=false;
    emit();
    nextTimer=setTimeout(refresh,90000);
  }
  return {
    start(loc){
      started=true;
      if(loc)place={lat:loc.lat,lon:loc.lon};
      void refresh();
    },
    setLocation(loc){
      place={lat:loc.lat,lon:loc.lon};
      if(started)void refresh();
    },
    stop(){
      started=false;sequence++;
      clearTimeout(nextTimer);nextTimer=null;
      controller?.abort();controller=null;
      snapshot.loading=false;
      emit();
    },
    refresh(){if(started)void refresh();},
    status(){return {...snapshot,errors:{...snapshot.errors},updated:{...snapshot.updated}};}
  };
}
