// Optional hardware-free browser regression. Arguments: Playwright module,
// Chromium executable, and optionally an object-detection image fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [playwrightPath,executablePath,fixture]=process.argv.slice(2);
if(!playwrightPath||!executablePath)throw new Error('Pass Playwright module and Chromium executable paths');
const {chromium}=await import(pathToFileURL(playwrightPath));
const html='<div id="travis-hud" data-ui-language="pt"><div id="travis-camera-dock"><button id="travis-camera-toggle"></button><span id="travis-camera-state"></span><video id="travis-camera-preview" muted autoplay playsinline></video></div></div>';
const server=http.createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(name==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
    const file=name==='/fixture.png'&&fixture?fixture:path.join(root,name);
    if(name!=='/fixture.png'&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.png')?'image/png':'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async()=>{
    const {createTravisVision}=await import('/travis-vision.mjs');
    const state=window.testState={requests:[],tracks:[],loads:0,creates:0,closed:0,critical:false,empty:false,defer:false,deny:false};
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const ctx=canvas.getContext('2d');let count=0;
    state.draw=setInterval(()=>{ctx.fillStyle=count++%2?'#999':'#777';ctx.fillRect(0,0,640,480);},40);
    state.canvas=canvas;
    navigator.mediaDevices.getSupportedConstraints=()=>({facingMode:true});
    navigator.mediaDevices.getUserMedia=async constraints=>{
      state.requests.push(constraints);
      if(state.deny)throw new DOMException('Denied','NotAllowedError');
      if(state.defer)await new Promise(resolve=>state.release=resolve);
      const stream=canvas.captureStream(20),track=stream.getVideoTracks()[0];state.tracks.push(track);
      track.getSettings=()=>({width:640,height:480,facingMode:constraints.video.facingMode.exact});
      return stream;
    };
    const close=()=>state.closed++;
    state.bundle={
      FilesetResolver:{forVisionTasks:async()=>({})},
      ObjectDetector:{createFromOptions:async()=>{state.creates++;return {close,detectForVideo:()=>({detections:state.empty?[]:[{categories:[{categoryName:'bottle',score:.91}],boundingBox:{originX:64,originY:96,width:128,height:240}}]})};}},
      GestureRecognizer:{createFromOptions:async()=>{state.creates++;return {close,recognizeForVideo:()=>({gestures:[],landmarks:[]})};}},
      FaceDetector:{createFromOptions:async()=>{state.creates++;return {close,detectForVideo:()=>({detections:[]})};}}
    };
    state.create=()=>createTravisVision({isSpeechCritical:()=>state.critical,loadModelBundle:async()=>{state.loads++;if(state.slowLoad)await new Promise(resolve=>state.releaseModels=resolve);return state.bundle;}});
    window.vision=state.create();
    await vision.start();
  });
  await page.waitForFunction(()=>vision.snapshot().objects.length===1);
  let result=await page.evaluate(()=>({scene:vision.snapshot(),description:vision.describe('pt'),requests:testState.requests}));
  assert.equal(result.scene.facingMode,'environment');assert.equal(result.scene.facingVerified,true);
  assert.match(result.description,/garrafa à esquerda/);assert.equal(result.requests[0].audio,false);
  await page.locator('.travis-vision-overlay').click({position:{x:100,y:150}});
  assert.equal(await page.evaluate(()=>vision.snapshot().selectedTarget?.name),'bottle');
  await page.evaluate(async()=>{await vision.switchCamera();await vision.switchCamera();});
  result=await page.evaluate(()=>({requests:testState.requests.map(x=>x.video.facingMode.exact),creates:testState.creates,oldStopped:testState.tracks.slice(0,-1).every(t=>t.readyState==='ended')}));
  assert.deepEqual(result.requests,['environment','user','environment']);assert.equal(result.creates,3);assert.equal(result.oldStopped,true);
  await page.waitForFunction(()=>vision.snapshot().objects.length===1);
  await page.evaluate(()=>testState.critical=true);
  await page.waitForFunction(()=>vision.snapshot().objects.length===0,{},{timeout:6000});
  assert.match(await page.evaluate(()=>vision.describe('pt')),/não confirmei/);
  await page.evaluate(()=>{vision.stop();testState.critical=false;testState.defer=true;window.cancelled=vision.start();});
  await page.waitForFunction(()=>!!testState.release);
  await page.evaluate(async()=>{vision.stop();testState.release();await cancelled;});
  assert.equal(await page.evaluate(()=>vision.snapshot().active),false);
  assert.equal(await page.evaluate(()=>testState.tracks.every(t=>t.readyState==='ended')),true);
  await page.evaluate(()=>{testState.defer=false;testState.deny=true;});
  assert.equal(await page.evaluate(async()=>{try{await vision.start();return false;}catch(e){return e.name==='NotAllowedError'&&!vision.snapshot().active;}}),true);
  await page.evaluate(async()=>{
    vision.destroy();testState.deny=false;testState.slowLoad=true;vision=testState.create();window.loading=vision.start();
  });
  await page.waitForFunction(()=>!!testState.releaseModels);
  await page.evaluate(async()=>{vision.stop();testState.releaseModels();await loading;});
  assert.equal(await page.evaluate(()=>vision.snapshot().active),false);
  assert.equal(await page.evaluate(()=>testState.tracks.every(t=>t.readyState==='ended')),true);
  await page.evaluate(()=>{vision.destroy();clearInterval(testState.draw);});
  assert.deepEqual(errors,[]);
  console.log('PASS browser lifecycle: rear/front, single model set, overlay selection, expiry during speech, permission denial, cancelled camera/model startup');
  if(fixture){
    await page.evaluate(async()=>{
      const {createTravisVision}=await import('/travis-vision.mjs');
      const img=new Image();img.src='/fixture.png';await img.decode();
      const ctx=testState.canvas.getContext('2d');
      testState.draw=setInterval(()=>ctx.drawImage(img,0,0,640,480),60);
      vision=createTravisVision();await vision.start();
    });
    await page.waitForFunction(()=>vision.snapshot().objects.some(o=>o.name==='dog'),{},{timeout:30000});
    const real=await page.evaluate(()=>({snapshot:vision.snapshot(),description:vision.describe('pt')}));
    assert.equal(real.snapshot.objectModel,'ready');assert.match(real.description,/cão/);
    console.log('PASS real MediaPipe inference on supplied image fixture:',JSON.stringify(real.snapshot.objects.map(o=>({name:o.name,score:o.score}))));
    await page.evaluate(()=>{vision.destroy();clearInterval(testState.draw);});
    assert.deepEqual(errors,[]);
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
