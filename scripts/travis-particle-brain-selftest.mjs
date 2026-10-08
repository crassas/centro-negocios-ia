import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const read=path=>fs.readFileSync(path,'utf8');
const scene=read('travis-3d.mjs');
const brain=read('travis-brain-view.mjs');
const graph=read('travis-knowledge-graph.mjs');
const panel=read('travis-brain-panel.mjs');
const html=read('index.html');
const sw=read('sw.js');
const backend=read('operit-agent/jarvis_local.py');
const runtime=read('operit-agent/travis_brain.py');
for(const path of ['travis-3d.mjs','travis-brain-view.mjs','travis-knowledge-graph.mjs','travis-brain-panel.mjs']){
  execFileSync(process.execPath,['--check',path]);
}
for(const marker of [
  'aScatter','uDissolve','new THREE.Points','graph.setData(data)',
  'graph.update({','panel.setVisible('
])assert.ok(brain.includes(marker),'brain missing '+marker);
assert.ok(!brain.includes('const pathways='),'pre-drawn cognitive pathways');
assert.ok(!brain.includes('cortexMaterial'),'opaque fake solid cortex still present');
for(const marker of [
  "input.source!=='local-sqlite'",'snapshot.links','snapshot.nodes',
  'PersistedSynapses','persisted-knowledge-graph',
  'status===\'live\''
])assert.ok(graph.includes(marker),'graph missing '+marker);
for(const marker of ["fetch('/brain/state'","fetch('/brain/graph'","onGraph(null)","setSelectedMemory"]){
  assert.ok(panel.includes(marker),'panel missing '+marker);
}
assert.ok(scene.includes("const memory=neuralField?.pick(raycaster)"));
assert.ok(scene.includes("import { createNeuralField } from './travis-brain-view.mjs?v=4'"));
for(const ref of [
  'travis-3d.mjs?v=particle-memory-1',
  'travis-brain-view.mjs?v=4',
  'travis-brain-panel.mjs?v=3',
  'travis-knowledge-graph.mjs?v=3',
  'travis-brain.css?v=3'
])assert.ok(sw.includes(ref),'cache mismatch '+ref);
assert.ok(html.includes('travis-3d.mjs?v=particle-memory-1'));
assert.ok(html.includes('travis-brain.css?v=3'));
assert.ok(backend.includes('"/brain/graph"'));
assert.ok(runtime.includes("'FROM travis_synapses WHERE active=1 '"));
assert.ok(runtime.includes("'FROM travis_neurons WHERE active=1 '"));
console.log('TRAVIS PARTICLE BRAIN STATIC SELFTEST OK');
