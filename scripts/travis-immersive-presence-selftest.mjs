import assert from 'node:assert/strict';
import fs from 'node:fs';
import {automaticTravisForm,nextFormBlend,visibleProjectionAmount,THINKING_DWELL_MS,MANUAL_PREVIEW_MS}
  from '../travis-form-director.mjs';
import {INTERFACE_COPY,interfaceLanguage,applyInterfaceLanguage,languageFromInterfaceCommand,visionStatusCopy}
  from '../travis-interface-language.mjs';

const full={faceReady:true,brainConnected:true};
assert.equal(automaticTravisForm({state:'idle',...full}),'face');
assert.equal(automaticTravisForm({state:'ready',...full}),'face');
assert.equal(automaticTravisForm({state:'listening',...full}),'face');
assert.equal(automaticTravisForm({state:'speaking',...full}),'face');
assert.equal(automaticTravisForm({state:'thinking',elapsedMs:THINKING_DWELL_MS-1,...full}),'face');
assert.equal(automaticTravisForm({state:'thinking',elapsedMs:THINKING_DWELL_MS,...full}),'face');
assert.equal(automaticTravisForm({state:'thinking',elapsedMs:7000,faceReady:true,brainConnected:false}),'face');
assert.equal(automaticTravisForm({state:'thinking',elapsedMs:7000,...full,projectionActive:true}),'face');
assert.equal(automaticTravisForm({state:'thinking',elapsedMs:120000,...full}),'face',
 'A long-running task must not automatically replace the face with a memory graph');
assert.equal(automaticTravisForm({state:'booting',...full}),'face');
assert.equal(automaticTravisForm({state:'ready',faceReady:false}),'core');
assert(MANUAL_PREVIEW_MS<=8000&&MANUAL_PREVIEW_MS>=2000);
const visual={visible:true,matter:{active:true,opacity:.8}};
assert.equal(visibleProjectionAmount(1,visual),1);
assert.equal(visibleProjectionAmount(.5,visual),.5);
assert.equal(visibleProjectionAmount(1,{visible:false,matter:{active:true,opacity:1}}),0);
assert.equal(visibleProjectionAmount(1,{visible:true,matter:{active:false,opacity:1}}),0);
assert.equal(visibleProjectionAmount(1,{visible:true,matter:{active:true,opacity:0}}),0);
assert.equal(visibleProjectionAmount(1,null),0);
assert.equal(visibleProjectionAmount(NaN,visual),0);

let sixty=0,thirty=0;
for(let i=0;i<60;i++)sixty=nextFormBlend(sixty,1,1/60);
for(let i=0;i<30;i++)thirty=nextFormBlend(thirty,1,1/30);
assert(Math.abs(sixty-thirty)<.001,'Morph should be independent of refresh rate');
assert(sixty>.9&&sixty<1);
assert(nextFormBlend(1,0,.02)<1);
assert(nextFormBlend(.5,2,.02)<=1);
assert(nextFormBlend(.5,-2,.02)>=0);
assert(nextFormBlend(.5,0,1)>=0,'Slow phones must never overshoot');

assert.equal(interfaceLanguage(),'en');
assert.equal(interfaceLanguage('pt'),'pt');
assert.equal(interfaceLanguage('fr'),'en');
assert.equal(languageFromInterfaceCommand('Travis, interface em inglês'),'en');
assert.equal(languageFromInterfaceCommand('Travis, interface em português'),'pt');
assert.equal(languageFromInterfaceCommand('Travis, muda a interface para português de Portugal'),'pt');
assert.equal(languageFromInterfaceCommand('Switch the interface to English'),'en');
assert.equal(languageFromInterfaceCommand('Interface in Portuguese'),'pt');
for(const phrase of [
  'Travis, fala em inglês','Travis, speak Portuguese','Abrir YouTube',
  'Pesquisa em português','Sinto-me muito português','Interface gráfica complicada'
]){
  assert.equal(languageFromInterfaceCommand(phrase),null,
    'Non-interface language request must remain available to voice/conversation: '+phrase);
}
assert.equal(visionStatusCopy('Câmara desligada','en'),'Camera off');
assert.equal(visionStatusCopy('Câmara activa · rosto, gestos e objetos','en'),
  INTERFACE_COPY.en.cameraFull);
assert.equal(visionStatusCopy('Câmara desligada','pt'),'Câmara desligada');
assert.equal(visionStatusCopy('Câmara: permissão recusada','en'),
  'Camera: Permission denied');

