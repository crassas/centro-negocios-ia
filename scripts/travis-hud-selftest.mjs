import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('travis-hud.css','utf8');
const scene=fs.readFileSync('travis-3d.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const glb=fs.statSync('assets/travis/travis-core.glb');
const faceGlb=fs.statSync('assets/travis/travis-face-realistic.glb');

for(const token of [
  'id="travis-hud"',
  'id="travis-three-canvas"',
  'id="travis-loading"',
  './travis-hud.css?v=marble1',
  './travis-3d.mjs?v=marble1',
  'type="importmap"',
  '"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"'
]){
  if(!html.includes(token)) throw new Error('Travis real 3D HTML em falta: '+token);
}

for(const token of [
  'id="travis-panel"',
  './travis-panel.css',
  './travis-panel.js',
  './travis-scene.js',
  './travis-hud.js',
  'class="travis-orbit-menu"',
  'id="travis-core-trigger"'
]){
  if(html.includes(token)) throw new Error('Camada antiga/genérica ainda ligada: '+token);
}

for(const token of [
  "import * as THREE from 'three'",
  'GLTFLoader',
  'EffectComposer',
  'UnrealBloomPass',
  'RoomEnvironment',
  "new THREE.MeshPhysicalMaterial",
  'raycaster.intersectObjects',
  'createCommandNode',
  './assets/travis/travis-core.glb?v=1',
  'ACESFilmicToneMapping',
  'window.TravisVisual'
]){
  if(!scene.includes(token)) throw new Error('Motor Three.js em falta: '+token);
}


for(const token of [
  'canvas,alpha:false',
  'scene.background=new THREE.Color(0x02070b)',
  'new THREE.BoxGeometry(1.35,.52,.065)',
  'new THREE.EdgesGeometry',
  'raycaster.intersectObjects'
]){
  if(!scene.includes(token)) throw new Error('Pipeline 3D robusto em falta: '+token);
}

for(const forbidden of [
  'new THREE.CylinderGeometry(.38,.38,.075',
  'new THREE.CircleGeometry(.68,32)'
]){
  if(scene.includes(forbidden)) throw new Error('Comando circular antigo ainda activo: '+forbidden);
}


for(const token of [
  'ShaderPass',
  'bloomComposer',
  'finalComposer',
  'finalFxPass',
  'hologramShader',
  'BLOOM_LAYER',
  'orbitParticles',
  'filamentGroup',
  'setVoiceLevel',
  'uAberration',
  'uGrain',
  'uScan',
  'uGlitch'
]){
  if(!scene.includes(token)) throw new Error('V7 cinematic layer em falta: '+token);
}


for(const token of [
  'TRAVIS V8',
  'new THREE.ConeGeometry(1.7,8.2,48,1,true)',
  'new THREE.ConeGeometry(1.45,6.8,48,1,true)',
  'return .62;',
  '[-1.18,.88,.48]',
  'hologramMaterial.uniforms.uOpacity.value=.28'
]){
  if(!html.includes(token) && !scene.includes(token)) throw new Error('V7.1 mobile correction em falta: '+token);
}


for(const token of [
  "LOCAL_TRAVIS_BASE",
  "localJson('/transcribe'",
  "localJson('/jarvis'",
  "localFetch('/speak'",
  'navigator.mediaDevices.getUserMedia',
  'new MediaRecorder',
  'startVoiceConversation',
  'scheduleListening',
  'playVoiceArrayBuffer',
  'decodeAudioData',
  'targetAddressSpace'
]){
  if(!scene.includes(token)) throw new Error('Integração de voz local em falta: '+token);
}


for(const token of [
  'IS_LOCAL_TRAVIS_UI',
  "location.assign('http://127.0.0.1:8770/?travis=1')",
  "new URLSearchParams(location.search).get('travis')==='1'",
  'open:launchHud'
]){
  if(!scene.includes(token)) throw new Error('Handoff local unificado em falta: '+token);
}


for(const token of [
  'data-travis-form="core"',
  'data-travis-form="face"',
  'data-travis-form="orb"',
  'data-text="TRAVIS"'
]){
  if(!html.includes(token)) throw new Error('Identidade adaptativa V8 em falta: '+token);
}

for(const token of [
  'createFaceAvatar',
  'createOrbAvatar',
  "modeForState(next=state)",
  "if (next==='listening' || next==='speaking') return 'face'",
  "if (next==='thinking' || next==='booting') return 'orb'",
  'faceMouthLower.position.y',
  'faceEyeGroups',
  'formBlend',
  'formTarget',
  "form(mode='auto')"
]){
  if(!scene.includes(token)) throw new Error('Motor adaptativo V8 em falta: '+token);
}

for(const token of [
  '.travis-form-selector',
  'trv-title-holo',
  'trv-title-slice-a',
  'trv-title-slice-b'
]){
  if(!css.includes(token)) throw new Error('Holograma textual V8 em falta: '+token);
}


for(const token of [
  './assets/travis/travis-face-realistic.glb?v=2',
  'TravisRealFace',
  'TravisFace_Head',
  'realFaceBaseMaterial',
  'realFaceIris',
  'await createFaceAvatar()'
]){
  if(!scene.includes(token)) throw new Error('Rosto 3D real em falta: '+token);
}
if(faceGlb.size < 1000000) throw new Error('GLB facial realista demasiado pequeno: '+faceGlb.size);
if(html.includes('data-travis-form="auto"')) throw new Error('AUTO não deve aparecer no selector visual.');
if(!sw.includes('travis-face-realistic.glb?v=2')) throw new Error('Rosto realista não está na cache PWA.');


for(const token of [
  'now-lastSpeech>620',
  'recorder.start(120)',
  'filamentGroup.visible=false',
  'gridFloor=null'
]){ if(!scene.includes(token)) throw new Error('V8 Marble em falta: '+token); }
for(const forbidden of ['class="travis-reticle"','class="travis-telemetry left"','class="travis-ticker"']){
  if(html.includes(forbidden)) throw new Error('HUD genérico ainda presente: '+forbidden);
}

if(glb.size < 500000) throw new Error('GLB Travis demasiado pequeno: '+glb.size);
if(!css.includes('#travis-three-canvas')) throw new Error('Canvas 3D CSS em falta.');
if(!sw.includes('travis-3d.mjs?v=marble1') || !sw.includes('travis-core.glb?v=1')) throw new Error('Cache real 3D em falta.');

console.log('TRAVIS REAL 3D SELFTEST OK',glb.size,'bytes');