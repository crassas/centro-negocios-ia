import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../operit-agent/jarvis_voice.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
function harness(fetch){
 const elements=new Map();const timers=[];
 const document={querySelector(sel){if(!elements.has(sel))elements.set(sel,{textContent:'',value:'',disabled:sel==='#replay',checked:false});return elements.get(sel)},addEventListener(){},removeEventListener(){}};
 const context=vm.createContext({document,fetch,AbortController,AbortSignal,Date,console,Blob,URL:{createObjectURL:()=> 'blob:voice',revokeObjectURL(){}},Audio:class{play(){return new Promise(()=>{})}pause(){}},window:{},navigator:{},setTimeout(fn,ms){const timer={fn,ms};timers.push(timer);return timer},clearTimeout(timer){if(timer)timer.cleared=true},setInterval(){return 1},clearInterval(){}});
 vm.runInContext(source,context);return {context,elements,timers,run:code=>vm.runInContext(code,context)};
}
const response=d=>({ok:true,json:async()=>d,blob:async()=>new Blob(['RIFF'])});
const calls=[];
const good=harness(async(path,options)=>{calls.push([path,options]);if(path==='/health')return response({ok:true});if(path==='/transcribe')return response({text:'estás aí?'});if(path==='/jarvis')return response({reply:'Estou aqui.'});return response({})});
await good.run('request("/listen",new Blob(["voz"]),"audio/webm")');
assert.deepEqual(calls.map(x=>x[0]),['/health','/transcribe','/jarvis','/speak']);
assert.equal(JSON.parse(calls[2][1].body).text,'estás aí?');
assert.match(good.elements.get('#answer').textContent,/Ouvi: estás aí\?/);
assert.equal(good.run('busy'),false,'pending Android playback must release the input');
assert.equal(good.elements.get('#send').disabled,false);
const hanging=harness(()=>new Promise(()=>{}));
const pending=hanging.run('request("/jarvis",{text:"olá"})');
hanging.timers.find(t=>t.ms===4000&&!t.cleared).fn();await pending;
assert.equal(hanging.run('busy'),false);assert.equal(hanging.elements.get('#send').disabled,false);
assert.match(hanging.elements.get('#status').textContent,/prazo de espera terminou/);
const badVoice=harness(async path=>{if(path==='/health')return response({ok:true});if(path==='/jarvis')return response({reply:'Resposta preservada.'});throw Error('Piper indisponível')});
await badVoice.run('request("/jarvis",{text:"olá"})');
assert.equal(badVoice.elements.get('#answer').textContent,'Resposta preservada.');assert.match(badVoice.elements.get('#status').textContent,/Voz indisponível/);assert.equal(badVoice.run('busy'),false);
console.log('Travis voice: staged requests, timeout recovery and pending playback passed');
