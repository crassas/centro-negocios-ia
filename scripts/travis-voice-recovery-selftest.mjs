import assert from 'node:assert/strict';
import http from 'node:http';
import {readVoiceReply} from '../travis-voice-stream.mjs';
import {withVoiceDeadline} from '../travis-voice-deadlines.mjs';
import fs from 'node:fs/promises';
import vm from 'node:vm';
let requests=0;
const frame=x=>JSON.stringify(x)+'\n';
const server=http.createServer((req,res)=>{
 requests++;res.writeHead(200,{'content-type':'application/x-ndjson'});
 if(req.url==='/done'){
  res.write(frame({type:'result',answer:{ok:true,reply:'Done.'}})+frame({type:'done'}));
 }else if(req.url==='/partial'){
  res.write(frame({type:'audio',audio:Buffer.from('RIFF').toString('base64'),text:'Partial.',language:'en'}));
 }else if(req.url==='/ordered'){
  for(const text of ['First.','Second.'])res.write(frame({type:'audio',audio:Buffer.from('RIFF').toString('base64'),text,language:'en'}));
  res.end(frame({type:'result',answer:{ok:true,reply:'First. Second.'}})+frame({type:'done'}));
 }else res.flushHeaders();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try{
 let t=Date.now();const done=await readVoiceReply(await fetch(base+'/done'),()=>{}, {idleTimeoutMs:150});
 assert.equal(done.answer.reply,'Done.');assert(Date.now()-t<1000,'Do not wait for transport EOF after done');
 await assert.rejects(readVoiceReply(await fetch(base+'/idle'),()=>{}, {idleTimeoutMs:80}),/stopped responding/);
 let received=0;const partial=await readVoiceReply(await fetch(base+'/partial'),()=>received++, {idleTimeoutMs:80});
 assert(partial.interrupted);assert.equal(received,1);
 const order=[];const ordered=await readVoiceReply(await fetch(base+'/ordered'),(wav,text)=>order.push(text),{idleTimeoutMs:150});
 assert.deepEqual(order,['First.','Second.']);assert(!ordered.interrupted);assert.equal(requests,4,'No retries');
 await assert.rejects(withVoiceDeadline(new Promise(()=>{}),30,'decode timeout'),/decode timeout/);
 assert.equal(await withVoiceDeadline(Promise.resolve('ready'),30),'ready');
 const source=await fs.readFile(new URL('../travis-3d.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  async function playVoiceArrayBuffer('),end=source.indexOf('\n  function presentToolResult',start);
 const fn=source.slice(start,end);
 function harness(mode){
  const listeners=new Map();let sourceNode;const ctx={
   state:'running',currentTime:0,destination:{},
   resume:async()=>{},decodeAudioData:()=>mode==='decode-stall'?new Promise(()=>{}):Promise.resolve({duration:.03,sampleRate:16000}),
   createBufferSource(){sourceNode={connect(){},disconnect(){},stop(){},start(){if(mode==='start-failure')throw Error('start failed');if(mode==='normal')setTimeout(()=>sourceNode.onended?.(),30);}};return sourceNode;},
   createAnalyser:()=>({connect(){},disconnect(){}}),
   addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)
  };
  const states=[];const scope={
   opened:true,voiceSession:1,voiceBusy:true,voiceSource:null,voiceFinishTimer:0,voicePlaybackResolve:null,externalVoiceLevel:0,speechClock:null,
   voicePaused:false,standby:false,playbackTranscript:'',lastPlaybackAt:0,lastInteraction:0,
   speechFace:null,faceRig:null,hud:{dataset:{}},flashPower:0,
   audio:()=>ctx,releaseVoiceMic(){},ensureVoiceInput(){},buildSpeechEnvelope:()=>({}),
   withVoiceDeadline:(work,ms,msg)=>withVoiceDeadline(work,Math.min(ms,70),msg),
   performance,window:{dispatchEvent(){},TravisProjection:null},CustomEvent:class{},
   setState:(state,text)=>states.push([state,text]),scheduleListening(){},voiceMetrics:[],console,
   setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,100)),clearTimeout
  };
  const context=vm.createContext(scope);vm.runInContext(fn,context);
  return {scope,ctx,listeners,run:()=>vm.runInContext("playVoiceArrayBuffer(new ArrayBuffer(4),1,'Hello',null,true)",context)};
 }
 let h=harness('normal');await h.run();assert.equal(h.scope.voiceSource,null);
 h=harness('stalled');await assert.rejects(h.run(),/stopped responding/);assert.equal(h.scope.voiceBusy,false);assert.equal(h.scope.voiceSource,null);
 h=harness('decode-stall');await assert.rejects(h.run(),/decoding/);
 h=harness('start-failure');await assert.rejects(h.run(),/start failed/);assert.equal(h.scope.voiceSource,null);
 h=harness('interrupted');const playing=h.run();await new Promise(r=>setTimeout(r,10));h.ctx.state='suspended';h.listeners.get('statechange')?.();
 await assert.rejects(playing,/interrupted/);assert.equal(h.scope.voiceBusy,false);
 console.log('PASS: 11 recovery checks; actual HTTP streams and extracted playback function; no physical phone audio claim');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
