// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out,fixtures]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const replyFixture='Modelo de referência.';
const fixtureRequests=[];let transientFailed=false,permanentFault=false;
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
  if(name==='/speak'){if((request.text.startsWith('Um buraco negro.')&&!transientFailed)||(permanentFault&&request.text.startsWith('Now, the DNA'))){transientFailed=true;res.writeHead(503);return res.end('Temporary voice fixture failure');}res.setHeader('Content-Type','audio/wav');return res.end(voiceFixture(3));}
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
 async function capture(name){const state=await page.evaluate(()=>({render:TravisVisual.diagnostics(),controller:TravisProjection.status()}));states.push({name,state});await page.screenshot({path:path.join(out,name+'.png')});await fs.writeFile(path.join(out,'worlds.json'),JSON.stringify({states,errors,fixtureRequests},null,2));return state;}

 async function request(text){return page.evaluate(async t=>{const intent=TravisProjection.interpret(t);if(intent?.pendingAnatomy||intent?.pendingFigure)await TravisProjection.prepareVisual(intent);return intent;},text);}
 for(const [text,name,variant] of [['Pessoa','person','reference-human'],['Corpo humano','body','anatomical-reference'],['Astronaut','astronaut','reference-astronaut']]){
  const intent=await request(text);assert(intent.handled);assert(intent.prepared);assert(!intent.needsReference);
  await page.waitForTimeout(3200);const s=await capture(name);assert.equal(s.render.hologram.variant,variant);
  assert.equal(await page.locator('.travis-visual-caption button').count(),0);
  assert.equal(s.controller.gallery,null);assert(s.render.hologram.animation.triangles>6000);
 }
 await request('Zoom in');await page.waitForTimeout(900);await capture('astronaut-detail');
 await request('Roda para a direita');await page.waitForTimeout(900);await capture('astronaut-turned');
 // Model-interpreted requests use the same asynchronous resolver.
 await page.evaluate(async()=>{const i=TravisProjection.applyModelIntent({ok:true,scene:'person',title:'Human figure'},'imagina uma pessoa');if(!i.pendingFigure)throw Error('Missing reference figure');await TravisProjection.prepareVisual(i);});
 await page.waitForTimeout(3200);assert.equal((await capture('person-semantic')).render.hologram.variant,'reference-human');
 // Backend illustrations cannot revive the old primitive path.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('travis:result',{detail:{ui:{kind:'illustration',scene:'person',title:'Corpo humano'}}})));
 await page.waitForFunction(()=>TravisProjection.status().scene==='anatomy');await page.waitForTimeout(2700);await capture('body-tool-result');
 // A stale asynchronous request cannot replace a newer planet scene.
 await page.evaluate(async()=>{const i=TravisProjection.interpret('Astronaut');TravisProjection.interpret('Mostra Marte');const ok=await TravisProjection.prepareVisual(i);if(ok)throw Error('Stale model accepted');});
 assert.equal(await page.evaluate(()=>TravisProjection.status().scene),'planet');
 // No generated cube/person or unrelated image is allowed to stand in for 3D.
 const noModel=await page.evaluate(async()=>{const i=TravisProjection.interpret('Mostra um okapi em 3D');const reply=await TravisProjection.applyReference({ok:true,title:'Unrelated children',imageData:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN98AAAAASUVORK5CYII=',modelUnavailable:true},i);return {reply,status:TravisProjection.status()};});
 assert(noModel.reply.includes('modelo 3D'));assert.equal(noModel.status.scene,'planet');assert.equal(noModel.status.gallery,null);
 // Explicit images remain a separate, correctly parsed request.
 const photo=await page.evaluate(()=>TravisProjection.interpret('Mostra fotografias de um astronauta'));assert.equal(photo.referenceRequested,true);assert.equal(photo.researchQuery.toLowerCase(),'astronauta');
 // Full typed/voice dispatch must await the figure before announcing success.
 await page.locator('#travis-command-text').fill('Mostra um astronauta');await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>TravisVisual.diagnostics().hologram?.variant==='reference-astronaut');
 await page.waitForFunction(()=>!TravisVisual.diagnostics().voiceBusy,{},{timeout:16000});await page.waitForTimeout(1500);await capture('astronaut-request');
 assert(!fixtureRequests.some(r=>r.name==='/visual-research'));assert(fixtureRequests.some(r=>r.name==='/speak'&&r.body.text.includes('Astronauta')));
 await request('Volta ao Travis');await page.waitForTimeout(3600);await capture('return-to-travis');
 // Missing assets must report failure and leave the face available.
 await page.route('**/assets/travis/figures/*.json',route=>route.fulfill({status:404,body:'Missing asset fixture'}));
 await page.reload();await page.waitForFunction(()=>window.TravisVisual?.diagnostics().ready&&TravisVisual.diagnostics().faceAsset==='bust',{},{timeout:60000});
 const failed=await page.evaluate(async()=>{const i=TravisProjection.interpret('Mostra uma pessoa');const ok=await TravisProjection.prepareVisual(i);return {ok,reply:i.reply,status:TravisProjection.status()};});
 assert.equal(failed.ok,false);assert(failed.reply.includes('Não consegui carregar'));assert.equal(failed.status.scene,null);
 assert.deepEqual(errors,[]);console.log('PASS figures: sourced person and astronaut, bare body, semantic/tool/voice routes, depth/rotation/zoom, no silent photo fallback, no stale response, return to face');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
