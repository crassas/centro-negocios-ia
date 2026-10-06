import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('travis-hud.css', 'utf8');
const js = fs.readFileSync('travis-hud.js', 'utf8');

const requiredHtml = [
  'id="travis-hud"',
  'id="travis-particles"',
  'id="travis-hud-close"',
  'id="travis-status-ready"',
  'data-target="conversation"',
  './travis-hud.css?v=1',
  './travis-hud.js?v=1'
];

for (const token of requiredHtml) {
  if (!html.includes(token)) throw new Error('HUD HTML em falta: ' + token);
}

if (!css.includes('.travis-hud-core')) throw new Error('Núcleo holográfico isolado em falta.');
if (css.includes('.travis-core{')) throw new Error('Conflito detectado com o núcleo do painel de conversa.');
if (!js.includes('window.TravisVisual')) throw new Error('API visual Travis em falta.');
if (!js.includes('window.TravisPanel?.open?.()')) throw new Error('Ponte para a conversa Travis em falta.');

console.log('TRAVIS HUD SELFTEST OK');
