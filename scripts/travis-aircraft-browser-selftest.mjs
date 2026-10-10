// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const replyFixture='Modelo de referência.';
const fixtureRequests=[];
function voiceFixture(seconds=.3){const rate=16000,samples=rate*seconds,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*180)*500),44+i*2);return b;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=url.pathname;
 if(req.method==='POST'&&['/jarvis','/jarvis-stream','/speak','/visual-research','/visual-intent'].includes(name)){
  let body='';for await(const chunk of req)body+=chunk;fixtureRequests.push({name,body:JSON.parse(body)});const request=JSON.parse(body);
  if(name==='/speak'){res.setHeader('Content-Type','audio/wav');return res.end(voiceFixture(.6));}
  res.setHeader('Content-Type','application/json');
  if(name==='/jarvis')return res.end(JSON.stringify({ok:true,reply:replyFixture,language:'pt',preferences:{proactive:false}}));
  if(name==='/visual-research')throw Error('Aircraft must not request an unrelated external model');
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
 // Use the real text/voice dispatch twice, as in the reported failure.
 for(const [text,name] of [['Mostra uma avião','airplane-pt'],['Mostra uma avião','airplane-pt-repeat'],['Show me a plane','airplane-en']]){
  await page.locator('#travis-command-text').fill(text);await page.locator('#travis-command button[type=submit]').click();
  await page.waitForFunction(()=>TravisVisual.diagnostics().hologram?.variant==='airplane');
  await page.waitForFunction(()=>!TravisVisual.diagnostics().voiceBusy,{},{timeout:16000});
  await page.waitForTimeout(2800);const s=await capture(name);
  assert.equal(s.render.hologram.variant,'airplane');assert(s.render.hologram.animation.triangles>15000);
  assert.equal(s.controller.gallery,null);assert.equal(s.render.hologram.animation.engines,2);
 }
 const start=await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.time);await page.waitForTimeout(400);
 assert((await page.evaluate(()=>TravisVisual.diagnostics().hologram.animation.time))>start);
 await request('Zoom in');await page.waitForTimeout(800);await capture('airplane-detail');
 await request('Roda para a direita');await page.waitForTimeout(800);await capture('airplane-turned');
 await page.evaluate(()=>TravisProjection.applyModelIntent({ok:true,scene:'object',title:'Plane'},'Imagine an airplane'));
 await page.waitForTimeout(2600);assert.equal((await capture('airplane-semantic')).render.hologram.variant,'airplane');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('travis:result',{detail:{ui:{kind:'illustration',scene:'vehicle',title:'Avião'}}})));
 await page.waitForTimeout(2600);assert.equal((await capture('airplane-tool')).render.hologram.variant,'airplane');
 assert.equal((await request('Show me a hand plane')).needsReference,true);
 assert.equal((await request('Show a mathematical plane')).needsReference,true);
 assert.equal((await request('Mostra um Boeing 747')).needsReference,true);
 assert.equal((await request('Mostra fotografias de um avião')).referenceRequested,true);
 await request('Mostra um avião');await page.waitForTimeout(2700);
 await request('Volta ao Travis');await page.waitForTimeout(3600);await capture('return-to-travis');
 assert(!fixtureRequests.some(r=>r.name==='/visual-research'));
 assert.deepEqual(errors,[]);console.log('PASS aircraft: repeated PT/EN requests, true 3D, motion, zoom, rotation, semantic/tool routes, tool/geometry/named-model separation and return');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
