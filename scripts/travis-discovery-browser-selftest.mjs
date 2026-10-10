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
  if(name==='/speak'){res.setHeader('Content-Type','audio/wav');return res.end(voiceFixture(3));}
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
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5,serviceWorkers:'block'}),errors=[],states=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error|TypeError|ReferenceError/.test(m.text()))errors.push(m.text());});
 await page.route('https://**',route=>route.abort());
 await page.goto('http://127.0.0.1:8770/?travis=1');
 await page.waitForFunction(()=>window.TravisVisual?.diagnostics().ready&&TravisVisual.diagnostics().faceAsset==='bust',{},{timeout:60000});
 await page.evaluate(()=>{TravisVisual.pause();TravisVisual.ready();});await page.waitForTimeout(2500);
 async function capture(name){const state=await page.evaluate(()=>({render:TravisVisual.diagnostics(),controller:TravisProjection.status()}));states.push({name,state});await page.screenshot({path:path.join(out,name+'.png')});await fs.writeFile(path.join(out,'discovery.json'),JSON.stringify({states,errors,fixtureRequests},null,2));return state;}
 for(const [text,title,variant] of [['Mostra um buraco negro','Black hole','black-hole-accretion'],['Mostra uma aurora boreal','Aurora','aurora-curtains'],['Mostra ADN','DNA','dna-double-helix'],['Mostra um átomo','Hydrogen','hydrogen-1s']]){
  const intent=await page.evaluate(text=>TravisProjection.interpret(text),text);assert.equal(intent.needsReference,false,text);
  await page.waitForTimeout(2600);const state=await capture(variant);assert.equal(state.render.hologram.variant,variant);assert.equal(state.controller.title,title);assert(state.render.hologram.visible);
  const before=state.render.hologram.animation.time;await page.waitForTimeout(300);assert((await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.time))>before);
 }
 await page.evaluate(()=>TravisProjection.interpret('Pausa a animação'));await page.waitForTimeout(250);const frozen=await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.time);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.time),frozen);
 await page.evaluate(()=>TravisProjection.interpret('Continua a animação'));
 await page.evaluate(()=>TravisProjection.interpret('Mostra ADN'));await page.waitForTimeout(2400);
 const rotation=await page.evaluate(()=>TravisVisual.diagnostics().hologram.rotation);
 await page.mouse.move(175,390);await page.mouse.down();await page.mouse.move(265,390,{steps:12});await page.mouse.up();await page.waitForTimeout(900);
 const inspected=await capture('inspect-dna');assert(inspected.render.hologram.rotation>rotation+.2,'Drag must rotate real geometry');assert(inspected.controller.pinned);
 await page.mouse.wheel(0,-150);await page.waitForTimeout(700);assert((await page.evaluate(()=>TravisVisual.diagnostics().hologram.zoom))>1,'Wheel zoom');
 await page.evaluate(()=>{const c=document.querySelector('#travis-three-canvas');const e=(type,id,x)=>c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:380,bubbles:true}));e('pointerdown',5,150);e('pointerdown',6,240);e('pointermove',6,280);e('pointerup',6,280);e('pointerup',5,150);});
 await page.waitForTimeout(500);const pinch=await capture('pinch-dna');assert(pinch.render.hologram.zoom>inspected.render.hologram.zoom);
 await page.evaluate(()=>{window.chapterEvents=[];window.addEventListener('travis:transcript',e=>{if(e.detail.role==='assistant')chapterEvents.push({text:e.detail.text,scene:TravisProjection.status().title,index:TravisProjection.status().discovery?.index});});});
 await page.locator('#travis-command-text').fill('Surpreende-me');await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>window.chapterEvents.length===6,{},{timeout:50000});
 await page.waitForFunction(()=>!TravisVisual.diagnostics().voiceBusy,{},{timeout:12000});
 const events=await page.evaluate(()=>chapterEvents);assert.deepEqual(events.map(e=>e.scene),['Milky way','Black hole','Earth','Aurora','DNA','Hydrogen']);assert.deepEqual(events.map(e=>e.index),[0,1,2,3,4,5]);
 assert.equal(fixtureRequests.filter(r=>r.name==='/jarvis-stream'||r.name==='/visual-research').length,0,'Curated journey must not trigger an LLM or model search');
 await capture('journey-complete');await page.waitForTimeout(6500);const face=await capture('return');assert(face.render.avatar.visible);assert.equal(face.render.avatar.dissolve,0);
 // Replace a running journey: no stale prefetched chapter may take over.
 await page.locator('#travis-command-text').fill('Surprise me');await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>TravisVisual.diagnostics().state==='speaking',{},{timeout:12000});
 await page.locator('#travis-command-text').fill('Mostra chuva');await page.locator('#travis-command button[type=submit]').click();await page.waitForTimeout(6000);
 assert.equal(await page.evaluate(()=>TravisProjection.status().title),'rain');await capture('interrupted-rain');
 await page.evaluate(()=>TravisVisual.close());await page.waitForTimeout(500);await page.evaluate(()=>TravisVisual.ready());await page.waitForTimeout(2300);assert.equal(await page.evaluate(()=>TravisProjection.status().scene),null);
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'discovery.json'),JSON.stringify({states,events,errors,fixtureRequests},null,2));console.log('PASS Discovery browser: four real 3D scenes, pause, drag, zoom, exact chapter/audio pairing, interruption, return and reopen');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
