import assert from 'node:assert/strict';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {transferState,journeyCueTarget} from '../travis-scene-planner.mjs';
import {buildNarrationCues,hasLocalVisual} from '../travis-visual-story.mjs';
for(const [request,scene,title] of [
 ['Mostra chuva','weather','rain'],['Mostra neve','weather','snow'],['Mostra uma tempestade','weather','storm'],['Mostra fogo','weather','fire'],['Mostra as ondas do oceano','weather','ocean'],['Mostra nuvens','weather','clouds'],
 ['Como é que um foguetão chegaria a Marte?','journey','Earth to Mars'],['O que aconteceria se um foguetão saísse da Terra para a Lua?','journey','Earth to Moon'],['Mostra um foguetão','vehicle','Rocket']]){
 const intent=parseVisualIntent(request);assert.equal(intent?.scene,scene,request);assert.equal(intent.title,title);assert(hasLocalVisual(intent.scene,intent.title));assert.equal(intent.referenceRequested,false);
}
assert.equal(parseVisualIntent('chuva')?.scene,'weather');
assert.equal(parseVisualIntent('Faz chover')?.scene,'weather');
assert.equal(parseVisualIntent('Não mostres chuva'),null);
assert.notEqual(parseVisualIntent('Mostra fotografias de chuva')?.scene,'weather');
assert.equal(parseVisualIntent('Escreve "chuva"')?.scene,'text');
for(const [request,type,target] of [['Isola a Terra','focus','Earth'],['Isola esse planeta','focus',null],['Isola o foguetão','focus','Rocket']]){const i=parseVisualIntent(request,{active:true,kind:'illustration'});assert.equal(i.type,type);assert.equal(i.target,target);}
for(const [request,action] of [['Pausa a animação','pause-motion'],['Continua a animação','resume-motion'],['Mais devagar','slow-motion'],['Mostra tudo','wide-view']])assert.equal(parseVisualIntent(request,{active:true}).action,action);
const story=buildNarrationCues('A água cai em pequenas gotas. Depois evapora e volta a condensar.',{scene:'weather',title:'rain'});assert.equal(story.length,1);assert(!story.some(c=>c.scene==='text'));
for(const [r1,r2] of [[1,1.524],[.55,1.4]]){
 const start=transferState(0,r1,r2),end=transferState(1,r1,r2);
 assert(Math.abs(start.rocket[0]-r1)<1e-8);assert(Math.abs(end.rocket[0]+r2)<1e-8);assert(Math.abs(end.rocket[1])<1e-8);
 assert(Math.abs(end.destinationAngle-Math.PI)<1e-8);
 assert.equal(transferState(-1,r1,r2).progress,0);assert.equal(transferState(2,r1,r2).progress,1);
}
console.log('PASS cinematic scenes: natural phenomena, missions, focus, controls, narrative continuity, transfer endpoints');

let progress=0;for(const part of ['O foguetão parte da Terra.','Entra na trajetória de transferência.','A viagem continua.','Chega a Marte.']){const next=journeyCueTarget(part,progress,2);assert(next>=progress);progress=next;}assert.equal(progress,1);
