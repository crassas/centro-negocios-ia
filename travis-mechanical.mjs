import {createSceneFocus} from './travis-scene-focus.mjs?v=context-1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=context-1';
// Educational electric motor cutaway. Generic proportions, never measured CAD.
// Inspired by the exploded-view choreography in claude-motion/sims/engine.
export function createMechanical(THREE,{exploded=false,reducedMotion=false}={}){
 const group=new THREE.Group(),materials=[];group.name='TravisMotorCutaway';
 const surface=gain=>{const m=createHolographicSurfaceMaterial(THREE,{gain});materials.push(m);return m;};
 const gold=surface(1),copper=surface(.78),bright=surface(1.15);
 const parts=[];
 function part(name,x,spread){const node=new THREE.Group();node.name=name;node.position.x=x+(exploded?spread:0);group.add(node);parts.push(node);return node;}
 function mesh(parent,geometry,material,x=0,y=0,z=0){const node=new THREE.Mesh(geometry,material);node.position.set(x,y,z);parent.add(node);return node;}
 function ring(parent,r,tube,x,mat=gold){const node=mesh(parent,new THREE.TorusGeometry(r,tube,8,48),mat,x);node.rotation.y=Math.PI/2;return node;}
 const shaft=part('Eixo e rotor',0,0);
 const axle=mesh(shaft,new THREE.CylinderGeometry(.065,.065,2.30,24),bright);axle.rotation.z=Math.PI/2;
 const rotor=mesh(shaft,new THREE.CylinderGeometry(.27,.27,.95,40),gold);rotor.rotation.z=Math.PI/2;
 for(let i=0;i<16;i++){const a=i*Math.PI/8;mesh(shaft,new THREE.BoxGeometry(.87,.022,.025),bright,0,Math.cos(a)*.275,Math.sin(a)*.275);}
 const stator=part('Estator e bobinas',0,.85);
 // Open quarter of the casing reveals the windings even in the assembled view.
 const shell=mesh(stator,new THREE.CylinderGeometry(.51,.51,1.14,48,1,true,Math.PI*.20,Math.PI*1.5),copper);shell.rotation.z=Math.PI/2;
 for(let i=0;i<9;i++){
  const a=(i/9*1.5+.20)*Math.PI,y=Math.sin(a)*.40,z=Math.cos(a)*.40;
  const winding=new THREE.Group();winding.position.set(0,y,z);stator.add(winding);
  for(let j=0;j<8;j++){const coil=mesh(winding,new THREE.TorusGeometry(.10,.016,5,16),bright,(j-3.5)*.095);coil.rotation.y=Math.PI/2;}
 }
 const front=part('Rolamento dianteiro',.69,1.05),rear=part('Rolamento traseiro',-.69,-.65);
 for(const bearing of [front,rear]){ring(bearing,.34,.055,0);ring(bearing,.13,.035,0,bright);
  for(let i=0;i<10;i++){const a=i*Math.PI/5;mesh(bearing,new THREE.SphereGeometry(.04,8,6),bright,0,Math.cos(a)*.235,Math.sin(a)*.235);}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const spoke=mesh(bearing,new THREE.BoxGeometry(.05,.23,.045),gold,0,Math.cos(a)*.235,Math.sin(a)*.235);spoke.rotation.x=a;}
 }
 const fan=part('Ventoinha',-.95,-1.05);ring(fan,.16,.035,0,bright);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;const blade=mesh(fan,new THREE.BoxGeometry(.07,.25,.09),gold,0,Math.cos(a)*.27,Math.sin(a)*.27);blade.rotation.x=a+.28;}
 // Batch within each named part, preserving part identity for contextual focus.
 group.updateMatrixWorld(true);const entries=[];
 const ids=['rotor','stator','front-bearing','rear-bearing','fan'];
 const aliases=[['eixo','shaft','rotor'],['estator','bobinas','stator','windings'],['rolamento dianteiro','front bearing'],['rolamento traseiro','rear bearing'],['ventoinha','fan']];
 for(const [index,part] of parts.entries()){
  const batches=new Map();part.traverse(node=>{if(!node.isMesh)return;const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);
   const batch=batches.get(node.material)||{position:[],normal:[],uv:[]};
   for(const key of Object.keys(batch))for(const value of geometry.attributes[key].array)batch[key].push(value);
   batches.set(node.material,batch);geometry.dispose();node.geometry.dispose();
  });
  part.clear();part.position.set(0,0,0);
  for(const [original,attributes] of batches){const geometry=new THREE.BufferGeometry();
   for(const [key,values] of Object.entries(attributes))geometry.setAttribute(key,new THREE.Float32BufferAttribute(values,key==='uv'?2:3));
   const material=original.clone();materials.push(material);part.add(new THREE.Mesh(geometry,material));
  }
  part.userData.visualBody=ids[index];entries.push({id:ids[index],label:part.name,aliases:aliases[index],object:part});
 }
 group.rotation.set(.12,-.48,-.18);group.updateMatrixWorld(true);
 const selection=createSceneFocus(THREE,entries,{reducedMotion});
 return {group,materials,textures:[],variant:exploded?'motor-exploded':'motor-cutaway',parts:parts.map(p=>p.name),focus:selection.focus,update(time,_progress,now=time){selection.update(now);},state:selection.state};
}
