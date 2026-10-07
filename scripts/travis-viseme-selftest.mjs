import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createFaceRig} from '../travis-face-rig.mjs';
const file=fs.readFileSync('assets/travis/travis-face-bust.glb');
const length=file.readUInt32LE(12),doc=JSON.parse(file.subarray(20,20+length));
const bin=20+length+8;
const mesh=doc.meshes[doc.nodes.find(n=>n.name==='TravisFace_Bust').mesh];
const accessor=doc.accessors[mesh.primitives[0].attributes.POSITION],view=doc.bufferViews[accessor.bufferView];
assert.equal(accessor.componentType,5126);
const rest=new Float32Array(accessor.count*3);
for(let i=0;i<accessor.count;i++)for(let axis=0;axis<3;axis++)rest[i*3+axis]=file.readFloatLE(bin+(view.byteOffset||0)+(accessor.byteOffset||0)+i*(view.byteStride||12)+axis*4);
const position={array:rest.slice(),count:accessor.count,setXYZ(i,x,y,z){this.array.set([x,y,z],i*3);}};
const rig=createFaceRig({attributes:{position},computeVertexNormals(){}});
const shapes=[];
for(const key of ['aa','E','I','O','U','PP','FF','SS','TH','DD','kk','nn','RR','CH']){
 rig.update(.8,{[key]:.65});assert(position.array.every(Number.isFinite));
 shapes.push(Buffer.from(position.array.buffer).toString('base64'));
 for(let i=0;i<position.count;i++)if(rest[i*3+1]>.6)assert.deepEqual(position.array.slice(i*3,i*3+3),rest.slice(i*3,i*3+3));
 rig.update(0);assert.deepEqual(position.array,rest);
}
assert(new Set(shapes).size>=8,'Distinct articulations required');
rig.update(0,{aa:1});assert.deepEqual(position.array,rest,'Silent audio must close mouth');
console.log('VISEME_RIG_OK',JSON.stringify({vertices:position.count,affected:rig.affected,distinct:new Set(shapes).size,silence:'exact-rest'}));
