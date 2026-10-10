import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const [playwrightPath,chromiumPath,three]=process.argv.slice(2);
if(!playwrightPath||!chromiumPath||!three)throw new Error('Pass Playwright module, Chromium binary and Three.js directory');
const {chromium}=await import(pathToFileURL(playwrightPath));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wav=Buffer.alloc(44+16000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
let requests=0,finalSent=false;
const server=http.createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/travis-voice-input.mjs'){res.setHeader('content-type','text/javascript');return res.end(`export function createVoiceInput(callbacks){window.voiceTest=callbacks;let active=false;return {async start(){active=true},stop(){active=false},diagnostics(){return {active,speaking:false}}}}`);}
 if(req.method==='POST'&&name==='/jarvis-stream'){
  requests++;let body='';for await(const part of req)body+=part;
  if(JSON.parse(body).text==='stop'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:true,reply:'Stopped.',language:'en',tool:'stop'}));}
  res.setHeader('content-type','application/x-ndjson');
  res.write(JSON.stringify({type:'audio',audio:wav.toString('base64'),text:'First useful sentence.',language:'en'})+'\n');
  if(requests===4){setTimeout(()=>{if(!res.destroyed)res.end(JSON.stringify({type:'error',error:'synthetic network interruption'})+'\n');},100);return;}
  setTimeout(()=>{if(res.destroyed)return;res.write(JSON.stringify({type:'audio',audio:wav.toString('base64'),text:'Second useful sentence.',language:'en'})+'\n');},200);
  setTimeout(()=>{if(res.destroyed)return;finalSent=true;res.end(JSON.stringify({type:'result',answer:{ok:true,reply:'First useful sentence. Second useful sentence.',language:'en',preferences:{language:'en',proactive:false},tool:'local_llm'}})+'\n'+JSON.stringify({type:'done'})+'\n');},1500);
  return;
 }
 if(req.method!=='GET'||name==='/health'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(name==='/health'?{ok:true,voiceProtocol:'ndjson-audio-v1'}:{ok:false}));}
 const file=name.startsWith('/_three/')?path.join(three,name.slice(8)):path.join(repo,name==='/'?'index.html':name);
 let data=await fs.readFile(file);
 if(file.endsWith('.html'))data=Buffer.from(data.toString().replaceAll('https://cdn.jsdelivr.net/npm/three@0.180.0/','/_three/'));
 res.setHeader('content-type',file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);
 }catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(8770,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:chromiumPath,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**',route=>route.abort());
 await page.goto('http://127.0.0.1:8770/?travis=1');
 await page.waitForFunction(()=>window.TravisVisual?.diagnostics().ready,{},{timeout:60000});
 await page.evaluate(()=>TravisVisual.ready());
 await page.locator('#travis-command-text').fill('Tell me a short story');
 await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>TravisVisual.diagnostics().lipSync.playbackClock,{},{timeout:10000});
 assert.equal(finalSent,false,'Audio must begin before the full response arrives');
 await page.waitForFunction(()=>!TravisVisual.diagnostics().lipSync.playbackClock&&['ready','listening'].includes(TravisVisual.diagnostics().state),{},{timeout:10000});
 assert.equal(requests,1);
 await page.locator('#travis-command-text').fill('Tell me another short story');
 await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>TravisVisual.diagnostics().lipSync.playbackClock,{},{timeout:10000});
 await page.evaluate(()=>window.voiceTest.onStart());
 assert.equal(await page.evaluate(()=>Boolean(TravisVisual.diagnostics().lipSync.playbackClock)),true,'VAD alone must not cancel playback');
 await page.evaluate(()=>window.voiceTest.onSpeech(new Blob(),performance.now(),Promise.resolve({text:'First useful sentence.'})));
 assert.equal(await page.evaluate(()=>document.querySelector('#travis-hud').dataset.echoGuard),'ignored');
 assert.equal(await page.evaluate(()=>Boolean(TravisVisual.diagnostics().lipSync.playbackClock)),true,'Echo must not cancel playback');
 const at=Date.now();await page.evaluate(async()=>{window.voiceTest.onStart();await window.voiceTest.onSpeech(new Blob(),performance.now(),Promise.resolve({text:'stop'}));});
 await page.waitForFunction(()=>!TravisVisual.diagnostics().lipSync.playbackClock);
 const interruptionMs=Date.now()-at;
 await page.waitForTimeout(1800);
 assert.equal(await page.evaluate(()=>Boolean(TravisVisual.diagnostics().lipSync.playbackClock)),false,'Cancelled queued audio must not restart');
 assert.equal(requests,3);
 await page.locator('#travis-command-text').fill('Tell me a final story');
 await page.locator('#travis-command button[type=submit]').click();
 await page.waitForFunction(()=>TravisVisual.diagnostics().lipSync.playbackClock);
 await page.waitForTimeout(230);
 assert.equal(await page.evaluate(()=>Boolean(TravisVisual.diagnostics().lipSync.playbackClock)),true,'Received audio must finish after stream failure');
 await page.waitForFunction(()=>document.querySelector('#travis-status-message').textContent.includes('connection interrupted'));
 assert.equal(requests,4,'A failed request must never be redispatched');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:true,firstAudioBeforeFinalReply:true,echoIgnored:true,interruptionMs,noStalePlayback:true,partialAudioPreserved:true,requests,errors}));
}finally{await browser.close();server.closeAllConnections();server.close();}
