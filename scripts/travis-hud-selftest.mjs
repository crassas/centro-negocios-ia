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
  './travis-hud.css?v=4',
  './travis-hud.js?v=4',
  './travis-scene.js?v=4',
  'type="importmap"',
  '"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"'
]){
  if(!html.includes(token)) throw new Error('Travis V4 HTML em falta: '+token);
}

for(const token of ['id="travis-panel"','./travis-panel.css','./travis-panel.js','id="travis-core-canvas"']){
  if(html.includes(token)) throw new Error('Renderer/Travis antigo ainda ligado: '+token);
}

for(const token of [
  "import * as THREE from 'three'",
  'GLTFLoader',
  'EffectComposer',
  'UnrealBloomPass',
  "./assets/travis/travis-core.glb?v=1",
  'ACESFilmicToneMapping',
  'window.Travis3D'
]){
  if(!scene.includes(token)) throw new Error('Motor 3D em falta: '+token);
}

if(glb.size < 100000) throw new Error('GLB Travis parece vazio ou inválido: '+glb.size);
if(!css.includes('#travis-three-stage')) throw new Error('Mount CSS 3D em falta.');
if(!hud.includes("new CustomEvent('travis3dcommands'")) throw new Error('Ligação HUD→3D em falta.');
if(!sw.includes('travis-scene.js?v=4') || !sw.includes('travis-core.glb?v=1')) throw new Error('Cache V4 em falta.');

console.log('TRAVIS REAL 3D V4 SELFTEST OK',glb.size,'bytes');
