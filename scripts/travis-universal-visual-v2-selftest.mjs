import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseVisualIntent,mayNeedVisualModel,parseEnglishProjection} from '../travis-english-intents.mjs';

const examples=[
 ['apetece-me ver o planeta Marte','planet','Mars','pt'],
 ['Travis, olha, queria ver Marte','planet','Mars','pt'],
 ['Quero ver Saturno','planet','Saturn','pt'],
 ['I feel like seeing Mars','planet','Mars','en'],
 ["I'd love to see Saturn",'planet','Saturn','en'],
 ['Could you show me Neptune?','planet','Neptune','en'],
 ['Mostra-me uma casa futurista','house','casa futurista','pt'],
 ['Olha, quero ver uma casa','house','casa','pt'],
 ['I would like to see a house','house','house','en'],
 ['Project a building blueprint','house','building','en'],
 ['Consegues pôr um carro à minha frente','vehicle','carro','pt'],
 ['Põe-me um drone','vehicle','drone','pt'],
 ['Show me a spaceship','vehicle','spaceship','en'],
 ['I want to see an alien spaceship','vehicle','spaceship','en'],
 ['Faz aparecer um barco','vehicle','barco','pt'],
 ['Quero ver o Porto num mapa','map','porto','pt'],
 ['Show me a map of London','map','london','en'],
 ['Mostra-me uma pessoa','person','pessoa','pt'],
 ['Show me a human silhouette','person','human','en'],
 ['Apetece-me ver uma floresta','landscape','floresta','pt'],
 ['I would love to see a dinosaur','landscape','dinosaur','en'],
 ['Faz aparecer uma montanha','landscape','montanha','pt'],
 ['Quero ver um diagrama de rede','diagram','diagrama','pt'],
 ['Show me a flowchart','diagram','flowchart','en'],
 ['I want to see a curious new artifact','object','artifact','en'],
 ['Quero ver uma coisa que nunca vi','object','coisa','pt'],
 ['Olha Travis, queria ver Marte','planet','Mars','pt']
];
for(const [text,scene,contains,language] of examples){
 const answer=parseVisualIntent(text);
 assert(answer&&answer.type==='scene',text+' did not request a scene');
 assert.equal(answer.scene,scene,text);
 assert(answer.title.toLowerCase().includes(contains.toLowerCase()),text+' had an incorrect subject: '+answer.title);
 assert.equal(answer.language,language,text);
 assert(answer.schematic&&answer.autoReturn);
}
const followups=[['Now Jupiter','planet','en'],['Agora Júpiter','planet','pt'],
 ['What about Saturn?','planet','en'],['E agora uma casa','house','pt']];
for(const [text,scene,language] of followups){
 const answer=parseVisualIntent(text,{active:true,kind:'illustration'});
 assert.equal(answer?.scene,scene,text);
 assert.equal(answer?.language,language,text);
 assert.equal(parseVisualIntent(text)?.type,undefined,'No context should not assume projection');
}
const controls=[
 ['Zoom in','zoom-in'],['Rotate left','rotate-left'],['Keep this open','pin'],
 ['Return to core','dismiss'],['Go back','dismiss'],['Unpin','unpin'],
 ['Aproxima','zoom-in'],['Roda para a esquerda','rotate-left'],
 ['Volta ao Travis','dismiss'],['Mantém isso aberto','pin']
];
for(const [text,action] of controls){
 const result=parseVisualIntent(text,{active:true});
 assert(result&&result.action===action,text+' -> '+JSON.stringify(result));
}
for(const text of [
 'What is Mars made of?','I do not want to see a map','Não quero ver um planeta',
 'Show me YouTube','Show me my face','Abre o Google','Mostra-me os meus repositórios',
 'Can you see me through the camera?','Mostra-me o saldo da conta',
 'Please analyse my bank statement','I want to see my email','I have a planet-sized problem'
]){
 assert.equal(parseVisualIntent(text,{active:true}),null,'Do not intercept: '+text);
}
assert(mayNeedVisualModel('I wonder what an imaginary superstructure would look like'));
assert(mayNeedVisualModel('Como seria visualmente uma cidade do futuro?'));
assert(!mayNeedVisualModel('Open Google'));
assert(parseEnglishProjection('Project Mars')?.scene==='planet');
const cards=fs.readFileSync('travis-action-cards.mjs','utf8');
const scene=fs.readFileSync('travis-concept-projection.mjs','utf8');
const engine=fs.readFileSync('travis-particle-morph.mjs','utf8');
const client=fs.readFileSync('travis-3d.mjs','utf8');
const css=fs.readFileSync('travis-hud.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(cards.includes("deck.hidden=!view.visible||immersive"),'Workspace must not cover concept shapes');
assert(cards.includes('renderVersion'), 'Pending return must not hide the next shape');
assert(cards.includes("scene:data.kind==='illustration'?data.scene:null"));
assert(cards.includes('mayNeedModel:mayNeedVisualModel'));
assert(cards.includes('applyModelIntent(result'));
assert(scene.includes('createTravisParticleMorph('),'Scene geometry must feed morph particles');
assert(scene.includes('active.visible=false')&&scene.includes('createHolographicSurfaceMaterial'),'Fine surfaces must reconstruct after the particle transfer');
assert(client.includes('conceptProjection.setSource('),'Morph origin must be the actual Travis 3D form');
assert(client.includes("returnToCore?.("),'Returning holograms must reassemble the Travis core');
assert(client.includes("travis-concept-projection.mjs?v=cinematic-1"));
assert(engine.includes('TravisMorphParticles'));
assert(engine.includes('aFrom')&&engine.includes('aTo')&&engine.includes('uMorph'));
assert(css.includes('data-immersive="true"'),'Visual projection must give full screen');
assert(sw.includes('travis-particle-morph.mjs?v=cinematic-1'));
console.log('PASS UNIVERSAL_VISUAL_V2',JSON.stringify({
 openVocabularyScenes:examples.length,controls:controls.length,negativeSafety:true,
 particleMorph:true,fineLightSurfaces:true,immersive:true,modelFallback:true
}));
