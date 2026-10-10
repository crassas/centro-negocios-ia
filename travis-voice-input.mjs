// Silero VAD via ricky0123/vad-web. Smart Turn is served by the local Pipecat worker.
// Audio stays on this device; these libraries never receive account credentials.
let libraries;
function script(src){return new Promise((resolve,reject)=>{
  const el=document.createElement('script');el.src=src;el.async=true;
  const timer=setTimeout(()=>reject(new Error('Voice library timeout')),15000);
  el.onload=()=>{clearTimeout(timer);resolve();};el.onerror=()=>{clearTimeout(timer);reject(new Error('Voice library unavailable'));};
  document.head.append(el);
});}
async function load(){
  if(!libraries)libraries=(async()=>{
    await script('/assets/voice/ort/ort.wasm.min.js');
    window.ort.env.wasm.numThreads=1;window.ort.env.wasm.proxy=false;
    await script('/assets/voice/vad/bundle.min.js');
  })().catch(error=>{libraries=null;throw error;});
  return libraries;
}
export function pcmWave(samples){
  const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);
  const word=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  word(0,'RIFF');v.setUint32(4,36+samples.length*2,true);word(8,'WAVE');word(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);
  v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);
  return new Blob([buffer],{type:'audio/wav'});
}
export function createVoiceInput({onStart,onSpeech,onLevel,checkTurn,onError,isPlayback=()=>false,liveSTT=null}){
  let detector,starting,active=false,generation=0,pending=null,timer=0,speaking=false,lastVoice=0,turnEngine='silero',realStarted=false,startedDuringPlayback=false,playbackVoiceMs=0,live=null,preFrames=[],preSamples=0;
  const append=(a,b)=>{if(!a)return b;const gap=4000,c=new Float32Array(a.length+gap+b.length);c.set(a);c.set(b,a.length+gap);return c;};
  function beginLive(){if(!live&&liveSTT){live=liveSTT();for(const frame of preFrames)live.push(frame);}}
  function submit(epoch){
    if(!active||generation!==epoch||speaking||!pending)return;
    const audio=pending;pending=null;const transcript=live?.finish();live=null;onSpeech(pcmWave(audio),lastVoice,transcript);
  }
  async function ended(audio){
    if(!active)return;
    speaking=false;if((startedDuringPlayback||isPlayback())&&!realStarted){pending=null;live?.cancel();live=null;return;}pending=append(pending,audio);const epoch=++generation;
    clearTimeout(timer);
    // Never wait indefinitely for the semantic detector. A natural silence remains a fallback.
    timer=setTimeout(()=>submit(epoch),100);
    // Avoid running a second neural model alongside Whisper for normal commands.
    if(!checkTurn || pending.length<160000)return;
    try{
      const result=await checkTurn(pcmWave(pending.slice(-128000)));
      if(!active||generation!==epoch||speaking)return;
      if(result.available){turnEngine=result.engine;if(result.complete){clearTimeout(timer);submit(epoch);}}
    }catch{/* bounded silence fallback */}
  }
  return {
    async start(){
      if(active)return;if(starting)return starting;
      const epoch=++generation;
      starting=(async()=>{
        await load();if(generation!==epoch)return;
        if(!detector)detector=await window.vad.MicVAD.new({
          startOnLoad:false,
          model:'v5',baseAssetPath:'/assets/voice/vad/',onnxWASMBasePath:'/assets/voice/ort/',
          positiveSpeechThreshold:.57,negativeSpeechThreshold:.33,minSpeechMs:210,preSpeechPadMs:500,redemptionMs:320,
          getStream:()=>navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}}),
          onSpeechStart(){if(!active)return;speaking=true;realStarted=false;startedDuringPlayback=isPlayback();playbackVoiceMs=0;generation++;clearTimeout(timer);},
          onSpeechRealStart(){if(active&&!isPlayback()){realStarted=true;beginLive();onStart();}},
          onVADMisfire(){if(!active)return;speaking=false;if(!pending){live?.cancel();live=null;}if(pending){const epoch=++generation;timer=setTimeout(()=>submit(epoch),100);}},
          onFrameProcessed(p,frame){
            if(!active)return;if(p.isSpeech>.65)lastVoice=performance.now();
            if(speaking&&live)live.push(frame);
            preFrames.push(new Float32Array(frame));preSamples+=frame.length;
            while(preSamples>8000&&preFrames.length>1)preSamples-=preFrames.shift().length;
            let energy=0;for(const x of frame)energy+=x*x;
            const rms=Math.sqrt(energy/frame.length);
            // Strong, sustained residual speech after browser echo cancellation.
            // A noise spike or a few leaked speaker frames must not cancel a turn.
            if(speaking&&!realStarted&&isPlayback()){
              playbackVoiceMs=p.isSpeech>.88&&rms>.018?playbackVoiceMs+frame.length/16:0;
              if(playbackVoiceMs>=240){realStarted=true;beginLive();onStart();}
            }
            onLevel(Math.min(1,rms/.08),p.isSpeech);
          },
          onSpeechEnd:audio=>void ended(audio),
        });
        if(generation!==epoch){await detector.pause();return;}
        active=true;await detector.start();
      })().catch(error=>{active=false;onError?.(error);throw error;}).finally(()=>{starting=null;});
      return starting;
    },
    stop(){active=false;generation++;speaking=false;pending=null;live?.cancel();live=null;preFrames=[];preSamples=0;clearTimeout(timer);void detector?.pause();},
    diagnostics(){return {active,speaking,turnEngine,lastVoice};},
  };
}
