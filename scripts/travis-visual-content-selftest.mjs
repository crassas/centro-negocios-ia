import assert from 'node:assert/strict';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {identifyVisualSubject} from '../travis-visual-subjects.mjs';
import {buildNarrationCues,cueAtTime,hasLocalVisual} from '../travis-visual-story.mjs';
for(const [text,scene,variant] of [
 ['Mostra Júpiter','planet','jupiter'],['Mostra Marte','planet','mars'],['Mostra a Terra','planet','earth'],
 ['Mostra o Sol','planet','sun'],['Mostra o espaço','space','galaxy'],['Mostra o sistema solar','planet','solar-system'],
 ['Mostra-me ADN','diagram','dna'],['Mostra-me um átomo','diagram','atom'],['Mostra-me um cubo','object','cube']
]){const intent=parseVisualIntent(text);assert.equal(intent.scene,scene,text);assert.equal(identifyVisualSubject(scene,intent.title),variant,text);assert(hasLocalVisual(scene,intent.title));}
for(const [text,result] of [['Escreve OLÁ','OLÁ'],['Mostra as letras "TRAVIS"','TRAVIS'],['Show the word "Earth"','Earth'],['Mostra letras','ABC']]){const intent=parseVisualIntent(text);assert.equal(intent.scene,'text',text);assert.equal(intent.title,result,text);}
assert(parseVisualIntent('Explica-me o sistema solar').explain);
assert.equal(parseVisualIntent('Não mostres Júpiter'),null);
assert.equal(parseVisualIntent('Mostra os meus emails'),null);
assert(!hasLocalVisual('object','Borboleta'),'Unknown subjects must use references instead of arbitrary solids');
const cues=buildNarrationCues('O Sol fica no centro. A Terra orbita o Sol. Júpiter é um gigante gasoso.',{scene:'planet',title:'Solar system'});
assert(cues.some(c=>c.title==='Earth'));assert(cues.some(c=>c.title==='Jupiter'));
assert.equal(cueAtTime(cues,-1,24),-1);assert.equal(cues[cueAtTime(cues,23,24)].title,'Jupiter');
assert(cues.every((c,i)=>i===0||c.at>=cues[i-1].at));
assert(buildNarrationCues('A fotossíntese utiliza luz. A planta transforma energia luminosa. Os açúcares armazenam energia.',{scene:'reference',title:'Fotossíntese'}).some(c=>c.scene==='text'&&c.title.includes('energia')));
console.log('PASS VISUAL_CONTENT: named planets, sun, space, literal text, DNA, atom, geometry, research fallback and narration cues');
