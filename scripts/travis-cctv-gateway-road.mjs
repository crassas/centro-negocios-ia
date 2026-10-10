/**
 * Travis CCTV-only local gateway — reuses unchanged God's Eye View CCTV plugin.
 * No Vite/Cesium process. No arbitrary URL proxy, no private webcams.
 * Bind strictly to loopback and authorize only the local Travis UI origins.
 *
 * Original upstream: https://github.com/bilawalsidhu/gods-eye-view (MIT).
 * Source fallbacks never pass off as real live images.
 */
import http from 'node:http';
import {performance} from 'node:perf_hooks';
import {cctvProxy} from './gods-eye-view/server/providers/cctv.js';
import {handleRoadLive} from './travis-road-live.mjs';
const PORT=4187;
const HOST='127.0.0.1';
const ROOT='/root/.centro-extensions/gods-eye-view';
const ALLOW_ORIGINS=new Set(['http://127.0.0.1:8770','http://localhost:8770']);
const MATCH=/^\/api\/cctv\/(?:sources|health|stream\/[^/]{1,128}|frame\/[^/]{1,128}|media\/[^/]{1,128}(?:\/seg_\d{1,12}\.ts)?)$/;
const plugin=cctvProxy({sourceRoot:ROOT});
let cctvHandler=null,starts=Date.now(),requests=0,failures=0,active=0;
const frameTimes=new Map();

const server=http.createServer(async(req,res)=>{
  const stamp=performance.now();
  const url=new URL(req.url||'/','http://'+HOST+':'+PORT);
  const origin=req.headers.origin||'';
  const allowed=!origin||ALLOW_ORIGINS.has(origin);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Origin');
  if(!allowed){
    res.writeHead(403,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'unauthorized origin'}));
    return;
  }
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS,DELETE');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  res.setHeader('Access-Control-Expose-Headers','X-CCTV-Source,Content-Type,Content-Length');
  if(req.method==='OPTIONS'){
    res.writeHead(204);res.end();return;
  }
  // Public road observations share this existing local-only, origin-checked gateway.
  // This is a fixed source allowlist, NOT an arbitrary URL proxy.
  if(url.pathname.startsWith('/api/road-live/')){
    await handleRoadLive(req,res,url);
    return;
  }
  if(url.pathname==='/healthz'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true,service:'Travis CCTV',originalPlugin:'gods-eye-view',
      port:PORT,uptimeSeconds:Math.round((Date.now()-starts)/1000),
      requests,errors:failures,active}));
    return;
  }
  if(!MATCH.test(url.pathname) ||
      !['GET','DELETE'].includes(req.method) ||
      (req.method==='DELETE'&&!url.pathname.startsWith('/api/cctv/media/'))){
    res.writeHead(404,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'unsupported CCTV route'}));
    return;
  }
  if(!cctvHandler){
    res.writeHead(503,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'camera provider not ready'}));
    return;
  }
  const isFrame=url.pathname.startsWith('/api/cctv/frame/');
  if(isFrame){
    const key=url.pathname;
    const last=frameTimes.get(key)||0;
    if(Date.now()-last<10000){
      res.writeHead(429,{'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'wait before refreshing image'}));
      return;
    }
    if(frameTimes.size>1200)frameTimes.delete(frameTimes.keys().next().value);
    frameTimes.set(key,Date.now());
  }
  if(active>=8){
    res.writeHead(503,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'camera service busy'}));
    return;
  }
  // Original plugin expects its Connect-mounted path relative to /api/cctv.
  // Never accept user supplied upstream URLs or arbitrary hosts.
  req.url=url.pathname.slice('/api/cctv'.length)+url.search;
  const originalWriteHead=res.writeHead.bind(res);
  res.writeHead=(status, headers={})=>{
    const label=Object.entries(headers||{}).find(([k])=>k.toLowerCase()==='x-cctv-source')?.[1];
    if(isFrame&&label&&label!=='upstream-image'){
      status=503;
      headers={...headers,'X-CCTV-Source':'unavailable',
        'Cache-Control':'no-store','X-Travis-Note':'No simulated video'};
    }
    return originalWriteHead(status,headers);
  };
  requests++;
  active++;
  res.once('close',()=>{active=Math.max(0,active-1);});
  try{
    await cctvHandler(req,res);
  }catch(err){
    failures++;
    console.warn('[CCTV]',err?.message||String(err),'after',Math.round(performance.now()-stamp),'ms');
    if(!res.headersSent){
      res.writeHead(502,{'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'public camera temporarily unavailable'}));
    }else if(!res.writableEnded)res.end();
  }
});
plugin.configureServer({
  httpServer:server,
  middlewares:{
    use(prefix,fn){
      if(prefix==='/api/cctv'&&typeof fn==='function')cctvHandler=fn;
    }
  }
});
if(!cctvHandler)throw Error('Original CCTV middleware failed to mount');
server.requestTimeout=25000;
server.headersTimeout=27000;
server.keepAliveTimeout=5000;
server.listen(PORT,HOST,()=>{
  console.log('[Travis CCTV] original Gods Eye View camera catalog and media available at '+HOST+':'+PORT);
});
for(const type of ['SIGTERM','SIGINT']){
  process.on(type,()=>server.close(()=>process.exit(0)));
}
