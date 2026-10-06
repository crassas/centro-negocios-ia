import fs from 'node:fs';

const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('travis-hud.css','utf8');
const js = fs.readFileSync('travis-hud.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');

for (const token of [
  'id="travis-hud"',
  'id="travis-space-canvas"',
  'id="travis-core-canvas"',
  'id="travis-core-trigger"',
  'class="travis-orbit-menu"',
  'class="travis-orbit-node node-centro"',
  'class="travis-orbit-node node-projectos"',
  'class="travis-orbit-node node-seo"',
  'class="travis-orbit-node node-agentes"',
  './travis-hud.css?v=3',
  './travis-hud.js?v=3',
  '<meta name="theme-color" content="#02060b">'
]) {
  if (!html.includes(token)) throw new Error('Travis V3 HTML em falta: '+token);
}

for (const token of [
  'id="travis-panel"',
  './travis-panel.css',
  './travis-panel.js',
  'class="travis-command-deck"'
]) {
  if (html.includes(token)) throw new Error('Elemento Travis antigo ainda ligado: '+token);
}

for (const token of [
  '.travis-depth-grid',
  '.travis-volumetric-beam',
  '.travis-orbit-node',
  '.travis-hud.deck-open .node-centro',
  '.travis-orb-parallax'
]) {
  if (!css.includes(token)) throw new Error('Travis V3 CSS em falta: '+token);
}

for (const token of [
  "getContext('webgl'",
  'powerPreference',
  'function animateParallax()',
  'function bootTone()',
  'function interactionTone(',
  'window.TravisVisual',
  'window.TravisPanel='
]) {
  if (!js.includes(token)) throw new Error('Travis V3 motor em falta: '+token);
}

if (js.includes('window.TravisBridge.ask')) {
  throw new Error('HUD visual voltou a ficar ligado ao Travis antigo.');
}

if (!sw.includes('travis-hud.js?v=3') || !sw.includes('travis-hud.css?v=3')) {
  throw new Error('Cache PWA V3 em falta.');
}

console.log('TRAVIS HUD V3 SELFTEST OK');
