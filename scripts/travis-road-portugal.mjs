/**
 * Portuguese public road incidents, temporary keyless feed in 2026.
 * Provider: transitoagora.pt (aggregates public entities, requires visible
 * attribution of BOTH provider and source on each event).
 *
 * This module owns only the two fixed districts Porto and Lisboa. The
 * provider will require an API key on 14-Oct-2026; disable keyless requests
 * automatically at the announced cutoff. It is NOT a speed sensor.
 *
 * No arbitrary URLs, no credentials, no scraping of municipal CCTV.
 */
const PREFIX="/api/road-live/";
const API="https://transitoagora.pt/api/v1/incidents";
const SUNSET=Date.parse("2026-10-13T23:00:00Z"); // Portugal 14-Oct 00:00 WEST
const TTL=18*60*1000; // Anonymous quota: <=20 requests/hour/IP
const MAX_BYTES=1500000;
const MAX_ROWS=1200;
const last=new Map();
const inflight=new Map();
const valid=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
const clean=(x,len=160)=>String(x??"").replace(/<[^>]*>/g," ")
  .replace(/[\x00-\x1f\x7f]/g," ").replace(/\s+/g," ").trim().slice(0,len);
const iso=value=>{
  const n=Date.parse(value||"");
  return Number.isFinite(n)?new Date(n).toISOString():null;
};
function formatDistance(a,b,c,d){
  const r=Math.PI/180;
  const x=Math.sin((c-a)*r/2)**2+
    Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;
  return Math.round(12742*Math.asin(Math.min(1,Math.sqrt(x)))*10)/10;
}
export function parsePortugalIncidents(input,{area="porto",now=Date.now()}={}){
  if(!["porto","lisboa"].includes(area)||!Array.isArray(input?.incidents))
    throw new Error("Invalid Portuguese road-incident dataset");
  const out=[];
  for(const x of input.incidents.slice(0,2600)){
    if(String(x.status||"").toLowerCase()!=="active")continue;
    if(!["accident","closure","traffic"].includes(x.type))continue;
    if(String(x.district||"").toLowerCase()!==area)continue;
    const lat=Number(x.lat),lon=Number(x.lon);
    if(!valid(lat,-90,90)||!valid(lon,-180,180))continue;
    const source=clean(x.source,40);
    const observedAt=iso(x.updatedAt||x.startedAt);
    if(!observedAt)continue;
    const age=now-Date.parse(observedAt);
    if(age< -3600000||age>14*24*3600000)continue;
    // Infraestruturas de Portugal upstream is known to have frozen; reject
    // stale incident records even if the aggregator still marks them active.
    if(source==="ip"&&age>48*3600000)continue;
    if(["accident","traffic"].includes(x.type)&&age>48*3600000)continue;
    out.push({
      id:"pt-"+clean(x.id||out.length,85),
      type:"incident",provider:"Trânsito Agora",
      originalProvider:source||"não identificado",
      label:clean(x.title||"Ocorrência registada",135),
      detail:clean(x.description||"",210),
      category:x.type,severity:clean(x.severity,22),
      road:clean(x.road||"",75),
      district:area,observedAt,
      lat,lon,sourceUrl:"https://transitoagora.pt/api-publica",
      // This is the ORIGINAL reporting organisation's published link,
      // only safe HTTPS URLs from a small official/public provenance allowlist.
      originalSourceUrl:typeof x.sourceUrl==="string"&&
        /^https:\/\/(?:[\w-]+\.)*(?:gov\.pt|cm-porto\.pt|cm-matosinhos\.pt|carrismetropolitana\.pt)\//i.test(x.sourceUrl)
        ?x.sourceUrl:null
    });
  }
  out.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
  return out.slice(0,MAX_ROWS);
}
const sunsetMessage="O fornecedor Trânsito Agora anunciou que a API deixaria de funcionar sem chave em 14-10-2026. A ligação gratuita está desactivada para evitar pedidos sem autorização.";
const send=(res,status,data)=>{
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Road-Data-Provenance":"aggregated-registered-incidents-not-measured-speeds"});
  res.end(JSON.stringify(data));
};
function filtered(payload,url){
  const limit=Math.min(80,Math.max(1,Number(url.searchParams.get("limit"))||36));
  const geo=url.searchParams.has("lat")&&url.searchParams.has("lon");
  const lat=Number(url.searchParams.get("lat")),lon=Number(url.searchParams.get("lon"));
  const radius=valid(Number(url.searchParams.get("radiusKm")),1,250)
    ?Number(url.searchParams.get("radiusKm")):75;
  let rows=payload.items;
  if(geo&&valid(lat,-90,90)&&valid(lon,-180,180)){
    rows=rows.map(x=>({...x,distanceKm:formatDistance(lat,lon,x.lat,x.lon)}))
      .filter(x=>x.distanceKm<=radius)
      .sort((a,b)=>a.distanceKm-b.distanceKm);
  }
  return {...payload,totalAvailable:payload.items.length,
    count:Math.min(rows.length,limit),items:rows.slice(0,limit)};
}
async function fetchArea(area,{now=Date.now(),fetchImpl=fetch}={}){
  const cached=last.get(area);
  if(cached && now-cached.at<TTL)return {...cached.data,cache:"hit"};
  if(inflight.has(area))return inflight.get(area);
  const pending=(async()=>{
    try{
      const url=API+"?district="+area+"&format=json";
      const res=await fetchImpl(url,{
        signal:AbortSignal.timeout(11000),
        headers:{"Accept":"application/json",
          "User-Agent":"TravisLocalPublicRoad/1.0"}
      });
      if(res.status===429)throw new Error("Quota de 20 pedidos/hora atingida; aguarda recuperação.");
      if(!res.ok)throw new Error("API portuguesa HTTP "+res.status);
      const bytes=Number(res.headers.get("content-length")||0);
      if(bytes>MAX_BYTES)throw new Error("Dataset demasiado extenso");
      const body=await res.text();
      if(body.length>MAX_BYTES)throw new Error("Dataset excedeu o limite");
      const data=JSON.parse(body);
      const items=parsePortugalIncidents(data,{area,now});
      const payload={
        schema:"travis-public-road-observations/v1",
        area,source:"Trânsito Agora · ocorrências rodoviárias (agregador não oficial)",
        kind:"reported-road-incidents",
        sourceUrl:"https://transitoagora.pt/api-publica",
        fetchedAt:new Date(now).toISOString(),
        reportedAt:null,
        temporaryKeylessUntil:"2026-10-13T23:00:00Z",
        attribution:"Dados: Trânsito Agora, fonte original indicada em cada evento",
        note:"Ocorrências reportadas por organismos públicos, não velocidades medidas. A API deixará de funcionar sem chave a 14-10-2026.",
        state:items.length?"current":"no-current-measurements",
        items
      };
      last.set(area,{at:now,data:payload});
      return {...payload,cache:"miss"};
    }catch(e){
      if(cached&&now-cached.at<30*60*1000)
        return {...cached.data,state:"stale",cache:"stale",
          warning:clean(e.message,130)};
      throw e;
    }
  })();
  inflight.set(area,pending);
  try{return await pending}finally{inflight.delete(area)}
}
export async function handlePortugalRoad(req,res,url,{now=Date.now(),fetchImpl=fetch}={}){
  if(!url.pathname.startsWith(PREFIX))return false;
  const area=url.pathname.slice(PREFIX.length);
  if(!["porto","lisboa"].includes(area))return false;
  if(req.method!=="GET"){send(res,405,{error:"Only GET allowed"});return true}
  if(now>=SUNSET){
    send(res,503,{schema:"travis-public-road-observations/v1",
      area,items:[],state:"unavailable",
      temporaryKeylessUntil:new Date(SUNSET).toISOString(),
      error:sunsetMessage});
    return true;
  }
  try{
    const payload=await fetchArea(area,{now,fetchImpl});
    send(res,200,filtered(payload,url));
  }catch(e){
    send(res,503,{schema:"travis-public-road-observations/v1",
      area,items:[],state:"unavailable",error:clean(e.message,180)});
  }
  return true;
}
