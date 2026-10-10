// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out,fixtures]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const replyFixture='O Sol fica no centro do sistema. A Terra orbita o Sol e recebe a sua luz. Júpiter é um gigante gasoso.';
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

 await capture('idle-open-space');
 async function request(text){const result=await page.evaluate(async t=>{const intent=TravisProjection.interpret(t);if(intent?.pendingAnatomy)await TravisProjection.prepareAnatomy(intent);return intent;},text);assert(result?.handled,text);assert(!result.needsReference,text);return result;}
 await request('Mostra um meteorito a passar perto da Terra');await page.waitForTimeout(3200);
 let state=await capture('earth-flyby');assert.equal(state.render.hologram.variant,'constructed-scene');assert.equal(state.controller.plan.layout,'flyby');
 assert.equal(await page.locator('.travis-scene-controls button').count(),0);
 const submit=await page.locator('#travis-command button[type=submit]').boundingBox();assert(submit.width===44&&submit.height===44);
 const before=state.render.hologram.animation.objects.find(o=>o.asset==='Meteor').position;
 await page.waitForTimeout(1500);const moving=await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation);assert.notDeepEqual(moving.objects.find(o=>o.asset==='Meteor').position,before);
 await request('Pausa a animação');await page.waitForTimeout(150);const paused=await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation);await page.waitForTimeout(400);assert.deepEqual((await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation)).objects,paused.objects);
 await request('Isola o meteorito');await page.waitForTimeout(1400);state=await capture('meteor-focus');assert.equal(state.render.hologram.animation.focused,'Meteor');assert.equal(state.render.hologram.animation.objects.filter(o=>o.visible).length,2);
 await request('Mostra tudo');await request('Continua a animação');await page.waitForTimeout(1600);
 const previousTime=await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.time);
 await request('Adiciona a Lua');await page.waitForTimeout(2200);state=await capture('earth-meteor-moon');assert(state.render.hologram.animation.time>=previousTime,'Edits preserve time');assert.deepEqual(state.controller.plan.nodes.map(n=>n.asset),['Earth','Meteor','Moon']);
 await request('Retira a Lua');await page.waitForTimeout(2200);assert.deepEqual((await page.evaluate(()=>TravisProjection.status().plan)).nodes.map(n=>n.asset),['Earth','Meteor']);
 await request('Constrói a Terra com a Lua e um satélite');await page.waitForTimeout(2700);state=await capture('orbital-assembly');assert.equal(state.render.hologram.animation.layout,'orbit');
 await request('Constrói uma casa com uma árvore e chuva');await page.waitForTimeout(3200);state=await capture('house-tree-rain');assert.equal(state.render.hologram.animation.environment,'earth');assert.equal(state.render.hologram.animation.objects.length,3);
 await request('Isola a árvore');await page.waitForTimeout(1800);assert.equal((await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation)).focused,'Tree');
 await request('Mostra um cometa');await page.waitForTimeout(2700);await capture('comet');
 await request('Mostra uma aurora boreal');await page.waitForTimeout(2700);await capture('aurora-clear-background');
 await request('Mostra o sistema solar');await page.waitForTimeout(2700);await capture('solar-open-space');
 // Contextual focus keeps the exact same planet nodes and running clock.
 const solar=await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation);
 await request('Isola Marte');await page.waitForTimeout(2000);state=await capture('mars-context');
 assert.equal(state.controller.scene,'planet');assert.equal(state.render.hologram.variant,'solar-system');assert.equal(state.render.hologram.animation.focused,'Mars');
 assert.deepEqual(state.render.hologram.animation.objects.map(o=>o.uuid),solar.objects.map(o=>o.uuid));assert(state.render.hologram.animation.time>solar.time);assert.equal(state.render.hologram.animation.objects.filter(o=>o.visible).length,9);
 await request('Zoom in');assert((await page.evaluate(()=>TravisVisual.diagnostics().hologram.zoom))>1);
 await request('Isola Júpiter');await page.waitForTimeout(1200);assert.equal((await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation)).focused,'Jupiter');
 await request('Mostra tudo');await page.waitForTimeout(1700);state=await capture('solar-restored');assert.equal(state.render.hologram.animation.focused,null);assert.equal(state.render.hologram.zoom,1);assert.deepEqual(state.render.hologram.animation.objects.map(o=>o.uuid),solar.objects.map(o=>o.uuid));
 await request('Show me only planet Mars');await page.waitForTimeout(2600);state=await capture('mars-only');assert.equal(state.render.hologram.variant,'mars');
 await request('Mostra o esqueleto');await page.waitForTimeout(3000);state=await capture('human-skeleton');assert.equal(state.render.hologram.variant,'anatomical-reference');assert.equal(state.render.hologram.animation.objects.length,13);
 const skeleton=state.render.hologram.animation;
 await request('Isola o crânio');await page.waitForTimeout(2100);state=await capture('skull-context');assert.equal(state.render.hologram.animation.focused,'skull');assert.deepEqual(state.render.hologram.animation.objects.map(o=>o.uuid),skeleton.objects.map(o=>o.uuid));
 await request('Mostra o corpo humano');await page.waitForTimeout(3000);state=await capture('human-anatomy');assert.equal(state.render.hologram.animation.objects.length,21);
 await request('Isola o coração');await page.waitForTimeout(2100);state=await capture('heart-context');assert.equal(state.render.hologram.animation.focused,'heart');assert.equal(state.render.hologram.animation.objects.filter(o=>o.visible).length,21);
 await request('Mostra-me só o coração');await page.waitForTimeout(2600);state=await capture('heart-only');assert.equal(state.render.hologram.animation.objects.length,1);
 await request('Mostra um motor elétrico');await page.waitForTimeout(2600);await request('Isola o rotor');await page.waitForTimeout(2100);state=await capture('motor-rotor');assert.equal(state.render.hologram.animation.focused,'rotor');assert.equal(state.render.hologram.animation.objects.length,5);assert.equal(await page.locator('.travis-mechanical-controls button').count(),0);
 // Typed form -> voice route -> same scene, without image search or LLM dependency.
 await page.locator('#travis-command-text').fill('Mostra um meteorito a passar perto da Terra');await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>TravisProjection.status().plan?.layout==='flyby',{},{timeout:12000});
 await page.waitForFunction(()=>!TravisVisual.diagnostics().voiceBusy,{},{timeout:16000});
 await page.waitForTimeout(2700);await capture('typed-flyby');
 assert(fixtureRequests.some(r=>r.name==='/speak'));assert(!fixtureRequests.some(r=>r.name==='/visual-research'||r.name==='/visual-intent'));
 await page.evaluate(()=>TravisVisual.commands(false));await page.waitForTimeout(2200);state=await capture('return-to-travis');assert(state.render.avatar.visible);assert.equal(state.render.avatar.dissolve,0);
 await page.setViewportSize({width:1365,height:900});await request('Mostra um meteorito a passar perto da Terra');await page.waitForTimeout(2700);await capture('desktop-flyby');
 // A fresh reduced-motion session must leave every object still.
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>TravisVisual?.diagnostics().ready&&TravisVisual.diagnostics().faceAsset==='bust',{},{timeout:60000});await page.evaluate(()=>{TravisVisual.pause();TravisVisual.ready();});
 await request('Constrói a Terra com a Lua e um satélite');await page.waitForTimeout(1700);const still=await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.objects);await page.waitForTimeout(500);assert.deepEqual(await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.objects),still);await capture('reduced-motion');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'worlds.json'),JSON.stringify({states,errors,fixtureRequests},null,2));console.log('PASS context + anatomy + constructed worlds: actual geometry, flyby, pause, focus, edit continuity, orbital assembly, house/weather, voice route, desktop and reduced motion');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
