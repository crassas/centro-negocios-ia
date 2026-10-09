import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createTravisParticleMorph,morphVisibility} from '../travis-particle-morph.mjs';
import {visibleProjectionAmount} from '../travis-form-director.mjs';
const threePath=process.argv[2];
if(!threePath)throw new Error('Pass the pinned Three.js module path');
const THREE=await import(pathToFileURL(threePath));
const scene=new THREE.Scene(),stage=new THREE.Group();stage.position.y=.34;scene.add(stage);
const camera=new THREE.PerspectiveCamera(40,390/844,.1,60);camera.position.set(0,.48,6.4);
const face=new THREE.Mesh(new THREE.SphereGeometry(.45,24,16));
face.position.set(.25,1.05,.2);face.scale.set(1.2,1.6,1);scene.add(face);
const target=new THREE.Mesh(new THREE.BoxGeometry(1.7,1.1,1.05));stage.add(target);
const engine=createTravisParticleMorph(THREE,{count:2600});stage.add(engine.root);engine.setSource(face);
const full={amount:1,panel:1};
const view={camera,pixelRatio:1.5};
function array(name){return engine.points.geometry.attributes[name].array;}
function near(a,b,limit,message){assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));assert(max<limit,message+': '+max);}
engine.go(target,1,{camera,label:'house'});engine.update(1,full,view);
assert.equal(engine.state().source,'face');
assert.deepEqual(engine.points.position.toArray(),[0,0,0]);
assert.deepEqual(engine.points.scale.toArray(),[1,1,1],'Destination framing must never transform the face source');
const faceBox=new THREE.Box3().setFromObject(face);const point=new THREE.Vector3();
for(let i=0;i<array('aFrom').length;i+=3){
 point.fromArray(array('aFrom'),i).add(stage.position);
 assert(faceBox.clone().expandByScalar(.001).containsPoint(point),'Every departure point must lie on the actual transformed head');
}
engine.update(2.3,full,view);const house=array('aTo').slice();
const planet=new THREE.Mesh(new THREE.SphereGeometry(.66,22,14));stage.add(planet);
engine.go(planet,2.3,{camera,label:'planet'});
near(array('aFrom'),house,.006,'Changing shape preserves displayed positions');
engine.update(2.7,full,view);
engine.go(target,2.7,{camera,label:'interrupted'});
assert([...array('aFrom')].every(Number.isFinite));
engine.update(4.1,full,{...view,voice:.72});
assert.equal(engine.state().voice,.72,'Actual audio level reaches the projected material');
assert.equal(engine.points.material.uniforms.uVoice.value,.72);
const oldTarget=array('aTo').slice();engine.update(4.2,full,{...view,spin:.5,zoom:1.25});
near(array('aFrom'),oldTarget,.012,'View controls must not jump the displayed source');
engine.update(4.7,full,{...view,spin:.5,zoom:1.25});
face.visible=false;engine.returnToSource(4.7);
assert.equal(engine.state().target,'travis-face');
for(let i=0;i<array('aTo').length;i+=3){
 point.fromArray(array('aTo'),i).add(stage.position);
 assert(faceBox.clone().expandByScalar(.001).containsPoint(point),'Return target must match the head without object fitting');
}
engine.update(5,{amount:.6,panel:.4},view);engine.returnToSource(5);
engine.update(5.9,{amount:0,panel:0},view);
assert.equal(engine.state().active,false,'Duplicate dismiss events must not restart the return');
assert.equal(engine.state().avatarDissolve,0);assert.equal(engine.points.visible,false);
for(const returning of [false,true])for(let step=0;step<=100;step++){
 const v=morphVisibility(step/100,returning,returning?1:0,returning?1:0);
 assert(v.opacity>=0&&v.opacity<=1&&v.avatar>=0&&v.avatar<=1);
 assert(v.opacity>.001||v.avatar<.001,'The face and particle field must never disappear together');
}
assert.equal(visibleProjectionAmount(1,{visible:true,matter:{active:true,opacity:1,avatarDissolve:.28}}),.28);
const main=fs.readFileSync('travis-3d.mjs','utf8'),cockpit=fs.readFileSync('travis-cockpit.mjs','utf8');
const cardImport=s=>s.match(/import ['"]([^'"]*travis-action-cards\.mjs[^'"]*)['"]/)[1];
assert.equal(cardImport(main),cardImport(cockpit),'A second module URL creates a second controller and erases the first scene');
engine.dispose();
console.log('PASS CONTINUOUS_MORPH: real Three.js transforms, first-scene singleton, interrupted morph, controls, voice, exact face return and no empty handoff');
