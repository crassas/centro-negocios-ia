/* Production controllers + real TfL HTTP data/images, with a tiny GEV protocol fixture.
 * Visibility/page-cache events are simulated. Does not validate Cesium GPU or phone audio.
 */
const assert=require('node:assert/strict');
const base=process.env.TRAVIS_BASE||'http://127.0.0.1:8770';
const modules=process.env.TRAVIS_MODULE_PREFIX||'/travis-rest-stage/';
const html=`<!doctype html><html><head><link rel="stylesheet" href="/travis-cctv-player.css"><link rel="stylesheet" href="/travis-road-live.css"></head><body>
<section id="travis-hud" aria-hidden="false"><button id="travis-world-toggle"></button></section>
<script>
window.__hidden=false;Object.defineProperty(document,'hidden',{get:()=>window.__hidden});
window.__visibility=hidden=>{window.__hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));};
window.__released=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.__released.push(url);revoke(url)};
window.TravisWorld={open(){},close(){},status(){return {open:false}},locations:['earth','london']};
window.TravisProjection={dismiss(){}};window.TravisVisual={open(){},setState(){}};
window.TravisCctvAutopilot={cancel(){}};
<\/script><script type="module">
await import('${modules}travis-gev-bridge.mjs');
await import('/travis-cctv-network.mjs?v=eye-8-private');
await import('${modules}travis-cctv-player.mjs');
await import('${modules}travis-road-live.mjs');
window.__ready=true;
<\/script></body></html>`;
if(process.argv.includes('--fixture-html')){process.stdout.write(html);process.exit(0)}
const puppeteer=require(process.env.PUPPETEER_PATH||'/root/.centro-extensions/gods-eye-view/node_modules/puppeteer');
(async()=>{
 let browser;const proof={scope:'real DOM/controllers + TfL HTTP; fixture GEV renderer; simulated visibility',checks:[],errors:[],images:[]};
 const deadline=setTimeout(()=>{console.error('REST_DEADLINE',JSON.stringify(proof));if(browser?.process()?.exitCode===null){try{process.kill(-browser.process().pid,'SIGTERM')}catch{}}process.exit(2);},150000);
 try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',headless:'shell',timeout:15000,
   args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer','--disable-background-networking']});
  const page=await browser.newPage();page.on('pageerror',e=>proof.errors.push(String(e)));
  console.log('REST_STEP','browser-ready',browser.process()?.pid);
  await page.setRequestInterception(true);
  page.on('request',r=>{
   if(r.url().startsWith('http://127.0.0.1:4173/?embed=1'))return r.respond({status:200,contentType:'text/html',body:`<script>addEventListener('message',e=>{if(e.data.type==='gev:view'){window.view=e.data.view;parent.postMessage({type:'gev:view-applied',id:e.data.id,ok:true},'${base}')}});parent.postMessage({type:'gev:ready'},'${base}');<\/script>`});
   return r.continue();
  });
  page.on('response',r=>{if(r.url().includes('/api/cctv/frame/'))proof.images.push({status:r.status(),source:r.headers()['x-cctv-source'],type:r.headers()['content-type']})});
  await page.goto(base+'/travis-rest-check.html',{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>window.__ready,{timeout:10000});
  console.log('REST_STEP','modules-ready');
  await page.evaluate(()=>window.TravisRoadLive.routeCommand('Road Live in London',{language:'en'}));
  await page.waitForFunction(()=>!window.TravisRoadLive.status().busy&&window.TravisGevBridge.status().lastApplied,{timeout:23000});
  await page.click('.travis-road-row button');
  await page.waitForFunction(()=>!window.TravisGevBridge.status().pending&&!window.TravisGevBridge.status().inFlight,{timeout:5000});
  const state=()=>page.evaluate(()=>({road:window.TravisRoadLive.status(),world:window.TravisGevBridge.status(),camera:window.TravisCctvPlayer.status(),frame:document.getElementById('travis-gev-frame').src,resources:window.TravisResources.status()}));
  const start=await state();assert.equal(start.road.state,'current');assert.ok(start.world.externalAnnotationCount>0);assert.equal(start.road.panelOpen,false);
  console.log('REST_STEP','road-ready',start.road.count);
  const hide=()=>page.evaluate(()=>{window.__visibility(true);window.dispatchEvent(new Event('pagehide'))});
  const wake=()=>page.evaluate(()=>{window.__visibility(false);window.dispatchEvent(new Event('pageshow'))});
  await hide();const sleeping=await state();assert.equal(sleeping.frame,'about:blank');assert.equal(sleeping.world.open,true);assert.equal(sleeping.world.suspended,true);assert.equal(sleeping.road.open,true);assert.equal(sleeping.road.suspended,true);assert.equal(sleeping.world.externalAnnotationCount,start.world.externalAnnotationCount);
  await wake();await page.waitForFunction(()=>window.TravisGevBridge.status().ready&&window.TravisGevBridge.status().lastApplied&&!window.TravisGevBridge.status().inFlight,{timeout:10000});
  const restored=await state();assert.deepEqual(restored.world.coordinates,start.world.coordinates);assert.deepEqual(restored.world.layers,start.world.layers);assert.equal(restored.world.externalAnnotationCount,start.world.externalAnnotationCount);assert.equal(restored.road.panelOpen,false);assert.equal(restored.road.suspended,false);assert.equal(restored.road.count,start.road.count);
  const frame=page.frames().find(f=>f.url().startsWith('http://127.0.0.1:4173'));
  const applied=await frame.evaluate(()=>window.view);assert.equal(applied.annotations.length,start.world.externalAnnotationCount);assert.equal(applied.camera.lat,start.world.coordinates.lat);
  proof.checks.push({name:'road-and-commanded-view-survive-sleep',passed:true,records:start.road.count,annotations:applied.annotations.length});
  console.log('REST_STEP','road-restored');
  await page.evaluate(()=>window.TravisCctv.load());
  const camera=await page.evaluate(async()=>{
   const net=window.TravisCctv;const ids=['tfl-00001.06502',...net.locations().filter(c=>c.pack==='tfl').slice(0,4).map(c=>c.id)];
   for(const id of [...new Set(ids)]){const r=await window.TravisCctvPlayer.openCamera(id,{timeoutMs:8000});if(r.ok)return {id,result:r,status:window.TravisCctvPlayer.status()};}
   return null;
  });assert.ok(camera);assert.equal(camera.result.type,'snapshot');
  console.log('REST_STEP','camera-ready',camera.id);
  const image=()=>page.evaluate(()=>({src:document.getElementById('cctv-image').src,width:document.getElementById('cctv-image').naturalWidth,visible:!document.getElementById('cctv-image').hidden,released:window.__released}));
  const before=await image();assert.ok(before.width>0);assert.equal(before.visible,true);
  await hide();const cameraSleep=await state();const released=await image();assert.equal(cameraSleep.camera.sourceId,camera.id);assert.equal(cameraSleep.camera.suspended,true);assert.equal(cameraSleep.camera.playingVerified,false);assert.equal(released.visible,false);assert.ok(released.released.includes(before.src));
  await wake();await page.waitForFunction(()=>!window.TravisCctvPlayer.status().suspended&&!document.getElementById('cctv-image').hidden&&document.getElementById('cctv-image').naturalWidth>0,{timeout:45000});
  const after=await image();assert.notEqual(after.src,before.src);assert.equal((await state()).camera.sourceId,camera.id);
  proof.checks.push({name:'camera-frees-image-and-reloads-same-source',passed:true,sourceId:camera.id,width:after.width});
  console.log('REST_STEP','camera-restored');
  await hide();await page.evaluate(()=>{window.TravisCctvPlayer.close();window.TravisGevBridge.close()});await wake();
  const closed=await state();assert.equal(closed.camera.open,false);assert.equal(closed.world.open,false);assert.equal(closed.frame,'about:blank');assert.equal(closed.road.open,false);
  proof.checks.push({name:'closed-features-do-not-reopen-on-wake',passed:true});
  assert.ok(proof.images.filter(x=>x.status===200&&x.source==='upstream-image').length>=2);assert.deepEqual(proof.errors,[]);proof.ok=true;
 }catch(e){proof.ok=false;proof.error=String(e);console.error(e.stack||e)}
 finally{
  if(browser){await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);if(browser.process()?.exitCode===null){try{process.kill(-browser.process().pid,'SIGTERM')}catch{}}}
  clearTimeout(deadline);console.log('REST_BROWSER_RESULT',JSON.stringify(proof));process.exit(proof.ok?0:1);
 }
})();
