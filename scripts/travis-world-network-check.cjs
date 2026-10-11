/* Real DOM + real public network checks; the globe adapter and projection are fixtures.
 * Does not test the phone microphone, speaker, GPU or real flight rendering.
 * Run on the Travis host with PUPPETEER_PATH and CHROME_PATH configured.
 */
const assert = require('node:assert/strict');
const base = process.env.TRAVIS_BASE || 'http://127.0.0.1:8770';
const html = `<!doctype html><html><body>
<section id="travis-hud" aria-hidden="false"><button id="travis-world-toggle"></button></section>
<script>
window.__projection={scene:'car'};window.__cameraResults=[];
window.TravisProjection={dismiss(){window.__projection.scene=null}};
window.TravisVisual={open(){},setState(){}};
window.__world={open:false,layers:[]};
window.TravisGevBridge={open(){window.__world.open=true},navigate(){},toggleLayer(id){window.__world.layers=[id]},setExternalAnnotations(){},status(){return window.__world}};
addEventListener('travis:cctv-auto-result',e=>window.__cameraResults.push(e.detail));
<\/script>
<script type="module">
await import('/travis-cctv-network.mjs?v=world-repair-1');
await import('/travis-cctv-player.mjs?v=world-repair-1');
await import('/travis-cctv-autopilot.mjs?v=world-repair-1');
await import('/travis-road-live.mjs?v=world-repair-1');
window.__ready=true;
<\/script></body></html>`;
// Serve this fixture from the actual local HTTP origin. Intercepted HTML has
// unknown address space in Chromium and can invalidate private-network checks.
if(process.argv.includes('--fixture-html')){process.stdout.write(html);process.exit(0)}
const puppeteer = require(process.env.PUPPETEER_PATH || '/root/.centro-extensions/gods-eye-view/node_modules/puppeteer');
(async()=>{
 let browser; const proof={scope:'real DOM and public network; fixture globe adapter and projection',checks:[],errors:[]};
 try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',headless:'shell',timeout:15000,
   args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer','--disable-background-networking']});
  const page=await browser.newPage();await page.setViewport({width:800,height:900});
  page.on('pageerror',e=>proof.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')console.log('BROWSER_ERROR',m.text().slice(0,500))});
  page.on('requestfailed',r=>console.log('REQUEST_FAILED',r.url(),r.failure()?.errorText));
  page.on('response',r=>{if(r.url().includes('/api/cctv/frame/'))console.log('FRAME_RESPONSE',r.url(),r.status(),r.headers()['x-cctv-source'],r.headers()['content-type'])});
  await page.goto(base+'/travis-world-network-check.html',{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>window.__ready,{timeout:10000});
  const coverage=await page.evaluate(()=>window.TravisCctvAutopilot.routeCommand('Where are cameras available?',{language:'en'}));
  console.log('COVERAGE',JSON.stringify(coverage),await page.evaluate(()=>window.TravisCctv.status()));proof.coverage=coverage;
  const road=await page.evaluate(()=>window.TravisRoadLive.routeCommand('Road Live in London',{language:'en'}));assert.equal(road.handled,true);
  await page.waitForFunction(()=>!window.TravisRoadLive.status().busy,{timeout:25000});
  const roadState=await page.evaluate(()=>({status:window.TravisRoadLive.status(),projection:window.__projection.scene,visible:!document.getElementById('travis-road-live').hidden,text:document.getElementById('travis-road-list').textContent.slice(0,300)}));
  console.log('ROAD',JSON.stringify(roadState));assert.equal(roadState.status.state,'current');assert.ok(roadState.status.count>0);assert.equal(roadState.projection,null);assert.equal(roadState.visible,true);
  proof.checks.push({name:'real-road-DOM',...roadState});
  await page.evaluate(()=>window.TravisCctvAutopilot.routeCommand("See what's going on in London",{language:'en'}));
  await page.waitForFunction(()=>window.__cameraResults.length>0,{timeout:65000});
  let camera=await page.evaluate(()=>window.__cameraResults.at(-1));proof.london=camera;console.log('LONDON',JSON.stringify(camera));
  if(!camera.verified){
   await page.evaluate(()=>window.TravisCctvAutopilot.routeCommand('Show any public camera',{language:'en'}));
   await page.waitForFunction(()=>window.__cameraResults.length>1,{timeout:60000});
   camera=await page.evaluate(()=>window.__cameraResults.at(-1));
  }
  console.log('PLAYER_AFTER_SELECTION',JSON.stringify(await page.evaluate(()=>({result:window.__cameraResults.at(-1),state:window.TravisCctvPlayer.status(),message:document.getElementById('cctv-status').textContent}))));
  assert.equal(camera.verified,true);
  const decoded=await page.evaluate(()=>({width:document.getElementById('cctv-image').naturalWidth,height:document.getElementById('cctv-image').naturalHeight,visible:!document.getElementById('cctv-image').hidden,state:window.TravisCctvPlayer.status()}));
  console.log('CAMERA',JSON.stringify({camera,decoded}));assert.ok(decoded.width>0);assert.equal(decoded.visible,true);
  proof.checks.push({name:'real-camera-image-decoded',camera,decoded});
  proof.followup=await page.evaluate(()=>window.TravisCctvAutopilot.routeCommand('What am I looking at?'));
  assert.match(proof.followup.reply,/You are viewing a still image/);
  const closed=await page.evaluate(async()=>{await window.TravisCctvAutopilot.routeCommand('Close camera');return {camera:window.TravisCctvPlayer.status(),road:window.TravisRoadLive.status()}});
  assert.equal(closed.camera.open,false);assert.equal(closed.road.open,false);
  proof.checks.push({name:'road-camera-transition-and-close',passed:true});proof.ok=true;
 }catch(e){proof.ok=false;proof.error=String(e);console.error(e.stack||e);}
 finally{
  if(browser){await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);if(browser.process()?.exitCode===null){try{process.kill(-browser.process().pid,'SIGTERM')}catch{}}}
  console.log('NETWORK_CHECK_RESULT',JSON.stringify(proof));process.exit(proof.ok?0:1);
 }
})();
