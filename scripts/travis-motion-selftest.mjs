import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {createMechanical} from '../travis-mechanical.mjs';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {hasLocalVisual} from '../travis-visual-story.mjs';
import {createMotionAudio} from '../travis-motion-audio.mjs';
import {MOTION,seededRandom,readingHold} from '../travis-motion.mjs';
const THREE=await import(pathToFileURL(process.argv[2]));
for(const text of ['Mostra um motor elétrico','Show an electric motor','Explica-me o motor elétrico']){
 const intent=parseVisualIntent(text);assert.equal(intent.scene,'mechanical');assert(hasLocalVisual(intent.scene,intent.title),text);
}
assert.equal(parseVisualIntent('Mostra um motor V8 Ferrari').scene,'mechanical');
assert(!hasLocalVisual('mechanical','Motor V8 Ferrari'),'Specific products must still request a reference');
assert.equal(parseVisualIntent('Separa as peças',{active:true}).action,'explode');
assert.equal(parseVisualIntent('Junta as peças',{active:true}).action,'assemble');
assert.equal(parseVisualIntent('Desliga os sons').enabled,false);
const bounds=[];
for(const exploded of [false,true]){
 const model=createMechanical(THREE,{exploded});bounds.push(new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()));
 assert.equal(model.group.children.length,3,'Coils and bearings must be batched into three draws');assert.equal(model.parts.length,5);
 model.group.traverse(node=>{if(!node.geometry)return;for(const n of node.geometry.attributes.position.array)assert(Number.isFinite(n));node.geometry.dispose();});model.materials.forEach(m=>m.dispose());
}
assert(bounds[1].x>bounds[0].x*1.3,'Exploded form must actually separate the assemblies');
assert(MOTION.exit<MOTION.enter);assert(readingHold('one two three four five six')>=2);
const a=seededRandom(11),b=seededRandom(11);for(let i=0;i<20;i++)assert.equal(a(),b());
let status={open:true},started=0,disconnected=0,stopped=0,context={currentTime:1,state:'running',destination:{}};
const parameter={setValueAtTime(){},exponentialRampToValueAtTime(){}};
context.createOscillator=()=>({frequency:parameter,connect(){return this;},start(){started++;},stop(){stopped++;},disconnect(){disconnected++;}});
context.createGain=()=>({gain:parameter,connect(){return this;},disconnect(){disconnected++;}});
const audio=createMotionAudio({context:()=>context,state:()=>status,storage:{getItem:()=>null,setItem(){}}});
assert(audio.play());assert.equal(started,1);assert(!audio.play(),'Rate limit');
context.currentTime=2;status.listening=true;assert(!audio.play(),'No sound while listening');status.listening=false;
context.state='suspended';assert(!audio.play(),'Must not unlock audio');context.state='running';
audio.setEnabled(false);assert(!audio.play());assert.equal(audio.status().active,0);assert(disconnected>=2&&stopped>=1);
console.log('PASS MOTION: PT/EN routing, honest model fallback, three batched motor draws, separate/assemble, deterministic timing and audio consent/listening/mute guards');
