import {ANATOMY_PARTS} from './travis-anatomy-catalog.mjs?v=figures-1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=figures-1';
import {createSceneFocus,focusKey} from './travis-scene-focus.mjs?v=figures-1';
export {ANATOMY_PARTS};
const cache=new Map();
export const anatomyPart=value=>{
 const key=focusKey(value);return ANATOMY_PARTS.find(p=>[p.id,p.pt,p.en,...p.aliases].some(a=>focusKey(a)===key))||null;
};
export function anatomySubject(text){
 const t=' '+focusKey(text)+' ';
 // Compound tool names are whole objects, not references to a human hand.
 if(/\b(?:hand|bench|block|woodworking|carpenter(?:s)?) plane\b/.test(t))return null;
 if(/\b(?:esqueleto|skeleton|skeletal system|sistema esqueletico)\b/.test(t))return 'Skeleton';
 if(/\b(?:corpo humano|human body|anatomia|anatomy)\b/.test(t))return 'Human body';
 const matches=ANATOMY_PARTS.filter(p=>[p.id,p.pt,p.en,...p.aliases].some(a=>t.includes(' '+focusKey(a)+' ')));
 return matches.length===1?matches[0].id:null;
}
export function anatomyLabel(subject,language='pt'){
 return subject==='Skeleton'?(language==='pt'?'Esqueleto humano':'Human skeleton'):subject==='Human body'?(language==='pt'?'Corpo humano · anatomia interna':'Human body · internal anatomy'):(anatomyPart(subject)?.[language==='pt'?'pt':'en']||subject);
}
function definitions(subject){return subject==='Skeleton'?ANATOMY_PARTS.filter(p=>p.kind==='bone'):subject==='Human body'?ANATOMY_PARTS:ANATOMY_PARTS.filter(p=>p.id===anatomyPart(subject)?.id);}
function decode(data,id){
 if(data.version!==1||data.id!==id||data.divisor!==20000)throw new Error('Invalid anatomy asset');
 const bytes=value=>{if(typeof value!=='string'||value.length>440000||! /^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Invalid geometry encoding');const str=atob(value);return Uint8Array.from(str,c=>c.charCodeAt(0));};
 const p=bytes(data.positions),i=bytes(data.indices);if(p.byteLength%6||i.byteLength%6||!p.length||!i.length)throw new Error('Invalid geometry dimensions');
 const positions=Float32Array.from(new Int16Array(p.buffer),v=>v/20000),indices=new Uint16Array(i.buffer);
 if(positions.length>180000||indices.length>75000||indices.some(v=>v>=positions.length/3))throw new Error('Anatomy geometry exceeds budget');
 return {positions,indices};
}
export async function loadAnatomy(subject,{signal}={}){
 const parts=definitions(subject);if(!parts.length)throw new Error('Unknown anatomical part');
 const tasks=parts.flatMap(part=>part.files.map(file=>({part,file}))),results=new Map();let cursor=0;
 async function worker(){while(cursor<tasks.length){const {part,file}=tasks[cursor++];if(signal?.aborted)throw signal.reason;
  if(!cache.has(file)){
   const response=await fetch(new URL('./assets/travis/anatomy/'+file,import.meta.url),{signal});if(!response.ok)throw new Error('Anatomy asset unavailable');
   const raw=await response.text();if(raw.length>450000)throw new Error('Anatomy asset too large');cache.set(file,decode(JSON.parse(raw),part.id));
  }
  results.set(file,cache.get(file));
 }}
 await Promise.all(Array.from({length:Math.min(3,tasks.length)},worker));
 if(signal?.aborted)throw signal.reason;
 return {subject,parts:parts.map(p=>({...p,geometry:p.files.map(f=>results.get(f))}))};
}
export function createAnatomy(THREE,data,{reducedMotion=false}={}){
 const group=new THREE.Group(),materials=[],entries=[];group.name='BodyParts3D:'+data.subject;group.userData.dynamic=true;
 const tones={brain:0xd9b2b1,heart:0xc65f64,lungs:0xbe939f,liver:0x985658,stomach:0xd9a5ac,kidneys:0xa26465,intestines:0xc79486,pancreas:0xd6b580};
 for(const part of data.parts){
  const actor=new THREE.Group();actor.name=part.en;actor.userData.visualBody=part.id;group.add(actor);
  const material=createHolographicSurfaceMaterial(THREE,{natural:true,tint:tones[part.id]||0xe8ddd0,gain:1.45});materials.push(material);
  for(const chunk of part.geometry){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(chunk.positions,3));geometry.setIndex(new THREE.BufferAttribute(chunk.indices,1));geometry.computeVertexNormals();geometry.computeBoundingSphere();
   actor.add(new THREE.Mesh(geometry,material));
  }
  entries.push({id:part.id,label:part.pt,aliases:[part.en,...part.aliases],object:actor});
 }
 // Single parts use the same measured mesh, centered at a useful inspection size.
 if(entries.length===1){const box=new THREE.Box3().setFromObject(entries[0].object),centre=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),scale=1.8/Math.max(size.x,size.y,size.z);entries[0].object.position.copy(centre).multiplyScalar(-scale);entries[0].object.scale.setScalar(scale);}
 const selection=createSceneFocus(THREE,entries,{reducedMotion});
 return {group,materials,textures:[],variant:'anatomical-reference',focus:selection.focus,
  update(time,_progress,now=time){selection.update(now);},
  state:()=>({type:'anatomy',subject:data.subject,source:'BodyParts3D',triangles:data.parts.reduce((n,p)=>n+p.triangles,0),...selection.state()})};
}
