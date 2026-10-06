import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('travis-hud.css', 'utf8');
const js = fs.readFileSync('travis-hud.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

const requiredHtml = [
  'id="travis-launcher"',
  'id="travis-hud"',
  'id="travis-space-canvas"',
  'id="travis-core-canvas"',
  'id="travis-core-trigger"',
  'class="travis-command-deck"',
  'data-travis-panel="visao"',
  './travis-hud.css?v=2',
  './travis-hud.js?v=2'
];

for (const token of requiredHtml) {
  if (!html.includes(token)) throw new Error('HUD HTML em falta: ' + token);
}

const forbiddenHtml = [
  'id="travis-panel"',
  './travis-panel.css',
  './travis-panel.js',
  'class="travis-core"'
];

for (const token of forbiddenHtml) {
  if (html.includes(token)) throw new Error('Travis antigo ainda está ligado no HTML: ' + token);
}

if (!css.includes('#travis-launcher .trv-launch-ring')) throw new Error('Launcher holográfico em falta.');
if (!css.includes('.travis-core-trigger')) throw new Error('Núcleo interactivo em falta.');
if (!css.includes('height:100dvh')) throw new Error('HUD não está protegido para viewport mobile.');
if (!js.includes("getContext('webgl'")) throw new Error('Renderer WebGL em falta.');
if (!js.includes('window.TravisVisual')) throw new Error('API visual Travis em falta.');
if (!js.includes('window.TravisPanel =')) throw new Error('Compatibilidade do Centro em falta.');
if (js.includes('window.TravisBridge.ask')) throw new Error('HUD visual não deve estar ligado ao Travis antigo.');
if (!sw.includes('travis-hud.js?v=2') || !sw.includes('travis-hud.css?v=2')) {
  throw new Error('Cache PWA do HUD v2 em falta.');
}

console.log('TRAVIS HUD V2 SELFTEST OK');
