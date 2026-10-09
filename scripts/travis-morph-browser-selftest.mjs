// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=url.pathname;
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
 await page.evaluate(()=>TravisProjection.interpret('show me a house'));
 await page.waitForTimeout(420);await record('02-house-transition');
 await page.waitForTimeout(1400);await record('03-house');
 assert.equal(states.at(-1).state.hologram.kind,'house','First visual request must survive controller initialization');
 assert.equal(states.at(-1).state.hologram.matter.active,true);
 await page.evaluate(()=>{TravisVisual.speak('Visual envelope fixture');TravisVisual.setVoiceLevel(.7);});
 await page.waitForFunction(()=>TravisVisual.diagnostics().hologram.matter.voice>.3);
 await page.evaluate(()=>{TravisVisual.clearVoiceLevel();TravisVisual.ready();});
 await page.evaluate(()=>TravisProjection.interpret('mostra-me um planeta aleatório'));
 assert(['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'].includes(await page.evaluate(()=>TravisVisual.diagnostics().hologram.matter.target)));
 await page.waitForTimeout(400);
 await page.evaluate(()=>TravisProjection.interpret('show me Saturn'));
 await page.waitForTimeout(1600);await record('04-saturn');
 assert.equal(states.at(-1).state.hologram.matter.source,'previous-form');
 assert.equal(states.at(-1).state.hologram.matter.target,'Saturn');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('travis:speech-end')));
 await page.waitForFunction(()=>TravisVisual.diagnostics().hologram.matter.returning,{},{timeout:20000});
 await page.waitForTimeout(1600);await record('06-face-restored');
 assert.equal(states.at(-1).state.hologram.matter.active,false);
 assert.equal(states.at(-1).state.avatar.visible,true);
 assert.equal(states.at(-1).state.avatar.dissolve,0);
 const frames=await page.evaluate(()=>morphFrames);
 assert(frames.length>20);
 assert(frames.every(f=>f.face&&f.dissolve<.999||f.points&&f.opacity>.001),'Every rendered transition frame must keep the avatar or its particle form present');
 await fs.writeFile(path.join(out,'states.json'),JSON.stringify({states,errors,events:await page.evaluate(()=>visualEvents)},null,2));
 assert.deepEqual(errors,[]);console.log('PASS browser: first house, PT random planet, interrupted shape change, voice envelope, automatic face return, no blank handoff, no shader errors');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
