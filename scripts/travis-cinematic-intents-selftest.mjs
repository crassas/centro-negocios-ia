import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseEnglishProjection,rewriteEnglishToolRequest} from '../travis-english-intents.mjs';

const scenarios=[
 ['Travis, show me Mars','planet'],['Could you project Saturn?','planet'],
 ['I want to see the solar system','planet'],['Bring up planet Earth','planet'],
 ['Show me the map of Porto','map'],['Pull up a map of Lisbon','map'],
 ['Could you display a route map?','map'],['I would like to see a city map','map'],
 ['Project this house as a hologram','house'],['Bring up the house blueprint','house'],
 ['Visualize a building','house'],['Turn that into a house','house'],
 ['Show me a human figure','person'],['Project a person hologram','person'],
 ['Could you show a human bust?','person'],['Show me an object in 3D','object'],
 ['Bring up a product wireframe','object'],['Render an object','object']
];
for(const [text,expected] of scenarios){
 const actual=parseEnglishProjection(text);
 assert.equal(actual?.type,'scene',text+' -> '+JSON.stringify(actual));
 assert.equal(actual.scene,expected,text);
 assert(actual.title.length>0&&actual.title.length<=100);
}
const controlCases=[
 ['Bring it closer','zoom-in'],['Make it bigger','zoom-in'],
 ['Zoom out','zoom-out'],['Rotate left','rotate-left'],
 ['Spin it','rotate-right'],['Move it right','move-right'],
 ['Move it up','move-up'],['Centre it','reset-view'],
 ['Next','next'],['Previous one','previous']
];
for(const [text,action] of controlCases){
 assert.equal(parseEnglishProjection(text,{active:true,kind:'illustration'})?.action,action,text);
}
for(const phrase of ['Return to core','Go back','Dismiss it','Clear the screen','Restore the original view']){
 assert.equal(parseEnglishProjection(phrase,{active:true})?.type,'dismiss',phrase);
}
for(const phrase of ['Keep this open','Leave it there','Pin this','Hold this view']){
 assert.equal(parseEnglishProjection(phrase,{active:true})?.type,'pin',phrase);
}
for(const phrase of ['Unpin','Auto return','Let it close']){
 assert.equal(parseEnglishProjection(phrase,{active:true})?.type,'unpin',phrase);
}
assert.equal(parseEnglishProjection('Next',{active:true,kind:'youtube'}),null,
 'Player next must remain a real media control');
for(const phrase of ['Open Google','Open YouTube','Show me my face','Can you see my face?',
  'What are my tasks?','What do you see?','Do not show me a map','I have a planet-sized problem']){
 assert.equal(parseEnglishProjection(phrase,{active:true}),null,phrase);
}
const synonyms=[
 ['Pull up YouTube','Open YouTube'],['Could you bring up YouTube for me','Open YouTube'],
 ['Take me to Google','Open Google'],['Show me our sites','Check the sites'],
 ['Display my tasks','Show my tasks'],
 ['Find a video about astronomy','Search YouTube astronomy'],
 ['Look up Carl Sagan','Search the web for carl sagan']
];
for(const [input,expected] of synonyms){
 assert.equal(rewriteEnglishToolRequest(input),expected,input);
}
assert.equal(rewriteEnglishToolRequest('Tell me about the planets'),
 'Tell me about the planets','Ordinary explanation must not be rewritten.');
const ui=fs.readFileSync('travis-3d.mjs','utf8'),
 deck=fs.readFileSync('travis-action-cards.mjs','utf8'),
 visual=fs.readFileSync('travis-concept-projection.mjs','utf8'),
 sw=fs.readFileSync('sw.js','utf8'),
 html=fs.readFileSync('index.html','utf8');
assert(ui.includes("import './travis-action-cards.mjs?v=real-3d-1'"));
assert(ui.includes('TravisProjection?.interpret?.(text)'));
assert(deck.includes('scheduleReturn(')&&deck.includes('pinned=true'));
assert(deck.includes('youtubeState().playing'));
assert(deck.includes('travis:speech-end')&&deck.includes('travis:visual-control'));
for(const scene of ['planet','map','house','person','object'])
 assert(visual.includes("kind==='"+scene+"'"),'Missing '+scene+' 3D builder');
assert(visual.includes('ghost')&&visual.includes('show(scene,now,subject'));
assert(html.includes('travis-3d.mjs?v=real-3d-1'));
assert(sw.includes('travis-english-intents.mjs?v=motion-routing-1'));
console.log('TRAVIS_CINEMATIC_INTENTS_PASS',JSON.stringify({
 scenarios:scenarios.length,controls:controlCases.length,synonyms:synonyms.length,
 autoReturn:true,pin:true,cinematicMorph:true
}));
