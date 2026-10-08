import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

let options,starts=0,stops=0,interruptions=0,resolveTurn;
const spoken=[],timers=new Map();let nextTimer=0;
const context=vm.createContext({Blob,ArrayBuffer,DataView,Float32Array,performance,console,
  setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
  document:{createElement:()=>({}),head:{append:el=>queueMicrotask(()=>el.onload())}},
  window:{ort:{env:{wasm:{}}},vad:{MicVAD:{new:async opts=>{options=opts;return {start:async()=>{starts++;},pause:async()=>{stops++;}};}}}}
});
const source=fs.readFileSync(new URL('../travis-voice-input.mjs',import.meta.url),'utf8').replaceAll('export function','function');
vm.runInContext(source+'\nglobalThis.api={createVoiceInput,pcmWave};',context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const input=context.api.createVoiceInput({onStart:()=>interruptions++,onLevel:()=>{},
  onSpeech:blob=>spoken.push(blob),checkTurn:()=>new Promise(resolve=>{resolveTurn=resolve;})});
await input.start();assert.equal(starts,1);assert.equal(options.startOnLoad,false);
options.onSpeechStart();assert.equal(interruptions,0,'Noise alone must not interrupt playback');
options.onSpeechRealStart();assert.equal(interruptions,1);
options.onSpeechEnd(new Float32Array([.2,.4]));
const oldTurn=resolveTurn;
options.onSpeechStart();options.onSpeechRealStart();
oldTurn({available:true,complete:true});await tick();assert.equal(spoken.length,0,'A continued utterance cancels old completion');
options.onSpeechEnd(new Float32Array([.6,.8]));
resolveTurn({available:true,complete:true,engine:'smart-turn'});await tick();assert.equal(spoken.length,1);
const wav=new DataView(await spoken[0].arrayBuffer());
assert.equal(wav.getUint32(24,true),16000);assert.equal(wav.getUint16(22,true),1);
assert.equal(wav.getUint32(40,true),(2+4000+2)*2,'Both parts survive the natural pause');
options.onSpeechStart();options.onSpeechEnd(new Float32Array([1]));
input.stop();resolveTurn({available:true,complete:true});await tick();
assert.equal(spoken.length,1,'Late inference cannot send audio after microphone off');
assert.equal(input.diagnostics().active,false);assert.equal(stops,1);
await input.start();options.onSpeechStart();options.onSpeechEnd(new Float32Array([0]));
resolveTurn({available:false});await tick();
for(const fn of [...timers.values()])fn();await tick();
assert.equal(spoken.length,2,'An unavailable semantic detector falls back to bounded silence');
input.stop();console.log('VOICE_INPUT_OK: real speech interruption, continued phrases, PCM audio, cancellation and fallback');
