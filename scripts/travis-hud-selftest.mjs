[Reading 71 lines from start (total: 71 lines, 0 remaining)]

import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('travis-hud.css','utf8');
const scene=fs.readFileSync('travis-3d.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const glb=fs.statSync('assets/travis/travis-core.glb');

for(const token of [
  'id="travis-hud"',
  'id="travis-three-canvas"',
  'id="travis-loading"',
  './travis-hud.css?v=6',
  './travis-3d.mjs?v=2',
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

if(glb.size < 500000) throw new Error('GLB Travis demasiado pequeno: '+glb.size);
if(!css.includes('#travis-three-canvas')) throw new Error('Canvas 3D CSS em falta.');
if(!sw.includes('travis-3d.mjs?v=2') || !sw.includes('travis-core.glb?v=1')) throw new Error('Cache real 3D em falta.');

console.log('TRAVIS REAL 3D SELFTEST OK',glb.size,'bytes');

[executed on device: localhost (8ad4e1a5-6b39-4f45-82a2-0253dd9519fb)]