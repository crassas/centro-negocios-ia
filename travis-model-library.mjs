import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=spectrum-1';

// A sourced mesh, not an image plane. Only embedded static geometry reaches
// GLTFLoader; neither materials nor external resources execute on the client.
export function validateModelDocument(document){
 if(!document||document.asset?.version!=='2.0'||JSON.stringify(document).length>6000000)throw new Error('Invalid 3D document');
 if(document.extensionsRequired?.length||document.images?.length||document.textures?.length||document.skins?.length||document.animations?.length)throw new Error('Unsupported 3D resources');
 const buffers=document.buffers||[];
 if(!buffers.length||buffers.length>4||buffers.reduce((n,b)=>n+b.byteLength,0)>4000000)throw new Error('3D byte budget exceeded');
 for(const b of buffers){if(!Number.isInteger(b.byteLength)||b.byteLength<=0||!/^data:application\/octet-stream;base64,[A-Za-z0-9+/]+=*$/.test(b.uri||'')||Math.abs((b.uri.split(',')[1].length*3/4)-b.byteLength)>2)throw new Error('External or invalid 3D buffer');}
 // Reject any extension/resource URL even when nested in an unused object.
 const walk=value=>{if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(key==='extensions'||key==='sparse')throw new Error('Unsupported 3D extension');if(key==='uri'&&!/^data:application\/octet-stream;base64,/.test(v))throw new Error('External 3D resource');if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Invalid 3D number');walk(v);}};walk(document);
 const nodes=document.nodes||[],seen=new Set(),parents=new Set();
 if(!nodes.length||nodes.length>256||!document.accessors?.length||document.accessors.length>256)throw new Error('3D node budget exceeded');
 const visit=(i,ancestors=new Set())=>{if(!Number.isInteger(i)||!nodes[i]||ancestors.has(i))throw new Error('Invalid 3D hierarchy');if(seen.has(i))return;seen.add(i);const path=new Set([...ancestors,i]);for(const child of nodes[i].children||[]){if(parents.has(child))throw new Error('Instanced hierarchy is unsupported');parents.add(child);visit(child,path);}};
 nodes.forEach((_,i)=>visit(i));
 for(const a of document.accessors)if(!Number.isInteger(a.count)||a.count<0||a.count>300000)throw new Error('3D accessor budget exceeded');
 let triangles=0;
 for(const m of document.meshes||[])for(const p of m.primitives||[]){if((p.mode??4)!==4||p.targets||p.material!==undefined)throw new Error('Unsupported 3D primitive');const a=document.accessors[p.indices??p.attributes?.POSITION];if(!a)throw new Error('Missing 3D accessor');triangles+=a.count/3;}
 if(!triangles||triangles>100000)throw new Error('3D triangle budget exceeded');
 return document;
}

function disposeScene(scene){
 const geometries=new Set(),materials=new Set();scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m)materials.add(m);});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
}

export function disposeReferenceModel(model){if(!model)return;disposeScene(model.group);for(const texture of model.textures||[])texture.dispose();}

export async function decodeReferenceModel(payload){
 const document=validateModelDocument(payload?.gltf);
 const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('data:application/octet-stream;base64,'))throw new Error('External 3D request refused');return url;});
 const loaded=await new GLTFLoader(manager).parseAsync(document,'');
 try{
  loaded.scene.updateMatrixWorld(true);
  const pieces=[];let count=0;
  let geometry;
  try{
  loaded.scene.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
   const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
   if(!g.attributes.normal)g.computeVertexNormals();
   const vertices=g.index?.count||g.attributes.position.count;count+=vertices;
   if(count>300000){g.dispose();throw new Error('Expanded 3D geometry too large');}
   pieces.push(g);
  });
   if(!count)throw new Error('Empty 3D geometry');
   const positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2);let offset=0;
   for(const g of pieces){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,number=g.index?.count||p.count;for(let i=0;i<number;i++){const j=g.index?g.index.getX(i):i;positions.set([p.getX(j),p.getY(j),p.getZ(j)],offset);normals.set([n.getX(j),n.getY(j),n.getZ(j)],offset);if(uv)uvs.set([uv.getX(j),uv.getY(j)],offset/3*2);offset+=3;}}
   if(!positions.every(Number.isFinite)||!normals.every(Number.isFinite))throw new Error('Invalid 3D coordinates');
   geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
   geometry.computeBoundingBox();const box=geometry.boundingBox,center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   const largest=Math.max(size.x,size.y,size.z);
   if(!Number.isFinite(largest)||largest<=0||Math.min(size.x,size.y,size.z)/largest<.012)throw new Error('A flat image is not a complete 3D model');
   geometry.translate(-center.x,-center.y,-center.z);geometry.scale(2.5/largest,2.5/largest,2.5/largest);geometry.computeBoundingSphere();
   let map=null;
   if(typeof payload.detailImage==='string'&&payload.detailImage.length<1000100&&/^data:image\/(?:jpeg|png|webp);base64,/.test(payload.detailImage)){
    try{const image=new Image();image.src=payload.detailImage;await image.decode();if(image.naturalWidth*image.naturalHeight<=2000000){map=new THREE.Texture(image);map.flipY=false;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;}}catch{/* Surface detail is optional; actual geometry remains complete. */}
   }
   const material=createHolographicSurfaceMaterial(THREE,{gain:1,map,natural:Boolean(map)}),group=new THREE.Group();group.name='TravisSourcedModel';group.rotation.y=-.55;
   group.add(new THREE.Mesh(geometry,material));
   return {group,materials:[material],textures:map?[map]:[],variant:'sourced-3d',asset:String(payload.asset||'').slice(0,90),triangles:count/3,bounds:size.toArray().map(x=>x*2.5/largest)};
  }catch(error){geometry?.dispose();throw error;}finally{for(const g of pieces)g.dispose();}
 }finally{disposeScene(loaded.scene);}
}
