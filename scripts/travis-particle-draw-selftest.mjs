import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTravisParticleMorph} from '../travis-particle-morph.mjs';

// Reproduce the exact Three.js WebGLRenderer draw-count gate without
// fetching WebGL or depending on a GPU in CI.
class BufferAttribute {
  constructor(array,itemSize) {this.array=array;this.itemSize=itemSize;this.count=array.length/itemSize;}
}
class BufferGeometry {
  constructor(){this.attributes={};this.index=null;this.drawRange={start:0,count:Infinity};}
  setAttribute(key,value){this.attributes[key]=value;return this;}
  setDrawRange(start,count){this.drawRange={start,count};}
}
class ShaderMaterial {constructor(options){Object.assign(this,options);this.userData={};}}
class Group {constructor(){this.children=[];}add(item){this.children.push(item);item.parent=this;}}
class Points {constructor(geometry,material){this.geometry=geometry;this.material=material;this.visible=true;}}
const MockThree={BufferAttribute,BufferGeometry,ShaderMaterial,Group,Points,AdditiveBlending:2};
const engine=createTravisParticleMorph(MockThree,{count:2600});
const geometry=engine.points.geometry;
function threeWebGLDrawCount(g) {
  const position=g.attributes.position;
  let start=g.drawRange.start,end=start+g.drawRange.count;
  if(g.index!==null)end=Math.min(end,g.index.count);
  else if(position!==undefined&&position!==null)end=Math.min(end,position.count);
  const count=end-start;
  // Three.js WebGLRenderer.renderBufferDirect returns when count === Infinity.
  return count<0||count===Infinity ? 0 : count;
}
assert.equal(threeWebGLDrawCount(new BufferGeometry()),0,'Regression reproduces old blank screen.');
assert.equal(geometry.attributes.position.count,2600,
  'Particle field must expose a standard position attribute for the renderer.');
assert.equal(geometry.drawRange.start,0);
assert.equal(geometry.drawRange.count,2600,'Draw count must be finite.');
assert.equal(threeWebGLDrawCount(geometry),2600,'GPU draw should contain 2600 particles.');
for(const key of ['aFrom','aTo','aSeed'])assert.equal(geometry.attributes[key].count,2600);
assert(engine.points.frustumCulled===false,'Dynamic particle bounds must not be culled.');
const shader=engine.points.material.vertexShader;
assert(shader.includes('aFrom')&&shader.includes('aTo')&&shader.includes('gl_PointSize'));
const client=fs.readFileSync('travis-concept-projection.mjs','utf8');
assert(client.includes("travis-particle-morph.mjs?v=2"));
console.log('PASS PARTICLE_DRAW: Three.js finite render count, attributes, visibility, 2600 GPU points');