const fake=()=>({
  dataset:{},textContent:'',placeholder:'',lang:'',
  attributes:new Map(),
  setAttribute(n,v){this.attributes.set(n,v);},
  getAttribute(n){return this.attributes.get(n)||null;}
});
const ids=new Map();
for(const id of [
 'travis-hud','travis-command-text','travis-voice-start','travis-room-toggle',
 'travis-pause','travis-camera-toggle','travis-hud-close',
 'travis-camera-preview','travis-three-canvas'
])ids.set(id,fake());
const selectors=new Map([
 ['.travis-hint',fake()],['label[for="travis-command-text"]',fake()],
 ['#travis-command button[type="submit"]',fake()]
]);
const doc={getElementById(id){return ids.get(id)||null;},
  querySelector(sel){return selectors.get(sel)||null;}};
ids.get('travis-camera-toggle').setAttribute('aria-pressed','false');
assert.equal(applyInterfaceLanguage('en',doc),'en');
assert.equal(ids.get('travis-hud').lang,'en');
assert.equal(ids.get('travis-camera-toggle').textContent,'Enable camera');
assert.equal(ids.get('travis-command-text').placeholder,INTERFACE_COPY.en.command);
assert.equal(selectors.get('.travis-hint').textContent,'TOUCH TRAVIS');
assert.equal(applyInterfaceLanguage('pt',doc),'pt');
assert.equal(ids.get('travis-hud').lang,'pt-PT');
assert.equal(ids.get('travis-camera-toggle').textContent,'Ligar câmara');
assert.equal(ids.get('travis-command-text').placeholder,INTERFACE_COPY.pt.command);
ids.get('travis-camera-toggle').setAttribute('aria-pressed','true');
assert.equal(applyInterfaceLanguage('en',doc),'en');
assert.equal(ids.get('travis-camera-toggle').textContent,'Disable camera');

const html=fs.readFileSync('index.html','utf8');
const scene=fs.readFileSync('travis-3d.mjs','utf8');
const ui=fs.readFileSync('travis-vision.mjs','utf8');
const brain=fs.readFileSync('travis-brain-view.mjs','utf8');
const brainPanel=fs.readFileSync('travis-brain-panel.mjs','utf8');
const css=fs.readFileSync('travis-hud.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(!html.includes('travis-form-selector'),'Manual control must be removed from HTML, not hidden');
assert(!html.includes('data-travis-form='),'No leftover face/core toggle');
assert(!scene.includes('formButtons'),'No leftover button handlers');
assert(scene.includes('automaticTravisForm('));
assert(scene.includes('syncAutoForm(state,now)'),'Timed automatic decisions must be reevaluated');
assert(scene.includes('visibleProjectionAmount('),'The face must be retained until particles are visible');
assert(scene.includes("manualFormUntil=0;\n    if(realFaceReady){"),
 'Reopening must clear a previous brain preview and show the face');
assert(scene.includes('formBlend.face=1;'),'Face must be visible immediately when the mesh loads');
assert(scene.includes('formBlend[key]=nextFormBlend('));
assert(scene.includes("Math.min(1,(1-formBlend.face)*.93)"),'Particle dissolution must accompany the morph');
assert(scene.includes('manualFormUntil=manual?performance.now()+MANUAL_PREVIEW_MS:0'),
  'Gesture overrides must expire');
assert(scene.includes('languageFromInterfaceCommand(text)'), 'Voice must support changing UI language');
assert(scene.includes("sessionStorage.setItem('travis.ui.language'"),
  'Preference is only for UI, not model/voice');
assert(scene.includes("sessionStorage.setItem('travis.language'"),
  'The existing bilingual speech preference must remain');
assert(!brain.includes('panel.setVisible(core>.52&&projection<.22);'),
  'Automatic interior overlay must not obscure cinematic view');
assert(brain.includes('selectedDetailsUntil'),'A user can still inspect a real selected memory node');
assert(brainPanel.includes('monitoring&&!disposed'),
  'Brain events must remain observable even when no technical panel is shown');
assert(brainPanel.includes("hud?.classList.contains('is-open')"),
  'Background polling must stop when the stage closes');
assert(ui.includes("visionStatusCopy(message,locale())"));
assert(css.includes('display:none!important')&&css.includes('#travis-hud .travis-form-selector'),
  'Cached selector must remain hidden even during a partial update');
assert(sw.includes('travis-form-director.mjs?v=2'));
assert(sw.includes('travis-interface-language.mjs?v=1'));
assert(sw.includes('travis-brain-view.mjs?v=cinema-2'));
assert(html.includes('data-ui-language="en"'));
assert(html.includes('placeholder="Speak to me, or type a request…"'));
console.log('PASS IMMERSIVE_TRAVIS: automatic observed-state morph, invisible switch, PT/EN voice, English-first UI and accessibility');
