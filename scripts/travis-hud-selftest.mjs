import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('travis-hud.css','utf8');
const hud=fs.readFileSync('travis-hud.js','utf8');
const scene=fs.readFileSync('travis-scene.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const glb=fs.statSync('assets/travis/travis-core.glb');

for(const token of [
  'id="travis-hud"',
  'id="travis-three-stage"',
  'id="travis-core-trigger"',
  'class="travis-orbit-menu"',
  './travis-hud.css?v=5',
  './travis-hud.js?v=5',
  './travis-scene.js?v=5',
  'type="importmap"',
  '"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"'
]){
  if(!html.includes(token)) throw new Error('Travis V5 HTML em falta: '+token);
}

for(const token of [
  'id="travis-panel"',
  './travis-panel.css',
  './travis-panel.js',
  'id="travis-core-canvas"',
  'class="node-ring"'
]){
  if(html.includes(token)) throw new Error('UI/renderer antigo ainda ligado: '+token);
}

for(const token of [
  "import * as THREE from 'three'",
  'GLTFLoader',
  "./assets/travis/travis-core.glb?v=1",
  'ACESFilmicToneMapping',
  "setClearColor(0x000000,0)",
  'premultipliedAlpha:false',
  'renderer.render(scene,camera)',
  'window.Travis3D'
]){
  if(!scene.includes(token)) throw new Error('Motor 3D V5 em falta: '+token);
}

for(const forbidden of ['EffectComposer','UnrealBloomPass','OutputPass','composer.render()']){
  if(scene.includes(forbidden)) throw new Error('Pós-processamento que pode quebrar alpha ainda activo: '+forbidden);
}

if(glb.size<100000) throw new Error('GLB Travis parece vazio ou inválido: '+glb.size);
if(!css.includes('#travis-three-stage')) throw new Error('Mount CSS 3D em falta.');
if(css.includes('.node-ring')) throw new Error('UI circular antiga ainda existe no CSS.');
if(!hud.includes("new CustomEvent('travis3dcommands'")) throw new Error('Ligação HUD→3D em falta.');
if(!sw.includes('travis-scene.js?v=5')||!sw.includes('travis-hud.css?v=5')) throw new Error('Cache V5 em falta.');

console.log('TRAVIS TRANSPARENT 3D V5 SELFTEST OK',glb.size,'bytes');
