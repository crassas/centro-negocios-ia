// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const replyFixture='O Sol fica no centro do sistema. A Terra orbita o Sol e recebe a sua luz. Júpiter é um gigante gasoso.';
const fixtureRequests=[];
function voiceFixture(){const rate=16000,seconds=.3,samples=rate*seconds,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*180)*500),44+i*2);return b;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=url.pathname;
 if(req.method==='POST'&&['/jarvis','/jarvis-stream','/speak','/visual-research','/visual-intent'].includes(name)){
  let body='';for await(const chunk of req)body+=chunk;fixtureRequests.push({name,body:JSON.parse(body)});
  if(name==='/speak'){res.setHeader('Content-Type','audio/wav');return res.end(voiceFixture());}
  res.setHeader('Content-Type','application/json');
  if(name==='/jarvis'||name==='/jarvis-stream')return res.end(JSON.stringify({ok:true,reply:replyFixture,language:'pt',preferences:{proactive:false}}));
  return res.end(JSON.stringify({ok:false,error:'External research is disabled in this routing regression'}));
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

 const cases=['“mostra um motor elétrico','“Mostra um motor elétrico”','Travis, mostra-me um motor eléctrico, por favor.'];
 for(const [i,text] of cases.entries()){
  await page.locator('#travis-command-text').fill(text);
  await page.locator('#travis-command button[type=submit]').click();
  await page.waitForFunction(()=>TravisVisual.diagnostics().hologram?.variant==='motor-cutaway',{},{timeout:10000});
  await page.waitForFunction(()=>!TravisVisual.diagnostics().lipSync.playbackClock&&TravisVisual.diagnostics().state==='ready',{},{timeout:12000});
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.travis-mechanical-controls button').count(),2);
  assert.equal(await page.locator('.travis-reference-navigation:not(.travis-mechanical-controls)').count(),0,'No photo gallery for a generic motor');
  await page.screenshot({path:path.join(out,'quoted-motor-'+i+'.png')});
 }
 for(const [text,variant] of [['“Separa as peças”','motor-exploded'],['“Junta as peças','motor-cutaway']]){
  await page.locator('#travis-command-text').fill(text);await page.locator('#travis-command button[type=submit]').click();
  await page.waitForFunction(variant=>TravisVisual.diagnostics().hologram?.variant===variant,variant,{timeout:10000});await page.waitForTimeout(1400);
 }
 await page.screenshot({path:path.join(out,'motor-reassembled.png')});
 const literal=await page.evaluate(()=>TravisProjection.interpret('Escreve “mostra um motor elétrico”'));
 assert.equal(literal.scene,'text');assert.equal(literal.title,'mostra um motor elétrico');
 assert.equal(literal.needsReference,false);
 await page.waitForTimeout(1400);await page.screenshot({path:path.join(out,'literal-text.png')});
 const photos=await page.evaluate(()=>TravisProjection.interpret('“Mostra fotos de um motor elétrico”'));
 assert(photos.needsReference&&photos.referenceRequested,'Photos only when explicitly requested');
 const scriptRequests=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>x.name));
 assert(scriptRequests.some(url=>url.includes('travis-english-intents.mjs?v=figures-1')),'Browser must load the new router');
 assert.equal(fixtureRequests.filter(r=>['/visual-research','/visual-intent','/jarvis','/jarvis-stream'].includes(r.name)).length,0,'Copied local commands must not call research or the model');
 assert(fixtureRequests.some(r=>r.name==='/speak'&&r.body.text==='A projetar Electric motor.'));
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'quoted-routing.json'),JSON.stringify({cases,requests:fixtureRequests,errors,events:await page.evaluate(()=>visualEvents)},null,2));
 console.log('PASS QUOTED_REQUESTS_BROWSER: real form submission, smart quotes, motor controls, zero research/model calls, literal text preserved');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
