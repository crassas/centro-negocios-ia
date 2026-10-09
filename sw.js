const CACHE='centro-negocios-v92-reference-detail';
const SHELL=['./travis-scene-tracker.mjs?v=1','./','./index.html','./styles.css','./app.js?v=travis-panel-2','./agent-room.js?v=jarvis-1','./agent-room.css?v=status-fix-1','./product.css?v=world-8','./travis-hud.css?v=detail-1','./travis-cinema.css?v=cinema-1','./travis-cinema-depth.css?v=depth-2','./travis-3d.mjs?v=detail-1','./travis-vision.mjs?v=scene-1','./travis-audio-sync.mjs?v=1','./travis-vision-policy.mjs?v=scene-1','./travis-web-projection.mjs?v=agent-1','./travis-voice-input.mjs?v=stt-fast-1','./travis-form-director.mjs?v=detail-1','./travis-interface-language.mjs?v=1','./travis-wake-phrase.mjs?v=pt-1','./travis-concept-projection.mjs?v=detail-1','./travis-particle-morph.mjs?v=detail-1','./travis-holographic-surface.mjs?v=detail-1','./travis-visual-subjects.mjs?v=detail-1','./travis-visual-story.mjs?v=detail-1','./travis-architecture.mjs?v=detail-1','./travis-earth-land.mjs?v=1','./travis-projection-framing.mjs?v=1','./travis-neural-field.mjs?v=1','./travis-brain-view.mjs?v=detail-1','./travis-knowledge-graph.mjs?v=cinema-1','./travis-brain-panel.mjs?v=4','./travis-brain.css?v=3','./travis-atmosphere.mjs?v=cinema-1','./travis-face-rig.mjs?v=articulation-2','./travis-holographic-head.mjs?v=detail-1','./travis-presence.mjs?v=3','./travis-youtube.mjs?v=3','./travis-action-cards.mjs?v=detail-1','./travis-english-intents.mjs?v=detail-1','./travis-speech-face.mjs?v=articulation-2','./vendor/headaudio/headaudio.min.mjs','./vendor/headaudio/headworklet.min.mjs','./vendor/headaudio/model-en-mixed.bin','./travis-cockpit.mjs?v=detail-1','./assets/travis/travis-core.glb?v=1','./assets/travis/travis-face-bust.glb?v=1','./manifest.webmanifest','./icon.svg','./data/sites.json'];

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