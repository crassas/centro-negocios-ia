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
  "source!=='local-sqlite'",'snapshot.links','snapshot.nodes',
  'valid.has(l.source)','valid.has(l.target)','persisted-knowledge-graph',
  'status===\'live\''
])assert.ok(graph.includes(marker),'graph missing '+marker);
for(const marker of ["fetch('/brain/state'","fetch('/brain/graph'","onGraph(null)","setSelectedMemory"]){
  assert.ok(panel.includes(marker),'panel missing '+marker);
}
assert.ok(scene.includes("const memory=neuralField?.pick(raycaster)"));
const importedBrain=scene.match(/import \{ createNeuralField \} from '\.\/(travis-brain-view\.mjs\?v=[^']+)'/);
assert.ok(importedBrain,'scene must import the functional brain renderer');
assert.ok(sw.includes(importedBrain[1]),'service-worker brain cache must match scene import');
const entry=html.match(/src="\.\/(travis-3d\.mjs\?v=[^"]+)"/);
assert.ok(entry,'page must load a versioned Travis scene');
assert.ok(sw.includes(entry[1]),'service-worker cache must match the page scene');
for(const name of ['travis-brain-panel.mjs','travis-knowledge-graph.mjs','travis-brain.css']){
  assert.match(sw,new RegExp(name.replaceAll('.', '\\.')+'\\?v=[^\\\'"]+'),'missing versioned brain asset '+name);
}
assert.ok(html.includes('travis-brain.css?v='));
assert.ok(backend.includes('"/brain/graph"'));
assert.ok(runtime.includes("'FROM travis_synapses WHERE active=1 '"));
assert.ok(runtime.includes("'FROM travis_neurons WHERE active=1 '"));
console.log('TRAVIS PARTICLE BRAIN STATIC SELFTEST OK');
