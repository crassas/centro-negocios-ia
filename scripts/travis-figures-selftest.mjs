import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {figureSubject} from '../travis-figure-catalog.mjs';
import {loadFigure,createFigure,decodeFigure} from '../travis-figures.mjs';
const THREE=await import(pathToFileURL(process.argv[2]));
for(const text of ['Pessoa','Mostra uma pessoa','Human figure','Show me an astronaut','Astronaut','Mostra um astronauta','Traje ACES'])assert.equal(parseVisualIntent(text).scene,'figure',text);
for(const text of ['Corpo humano','Human body','Esqueleto','Skeleton','Coração'])assert.equal(parseVisualIntent(text).scene,'anatomy',text);
assert.equal(parseVisualIntent('Não mostres uma pessoa'),null);
assert.equal(parseVisualIntent('Escreve "pessoa"').scene,'text');
for(const text of ['a minha pessoa favorita','Neil Armstrong','astronaut dog','pessoa deitada','human bodybuilder'])assert.equal(figureSubject(text),null,text);
for(const text of ['Mostra fotografias de um astronauta','Show photographs of an astronaut']){const i=parseVisualIntent(text);assert(i.referenceRequested);assert(/^(?:astronauta|astronaut)$/i.test(i.title),i.title);}
let reads=0;
globalThis.fetch=async url=>{reads++;return {ok:true,text:async()=>fs.readFile(url,'utf8')};};
for(const id of ['human','astronaut']){
 const data=await loadFigure(id),figure=createFigure(THREE,data,{reducedMotion:true}),size=new THREE.Box3().setFromObject(figure.group).getSize(new THREE.Vector3());
 assert(size.y>2.59&&size.y<2.61);assert(size.x>.7&&size.z>.3,'Real body depth');
 assert.equal(data.triangles,id==='human'?60000:88872);
 let triangles=0,meshes=0;
 figure.group.traverse(mesh=>{if(!mesh.isMesh)return;meshes++;triangles+=mesh.geometry.index.count/3;assert(mesh.geometry.attributes.position.count===mesh.geometry.attributes.normal.count);});
 assert.equal(triangles,data.triangles);assert(meshes<=20);
 const before=reads;await loadFigure(id);assert.equal(reads,before,'Repeated displays reuse decoded source files');
 const ids=figure.state().objects.map(o=>o.uuid);assert(figure.focus(id));figure.update(0);assert.deepEqual(figure.state().objects.map(o=>o.uuid),ids);assert(!figure.focus('invented part'));
 for(const part of data.parts)for(const chunk of part.geometry){assert(chunk.positions.every(Number.isFinite));assert(chunk.normals.every(n=>n>=-1&&n<=1));}
}
const controller=new AbortController();controller.abort();await assert.rejects(()=>loadFigure('human',{signal:controller.signal}));
await assert.rejects(()=>loadFigure('unknown'));
assert.throws(()=>decodeFigure({divisor:20000,positions:'bad',normals:'',indices:''}));
const dir=new URL('../assets/travis/figures/',import.meta.url);
for(const file of await fs.readdir(dir))assert((await fs.stat(new URL(file,dir))).size<450000,file);
assert(!(await fs.readFile(new URL('../travis-concept-projection.mjs',import.meta.url),'utf8')).includes('function person()'));
console.log('PASS figures: exact bilingual subjects, literal/photo/named-person separation, real sourced geometry and normals, depth, identity, cache, cancellation and phone asset budgets');
