import {FIGURES} from './travis-figure-catalog.mjs?v=figures-1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=figures-1';
import {createSceneFocus} from './travis-scene-focus.mjs?v=figures-1';
const cache=new Map(),geometryCache=new Map();
async function asset(file,signal){
 if(signal?.aborted)throw signal.reason;
 if(!/^[a-z0-9-]+\.json$/.test(file))throw new Error('Invalid figure path');
 if(cache.has(file))return cache.get(file);
 const response=await fetch(new URL('./assets/travis/figures/'+file,import.meta.url),{signal});
 if(!response.ok)throw new Error('Figure asset unavailable');
 const raw=await response.text();if(raw.length>450000)throw new Error('Figure asset too large');
 const result=JSON.parse(raw);if(result.version!==1)throw new Error('Invalid figure version');
 cache.set(file,result);return result;
}
function buffer(value,Type){
 if(typeof value!=='string'||value.length>440000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Invalid figure encoding');
 const data=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(data.byteLength%Type.BYTES_PER_ELEMENT)throw new Error('Invalid figure buffer');
 return new Type(data.buffer);
}
export function decodeFigure(data){
 if(data.divisor!==20000)throw new Error('Invalid figure scale');
 const positions=Float32Array.from(buffer(data.positions,Int16Array),n=>n/20000),normals=Float32Array.from(buffer(data.normals,Int16Array),n=>n/32767),indices=buffer(data.indices,Uint16Array),uv=data.uv?buffer(data.uv,Float32Array):null;
 if(!positions.length||positions.length%3||normals.length!==positions.length||indices.length%3||!indices.length||indices.length>27000||positions.length>81000||indices.some(i=>i>=positions.length/3)||uv&&(uv.length!==positions.length/3*2||!uv.every(Number.isFinite)))throw new Error('Invalid figure geometry');
 return {positions,normals,indices,uv};
}
export async function loadFigure(id,{signal}={}){
 if(!FIGURES[id])throw new Error('Unknown figure');
 const manifest=await asset('manifest.json',signal),definitions=id==='human'?[manifest.human]:manifest.astronaut;
 if(!Array.isArray(definitions)||!definitions.length||definitions.length>24)throw new Error('Invalid figure manifest');
 const tasks=definitions.flatMap(part=>part.files.map(file=>({part,file})));if(tasks.length>48)throw new Error('Figure exceeds budget');
 const decoded=new Map();let cursor=0;
 async function worker(){while(cursor<tasks.length){const {file}=tasks[cursor++];if(signal?.aborted)throw signal.reason;if(!geometryCache.has(file))geometryCache.set(file,decodeFigure(await asset(file,signal)));decoded.set(file,geometryCache.get(file));}}
 await Promise.all(Array.from({length:Math.min(3,tasks.length)},worker));
 const parts=[];
 for(const part of definitions){
  let image=null;
  if(part.texture){const data=await asset(part.texture,signal);if(!/^data:image\/(?:webp|png|jpeg);base64,/.test(data.image||''))throw new Error('Invalid figure texture');image=new Image();image.src=data.image;await image.decode();if(image.naturalWidth*image.naturalHeight>2000000)throw new Error('Texture too large');}
  if(part.colour&&(!Array.isArray(part.colour)||part.colour.length!==3||part.colour.some(n=>!Number.isFinite(n)||n<0||n>1)))throw new Error('Invalid figure colour');
  parts.push({geometry:part.files.map(file=>decoded.get(file)),image,colour:part.colour});
 }
 if(signal?.aborted)throw signal.reason;
 return {id,parts,triangles:parts.reduce((n,p)=>n+p.geometry.reduce((m,g)=>m+g.indices.length/3,0),0)};
}
export function createFigure(THREE,data,{reducedMotion=false}={}){
 const group=new THREE.Group(),actor=new THREE.Group(),materials=[],textures=[];
 group.name='TravisReferenceFigure:'+data.id;actor.name=FIGURES[data.id].en;actor.userData.visualBody=data.id;group.add(actor);group.userData.dynamic=true;
 // ACES has its back toward +Z in the source; greet the viewer face first.
 if(data.id==='astronaut')actor.rotation.y=Math.PI;
 for(const part of data.parts){
  let map=null;if(part.image){map=new THREE.Texture(part.image);map.flipY=false;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;textures.push(map);}
  const material=createHolographicSurfaceMaterial(THREE,{map,natural:true,porosity:.004,tint:part.colour?new THREE.Color().setRGB(...part.colour):data.id==='human'?0xceb498:0xffffff,gain:data.id==='human'?1.28:1.42});materials.push(material);
  for(const chunk of part.geometry){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(chunk.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(chunk.normals,3));
   if(chunk.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(chunk.uv,2));
   geometry.setIndex(new THREE.BufferAttribute(chunk.indices,1));geometry.computeBoundingSphere();actor.add(new THREE.Mesh(geometry,material));
  }
 }
 const selection=createSceneFocus(THREE,[{id:data.id,label:FIGURES[data.id].pt,aliases:[FIGURES[data.id].en,...FIGURES[data.id].aliases],object:actor}],{reducedMotion});
 return {group,materials,textures,variant:'reference-'+data.id,focus:selection.focus,
  update(time,_progress,now=time){selection.update(now);},
  state:()=>({type:'figure',id:data.id,triangles:data.triangles,source:FIGURES[data.id].sourceName,...selection.state()})};
}
