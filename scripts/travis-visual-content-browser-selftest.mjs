// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const replyFixture='O Sol fica no centro do sistema. A Terra orbita o Sol e recebe a sua luz. Júpiter é um gigante gasoso.';
const fixtureRequests=[];
function voiceFixture(){const rate=16000,seconds=12,samples=rate*seconds,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*180)*500),44+i*2);return b;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=url.pathname;
 if(req.method==='POST'&&['/jarvis','/speak','/visual-research'].includes(name)){
  let body='';for await(const chunk of req)body+=chunk;fixtureRequests.push({name,body:JSON.parse(body)});
  if(name==='/speak'){res.setHeader('Content-Type','audio/wav');return res.end(voiceFixture());}
  res.setHeader('Content-Type','application/json');
  if(name==='/jarvis')return res.end(JSON.stringify({ok:true,reply:replyFixture,language:'pt',preferences:{proactive:false}}));
  return res.end(await fs.readFile(process.argv[6],'utf8'));
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
  for(const name of ['travis:illustration','travis:commands','travis:result','travis:close','travis:state'])window.addEventListener(name,e=>visualEvents.push({time:performance.now(),name,detail:e.detail}));
 });
 page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error|TypeError|ReferenceError/.test(m.text()))errors.push(m.text());});
 await page.route('https://**',route=>route.abort());
 await page.goto('http://127.0.0.1:8770/?travis=1');
 await page.waitForFunction(()=>window.TravisVisual?.diagnostics().ready&&window.TravisVisual.diagnostics().faceAsset==='bust',{},{timeout:60000});
 await page.evaluate(()=>{TravisVisual.pause();TravisVisual.ready();});
 await page.waitForTimeout(3200);
 await page.evaluate(()=>{window.morphFrames=[];const inspect=()=>{const d=TravisVisual.diagnostics();morphFrames.push({face:d.avatar.visible,dissolve:d.avatar.dissolve,points:d.hologram?.visible,opacity:d.hologram?.matter?.opacity});requestAnimationFrame(inspect);};inspect();});
 const states=[];
 async function record(name){await page.screenshot({path:path.join(out,name+'.png')});const state=await page.evaluate(()=>TravisVisual.diagnostics());states.push({name,state});console.log(name,JSON.stringify({form:state.form,kind:state.hologram?.kind,target:state.hologram?.matter?.target,frames:state.renderedFrames}));}
 await record('01-face');
 for(const [request,variant] of [
  ['Mostra-me Júpiter','jupiter'],['Mostra-me Marte','mars'],['Mostra-me a Terra','earth'],
  ['Mostra-me o Sol','sun'],['Mostra-me o espaço','galaxy'],['Mostra as letras "TRAVIS"','text'],
  ['Mostra-me ADN','dna'],['Mostra-me uma casa','house']
 ]){
  const receipt=await page.evaluate(request=>TravisProjection.interpret(request),request);
  assert(receipt?.handled,request);await page.waitForTimeout(1600);
  await record(variant);assert.equal(states.at(-1).state.hologram.variant,variant,request);
  assert.equal(states.at(-1).state.hologram.matter.active,true);
 }
 const explanation=await page.evaluate(()=>TravisProjection.interpret('Explica-me o sistema solar'));
 assert.equal(explanation.handled,false,'Explanations must reach the conversational backend');
 await page.evaluate(()=>{window.testAudioClock={currentTime:0};TravisProjection.beginNarration({text:'O Sol fica no centro. A Terra orbita o Sol e tem uma lua. Júpiter é um gigante gasoso.',context:testAudioClock,start:0,duration:24});});
 await page.waitForTimeout(1200);
 await page.evaluate(()=>testAudioClock.currentTime=18);await page.waitForTimeout(1700);
 await record('narration');assert.equal(states.at(-1).state.hologram.variant,'jupiter');
 await page.evaluate(()=>TravisProjection.interpret('Mostra as letras "OLÁ"'));
 await page.waitForTimeout(1600);await page.evaluate(()=>testAudioClock.currentTime=23);
 assert.equal(await page.evaluate(()=>TravisProjection.status().narration),null,'New requests cancel old narration cues');
 const fixturePath=process.argv[6];
 if(fixturePath){
  const reference=JSON.parse(await fs.readFile(fixturePath,'utf8'));
  await page.evaluate(async reference=>{const intent=TravisProjection.interpret('Show me the Eiffel Tower');await TravisProjection.applyReference(reference,intent);},reference);
  await page.waitForTimeout(1700);await record('reference');assert.equal(states.at(-1).state.hologram.variant,'reference');
  assert.equal(states.at(-1).state.projectionControl.sourceUrl,reference.url);
  await page.evaluate(async reference=>{const old=TravisProjection.interpret('Show me a butterfly');TravisProjection.interpret('Mostra Marte');await TravisProjection.applyReference(reference,old);},reference);
  await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>TravisVisual.diagnostics().hologram.variant),'mars','Late reference results must not replace a new request');
 }

 await page.evaluate(()=>TravisVisual.ask('Explica-me o sistema solar'));
 await page.waitForFunction(()=>TravisVisual.diagnostics().lipSync.playbackClock&&TravisProjection.status().narration,{},{timeout:20000});
 await page.waitForFunction(()=>TravisVisual.diagnostics().hologram.variant==='earth',{},{timeout:12000});
 await page.waitForFunction(()=>TravisVisual.diagnostics().hologram.variant==='jupiter',{},{timeout:12000});
 await record('actual-audio-clock');
 await page.waitForFunction(()=>!TravisVisual.diagnostics().lipSync.playbackClock,{},{timeout:16000});
 await page.waitForFunction(()=>!TravisVisual.diagnostics().hologram.matter.active,{},{timeout:10000});
 assert(fixtureRequests.some(r=>r.name==='/jarvis'&&r.body.text==='Explica-me o sistema solar'));
 assert(fixtureRequests.some(r=>r.name==='/speak'&&r.body.text===replyFixture));
 await page.evaluate(()=>{TravisVisual.pause();TravisVisual.ready();});
 await page.evaluate(()=>TravisProjection.interpret('Volta ao Travis'));
 await page.waitForTimeout(1800);await record('restored');
 assert.equal(states.at(-1).state.avatar.visible,true);assert.equal(states.at(-1).state.avatar.dissolve,0);
 const frames=await page.evaluate(()=>morphFrames);
 assert(frames.length>20);
 assert(frames.every(f=>f.face&&f.dissolve<.999||f.points&&f.opacity>.001),'Every rendered transition frame must keep the avatar or its particle form present');
 await fs.writeFile(path.join(out,'states.json'),JSON.stringify({states,errors,events:await page.evaluate(()=>visualEvents)},null,2));
 assert.deepEqual(errors,[]);console.log('PASS browser: distinct named subjects, letters, explanation audio-clock cues, interruption, return to face, no shader errors');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
