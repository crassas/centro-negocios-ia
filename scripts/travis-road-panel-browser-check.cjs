/* Real road module, CSS, cinema controls and TfL HTTP data.
 * The map adapter records annotations; this does not render the 3D globe.
 * Emit --fixture-html into the Travis UI directory, run, then remove that file.
 */
const assert=require('node:assert/strict');
const base=process.env.TRAVIS_BASE||'http://127.0.0.1:8770';
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/travis-road-live.css">
<style>body{margin:0;background:#13100e;color:white}#travis-hud{height:844px;position:relative}</style></head><body>
<section id="travis-hud" aria-hidden="false"><section id="travis-gev-official"><nav class="travis-gev-toolbar"></nav></section></section>
<script>
window.__annotations=[];window.__moves=[];
window.TravisGevBridge={status:()=>({open:true,place:'london'}),navigate(...args){window.__moves.push(args)},setExternalAnnotations(rows){window.__annotations=structuredClone(rows)}};
window.TravisProjection={dismiss(){}};window.TravisCctvPlayer={close(){}};window.TravisCctvAutopilot={cancel(){}};
<\/script><script type="module">
await import('/travis-road-live.mjs?v=road-panel-1');
await import('/travis-cinematic-shell.mjs?v=road-panel-1');
window.__ready=true;
<\/script></body></html>`;
if(process.argv.includes('--fixture-html')){process.stdout.write(html);process.exit(0)}
const puppeteer=require(process.env.PUPPETEER_PATH||'/root/.centro-extensions/gods-eye-view/node_modules/puppeteer');
(async()=>{
 let browser;const proof={scope:'real DOM, CSS, TfL data and cinema controls; map annotation adapter fixture',checks:[],errors:[]};
 try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',headless:'shell',timeout:15000,
   args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer','--disable-background-networking']});
  const page=await browser.newPage();await page.setViewport({width:390,height:844});page.on('pageerror',e=>proof.errors.push(String(e)));
  await page.goto(base+'/travis-road-panel-check.html',{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>window.__ready,{timeout:10000});
  await page.evaluate(()=>window.TravisRoadLive.routeCommand('Road Live in London',{language:'en'}));
  await page.waitForFunction(()=>!window.TravisRoadLive.status().busy,{timeout:20000});
  const snapshot=()=>page.evaluate(()=>({road:window.TravisRoadLive.status(),display:getComputedStyle(document.getElementById('travis-road-live')).display,annotations:window.__annotations,moves:window.__moves.length}));
  const start=await snapshot();assert.equal(start.road.state,'current');assert.ok(start.annotations.length>0);assert.notEqual(start.display,'none');
  proof.source=start.road.source;proof.records=start.road.count;proof.markerCount=start.annotations.length;
  const retained=async name=>{const s=await snapshot();assert.equal(s.display,'none');assert.equal(s.road.open,true);assert.equal(s.road.panelOpen,false);assert.deepEqual(s.annotations,start.annotations);proof.checks.push({name,passed:true,markerCount:s.annotations.length})};
  const reopen=async()=>{await page.evaluate(()=>window.TravisCinemaUI.setTools(true));await page.click('#travis-road-toggle');const s=await snapshot();assert.notEqual(s.display,'none');assert.deepEqual(s.annotations,start.annotations);return s};
  await page.click('.travis-road-row button');await retained('select-event-hides-list-keeps-markers');
  const focus=await snapshot();const reopened=await reopen();assert.equal(reopened.moves,focus.moves);
  await page.click('#travis-road-close');await retained('close-card-keeps-markers');
  await reopen();
  const reply=await page.evaluate(()=>window.TravisCinemaUI.routeCommand('Focus on globe'));assert.equal(reply.handled,true);await retained('focus-globe-keeps-markers');
  await page.evaluate(()=>window.TravisRoadLive.routeCommand('Turn off Road Live'));
  const off=await snapshot();assert.equal(off.road.open,false);assert.deepEqual(off.annotations,[]);assert.equal(off.display,'none');
  proof.checks.push({name:'explicit-off-removes-markers',passed:true});assert.deepEqual(proof.errors,[]);proof.ok=true;
 }catch(e){proof.ok=false;proof.error=String(e);console.error(e.stack||e)}
 finally{
  if(browser){await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);if(browser.process()?.exitCode===null){try{process.kill(-browser.process().pid,'SIGTERM')}catch{}}}
  console.log('ROAD_PANEL_RESULT',JSON.stringify(proof));process.exit(proof.ok?0:1);
 }
})();
