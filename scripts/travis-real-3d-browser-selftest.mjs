// Hardware-free full UI regression; backend requests are isolated test responses.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const [playwrightModule,executablePath,three,out,fixtures]=process.argv.slice(2);
if(!playwrightModule||!executablePath||!three||!out)throw new Error('Pass Playwright module, Chromium binary, Three.js package directory and evidence directory');
const {chromium}=await import(pathToFileURL(playwrightModule));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');await fs.mkdir(out,{recursive:true});
const replyFixture='O Sol fica no centro do sistema. A Terra orbita o Sol e recebe a sua luz. Júpiter é um gigante gasoso.';
const fixtureRequests=[];
function voiceFixture(){const rate=16000,seconds=.3,samples=rate*seconds,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*180)*500),44+i*2);return b;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=url.pathname;
 if(req.method==='POST'&&['/jarvis','/jarvis-stream','/speak','/visual-research','/visual-intent'].includes(name)){
  let body='';for await(const chunk of req)body+=chunk;fixtureRequests.push({name,body:JSON.parse(body)});const request=JSON.parse(body);
  if(name==='/speak'){res.setHeader('Content-Type','audio/wav');return res.end(voiceFixture());}
  res.setHeader('Content-Type','application/json');
  if(name==='/jarvis'||name==='/jarvis-stream')return res.end(JSON.stringify({ok:true,reply:replyFixture,language:'pt',preferences:{proactive:false}}));
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
 async function submit(text){await page.locator('#travis-command-text').fill(text);await page.locator('#travis-command button[type=submit]').click();}
 async function settled(){await page.waitForFunction(()=>!TravisVisual.diagnostics().lipSync.playbackClock&&TravisVisual.diagnostics().state==='ready',{},{timeout:15000});await page.waitForTimeout(1400);}
 for(const [text,name] of [['Mostra uma cadeira de madeira','chair'],['Mostra uma câmara fotográfica','camera'],['Mostra futebol','football']]){
  await submit(text);await page.waitForFunction(name=>TravisVisual.diagnostics().hologram?.variant==='sourced-3d'&&(name==='chair'?TravisProjection.status().title.includes('Cadeira'):name==='camera'?/camara/i.test(TravisProjection.status().title):TravisProjection.status().title==='Futebol'),name,{timeout:20000});await settled();
  await page.screenshot({path:path.join(out,name+'.png')});console.log('rendered',name);
  assert.equal(await page.evaluate(()=>TravisProjection.status().scene),'model');
  assert(!(await page.locator('.travis-visual-caption').textContent()).includes('Poly Haven'),'Credits stay off the hologram');
  await page.getByRole('button',{name:'Fontes',exact:true}).click();
  await page.locator('#travis-sources').waitFor({state:'visible'});
  assert((await page.locator('#travis-sources').textContent()).includes('Poly Haven'));
  assert((await page.locator('#travis-sources').textContent()).includes('CC0'));
  assert(await page.locator('#travis-sources a').first().getAttribute('href'));
  if(name==='chair')await page.screenshot({path:path.join(out,'sources-panel.png')});
  await page.keyboard.press('Escape');
  await page.locator('#travis-sources').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>TravisProjection.status().scene),'model','Escape closes sources, not Travis');
  assert.equal(await page.evaluate(()=>document.activeElement?.className),'travis-sources-toggle');
  assert.equal(await page.locator('.travis-visual-caption button[aria-label="Roda para a direita"]').count(),1);
  await page.screenshot({path:path.join(out,name+'.png')});
  states.push({name,state:await page.evaluate(()=>TravisVisual.diagnostics().hologram)});
  await page.locator('button[aria-label="Roda para a direita"]').click();await settled();
  const rotated=await page.evaluate(()=>TravisVisual.diagnostics().hologram.rotation);assert(rotated>.4,'Actual volume rotates');
  await page.screenshot({path:path.join(out,name+'-rotated.png')});
 }
 await submit('Mostra fotografias de Júpiter');await page.waitForFunction(()=>TravisProjection.status().scene==='reference',{},{timeout:15000});await settled();
 assert(!(await page.locator('.travis-visual-caption').textContent()).includes('NASA'));
 await page.getByRole('button',{name:'Fontes',exact:true}).click();
 assert((await page.locator('#travis-sources').textContent()).includes('NASA'));
 assert((await page.locator('#travis-sources').textContent()).includes('Poly Haven'),'Sources from previous narrated scenes stay available');
 await page.getByRole('button',{name:'Fechar fontes'}).click();
 assert((await page.locator('.travis-visual-caption').textContent()).includes('FOTOGRAFIA'));
 assert.equal(await page.getByRole('button',{name:'Procurar objeto 3D'}).count(),1);
 await page.screenshot({path:path.join(out,'nasa-photo.png')});
 // A new request supersedes a delayed 3D response; it must not replace Jupiter.
 const stale=await page.evaluate(()=>TravisProjection.interpret('Mostra uma cadeira de madeira'));
 await page.evaluate(()=>TravisProjection.interpret('Mostra Júpiter'));
 const fixture=JSON.parse(await fs.readFile(path.join(fixtures,'cadeira.json'),'utf8'));
 await page.evaluate(async({result,intent})=>TravisProjection.applyReference(result,intent),{result:fixture,intent:stale});
 assert.equal(await page.evaluate(()=>TravisVisual.diagnostics().hologram.variant),'jupiter');
 // Real provider geometry must have depth, one draw call and the shared material.
 const meshEvidence=await page.evaluate(async payload=>{
  const {decodeReferenceModel,disposeReferenceModel,validateModelDocument}=await import('./travis-model-library.mjs?v=figures-1');
  const model=await decodeReferenceModel(payload),evidence={triangles:model.triangles,bounds:model.bounds,children:model.group.children.length,holographic:model.materials[0].userData.holographicSurface};disposeReferenceModel(model);
  let blocked=0;for(const edit of [d=>d.buffers[0].uri='https://localhost/private',d=>d.images=[{uri:'https://evil.test/a.png'}],d=>d.nodes[0].children=[0],d=>d.accessors[0].count=99999999]){const d=structuredClone(payload.gltf);edit(d);try{validateModelDocument(d);}catch{blocked++;}}
  return {...evidence,blocked};
 },fixture.model);
 assert(meshEvidence.triangles>1000&&meshEvidence.triangles<=100000);
 assert(Math.min(...meshEvidence.bounds)>.1);assert.equal(meshEvidence.children,1);assert(meshEvidence.holographic);assert.equal(meshEvidence.blocked,4);
 await page.evaluate(()=>TravisProjection.interpret('Volta a ti'));await page.waitForFunction(()=>TravisVisual.diagnostics().avatar.visible,{},{timeout:15000});
 assert.equal(await page.evaluate(()=>TravisVisual.diagnostics().avatar.visible),true);
 assert(fixtureRequests.filter(r=>r.name==='/visual-research'&&r.body.preferModel).length===3);
 assert(fixtureRequests.some(r=>r.name==='/visual-research'&&!r.body.preferModel&&r.body.query==='Jupiter'));
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'real-3d.json'),JSON.stringify({states,meshEvidence,requests:fixtureRequests,errors},null,2));
 console.log('PASS REAL_3D_BROWSER: three actual provider meshes, depth, rotation, shared material, NASA photograph, explicit routing, stale response, input bounds and return to face');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
