import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import './travis-wake-phrase-selftest.mjs';

let options, starts=0, stops=0, interruptions=0, semanticCalls=0;
const submitted=[], timers=new Map();let nextTimer=0;
const context=vm.createContext({
  Blob,ArrayBuffer,DataView,Float32Array,performance,console,
  setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},
  clearTimeout:id=>timers.delete(id),
  document:{createElement:()=>({}),head:{append:el=>queueMicrotask(()=>el.onload())}},
  window:{
    ort:{env:{wasm:{}}},
    vad:{MicVAD:{new:async opts=>{
      options=opts;
      return {start:async()=>{starts++;},pause:async()=>{stops++;}};
    }}}
  }
});
const source=fs.readFileSync(new URL('../travis-voice-input.mjs',import.meta.url),'utf8')
 .replaceAll('export function','function');
vm.runInContext(source+'\nglobalThis.api={createVoiceInput,pcmWave};',context);
const flush=async()=>{
 const callbacks=[...timers.values()];timers.clear();
 for(const fn of callbacks)fn();
 await new Promise(resolve=>setImmediate(resolve));
};
const input=context.api.createVoiceInput({
 onStart:()=>interruptions++,onLevel:()=>{},
 onSpeech:blob=>submitted.push(blob),
 checkTurn:()=>{semanticCalls++;return Promise.resolve({available:true,complete:true});}
});
await input.start();
assert.equal(starts,1);
assert.equal(options.startOnLoad,false);
assert(options.positiveSpeechThreshold<=.6,'Quiet English must activate the VAD.');
assert(options.minSpeechMs<=250,'Short speech must not be ignored.');
options.onSpeechStart();
assert.equal(interruptions,0,'Noise alone must not interrupt output.');
options.onSpeechRealStart();
assert.equal(interruptions,1);
options.onSpeechEnd(new Float32Array([.2,.4]));
assert.equal(semanticCalls,0,'Short phrases must not run the expensive semantic model.');
options.onSpeechStart();
options.onSpeechRealStart();
assert.equal(interruptions,2);
await flush();
assert.equal(submitted.length,0,'Continuation must cancel prior short-phrase submission.');
options.onSpeechEnd(new Float32Array([.6,.8]));
await flush();
assert.equal(submitted.length,1);
const wav=new DataView(await submitted[0].arrayBuffer());
assert.equal(wav.getUint32(24,true),16000);
assert.equal(wav.getUint16(22,true),1);
assert.equal(wav.getUint32(40,true),(2+4000+2)*2,'Two parts must survive a natural pause.');
assert.equal(semanticCalls,0);
options.onSpeechStart();
options.onSpeechEnd(new Float32Array([1]));
input.stop();
await flush();
assert.equal(submitted.length,1,'Stopped microphone must not submit stale utterance.');
assert.equal(input.diagnostics().active,false);
assert.equal(stops,1);
await input.start();
options.onSpeechStart();
options.onSpeechEnd(new Float32Array([.15]));
await flush();
assert.equal(submitted.length,2,'Simple silence must finish without neural turn detection.');
input.stop();
console.log('TRAVIS_FAST_VOICE_TEST_OK',JSON.stringify({
  interruptions,submissions:submitted.length,semanticCalls,
  shortenedVAD:true,naturalContinuation:true,noDoubleSubmission:true
}));
