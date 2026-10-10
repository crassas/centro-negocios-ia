/* Travis God's Eye public CCTV catalog adapter.
 * The server uses the unmodified original God's Eye View CCTV plugin.
 * 3,000+ locations are public records, NOT 3,000 verified live streams.
 * No credentials, guessed URLs, private access or background surveillance.
 */
const HOST=['localhost','127.0.0.1'].includes(location.hostname)?location.hostname:'127.0.0.1';
const BASE='http://'+HOST+':4187';
const TTL=15*60*1000;
let cameras=[],byId=new Map(),lastLoaded=0,inflight=null,error='',state='idle',packs={};
let worldOpen=false,retryTimer=null,retries=0;
const RETRY_DELAYS=[3000,10000,30000];
function clearRetry(){clearTimeout(retryTimer);retryTimer=null;}
function retryVisibleCatalog(){
  if(!worldOpen||document.hidden||retryTimer||retries>=RETRY_DELAYS.length)return;
  retryTimer=setTimeout(()=>{
    retryTimer=null;
    if(worldOpen&&!document.hidden)void load({force:true});
  },RETRY_DELAYS[retries++]);
}
const validCamera=item=>{
  const lat=Number(item.lat),lon=Number(item.lon);
  return typeof item.id==='string'||typeof item.id==='number'
    ?Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180
    :false;
};
const safe=x=>String(x??'').slice(0,180);
function publish(){
  window.dispatchEvent(new CustomEvent('travis:cctv-catalog',{detail:status()}));
}
function status(){
  return {state,error,count:cameras.length,updated:lastLoaded,packs:{...packs},
    service:BASE,canSelect:cameras.length>0};
}
async function load({force=false}={}){
  if(!force && state==='ready' && cameras.length && Date.now()-lastLoaded<TTL){
    publish();return status();
  }
  if(inflight)return inflight;
  clearRetry();
  state='loading';error='';publish();
  inflight=(async()=>{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),45000);
    try{
      const response=await fetch(BASE+'/api/cctv/sources',{
        credentials:'omit',cache:'no-store',signal:ctrl.signal
      });
      if(!response.ok)throw new Error('CCTV service HTTP '+response.status);
      const raw=await response.json();
      if(!Array.isArray(raw.sources))throw new Error('Invalid public camera catalog');
      // Limit memory and avoid retaining optional geometric/source metadata.
      const catalog=raw.sources.filter(validCamera).slice(0,5000).map(item=>({
        id:safe(item.id),name:safe(item.name||'Public camera'),
        city:safe(item.city||''),provider:safe(item.provider||item.pack||'Public provider'),
        pack:safe(item.pack||''),lat:Number(item.lat),lon:Number(item.lon),
        feedType:item.feedType==='hls'?'hls':'image',
        sourceKind:safe(item.sourceKind||''),credit:safe(item.credit||''),
        license:safe(item.license||'')
      }));
      const found=new Map();
      for(const row of catalog)if(!found.has(row.id))found.set(row.id,row);
      cameras=[...found.values()];
      byId=found;
      lastLoaded=Date.now();state='ready';error='';
      retries=0;
      packs={};
      for(const row of cameras)packs[row.pack]=(packs[row.pack]||0)+1;
      publish();
      return status();
    }catch(e){
      state=cameras.length?'stale':'error';error=String(e?.message||e).slice(0,160);
      publish();return status();
    }finally{
      clearTimeout(timer);inflight=null;
      if(state==='error'||state==='stale')retryVisibleCatalog();
    }
  })();
  return inflight;
}
function distance(lat1,lon1,lat2,lon2){
  const R=Math.PI/180,dlat=(lat2-lat1)*R,dlon=(lon2-lon1)*R;
  const a=Math.sin(dlat/2)**2+Math.cos(lat1*R)*Math.cos(lat2*R)*Math.sin(dlon/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(a)));
}
function nearest(lat,lon,{limit=20,radiusKm=2000}={}){
  const a=Number(lat),b=Number(lon);
  if(!Number.isFinite(a)||!Number.isFinite(b))return [];
  return cameras.map(c=>({camera:c,km:distance(a,b,c.lat,c.lon)}))
    .filter(row=>row.km<=radiusKm)
    .sort((x,y)=>x.km-y.km)
    .slice(0,Math.min(80,Math.max(1,limit)));
}
function frameUrl(cameraId){
  if(!byId.has(String(cameraId)))return null;
  return BASE+'/api/cctv/frame/'+encodeURIComponent(String(cameraId));
}
function streamInfoUrl(cameraId){
  if(!byId.has(String(cameraId)))return null;
  return BASE+'/api/cctv/stream/'+encodeURIComponent(String(cameraId));
}
function mediaUrl(cameraId,lease){
  if(!byId.has(String(cameraId))||!/^[a-f0-9-]{36}$/i.test(lease))return null;
  return BASE+'/api/cctv/media/'+encodeURIComponent(String(cameraId))+'?lease='+encodeURIComponent(lease);
}
window.TravisCctv=Object.freeze({
  load,status,nearest,
  get:id=>byId.get(String(id))||null,
  locations:()=>cameras,
  frameUrl,streamInfoUrl,mediaUrl,
  base:BASE
});
window.addEventListener('travis:world',e=>{
  worldOpen=Boolean(e.detail?.open);
  if(!worldOpen){clearRetry();return;}
  // A previous outage must not make the globe permanently unable to retry.
  if(!inflight){retries=0;void load();}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearRetry();return;}
  if(worldOpen&&!inflight){retries=0;void load();}
});
window.addEventListener('online',()=>{
  if(worldOpen&&!document.hidden&&!inflight){retries=0;void load();}
});
