import assert from 'node:assert/strict';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {discoveryChapters,playDiscovery} from '../travis-discovery.mjs';
import {hasLocalVisual} from '../travis-visual-story.mjs';
for(const text of ['Surpreende-me','Travis, surpreende-me!','Leva-me ao futuro','Surprise me','Take me to the future']){const i=parseVisualIntent(text);assert.equal(i.type,'discovery',text);assert.equal(i.ids.length,6);assert(discoveryChapters(i.ids,i.language).every(c=>hasLocalVisual(c.scene,c.title)&&c.text.length<480));}
for(const [text,title] of [['Mostra um buraco negro','Black hole'],['Mostra uma aurora boreal','Aurora'],['Mostra ADN','DNA'],['Mostra um átomo','Hydrogen'],['show an atom','Hydrogen']]){const i=parseVisualIntent(text);assert.equal(i.scene,'science');assert.equal(i.title,title);assert.equal(i.explain,false);}
for(const text of ['Não mostres um buraco negro','Do not surprise me'])assert.equal(parseVisualIntent(text),null);
assert.equal(parseVisualIntent('Escreve "surpreende-me"').scene,'text');
assert.notEqual(parseVisualIntent('Mostra fotografias de uma aurora').scene,'science');
assert.equal(parseVisualIntent('Explica o ADN').ids[0],'dna');
for(const text of ['Mostra um átomo de carbono','Show a helium atom','Show an atom of oxygen'])assert.notEqual(parseVisualIntent(text)?.scene,'science',text);
assert.equal(parseVisualIntent('Mostra o átomo de hidrogénio').title,'Hydrogen');
const chapters=discoveryChapters(['dna','atom'],'pt'),log=[];
await playDiscovery(chapters,{prepare:async c=>{log.push('prepare:'+c.id);return c.id;},present:c=>log.push('show:'+c.id),play:async(_a,c)=>{log.push('play:'+c.id);await new Promise(r=>setTimeout(r,1));log.push('end:'+c.id);},valid:()=>true,finish:()=>log.push('done')});
assert(log.indexOf('show:atom')>log.indexOf('end:dna'),'Next scene must wait for current speech completion');
assert(log.indexOf('prepare:atom')<log.indexOf('end:dna'),'Only next chapter is prepared during current speech');
let valid=true,presented=0,finished=false;
await playDiscovery(chapters,{prepare:async()=>new ArrayBuffer(0),present:()=>presented++,play:async()=>{valid=false;},valid:()=>valid,finish:()=>{finished=true;}});assert.equal(presented,1);assert.equal(finished,false);
await assert.rejects(()=>playDiscovery(chapters,{prepare:async c=>{if(c.id==='atom')throw new Error('speech unavailable');return c.id;},present:()=>{},play:async()=>{},valid:()=>true,finish:()=>assert.fail()}),/speech unavailable/);
console.log('PASS Discovery: bilingual routing, local scenes, literal/photo guards, sequential audio, bounded prefetch and cancellation');
