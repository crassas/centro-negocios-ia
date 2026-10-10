import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createSceneFocus} from '../travis-scene-focus.mjs';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {loadAnatomy,createAnatomy,ANATOMY_PARTS} from '../travis-anatomy.mjs';
const THREE=await import(pathToFileURL(process.argv[2]));
for(const [request,type,target] of [['Isola Marte','focus','Mars'],['Isola o coração','focus','heart'],['Focus on the skull','focus','skull'],['Mostra-me só Marte','solo','Mars'],['Show me only planet Mars','solo','Mars'],['Mostra apenas os pulmões','solo','lungs'],['Isola o rotor','focus','rotor']]){const i=parseVisualIntent(request,{active:true});assert.equal(i.type,type,request);assert.equal(i.target,target,request);}
for(const text of ['Mostra o esqueleto','Show the human body','Explica os pulmões'])assert.equal(parseVisualIntent(text).scene,'anatomy',text);
assert.equal(parseVisualIntent('Explica os pulmões').language,'pt');
assert.equal(parseVisualIntent('Escreve "mostra o esqueleto"').scene,'text');
assert.equal(parseVisualIntent('Não mostres o esqueleto'),null);
assert.equal(parseVisualIntent('Mostra fotografias de um esqueleto').referenceRequested,true);
const root=new THREE.Group(),a=new THREE.Mesh(new THREE.SphereGeometry(.12),new THREE.MeshBasicMaterial()),b=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshBasicMaterial());root.add(a,b);a.position.x=.7;b.position.x=-.7;
const focus=createSceneFocus(THREE,[{id:'a',object:a},{id:'b',object:b}]),ids=[a.uuid,b.uuid];
assert(focus.focus('a'));for(let i=0;i<120;i++)focus.update(i/60);assert.deepEqual(focus.state().objects.map(o=>o.uuid),ids);assert(focus.state().objects.every(o=>o.visible));assert(focus.state().objects[0].focusScale>5);
const before=focus.state().objects.map(o=>o.offset);assert(focus.focus('b'));assert.deepEqual(focus.state().objects.map(o=>o.offset),before);focus.update(2);assert(Math.abs(focus.state().objects[0].offset[0]-before[0][0])<1,'Switching focus must interpolate, not jump');
assert(!focus.focus('unknown'));assert.equal(focus.state().focused,'b');assert(focus.focus(null));for(let i=121;i<400;i++)focus.update(i/60);for(const o of focus.state().objects){assert(o.offset.every(n=>Math.abs(n)<.001));assert(Math.abs(o.focusScale-1)<.001);}
// Decode the actual shipped, bounded meshes, not a generated stand-in.
globalThis.fetch=async url=>{const raw=await fs.readFile(url,'utf8');return {ok:true,text:async()=>raw};};
const anatomy=await loadAnatomy('Human body');assert.equal(anatomy.parts.length,21);
const built=createAnatomy(THREE,anatomy,{reducedMotion:true}),box=new THREE.Box3().setFromObject(built.group),size=box.getSize(new THREE.Vector3());assert(size.y>2.5&&size.z>.25&&size.x>.9);assert(built.state().triangles<180000);
for(const id of ['feet','hands','femurs','skull','spine','heart','brain','lungs'])assert(built.state().objects.some(o=>o.id===id));
const original=built.state().objects.map(o=>o.uuid);assert(built.focus('coração'));built.update(0,null,0);assert.equal(built.state().focused,'heart');assert.deepEqual(built.state().objects.map(o=>o.uuid),original);assert(built.state().objects.every(o=>o.visible));assert(!built.focus('wings'));
for(const part of ANATOMY_PARTS)for(const file of part.files)assert((await fs.stat(new URL('../assets/travis/anatomy/'+file,import.meta.url))).size<450000);
const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>loadAnatomy('Skeleton',{signal:cancelled.signal}));
console.log('PASS context: bilingual focus/only semantics, stable identities, continuous focus switch, exact return, 21 sourced anatomy groups, whole-body depth, mesh budgets and cancellation');
