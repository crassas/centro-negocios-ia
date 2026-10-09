import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSpeechEnvelope,speechEnvelopeLevel} from '../travis-audio-sync.mjs';

const rate=16000, samples=new Float32Array(rate);
for(let i=0;i<samples.length;i++){
  const time=i/rate;
  if((time>=.08&&time<.28)||(time>=.55&&time<.82)){
    samples[i]=.55*Math.sin(i*2*Math.PI*240/rate);
  }
}
const buffer={sampleRate:rate,duration:1,numberOfChannels:1,getChannelData:ch=>{assert.equal(ch,0);return samples;}};
const envelope=buildSpeechEnvelope(buffer);
assert.equal(envelope.hz,40);
assert.equal(envelope.duration,1);
assert(envelope.levels.length>30);
assert(speechEnvelopeLevel(envelope,.14)>.3,'Sound must animate the mouth in real time.');
assert(speechEnvelopeLevel(envelope,.41)<.04,'Silence between phrases must close the mouth.');
assert(speechEnvelopeLevel(envelope,.64)>.3,'Second phrase must not drift from the audio.');
for(const time of [-2,-.01,1,3,NaN])assert.equal(speechEnvelopeLevel(envelope,time),0,'Out-of-range sound must be silent.');
const silence={...buffer,getChannelData:()=>new Float32Array(rate)};
assert.equal(speechEnvelopeLevel(buildSpeechEnvelope(silence),.5),0);
assert.throws(()=>buildSpeechEnvelope({}),TypeError);
const ui=fs.readFileSync('travis-3d.mjs','utf8');
const camera=fs.readFileSync('travis-vision.mjs','utf8');
assert(ui.includes("voiceInput?.stop();\n    releaseVoiceMic({stopRecorder:true});"));
assert(!ui.includes("if(!voicePaused)void ensureVoiceInput();"),'Mic must not reopen during speaker playback.');
assert(ui.includes('source.start(startAt);') && ui.includes('speechEnvelopeLevel(speechClock.envelope'));
assert(camera.includes('isSpeechCritical()'),'Visual inference must yield CPU to speech.');
console.log('TRAVIS_AUDIO_SYNC_TESTS_OK',JSON.stringify({
  audioClock:true,quietBreak:true,secondPhrase:true,backgroundMic:false,
  cameraPausesInference:true
}));
