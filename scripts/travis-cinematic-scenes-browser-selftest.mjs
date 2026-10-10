// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out,fixtures]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const replyFixture='O Sol fica no centro do sistema. A Terra orbita o Sol e recebe a sua luz. Júpiter é um gigante gasoso.';
const fixtureRequests=[];
function voiceFixture(seconds=.3){const rate=16000,samples=rate*seconds,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*180)*500),44+i*2);return b;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=url.pathname;
 if(req.method==='POST'&&['/jarvis','/jarvis-stream','/speak','/visual-research','/visual-intent'].includes(name)){
  let body='';for await(const chunk of req)body+=chunk;fixtureRequests.push({name,body:JSON.parse(body)});const request=JSON.parse(body);
  if(name==='/jarvis-stream'){
   const chunks=['O foguetão parte da Terra.','Entra na trajetória de transferência.','A viagem continua em torno do Sol.','Chega a Marte.'];
   res.setHeader('Content-Type','application/x-ndjson');
   for(const text of chunks)res.write(JSON.stringify({type:'audio',text,language:'pt',audio:voiceFixture(2).toString('base64')})+'\n');
   return res.end(JSON.stringify({type:'result',answer:{ok:true,reply:chunks.join(' '),language:'pt',preferences:{proactive:false},tool:'local_llm'}})+'\n'+JSON.stringify({type:'done'})+'\n');
  }
  if(name==='/speak'){res.setHeader('Content-Type','audio/wav');return res.end(voiceFixture());}
  res.setHeader('Content-Type','application/json');
  if(name==='/jarvis')return res.end(JSON.stringify({ok:true,reply:replyFixture,language:'pt',preferences:{proactive:false}}));
  if(name==='/visual-research'){const file=request.preferModel?(/camara|câmara/i.test(request.query)?'camara.json':/futebol/i.test(request.query)?'futebol.json':'cadeira.json'):'nasa.json';return res.end(await fs.readFile(path.join(fixtures,file)));}
  return res.end(JSON.stringify({ok:false}));
 }

 if(req.method!=='GET'||name==='/health'||name.startsWith('/brain/')||name.startsWith('/tasks')||name.startsWith('/initiative')){
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(name==='/health'?{ok:true}:{ok:false,error:'Visual test; backend not connected'}));
 }
 const file=name.startsWith('/_three/')?path.join(three,name.slice(8)):path.join(repo,name==='/'?'index.html':name);
 let data=await fs.readFile(file);
 if(file.endsWith('.html'))data=Buffer.from(data.toString().replaceAll('https://cdn.jsdelivr.net/npm/three@0.180.0/','/_three/'));
 res.setHeader('Content-Type',file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(data);
 }catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(8770,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5,serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.visualEvents=[];
  for(const name of ['travis:illustration','travis:commands','travis:result','travis:close','travis:state'])window.addEventListener(name,e=>visualEvents.push({time:performance.now(),name,detail:name==='travis:illustration'?{scene:e.detail?.scene,subject:e.detail?.subject}:e.detail}));
 });
 page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error|TypeError|ReferenceError/.test(m.text()))errors.push(m.text());});
 await page.route('https://**',route=>route.abort());
 await page.goto('http://127.0.0.1:8770/?travis=1');
 await page.waitForFunction(()=>window.TravisVisual?.diagnostics().ready&&window.TravisVisual.diagnostics().faceAsset==='bust',{},{timeout:60000});
 await page.evaluate(()=>{TravisVisual.pause();TravisVisual.ready();});
 await page.waitForTimeout(3200);
 await page.evaluate(()=>{window.morphFrames=[];const inspect=()=>{const d=TravisVisual.diagnostics();morphFrames.push({face:d.avatar.visible,dissolve:d.avatar.dissolve,points:d.hologram?.visible,opacity:d.hologram?.matter?.opacity});requestAnimationFrame(inspect);};inspect();});


 const states=[];
 async function capture(name){
  const state=await page.evaluate(()=>({render:TravisVisual.diagnostics(),controller:TravisProjection.status()}));states.push({name,state});
  await page.screenshot({path:path.join(out,name+'.png')});
  await fs.writeFile(path.join(out,'cinematic.json'),JSON.stringify({states,errors,fixtureRequests},null,2));return state;
 }
 async function ask(text){return page.evaluate(text=>TravisProjection.interpret(text),text);}
 await ask('Mostra o sistema solar');await page.waitForTimeout(3000);const solar=await capture('solar');
 await page.waitForTimeout(1200);const solar2=await capture('solar-moving');
 assert(solar2.render.hologram.animation.time>solar.render.hologram.animation.time);
 assert.equal(solar.render.hologram.variant,'solar-system');
 await ask('Pausa a animação');const paused=await capture('paused');await page.waitForTimeout(800);
 const paused2=await page.evaluate(()=>TravisVisual.diagnostics().hologram);assert.equal(paused2.animation.time,paused.render.hologram.animation.time);
 await ask('Continua a animação');await ask('Mais devagar');await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>TravisVisual.diagnostics().hologram)).animation.speed,.3);
 await ask('Isola a Terra');await page.waitForTimeout(2100);const earth=await capture('earth-isolated');assert.equal(earth.controller.title,'Earth');assert.equal(earth.render.hologram.variant,'earth');
 await ask('Aproxima');await page.waitForTimeout(800);assert((await page.evaluate(()=>TravisVisual.diagnostics().hologram)).zoom>1);
 await ask('Mostra tudo');await page.waitForTimeout(2200);assert.equal((await page.evaluate(()=>TravisVisual.diagnostics().hologram)).variant,'solar-system');
 await ask('Mostra chuva');await page.waitForTimeout(2300);const rain=await capture('rain');await page.waitForTimeout(900);const rain2=await capture('rain-moving');assert.equal(rain.controller.scene,'weather');assert(rain2.render.hologram.animation.time>rain.render.hologram.animation.time);assert(!fixtureRequests.some(r=>r.name==='/visual-research'&&/chuva|rain/i.test(r.body.query)));
 await ask('Isola uma gota');await page.waitForTimeout(1800);const drop=await capture('drop-isolated');assert.equal(drop.render.hologram.variant,'drop');await ask('Mostra tudo');await page.waitForTimeout(1600);assert.equal((await page.evaluate(()=>TravisProjection.status())).title,'rain');
 const text='O Travis transforma ideias em imagens. Esta frase tem mais de noventa caracteres e deve aparecer completa, com todas as palavras até ao fim.';
 await ask('Escreve "'+text+'"');await page.waitForTimeout(2300);const full=await capture('full-text');assert.equal(full.render.hologram.textLayout.text,text);assert.equal(full.render.hologram.textLayout.lines.join(' '),text);assert.equal(await page.locator('.travis-visual-caption .travis-motion-title').count(),0);
 await ask('Como é que um foguetão chegaria a Marte?');await page.waitForTimeout(2300);
 await page.evaluate(()=>{window.storyAudio=new AudioContext();storyAudio.resume();TravisProjection.beginNarration({text:'A Terra é o ponto de partida. O foguetão segue uma transferência em torno do Sol até Marte.',context:storyAudio,start:storyAudio.currentTime,duration:12});});
 const departure=await capture('mars-departure');await page.waitForTimeout(5500);const transfer=await capture('mars-transfer');assert.equal(transfer.controller.scene,'journey');assert(transfer.render.hologram.animation.progress>departure.render.hologram.animation.progress);assert(transfer.render.hologram.animation.progress<1);assert.equal(transfer.render.hologram.animation.phase,'transfer');
 await page.waitForTimeout(7000);const arrival=await capture('mars-arrival');assert.equal(arrival.render.hologram.animation.progress,1);assert.equal(arrival.controller.scene,'journey');
 await page.evaluate(()=>window.dispatchEvent(new Event('travis:speech-end')));await page.waitForTimeout(5000);await capture('return-to-face');
 await ask('Mostra uma viagem de foguetão da Terra para a Lua');await page.waitForTimeout(2400);const moon=await capture('moon-departure');assert.equal(moon.render.hologram.animation.type,'earth-moon-transfer');
 for(const [request,name] of [['Mostra neve','snow'],['Mostra fogo','fire'],['Mostra as ondas do oceano','ocean']]){await ask(request);await page.waitForTimeout(2000);await capture(name);}
 await ask('Volta ao Travis');await page.waitForTimeout(2100);const face=await capture('face');assert(face.render.avatar.visible);assert.equal(face.render.avatar.dissolve,0);
 await page.evaluate(()=>{window.streamProgress=[];window.streamChunks=[];window.streamRecording=true;window.addEventListener('travis:visual-timeline',e=>{if(e.detail?.continuous)streamChunks.push(e.detail.text);});const sample=()=>{if(!streamRecording)return;const h=TravisVisual.diagnostics().hologram;if(h?.kind==='journey'&&Number.isFinite(h.animation.progress))streamProgress.push(h.animation.progress);requestAnimationFrame(sample);};sample();});
 await page.locator('#travis-command-text').fill('Como é que um foguetão chegaria a Marte?');await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>window.streamChunks.length===4,{},{timeout:25000});
 await page.waitForFunction(()=>!TravisVisual.diagnostics().lipSync.playbackClock&&['ready','listening','idle'].includes(TravisVisual.diagnostics().state),{},{timeout:15000});
 await page.waitForTimeout(1300);const streaming=await capture('streamed-journey');
 const streamed=await page.evaluate(()=>{streamRecording=false;return {progress:streamProgress,chunks:streamChunks};});assert.equal(streamed.chunks.length,4);assert(streamed.progress.length>5);for(let i=1;i<streamed.progress.length;i++)assert(streamed.progress[i]>=streamed.progress[i-1]-.001,'Chunked speech must not restart the journey');assert(streamed.progress.at(-1)>.99);
 await fs.writeFile(path.join(out,'streamed-journey.json'),JSON.stringify(streamed,null,2));
 const studio=await browser.newPage({viewport:{width:300,height:540},deviceScaleFactor:1,serviceWorkers:'block'});
 studio.on('pageerror',e=>errors.push(e.message));await studio.route('https://**',route=>route.abort());
 await studio.goto('http://127.0.0.1:8770/tools/travis-motion/studio.html?capture');await studio.waitForFunction(()=>window.TRAVIS_MOTION?.ready,{},{timeout:60000});
 await studio.evaluate(()=>TRAVIS_MOTION.render(8));const first=await studio.screenshot();await studio.evaluate(()=>TRAVIS_MOTION.render(.2));await studio.evaluate(()=>TRAVIS_MOTION.render(8));const second=await studio.screenshot();assert(first.equals(second),'Repeated studio seek must reproduce the same animated pose');
 await studio.close();
 assert.deepEqual(errors,[]);
 console.log('PASS CINEMATIC SCENES');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
