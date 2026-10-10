import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createScienceScene} from '../travis-science-scenes.mjs';
const THREE=await import(pathToFileURL(process.argv[2]));
const aurora=createScienceScene(THREE,'Aurora');
const snapshots=[];aurora.group.traverse(o=>{if(o.geometry)snapshots.push({o,version:o.geometry.attributes.position.version});});
const curtains=snapshots.find(({o})=>o.isPoints&&o.geometry.attributes.position.count===5400).o;
const before=new THREE.Vector3().fromBufferAttribute(curtains.geometry.attributes.position,20);
aurora.update(4.25);const displayed=curtains.userData.morphPosition(20,before.clone());
assert(displayed.distanceTo(before)>.01,'The shader pose must be sampled when a curtain dissolves');
for(let i=0;i<60;i++)aurora.update(i/60);
for(const {o,version} of snapshots)assert.equal(o.geometry.attributes.position.version,version,'Animation must not rewrite GPU position buffers');
const colours=curtains.geometry.attributes.aColor;
assert(Array.from({length:colours.count},(_,i)=>colours.getY(i)-colours.getX(i)).some(x=>x>.5),'Aurora has green emission');
assert(Array.from({length:colours.count},(_,i)=>colours.getX(i)-colours.getY(i)).some(x=>x>.5),'Aurora has red/violet emission');
const dna=createScienceScene(THREE,'DNA');let draws=0;dna.group.traverse(o=>{if(o.isMesh)draws++;});assert.equal(draws,1,'DNA detail remains one batched mesh');
for(const built of [aurora,dna]){built.group.traverse(o=>o.geometry?.dispose());built.materials.forEach(m=>m.dispose());}
console.log('PASS Spectrum: GPU-only curtain animation, visible-pose sampling, emission colours and batched DNA');
