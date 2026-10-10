import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {compositionIntent,makeScenePlan,validateScenePlan,flybyPosition,SCENE_ASSETS} from '../travis-scene-blueprint.mjs';
import {parseVisualIntent} from '../travis-english-intents.mjs';
import {createComposedScene} from '../travis-scene-composer.mjs';
const THREE=await import(pathToFileURL(process.argv[2]));
for(const text of ['Mostra um meteorito a passar perto da Terra','Show an asteroid passing Earth','Constrói a Terra com um satélite e a Lua']){
 const intent=parseVisualIntent(text);assert.equal(intent.scene,'composition',text);assert(validateScenePlan(intent.plan));assert.equal(intent.plan.environment,'space');assert(!intent.referenceRequested);
}
assert.equal(parseVisualIntent('Constrói um motor com ADN').plan.nodes.length,2);
assert.equal(parseVisualIntent('Constrói uma casa com uma árvore e chuva').plan.environment,'earth');
const initial=compositionIntent('Mostra a Terra com um meteoroide').plan;
let added=compositionIntent('Adiciona a Lua',{plan:initial});assert.equal(added.plan.nodes.length,3);assert(added.edit);assert.deepEqual(added.plan.nodes[0],initial.nodes[0]);
const removed=compositionIntent('Retira a Lua',{plan:added.plan});assert.deepEqual(removed.plan.nodes,initial.nodes);
const onlyRock=compositionIntent('Retira a Terra',{plan:initial});assert.equal(onlyRock.plan.layout,'tableau');
assert.equal(compositionIntent('Retira o meteoroide',{plan:onlyRock.plan}).type,'dismiss');
assert.equal(compositionIntent('Adiciona um dragão',{plan:initial}).reason,'unknown');
for(const text of ['Não mostres um meteoroide','Escreve Terra e Lua','Mostra fotografias da Terra e da Lua','Adiciona uma tarefa sobre a Terra','Constrói uma casa com uma piscina','Constrói um dragão junto à Terra'])assert.equal(compositionIntent(text,{plan:initial}),null,text);
assert.equal(compositionIntent('Mostra um meteoroide a atingir a Terra')?.plan?.layout,undefined);
assert.equal(compositionIntent('Mostra um meteorito em colisão com a Terra').reason,'impact');
const eight=makeScenePlan(['Motor','Cube','Sphere','Pyramid','Tree','Mountain','House','DNA']);assert.equal(eight.nodes.length,8);assert.equal(compositionIntent('Adiciona chuva',{plan:eight}).reason,'limit');
assert.equal(validateScenePlan({...initial,nodes:Array(9).fill(initial.nodes[0])}),null);
for(const patch of [{scale:Infinity},{asset:'javascript:alert(1)'},{position:[0,NaN,0]},{position:[0,0,9999]},{id:123}])assert.equal(validateScenePlan({...initial,nodes:[{...initial.nodes[0],...patch}]}),null);
assert.equal(validateScenePlan({...initial,nodes:[initial.nodes[0],initial.nodes[0]]}),null);
assert.equal('code' in validateScenePlan({...initial,code:'throw new Error()'}),false);
let previous=-Infinity;for(let i=0;i<=1000;i++){const [x,y,z]=flybyPosition(i/1000,1.2);assert(x>=previous);previous=x;assert(Math.hypot(x,y,z)>1.2);}
// Real Three.js: each constructed object has depth, can be isolated, and returns
// to the exact same composition; detail buffers remain static during animation.
for(const assets of [['Meteor'],['Satellite'],['Tree','Mountain'],['Cube','Sphere','Pyramid'],['Motor','DNA']]){
 const built=createComposedScene(THREE,makeScenePlan(assets)),snapshot=[];
 built.group.traverse(o=>{if(o.geometry)snapshot.push({o,version:o.geometry.attributes.position.version});});
 assert(snapshot.length>0);const box=new THREE.Box3().setFromObject(built.group),size=box.getSize(new THREE.Vector3());assert(size.x>.1&&size.y>.1&&size.z>.1);
 for(let i=0;i<120;i++)built.update(i/60);
 assert(built.focus(assets.at(-1)));built.update(3);assert.equal(built.state().objects.filter(o=>o.visible).length,assets.length);assert(!built.focus('Unknown'));
 assert(built.focus(null));built.update(4);assert.equal(built.state().objects.filter(o=>o.visible).length,assets.length);
 for(const {o,version} of snapshot)assert.equal(o.geometry.attributes.position.version,version);
 built.group.traverse(o=>o.geometry?.dispose());built.materials.forEach(m=>m.dispose());built.textures.forEach(t=>t.dispose());
}
console.log('PASS Worlds: '+SCENE_ASSETS.length+' bounded assets, PT/EN construction, editing, literal/private/unknown guards, clearance, actual depth, focus and stable geometry');
