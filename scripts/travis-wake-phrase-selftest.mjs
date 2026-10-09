import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveWakePhrase} from '../travis-wake-phrase.mjs';

const check=(input,options={allowFuzzy:true})=>resolveWakePhrase(input,options);
const yes=[
  ['Travis, verifica o Centro','exact','verifica o Centro'],
  ['Olá Travis, verifica o Centro','exact','verifica o Centro'],
  ['Hey Jarvis, check the server','exact','check the server'],
  ['Olha, Travis, compara Jung e Kant','exact','compara Jung e Kant'],
  ['Travis','exact',''],
  ['acorda','explicit','acorda'],
  ['wake up','explicit','acorda'],
  ['Olá para VIS, verifica o estado do Centro de Negócios','strong','verifica o estado do Centro de Negócios'],
  ['Olá pra vís, explica Jung','strong','explica Jung'],
  ['Olá para vis','strong',''],
  ['O atraviz, verifica o Centro','strong','verifica o Centro'],
  ['Ou através, compara Jung e Kant','strong','compara Jung e Kant'],
  ['pravis, mostra a biblioteca','strong','mostra a biblioteca'],
  ['Avis abre o YouTube e procura música portuguesa','weak','abre o YouTube e procura música portuguesa'],
  ['Avis, explica a sombra de Jung','weak','explica a sombra de Jung'],
  ['A vis, verifica a memória','weak','verifica a memória'],
];
for(const [source,kind,command] of yes){
  const item=check(source);
  assert.equal(item.matched,true,source);
  assert.equal(item.kind,kind,source);
  assert.equal(item.command,command,source);
  assert.equal(item.corrected,!['exact','explicit'].includes(kind),source);
  assert(!item.canonical.includes('undefined'),source);
}
const no=[
  '', '  ', 'Avis', 'A vis', 'Para vis', 'Pravis',
  'Avisa-me quando chegar', 'O aviso abre hoje', 'Avisos abreviados',
  'Ontem falei com Travis', 'Conversa sobre a palavra Travis',
  'Não Travis, publica já tudo', 'Hoje disse: Travis, abre o Google',
  'Avis, publica agora o site', 'Avis, apaga a base de dados',
  'Avis envia um email ao cliente', 'Avis, transfere dinheiro',
  'Avis, pagar a fatura', 'Avis, instala novo software',
  'Olá para VIS, publica agora o site',
  'Olá para VIS, modifica os dados',
  'Olá para VIS, envia informação privada',
  'Avis, trabalha no repositório', 'Avis, é preciso agir',
  'Avis, lembra-te de fazer o pagamento',
];
for(const source of no){
  assert.equal(check(source).matched,false,source);
}
for(const source of [
  'Avis abre o YouTube e procura música portuguesa',
  'Olá para VIS, verifica o Centro',
  'O atraviz, explica-me Kant',
]){
  assert.equal(check(source,{allowFuzzy:false}).matched,false,
    'Typed text must never receive acoustic corrections: '+source);
}
assert.equal(check('Travis, publica agora o site',{allowFuzzy:false}).matched,true,
  'An exact wake address is allowed; downstream authorization remains mandatory.');

for(const source of [null,undefined,1234,{},'a'.repeat(1400)]){
  assert.equal(check(source).matched,false);
}
// Integration checks: keep the raw transcript on screen, but route only
// the recovered command and do not promote fuzzy wake to tool authorization.
const scene=fs.readFileSync(new URL('../travis-3d.mjs',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert(scene.includes("import { resolveWakePhrase } from './travis-wake-phrase.mjs?v=pt-1';"));
assert(scene.includes("resolveWakePhrase(text,{allowFuzzy:typeof blob!=='string'})"));
assert(scene.includes("window.dispatchEvent(new CustomEvent('travis:transcript',{detail:{role:'user',text}}))"),
  'ASR output must remain available for diagnosis');
assert(scene.includes('if(standby&&!wakeAddress.matched)'));
assert(scene.includes("text=wakeAddress.command||'acorda'"));
assert(sw.includes('travis-wake-phrase.mjs?v=pt-1'), 'service worker must precache new module');
console.log('PASS WAKE_PHRASE: '+yes.length+' accepted variants, '+no.length+
  ' negative phrases, typed-text safeguards and versioned UI wiring');
