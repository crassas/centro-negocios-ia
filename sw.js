const CACHE='centro-negocios-v51-bilingual-voice';
const SHELL=['./','./index.html','./styles.css','./app.js?v=travis-panel-2','./agent-room.js?v=jarvis-1','./agent-room.css?v=status-fix-1','./product.css?v=world-8','./travis-hud.css?v=connections1','./travis-3d.mjs?v=bilingual-voice-1','./travis-atmosphere.mjs?v=connections1','./travis-face-rig.mjs?v=connections1','./travis-holographic-head.mjs','./travis-speech-face.mjs','./vendor/headaudio/headaudio.min.mjs','./vendor/headaudio/headworklet.min.mjs','./vendor/headaudio/model-en-mixed.bin','./travis-cockpit.mjs?v=connections1','./assets/travis/travis-core.glb?v=1','./assets/travis/travis-face-bust.glb?v=1','./manifest.webmanifest','./icon.svg','./data/sites.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone());
    }
    return response;
  }catch{
    const cached=await caches.match(request);
    if(cached)return cached;
    throw new Error('offline');
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(/^\/(gmail(?:\/|$)|health$|voice$)/.test(url.pathname))return;

  const freshAsset=
    event.request.mode==='navigate' ||
    ['document','script','style','manifest'].includes(event.request.destination) ||
    url.pathname.endsWith('/data/live.json') ||
    url.pathname.endsWith('/data/sites.json');

  if(freshAsset){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached)return cached;
      return fetch(event.request).then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      });
    })
  );
});