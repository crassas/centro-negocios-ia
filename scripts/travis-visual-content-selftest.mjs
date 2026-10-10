import assert from 'node:assert/strict';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {identifyVisualSubject} from '../travis-visual-subjects.mjs';
import {buildNarrationCues,cueAtTime,hasLocalVisual} from '../travis-visual-story.mjs';
for(const [text,scene,variant] of [
 ['Mostra Júpiter','planet','jupiter'],['Mostra Marte','planet','mars'],['Mostra a Terra','planet','earth'],
 ['Mostra o Sol','planet','sun'],['Mostra o espaço','space','galaxy'],['Mostra o sistema solar','planet','solar-system'],
 ['Mostra-me um cubo','object','cube']
]){const intent=parseVisualIntent(text);assert.equal(intent.scene,scene,text);assert.equal(identifyVisualSubject(scene,intent.title),variant,text);assert(hasLocalVisual(scene,intent.title));}
for(const [text,title] of [['Mostra-me ADN','DNA'],['Mostra-me um átomo','Hydrogen']]){const i=parseVisualIntent(text);assert.equal(i.scene,'science');assert.equal(i.title,title);assert(hasLocalVisual(i.scene,i.title));}
for(const [text,result] of [['Escreve OLÁ','OLÁ'],['Mostra as letras "TRAVIS"','TRAVIS'],['Show the word "Earth"','Earth'],['Mostra letras','ABC']]){const intent=parseVisualIntent(text);assert.equal(intent.scene,'text',text);assert.equal(intent.title,result,text);}
assert(parseVisualIntent('Explica-me o sistema solar').explain);
assert.equal(parseVisualIntent('Não mostres Júpiter'),null);
assert.equal(parseVisualIntent('Mostra os meus emails'),null);
assert(!hasLocalVisual('object','Borboleta'),'Unknown subjects must use references instead of arbitrary solids');
const cues=buildNarrationCues('O Sol fica no centro. A Terra orbita o Sol. Júpiter é um gigante gasoso.',{scene:'planet',title:'Solar system'});
assert(cues.some(c=>c.title==='Earth'));assert(cues.some(c=>c.title==='Jupiter'));
assert.equal(cueAtTime(cues,-1,24),-1);assert.equal(cues[cueAtTime(cues,23,24)].title,'Jupiter');
assert(cues.every((c,i)=>i===0||c.at>=cues[i-1].at));
assert.deepEqual(buildNarrationCues('A fotossíntese utiliza luz. A planta transforma energia luminosa. Os açúcares armazenam energia.',{scene:'reference',title:'Fotossíntese'}),[{scene:'reference',title:'Fotossíntese',at:0}], 'Keep the visual instead of replacing it with sentence fragments');
console.log('PASS VISUAL_CONTENT: named planets, sun, space, literal text, DNA, atom, geometry, research fallback and narration cues');

for(const text of ['Show photos of Earth','Mostra imagens de uma casa','Find images of a butterfly']){
 const intent=parseVisualIntent(text);assert(intent?.referenceRequested,text);assert(!/^(photos|images|imagens|find)/i.test(intent.title),intent.title);
}
assert.equal(parseVisualIntent('Show me you').type,'dismiss');
for(const text of ['Next image','Mostra outra imagem','mais imagens','Previous image'])assert.equal(parseVisualIntent(text,{active:true,kind:'illustration'}).type,'control',text);
for(const title of ['House','Casa moderna','Building'])assert(hasLocalVisual('house',title));

// Regression: copied examples (including one unclosed smart quote) are commands,
// not the title of a reference-image search. Preserve quoted text on explicit request.
for(const text of ['“mostra um motor elétrico','“Mostra um motor elétrico”','"Mostra um motor elétrico"',
 '«Mostra um motor elétrico»','Travis, mostra-me um motor eléctrico, por favor.',
 'Podes mostrar-me um motor elétrico?','“Mostra um motor elétrico em 3D”',
 'motor elétrico','motor eléctrico','“electric motor”','Show an electric motor, please.']){
 const intent=parseVisualIntent(text);assert.equal(intent.scene,'mechanical',text);assert.equal(intent.title,'Electric motor',text);
 assert(hasLocalVisual(intent.scene,intent.title),text);assert.equal(intent.referenceRequested,false,text);
}
for(const text of ['“Mostra uma casa”','«Mostra Marte»','“Mostra Júpiter','“Mostra a Terra”']){
 const intent=parseVisualIntent(text);assert(hasLocalVisual(intent.scene,intent.title),text);
}
for(const [text,title] of [['Escreve “mostra um motor elétrico”','mostra um motor elétrico'],['“Mostra as letras «Olá»”','Olá'],['Escreve "Não mostres um motor"','Não mostres um motor']]){
 const intent=parseVisualIntent(text);assert.equal(intent.scene,'text');assert.equal(intent.title,title);
}
for(const text of ['“Não mostres um motor elétrico”','“Mostra os meus emails”'])assert.equal(parseVisualIntent(text),null,text);
for(const text of ['“Separa as peças”','“Junta as peças','“Volta ao Travis”'])assert(parseVisualIntent(text,{active:true,kind:'illustration'}),text);
assert(parseVisualIntent('“Mostra fotos de um motor elétrico”').referenceRequested,'Explicit photos must still use research');
const specific=parseVisualIntent('“Mostra um motor V8 Ferrari”');assert(!hasLocalVisual(specific.scene,specific.title),'Do not invent a specific product model');
console.log('PASS COPIED_REQUESTS: smart/unclosed quotes, electric motor aliases, politeness, controls, literal text, negatives and explicit photos');

for(const text of ['Mostra um avião','Mostra uma avião','avião','Podes mostrar-me um avião?',
 'Mostra um avião comercial','Show me a plane','Show an airplane','Show an aeroplane',
 'Show a passenger aircraft','airplane','“Mostra um avião”']){
 const i=parseVisualIntent(text);assert.equal(i.scene,'vehicle',text);
 assert.equal(identifyVisualSubject(i.scene,i.title),'airplane',text);assert(hasLocalVisual(i.scene,i.title),text);
}
for(const text of ['Show me a hand plane','Mostra uma plaina','Show a mathematical plane','Mostra um Boeing 747']){
 const i=parseVisualIntent(text);assert.equal(i.scene,'object',text);assert(!hasLocalVisual(i.scene,i.title),text);
}
assert.equal(parseVisualIntent('Escreve avião').scene,'text');
assert.equal(parseVisualIntent('Não mostres um avião'),null);
assert(parseVisualIntent('Mostra fotografias de um avião').referenceRequested);
assert.equal(parseVisualIntent('Mostra uma mão').scene,'anatomy');
console.log('PASS AIRCRAFT_ROUTING: PT/EN aircraft, hand plane, mathematical plane, named models, literal text, photos and anatomy');
